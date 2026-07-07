const db = require('../config/database');
const NotificationService = require('./notificationService');
const logger = require('../utils/logger');

// Lightweight per-trade snapshot: everything the achievement criteria need,
// computed in a single pass over the user's trades. Date/hour/window values
// are derived in SQL so they match the semantics of the old per-criterion
// queries exactly (DB session timezone, CURRENT_TIMESTAMP, ILIKE on NULL).
const TRADES_SNAPSHOT_QUERY = `
  SELECT
    t.pnl::float8 AS pnl,
    t.side,
    t.entry_price::float8 AS entry_price,
    t.exit_price::float8 AS exit_price,
    t.quantity::float8 AS quantity,
    t.symbol,
    t.entry_time,
    (t.exit_time IS NOT NULL) AS is_closed,
    (t.stop_loss IS NOT NULL) AS has_stop_loss,
    (t.take_profit IS NOT NULL) AS has_take_profit,
    DATE(t.entry_time)::text AS entry_date,
    EXTRACT(HOUR FROM t.entry_time)::int AS entry_hour,
    EXTRACT(MINUTE FROM t.entry_time)::int AS entry_minute,
    EXTRACT(DOW FROM t.entry_time)::int AS entry_dow,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.entry_time))::float8 AS entry_age_seconds,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.exit_time))::float8 AS exit_age_seconds,
    EXTRACT(EPOCH FROM (t.exit_time - t.entry_time))::float8 / 60 AS duration_minutes,
    EXTRACT(EPOCH FROM t.exit_time)::float8 AS exit_epoch,
    EXTRACT(EPOCH FROM t.entry_time)::float8 AS entry_epoch,
    (t.exit_time >= date_trunc('week', CURRENT_TIMESTAMP)) AS exit_in_current_week,
    LENGTH(BTRIM(COALESCE(t.notes, ''))) AS notes_length,
    LENGTH(BTRIM(COALESCE(t.setup, ''))) AS setup_length,
    COALESCE(t.notes ILIKE '%stop%', false) AS notes_mention_stop,
    COALESCE(t.notes ILIKE '%profit%' OR t.notes ILIKE '%target%', false) AS notes_mention_profit,
    COALESCE(
      LOWER(t.notes) LIKE '%trend%' OR LOWER(t.notes) LIKE '%moving average%'
      OR LOWER(t.notes) LIKE '%ma%' OR LOWER(t.notes) LIKE '%crossover%',
      false
    ) AS notes_mention_trend,
    COALESCE(
      LOWER(t.notes) LIKE '%news%' OR LOWER(t.notes) LIKE '%earnings%'
      OR LOWER(t.notes) LIKE '%catalyst%' OR LOWER(t.notes) LIKE '%announcement%',
      false
    ) AS notes_mention_news,
    COALESCE((
      SELECT MAX(LENGTH(BTRIM(COALESCE(r.review_notes, ''))))
      FROM trade_playbook_reviews r
      WHERE r.trade_id = t.id AND r.user_id = t.user_id
    ), 0) AS max_review_notes_length,
    (CASE
      WHEN t.exit_price IS NOT NULL AND t.entry_price IS NOT NULL AND t.entry_price <> 0 THEN
        CASE
          WHEN t.side = 'long' THEN (t.exit_price - t.entry_price) / t.entry_price
          WHEN t.side = 'short' THEN (t.entry_price - t.exit_price) / t.entry_price
        END
    END)::float8 AS price_move_fraction
  FROM trades t
  WHERE t.user_id = $1
  ORDER BY t.exit_time DESC NULLS LAST, t.entry_time DESC
`;

const REVIEWS_SNAPSHOT_QUERY = `
  SELECT
    r.followed_plan,
    COALESCE(r.adherence_score, 0)::float8 AS adherence_score,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r.reviewed_at))::float8 AS reviewed_age_seconds,
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = r.trade_id AND t.user_id = r.user_id AND t.exit_time IS NOT NULL
    ) AS trade_closed
  FROM trade_playbook_reviews r
  WHERE r.user_id = $1
    AND r.review_type = 'adherence'
`;

const MISC_SNAPSHOT_QUERY = `
  SELECT
    (SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MAX(created_at)))::float8
       FROM revenge_trading_events WHERE user_id = $1) AS latest_revenge_age_seconds,
    (SELECT COUNT(*)::int FROM playbooks WHERE user_id = $1 AND is_active = true) AS active_playbook_count,
    (SELECT COUNT(DISTINCT pattern_type)::int FROM behavioral_patterns WHERE user_id = $1) AS patterns_identified,
    (SELECT COUNT(*)::int FROM user_challenges WHERE user_id = $1 AND status = 'completed') AS challenges_completed,
    (SELECT COUNT(*)::int
       FROM user_challenges uc
       JOIN challenges c ON c.id = uc.challenge_id
      WHERE uc.user_id = $1 AND c.is_community = true AND uc.status IN ('completed', 'active')) AS community_challenges
`;

const DAY_SECONDS = 86400;

class AchievementService {

  // Check and award achievements for a user based on their current stats
  static async checkAndAwardAchievements(userId) {
    try {
      // Get all achievements the user hasn't earned yet
      const unearned = await this.getUnearnedAchievements(userId);
      const newAchievements = [];
      // Capture XP/level before for UI animation signals
      const beforeStats = await this.getUserStats(userId);
      const oldXP = beforeStats.experience_points || 0;
      const oldLevel = beforeStats.level || 1;
      const beforeLevelInfo = this.calculateLevelFromXP(oldXP);

      // One batched snapshot replaces the per-achievement aggregate queries
      const snapshot = unearned.length > 0
        ? await this.getUserAchievementStats(userId)
        : null;

      for (const achievement of unearned) {
        const earned = await this.checkAchievementCriteria(userId, achievement, snapshot);
        if (earned) {
          const awarded = await this.awardAchievement(userId, achievement.id, earned.metadata);
          if (awarded) {
            newAchievements.push(achievement);
            console.log(`Successfully awarded ${achievement.name} to user ${userId}`);
          }
        }
      }

      // Update user stats if new achievements were earned
      if (newAchievements.length > 0) {
        newAchievements.forEach(achievement => {
          logger.info(
            `[ACHIEVEMENT] Awarded "${achievement.name}" (${achievement.key}) to user ${userId} for ${achievement.points || 0} XP`,
            'app'
          );
        });

        await this.updateUserStats(userId, newAchievements);
        // Re-fetch stats after update to compute delta
        const afterStats = await this.getUserStats(userId);
        const newXP = afterStats.experience_points || 0;
        const newLevel = afterStats.level || 1;
        const afterLevelInfo = this.calculateLevelFromXP(newXP);

        // Send XP update event for frontend animation
        try {
          await NotificationService.sendXPUpdateNotification(userId, {
            oldXP,
            newXP,
            deltaXP: (newAchievements || []).reduce((sum, a) => sum + (a.points || 0), 0),
            oldLevel,
            newLevel,
            currentLevelMinXPBefore: beforeLevelInfo.currentLevelMinXP,
            nextLevelMinXPBefore: beforeLevelInfo.nextLevelMinXP,
            currentLevelMinXPAfter: afterLevelInfo.currentLevelMinXP,
            nextLevelMinXPAfter: afterLevelInfo.nextLevelMinXP
          });
        } catch (e) {
          console.warn('Failed to send XP update notification:', e.message);
        }

        // If level changed, also send level-up notification
        if (newLevel > oldLevel) {
          try {
            await NotificationService.sendLevelUpNotification(userId, newLevel, oldLevel);
          } catch (e) {
            console.warn('Failed to send level up notification:', e.message);
          }
        }

        // Refresh leaderboards in the background so rankings reflect new
        // points without blocking the award path (debounced global job)
        try {
          await this.enqueueLeaderboardUpdate();
        } catch (e) {
          console.warn('Failed to enqueue leaderboard update after achievements:', e.message);
        }

        // Send notifications for new achievements
        for (const achievement of newAchievements) {
          await NotificationService.sendAchievementNotification(userId, achievement);
        }
      }

      return newAchievements;
    } catch (error) {
      console.error('Error checking achievements:', error);
      throw error;
    }
  }

  // Enqueue a debounced global leaderboard rebuild. Only one pending or
  // processing leaderboard_update job exists at a time (same NOT EXISTS
  // dedup pattern as the mae_recalc enqueues in migration 222). The
  // sequential job queue processes it (jobQueue.processLeaderboardUpdate).
  static async enqueueLeaderboardUpdate() {
    const result = await db.query(`
      INSERT INTO job_queue (type, data, priority, user_id, status, created_at)
      SELECT 'leaderboard_update', '{}'::jsonb, 4, NULL, 'pending', CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM job_queue
        WHERE type = 'leaderboard_update'
          AND status IN ('pending', 'processing')
      )
      RETURNING id
    `);

    if (result.rows.length > 0) {
      // Make sure the sequential poller is running and on its fast interval
      try {
        const jobQueue = require('../utils/jobQueue');
        jobQueue.startProcessing();
        jobQueue.resetBackoff();
      } catch (e) {
        console.warn('Failed to nudge job queue after leaderboard enqueue:', e.message);
      }
    }

    return result.rows[0]?.id || null;
  }

  // Get achievements user hasn't earned yet
  static async getUnearnedAchievements(userId) {
    const query = `
      SELECT a.*
      FROM achievements a
      WHERE a.is_active = true
        AND (
          a.is_repeatable = true
          OR NOT EXISTS (
            SELECT 1 FROM user_achievements ua
            WHERE ua.user_id = $1 AND ua.achievement_id = a.id
          )
        )
      ORDER BY a.difficulty, a.points
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Build the batched snapshot all criteria evaluate against. Three queries
  // replace the former one-aggregate-query-per-achievement pattern:
  //   1. one ordered lightweight pass over trades (per-trade derived fields)
  //   2. one pass over adherence reviews
  //   3. one scalar query over the small auxiliary tables
  static async getUserAchievementStats(userId) {
    const [tradesResult, reviewsResult, miscResult] = await Promise.all([
      db.query(TRADES_SNAPSHOT_QUERY, [userId]),
      db.query(REVIEWS_SNAPSHOT_QUERY, [userId]),
      db.query(MISC_SNAPSHOT_QUERY, [userId])
    ]);

    const trades = tradesResult.rows;

    return {
      trades,
      // Snapshot query orders by exit_time DESC, so this preserves the
      // "most recent closed trades first" ordering the old queries used
      closedTrades: trades.filter(t => t.is_closed),
      reviews: reviewsResult.rows,
      misc: miscResult.rows[0] || {},
      // Same "today" the old checks computed in JS (UTC date string)
      todayStr: new Date().toISOString().split('T')[0]
    };
  }

  // Check if user meets criteria for a specific achievement. Evaluates
  // against the batched snapshot; builds one on demand when not provided
  // (keeps the old (userId, achievement) call shape working).
  static async checkAchievementCriteria(userId, achievement, stats = null) {
    try {
      const criteria = achievement.criteria;

      switch (criteria.type) {
      case 'registration':
      case 'dashboard_visit':
      case 'achievement_page_visit':
        return await AchievementService.checkImmediateAchievement(userId, criteria.type);

      case 'peer_rank':
        // Cross-user percentile - cannot come from the per-user snapshot
        return await AchievementService.checkPeerRank(userId, criteria.percentile);

      default:
        break;
      }

      const snapshot = stats || await AchievementService.getUserAchievementStats(userId);

      switch (criteria.type) {
      case 'no_revenge_trades':
        return AchievementService.evaluateNoRevengeTrades(snapshot, criteria.days);

      case 'discipline_score':
        return AchievementService.evaluateDisciplineScore(snapshot, criteria.threshold, criteria.days);

      case 'risk_adherence':
        return AchievementService.evaluateRiskAdherence(snapshot, criteria.trades);

      case 'closed_trades_with_stop_loss':
        return AchievementService.evaluateClosedTradesWithStopLoss(snapshot, criteria.count);

      case 'active_playbooks':
        return AchievementService.evaluateActivePlaybooks(snapshot, criteria.count);

      case 'cooling_period_usage':
        return AchievementService.evaluateCoolingPeriodUsage(snapshot, criteria.percentage);

      case 'planned_trades':
        return AchievementService.evaluatePlannedTrades(snapshot, criteria.count);

      case 'trade_data_hygiene':
        return AchievementService.evaluateTradeDataHygiene(snapshot, criteria.count, criteria.min_length);

      case 'high_adherence_reviews':
        return AchievementService.evaluateHighAdherenceReviews(snapshot, criteria.count, criteria.threshold);

      case 'weekly_pnl':
        return AchievementService.evaluateWeeklyPnL(snapshot, criteria.positive);

      case 'journaled_trades':
        return AchievementService.evaluateJournaledTrades(snapshot, criteria.count, criteria.min_length);

      case 'review_habit':
        return AchievementService.evaluateReviewHabit(snapshot, criteria.count, criteria.days);

      case 'followed_plan_count':
        return AchievementService.evaluateFollowedPlanCount(snapshot, criteria.count);

      case 'win_rate':
        return AchievementService.evaluateWinRate(snapshot, criteria.threshold, criteria.trades);

      case 'risk_reward':
        return AchievementService.evaluateRiskReward(snapshot, criteria.ratio, criteria.trades);

      case 'patterns_identified':
        return AchievementService.evaluatePatternsIdentified(snapshot, criteria.count);

      case 'challenges_completed':
        return AchievementService.evaluateChallengesCompleted(snapshot, criteria.count);

      case 'community_challenges':
        return AchievementService.evaluateCommunityChallenges(snapshot, criteria.count);

      case 'trade_count':
        return AchievementService.evaluateTradeCount(snapshot, criteria.count);

      case 'first_profitable_trade':
        return AchievementService.evaluateFirstProfitableTrade(snapshot);

      case 'first_stop_loss':
        return AchievementService.evaluateFirstStopLoss(snapshot);

      case 'first_take_profit':
        return AchievementService.evaluateFirstTakeProfit(snapshot);

      case 'weekend_trade':
        return AchievementService.evaluateWeekendTrade(snapshot);

      case 'early_trade':
        return AchievementService.evaluateEarlyTrade(snapshot, criteria.before_hour);

      case 'late_trade':
        return AchievementService.evaluateLateTrade(snapshot, criteria.after_hour);

      case 'trading_streak':
        return AchievementService.evaluateTradingStreak(snapshot, criteria.days);

      case 'different_symbols':
        return AchievementService.evaluateDifferentSymbols(snapshot, criteria.count);

      case 'first_trade_daily':
        return AchievementService.evaluateFirstTradeDaily(snapshot);

      case 'quick_flip':
        return AchievementService.evaluateQuickFlip(snapshot, criteria.max_duration_minutes);

      case 'green_day':
        return AchievementService.evaluateGreenDay(snapshot);

      case 'profitable_streak':
        return AchievementService.evaluateProfitableStreak(snapshot, criteria.days);

      case 'early_market_trade':
        return AchievementService.evaluateEarlyMarketTrade(snapshot, criteria.minutes_from_open);

      case 'risk_reward_ratio':
        return AchievementService.evaluateRiskRewardRatio(snapshot, criteria.min_ratio);

      case 'trend_following_profit':
        return AchievementService.evaluateTrendFollowingProfit(snapshot);

      case 'news_based_profit':
        return AchievementService.evaluateNewsBasedProfit(snapshot);

      case 'daily_volume':
        return AchievementService.evaluateDailyVolume(snapshot, criteria.shares);

      case 'single_trade_profit':
        return AchievementService.evaluateSingleTradeProfit(snapshot, criteria.min_profit);

      case 'position_size':
        return AchievementService.evaluatePositionSize(snapshot, criteria.min_size);

      case 'daily_sector_diversity':
        return AchievementService.evaluateDailySectorDiversity(snapshot, criteria.min_sectors);

      case 'weekly_portfolio_gain':
        return AchievementService.evaluateWeeklyPortfolioGain(snapshot, criteria.min_percentage);

      default:
        console.log(`Unknown achievement criteria type: ${criteria.type}`);
        return false;
      }
    } catch (error) {
      console.error(`Error checking criteria for achievement ${achievement.name}:`, error);
      return false;
    }
  }

  // Award achievement to user
  static async awardAchievement(userId, achievementId, metadata = {}) {
    // Check if user already has this achievement
    const existing = await db.query(
      'SELECT id FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
      [userId, achievementId]
    );

    if (existing.rows.length > 0) {
      console.log(`User ${userId} already has achievement ${achievementId}`);
      return null; // Already earned
    }

    const query = `
      INSERT INTO user_achievements (user_id, achievement_id, metadata, earned_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, achievement_id) DO NOTHING
      RETURNING *
    `;

    const result = await db.query(query, [userId, achievementId, JSON.stringify(metadata)]);
    console.log(`Awarded achievement ${achievementId} to user ${userId}`);
    return result.rows[0];
  }

  // Update user gamification stats
  static async updateUserStats(userId, newAchievements) {
    const totalPoints = newAchievements.reduce((sum, a) => sum + a.points, 0);

    // Get current stats to calculate new level
    const currentStats = await db.query(`
      SELECT experience_points FROM user_gamification_stats WHERE user_id = $1
    `, [userId]);

    const currentXP = currentStats.rows.length > 0 ? currentStats.rows[0].experience_points || 0 : 0;
    const newXP = currentXP + totalPoints;
    const levelInfo = this.calculateLevelFromXP(newXP);

    const query = `
      INSERT INTO user_gamification_stats (user_id, total_points, achievement_count, last_achievement_date, experience_points, level)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $2, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        total_points = user_gamification_stats.total_points + $2,
        achievement_count = user_gamification_stats.achievement_count + $3,
        last_achievement_date = CURRENT_TIMESTAMP,
        experience_points = user_gamification_stats.experience_points + $2,
        level = $4,
        updated_at = CURRENT_TIMESTAMP
    `;

    await db.query(query, [userId, totalPoints, newAchievements.length, levelInfo.level]);
  }

  // --- Snapshot-based criteria evaluators -------------------------------
  // Each evaluator replicates the exact semantics of the SQL it replaced
  // (thresholds, NULL handling, ordering, window boundaries).

  // No revenge trades for X days (and trading activity during the window)
  static evaluateNoRevengeTrades(snapshot, days) {
    const windowSeconds = days * DAY_SECONDS;
    const latestRevengeAge = snapshot.misc.latest_revenge_age_seconds;
    // Old SQL: COUNT of revenge events in window === 0
    const revengeFree = latestRevengeAge === null || latestRevengeAge === undefined
      || latestRevengeAge > windowSeconds;

    if (revengeFree) {
      const tradesDuringPeriod = snapshot.trades.filter(
        t => t.entry_age_seconds !== null && t.entry_age_seconds <= windowSeconds
      ).length;

      if (tradesDuringPeriod > 0) {
        return {
          earned: true,
          metadata: {
            days_clean: days,
            trades_during_period: tradesDuringPeriod
          }
        };
      }
    }

    return false;
  }

  // Discipline score maintenance (per-day share of >=1.5% winners)
  static evaluateDisciplineScore(snapshot, threshold, days) {
    const windowSeconds = days * DAY_SECONDS;
    const windowTrades = snapshot.trades.filter(
      t => t.is_closed && t.entry_age_seconds !== null && t.entry_age_seconds <= windowSeconds
    );

    const byDay = new Map();
    for (const t of windowTrades) {
      let day = byDay.get(t.entry_date);
      if (!day) {
        day = { total: 0, qualifying: 0 };
        byDay.set(t.entry_date, day);
      }
      day.total++;
      if (t.pnl !== null && t.pnl > 0 && t.exit_price !== null
          && t.price_move_fraction !== null && t.price_move_fraction >= 0.015) {
        day.qualifying++;
      }
    }

    // Old SQL filtered days by score >= threshold before AVG/COUNT
    const qualifyingScores = [];
    for (const day of byDay.values()) {
      const score = (day.qualifying / day.total) * 100;
      if (score >= threshold) {
        qualifyingScores.push(score);
      }
    }

    if (qualifyingScores.length === 0) {
      return false; // AVG over empty set was NULL -> comparison false
    }

    const avgDiscipline = qualifyingScores.reduce((sum, s) => sum + s, 0) / qualifyingScores.length;
    const daysTraded = qualifyingScores.length;

    if (avgDiscipline >= threshold && daysTraded >= days * 0.7) {
      return {
        earned: true,
        metadata: {
          average_discipline: avgDiscipline,
          days_maintained: daysTraded
        }
      };
    }

    return false;
  }

  // Risk adherence: last N closed trades all within |pnl| <= 1000
  static evaluateRiskAdherence(snapshot, requiredTrades) {
    const recent = snapshot.closedTrades.slice(0, requiredTrades);
    const total = recent.length;
    const withinRisk = recent.filter(t => t.pnl !== null && Math.abs(t.pnl) <= 1000).length;

    if (total >= requiredTrades && withinRisk === total) {
      return {
        earned: true,
        metadata: {
          trades_checked: total,
          all_within_risk: true
        }
      };
    }

    return false;
  }

  static evaluateClosedTradesWithStopLoss(snapshot, requiredTrades) {
    const qualifying = snapshot.closedTrades.filter(t => t.has_stop_loss).length;

    if (qualifying >= requiredTrades) {
      return {
        earned: true,
        metadata: {
          qualifying_trades: qualifying,
          required_trades: requiredTrades
        }
      };
    }

    return false;
  }

  static evaluateActivePlaybooks(snapshot, requiredCount) {
    const activePlaybookCount = snapshot.misc.active_playbook_count || 0;

    if (activePlaybookCount >= requiredCount) {
      return {
        earned: true,
        metadata: {
          active_playbook_count: activePlaybookCount,
          required_count: requiredCount
        }
      };
    }

    return false;
  }

  // Cooling period usage after losses (last 30 days)
  static evaluateCoolingPeriodUsage(snapshot, percentage) {
    // Old SQL: losing closed trades in the last 30 days, LEAD(entry_time)
    // ordered by exit_time (i.e. the NEXT losing trade's entry time)
    const lossTrades = snapshot.trades
      .filter(t => t.is_closed && t.pnl !== null && t.pnl < 0
        && t.exit_age_seconds !== null && t.exit_age_seconds <= 30 * DAY_SECONDS)
      .sort((a, b) => a.exit_epoch - b.exit_epoch);

    const totalLosses = lossTrades.length;
    let withCooling = 0;
    for (let i = 0; i < lossTrades.length - 1; i++) {
      const next = lossTrades[i + 1];
      if (next.entry_epoch !== null && lossTrades[i].exit_epoch !== null) {
        const gapMinutes = (next.entry_epoch - lossTrades[i].exit_epoch) / 60;
        if (gapMinutes >= 30) {
          withCooling++;
        }
      }
    }

    const usagePercentage = totalLosses > 0 ? (withCooling / totalLosses) * 100 : 0;

    if (usagePercentage >= percentage && totalLosses >= 10) {
      return {
        earned: true,
        metadata: {
          usage_percentage: usagePercentage,
          losses_with_cooling: withCooling,
          total_losses: totalLosses
        }
      };
    }

    return false;
  }

  static evaluateJournaledTrades(snapshot, requiredTrades, minLength = 20) {
    const qualifying = snapshot.closedTrades.filter(
      t => t.notes_length >= minLength || t.max_review_notes_length >= minLength
    ).length;

    if (qualifying >= requiredTrades) {
      return {
        earned: true,
        metadata: {
          qualifying_trades: qualifying,
          required_trades: requiredTrades,
          min_length: minLength
        }
      };
    }

    return false;
  }

  static evaluatePlannedTrades(snapshot, requiredTrades) {
    const qualifying = snapshot.closedTrades.filter(
      t => t.has_stop_loss && t.has_take_profit
    ).length;

    if (qualifying >= requiredTrades) {
      return {
        earned: true,
        metadata: {
          qualifying_trades: qualifying,
          required_trades: requiredTrades
        }
      };
    }

    return false;
  }

  static evaluateTradeDataHygiene(snapshot, requiredTrades, minLength = 20) {
    const qualifying = snapshot.closedTrades.filter(
      t => t.has_stop_loss
        && t.setup_length > 0
        && (t.notes_length >= minLength || t.max_review_notes_length >= minLength)
    ).length;

    if (qualifying >= requiredTrades) {
      return {
        earned: true,
        metadata: {
          qualifying_trades: qualifying,
          required_trades: requiredTrades,
          min_length: minLength
        }
      };
    }

    return false;
  }

  static evaluateReviewHabit(snapshot, requiredReviews, days) {
    const windowSeconds = days * DAY_SECONDS;
    const completedReviews = snapshot.reviews.filter(
      r => r.reviewed_age_seconds !== null && r.reviewed_age_seconds <= windowSeconds
    ).length;

    if (completedReviews >= requiredReviews) {
      return {
        earned: true,
        metadata: {
          completed_reviews: completedReviews,
          required_reviews: requiredReviews,
          window_days: days
        }
      };
    }

    return false;
  }

  static evaluateFollowedPlanCount(snapshot, requiredTrades) {
    const followedReviews = snapshot.reviews.filter(
      r => r.followed_plan === true && r.trade_closed
    ).length;

    if (followedReviews >= requiredTrades) {
      return {
        earned: true,
        metadata: {
          followed_reviews: followedReviews,
          required_trades: requiredTrades
        }
      };
    }

    return false;
  }

  static evaluateHighAdherenceReviews(snapshot, requiredReviews, threshold) {
    const qualifyingReviews = snapshot.reviews.filter(
      r => r.followed_plan === true && r.trade_closed && r.adherence_score >= threshold
    ).length;

    if (qualifyingReviews >= requiredReviews) {
      return {
        earned: true,
        metadata: {
          qualifying_reviews: qualifyingReviews,
          required_reviews: requiredReviews,
          threshold
        }
      };
    }

    return false;
  }

  // Weekly P&L (current DB week, i.e. date_trunc('week', CURRENT_TIMESTAMP))
  static evaluateWeeklyPnL(snapshot, mustBePositive) {
    const weekTrades = snapshot.closedTrades.filter(t => t.exit_in_current_week);
    const tradeCount = weekTrades.length;
    const pnlValues = weekTrades.filter(t => t.pnl !== null);
    // SUM over zero non-null values was NULL -> parseFloat(NULL) > 0 false
    const weeklyPnl = pnlValues.length > 0
      ? pnlValues.reduce((sum, t) => sum + t.pnl, 0)
      : null;

    if (mustBePositive && weeklyPnl !== null && weeklyPnl > 0 && tradeCount >= 5) {
      return {
        earned: true,
        metadata: {
          weekly_pnl: weeklyPnl,
          trade_count: tradeCount
        }
      };
    }

    return false;
  }

  // Win rate over the last N closed trades
  static evaluateWinRate(snapshot, threshold, requiredTrades) {
    const recent = snapshot.closedTrades.slice(0, requiredTrades);
    const total = recent.length;
    const winning = recent.filter(t => t.pnl !== null && t.pnl > 0).length;
    const winRate = total > 0 ? (winning / total) * 100 : 0;

    if (total >= requiredTrades && winRate >= threshold) {
      return {
        earned: true,
        metadata: {
          win_rate: winRate,
          trades_analyzed: total,
          winning_trades: winning
        }
      };
    }

    return false;
  }

  // Calculate and update current trading streak
  static async updateTradingStreak(userId) {
    try {
      const streakQuery = `
        WITH trading_days AS (
          SELECT DISTINCT DATE(entry_time AT TIME ZONE 'UTC') as trade_date
          FROM trades
          WHERE user_id = $1
          ORDER BY trade_date DESC
        ),
        dated_trades AS (
          SELECT
            trade_date,
            ROW_NUMBER() OVER (ORDER BY trade_date DESC) as row_num,
            trade_date + INTERVAL '1 day' * ROW_NUMBER() OVER (ORDER BY trade_date DESC) as expected_date
          FROM trading_days
        ),
        current_streak AS (
          SELECT COUNT(*) as streak_days
          FROM dated_trades
          WHERE trade_date = CURRENT_DATE - INTERVAL '1 day' * (row_num - 1)
          AND trade_date <= CURRENT_DATE
        ),
        longest_streak AS (
          SELECT
            trade_date,
            LAG(trade_date) OVER (ORDER BY trade_date) as prev_date,
            CASE
              WHEN LAG(trade_date) OVER (ORDER BY trade_date) = trade_date - INTERVAL '1 day'
              THEN 0
              ELSE 1
            END as is_break
          FROM trading_days
        ),
        streak_groups AS (
          SELECT
            trade_date,
            SUM(is_break) OVER (ORDER BY trade_date ROWS UNBOUNDED PRECEDING) as group_id
          FROM longest_streak
        ),
        streak_lengths AS (
          SELECT
            group_id,
            COUNT(*) as streak_length,
            MIN(trade_date) as streak_start,
            MAX(trade_date) as streak_end
          FROM streak_groups
          GROUP BY group_id
        )
        SELECT
          COALESCE((SELECT streak_days FROM current_streak), 0) as current_streak_days,
          COALESCE((SELECT MAX(streak_length) FROM streak_lengths), 0) as longest_streak_days
      `;

      const result = await db.query(streakQuery, [userId]);
      const { current_streak_days, longest_streak_days } = result.rows[0];

      // Update user gamification stats
      await db.query(`
        INSERT INTO user_gamification_stats (user_id, current_streak_days, longest_streak_days)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id)
        DO UPDATE SET
          current_streak_days = EXCLUDED.current_streak_days,
          longest_streak_days = GREATEST(user_gamification_stats.longest_streak_days, EXCLUDED.longest_streak_days),
          updated_at = CURRENT_TIMESTAMP
      `, [userId, current_streak_days, longest_streak_days]);

      return { current_streak_days, longest_streak_days };

    } catch (error) {
      console.error('Error updating trading streak for user', userId, ':', error);
      return { current_streak_days: 0, longest_streak_days: 0 };
    }
  }

  // Risk/reward: last N closed trades with sufficient percentage move
  static evaluateRiskReward(snapshot, targetRatio, requiredTrades) {
    const recent = snapshot.closedTrades.slice(0, requiredTrades);
    const goodRRTrades = recent.filter(
      t => t.pnl !== null && t.pnl > 0 && t.exit_price !== null
        && t.price_move_fraction !== null && t.price_move_fraction >= targetRatio * 0.01
    ).length;

    if (goodRRTrades >= requiredTrades) {
      return {
        earned: true,
        metadata: {
          trades_with_good_rr: goodRRTrades,
          target_ratio: targetRatio
        }
      };
    }

    return false;
  }

  static evaluatePatternsIdentified(snapshot, requiredCount) {
    const patternsCount = snapshot.misc.patterns_identified || 0;

    if (patternsCount >= requiredCount) {
      return {
        earned: true,
        metadata: {
          patterns_identified: patternsCount
        }
      };
    }

    return false;
  }

  static evaluateChallengesCompleted(snapshot, requiredCount) {
    const completedCount = snapshot.misc.challenges_completed || 0;

    if (completedCount >= requiredCount) {
      return {
        earned: true,
        metadata: {
          challenges_completed: completedCount
        }
      };
    }

    return false;
  }

  // Check peer rank (targeted query - percentile across the peer group
  // cannot be derived from a single user's snapshot)
  static async checkPeerRank(userId, requiredPercentile) {
    // Get user's peer group and calculate rank
    const query = `
      WITH peer_scores AS (
        SELECT
          u.id,
          COALESCE(gs.total_points, 0) as score,
          PERCENT_RANK() OVER (ORDER BY COALESCE(gs.total_points, 0)) * 100 as percentile
        FROM users u
        JOIN user_peer_groups upg ON upg.user_id = u.id
        LEFT JOIN user_gamification_stats gs ON gs.user_id = u.id
        WHERE upg.peer_group_id IN (
          SELECT peer_group_id
          FROM user_peer_groups
          WHERE user_id = $1 AND is_active = true
        )
      )
      SELECT percentile
      FROM peer_scores
      WHERE id = $1
    `;

    const result = await db.query(query, [userId]);

    if (result.rows.length > 0 && result.rows[0].percentile >= requiredPercentile) {
      return {
        earned: true,
        metadata: {
          percentile_rank: result.rows[0].percentile
        }
      };
    }

    return false;
  }

  static evaluateCommunityChallenges(snapshot, requiredCount) {
    const participatedCount = snapshot.misc.community_challenges || 0;

    if (participatedCount >= requiredCount) {
      return {
        earned: true,
        metadata: {
          community_challenges: participatedCount
        }
      };
    }

    return false;
  }

  static evaluateTradeCount(snapshot, requiredCount) {
    const tradeCount = snapshot.trades.length;

    if (tradeCount >= requiredCount) {
      return {
        earned: true,
        metadata: {
          total_trades: tradeCount
        }
      };
    }

    return false;
  }

  // Get user achievements
  static async getUserAchievements(userId) {
    // Includes unlock_percentage so the UI can show how rare each achievement is.
    // Denominator = users who have earned at least one achievement (the engaged player base).
    const query = `
      SELECT
        a.*,
        ua.earned_at,
        ua.progress,
        ua.metadata as earn_metadata,
        COALESCE(stats.earned_count, 0) AS earned_by_count,
        CASE
          WHEN totals.engaged_users > 0 THEN
            ROUND(100.0 * COALESCE(stats.earned_count, 0) / totals.engaged_users, 1)::float
          ELSE 0
        END AS unlock_percentage
      FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id
      LEFT JOIN (
        SELECT achievement_id, COUNT(*) AS earned_count
        FROM user_achievements
        WHERE earned_at IS NOT NULL
        GROUP BY achievement_id
      ) stats ON stats.achievement_id = a.id
      CROSS JOIN (
        SELECT COUNT(DISTINCT user_id) AS engaged_users
        FROM user_achievements
        WHERE earned_at IS NOT NULL
      ) totals
      WHERE ua.user_id = $1
      ORDER BY ua.earned_at DESC
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Get user stats
  static async getUserStats(userId) {
    const query = `
      SELECT *
      FROM user_gamification_stats
      WHERE user_id = $1
    `;

    const result = await db.query(query, [userId]);

    let stats;
    if (result.rows.length === 0) {
      // Initialize stats if not exists
      await db.query(`
        INSERT INTO user_gamification_stats (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId]);

      stats = {
        user_id: userId,
        total_points: 0,
        achievement_count: 0,
        challenge_count: 0,
        current_streak_days: 0,
        longest_streak_days: 0,
        level: 1,
        experience_points: 0,
        badges: []
      };
    } else {
      stats = result.rows[0];
    }

    // Add level progression information using new formula
    const currentXP = stats.experience_points || 0;
    const levelInfo = this.calculateLevelFromXP(currentXP);

    const currentLevel = levelInfo.level;
    const currentLevelMinXP = levelInfo.currentLevelMinXP;
    const nextLevelMinXP = levelInfo.nextLevelMinXP;
    const pointsForCurrentLevel = currentXP - currentLevelMinXP;
    const pointsNeededForNextLevel = nextLevelMinXP - currentXP;
    const totalPointsForCurrentLevel = nextLevelMinXP - currentLevelMinXP;

    return {
      ...stats,
      level: currentLevel, // Override with calculated level
      level_progress: {
        current_level: currentLevel,
        points_in_current_level: pointsForCurrentLevel,
        points_needed_for_next_level: Math.max(pointsNeededForNextLevel, 0),
        total_points_for_current_level: totalPointsForCurrentLevel,
        progress_percentage: Math.min((pointsForCurrentLevel / totalPointsForCurrentLevel) * 100, 100),
        current_level_min_xp: currentLevelMinXP,
        next_level_min_xp: nextLevelMinXP
      }
    };
  }

  // Get available achievements for user
  static async getAvailableAchievements(userId) {
    // Includes unlock_percentage so the UI can show how rare each achievement is.
    // Denominator = users who have earned at least one achievement (the engaged player base).
    const query = `
      SELECT
        a.*,
        CASE
          WHEN ua.achievement_id IS NOT NULL THEN true
          ELSE false
        END as earned,
        ua.earned_at,
        ua.progress,
        COALESCE(stats.earned_count, 0) AS earned_by_count,
        CASE
          WHEN totals.engaged_users > 0 THEN
            ROUND(100.0 * COALESCE(stats.earned_count, 0) / totals.engaged_users, 1)::float
          ELSE 0
        END AS unlock_percentage
      FROM achievements a
      LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
      LEFT JOIN (
        SELECT achievement_id, COUNT(*) AS earned_count
        FROM user_achievements
        WHERE earned_at IS NOT NULL
        GROUP BY achievement_id
      ) stats ON stats.achievement_id = a.id
      CROSS JOIN (
        SELECT COUNT(DISTINCT user_id) AS engaged_users
        FROM user_achievements
        WHERE earned_at IS NOT NULL
      ) totals
      WHERE a.is_active = true
      ORDER BY a.category, a.difficulty, a.points
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Update achievement progress
  static async updateAchievementProgress(userId, achievementKey, progress) {
    const achievement = await db.query(
      'SELECT id, max_progress FROM achievements WHERE key = $1',
      [achievementKey]
    );

    if (achievement.rows.length === 0) return;

    const achievementId = achievement.rows[0].id;
    const maxProgress = achievement.rows[0].max_progress;

    // Check if progress is complete
    if (progress >= maxProgress) {
      return await AchievementService.awardAchievement(userId, achievementId, { progress });
    }

    // Update progress
    await db.query(`
      INSERT INTO user_achievements (user_id, achievement_id, progress, earned_at)
      VALUES ($1, $2, $3, NULL)
      ON CONFLICT (user_id, achievement_id)
      DO UPDATE SET progress = $3
      WHERE user_achievements.earned_at IS NULL
    `, [userId, achievementId, progress]);
  }

  // Check immediate achievements (always return true for new users)
  static async checkImmediateAchievement(userId, type) {
    return {
      earned: true,
      metadata: {
        achievement_type: type,
        earned_immediately: true
      }
    };
  }

  // Check for immediate achievements that can be awarded right away
  static async checkImmediateAchievements(userId) {
    const immediateAchievements = [];

    try {
      // Check for achievements like "Welcome Aboard", "Dashboard Explorer"
      const welcomeAchievement = await db.query(`
        SELECT a.* FROM achievements a
        WHERE a.key = 'welcome_aboard'
        AND NOT EXISTS (
          SELECT 1 FROM user_achievements ua
          WHERE ua.user_id = $1 AND ua.achievement_id = a.id
        )
      `, [userId]);

      if (welcomeAchievement.rows.length > 0) {
        const achievement = welcomeAchievement.rows[0];
        const awarded = await AchievementService.awardAchievement(userId, achievement.id, { immediate: true });
        if (awarded) {
          immediateAchievements.push(achievement);
        }
      }

      const dashboardAchievement = await db.query(`
        SELECT a.* FROM achievements a
        WHERE a.key = 'dashboard_explorer'
        AND NOT EXISTS (
          SELECT 1 FROM user_achievements ua
          WHERE ua.user_id = $1 AND ua.achievement_id = a.id
        )
      `, [userId]);

      if (dashboardAchievement.rows.length > 0) {
        const achievement = dashboardAchievement.rows[0];
        const awarded = await AchievementService.awardAchievement(userId, achievement.id, { dashboard_visit: true });
        if (awarded) {
          immediateAchievements.push(achievement);
        }
      }

      // Update user stats if we awarded any immediate achievements
      if (immediateAchievements.length > 0) {
        await AchievementService.updateUserStats(userId, immediateAchievements);
      }
    } catch (error) {
      console.error('Error in checkImmediateAchievements:', error);
      // Return empty array on error
    }

    return immediateAchievements;
  }

  static evaluateFirstProfitableTrade(snapshot) {
    const profitableCount = snapshot.closedTrades.filter(
      t => t.pnl !== null && t.pnl > 0
    ).length;

    if (profitableCount >= 1) {
      return {
        earned: true,
        metadata: {
          first_profit_date: new Date().toISOString()
        }
      };
    }

    return false;
  }

  // First stop loss - closed losing trades whose notes mention "stop"
  static evaluateFirstStopLoss(snapshot) {
    const managedLossCount = snapshot.closedTrades.filter(
      t => t.pnl !== null && t.pnl < 0 && t.notes_mention_stop
    ).length;

    if (managedLossCount >= 1) {
      return {
        earned: true,
        metadata: {
          first_stop_loss_date: new Date().toISOString()
        }
      };
    }

    return false;
  }

  // First take profit - closed winners whose notes mention profit/target
  static evaluateFirstTakeProfit(snapshot) {
    const takeProfitCount = snapshot.closedTrades.filter(
      t => t.pnl !== null && t.pnl > 0 && t.notes_mention_profit
    ).length;

    if (takeProfitCount >= 1) {
      return {
        earned: true,
        metadata: {
          first_take_profit_date: new Date().toISOString()
        }
      };
    }

    return false;
  }

  static evaluateWeekendTrade(snapshot) {
    const weekendCount = snapshot.trades.filter(
      t => t.entry_dow === 0 || t.entry_dow === 6
    ).length;

    if (weekendCount >= 1) {
      return {
        earned: true,
        metadata: {
          weekend_trades: weekendCount
        }
      };
    }

    return false;
  }

  static evaluateEarlyTrade(snapshot, beforeHour) {
    const earlyCount = snapshot.trades.filter(
      t => t.entry_hour !== null && t.entry_hour < beforeHour
    ).length;

    if (earlyCount >= 1) {
      return {
        earned: true,
        metadata: {
          early_trades: earlyCount,
          before_hour: beforeHour
        }
      };
    }

    return false;
  }

  static evaluateLateTrade(snapshot, afterHour) {
    const lateCount = snapshot.trades.filter(
      t => t.entry_hour !== null && t.entry_hour >= afterHour
    ).length;

    if (lateCount >= 1) {
      return {
        earned: true,
        metadata: {
          late_trades: lateCount,
          after_hour: afterHour
        }
      };
    }

    return false;
  }

  // Trading streak - replicates the legacy SQL literally: ROW_NUMBER over
  // distinct trade dates DESC, grouped by trade_date - (rn - 1) days.
  // NOTE (pre-existing bug, preserved bit-for-bit): with DESC ordering that
  // group key never merges consecutive days, so max_streak is always 1 for
  // any user with at least one trade and the achievement cannot fire for
  // criteria.days > 1. The correct islands logic lives in
  // updateTradingStreak (longest_streak_days); fix both together if this
  // criterion is ever meant to work.
  static evaluateTradingStreak(snapshot, requiredDays) {
    const uniqueDatesDesc = [...new Set(
      snapshot.trades.map(t => t.entry_date).filter(Boolean)
    )].sort().reverse();

    const groups = new Map();
    uniqueDatesDesc.forEach((dateStr, idx) => {
      // group_date = trade_date - (rn - 1) days, rn over dates DESC
      const groupKey = Date.parse(`${dateStr}T00:00:00Z`) - idx * DAY_SECONDS * 1000;
      groups.set(groupKey, (groups.get(groupKey) || 0) + 1);
    });

    let maxStreak = 0;
    for (const length of groups.values()) {
      if (length > maxStreak) maxStreak = length;
    }

    if (maxStreak >= requiredDays) {
      return {
        earned: true,
        metadata: {
          streak_length: maxStreak,
          required_days: requiredDays
        }
      };
    }

    return false;
  }

  static evaluateDifferentSymbols(snapshot, requiredCount) {
    const symbolCount = new Set(
      snapshot.trades.map(t => t.symbol).filter(s => s !== null && s !== undefined)
    ).size;

    if (symbolCount >= requiredCount) {
      return {
        earned: true,
        metadata: {
          symbols_traded: symbolCount,
          required_count: requiredCount
        }
      };
    }

    return false;
  }

  static evaluateFirstTradeDaily(snapshot) {
    const today = snapshot.todayStr;
    const tradeCount = snapshot.trades.filter(t => t.entry_date === today).length;

    if (tradeCount >= 1) {
      return {
        earned: true,
        metadata: {
          trade_date: today
        }
      };
    }

    return false;
  }

  // Quick flip: profitable closed trade within X minutes
  static evaluateQuickFlip(snapshot, maxMinutes) {
    const quickFlips = snapshot.closedTrades.filter(
      t => t.pnl !== null && t.pnl > 0
        && t.duration_minutes !== null && t.duration_minutes <= maxMinutes
    ).length;

    if (quickFlips >= 1) {
      return {
        earned: true,
        metadata: {
          max_duration_minutes: maxMinutes
        }
      };
    }

    return false;
  }

  // Green day: positive P&L on today's closed trades
  static evaluateGreenDay(snapshot) {
    const today = snapshot.todayStr;
    const todayClosed = snapshot.closedTrades.filter(
      t => t.entry_date === today && t.pnl !== null
    );
    const dailyPnl = todayClosed.reduce((sum, t) => sum + t.pnl, 0);

    if (dailyPnl > 0) {
      return {
        earned: true,
        metadata: {
          daily_pnl: dailyPnl,
          trade_date: today
        }
      };
    }

    return false;
  }

  // Profitable streak: consecutive profitable days counted back from the
  // most recent trading day (last 30 trading days considered). Replicates
  // the old SQL exactly, including its quirk that a window with no
  // unprofitable day yields a streak of 0.
  static evaluateProfitableStreak(snapshot, requiredDays) {
    const byDay = new Map();
    for (const t of snapshot.closedTrades) {
      if (!t.entry_date) continue;
      const day = byDay.get(t.entry_date) || { sum: 0, hasPnl: false };
      if (t.pnl !== null) {
        day.sum += t.pnl;
        day.hasPnl = true;
      }
      byDay.set(t.entry_date, day);
    }

    const days = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // date DESC
      .slice(0, 30)
      .map(([date, day]) => ({
        date,
        isProfitable: day.hasPnl && day.sum > 0 // NULL daily pnl is not profitable
      }));

    // rn of first unprofitable day (1-based); none -> 0 (old COALESCE quirk)
    let firstUnprofitableRn = 0;
    for (let i = 0; i < days.length; i++) {
      if (!days[i].isProfitable) {
        firstUnprofitableRn = i + 1;
        break;
      }
    }

    const maxStreak = Math.max(firstUnprofitableRn - 1, 0);

    if (maxStreak >= requiredDays) {
      return {
        earned: true,
        metadata: {
          streak_length: maxStreak,
          required_days: requiredDays
        }
      };
    }

    return false;
  }

  // Early market trade: within X minutes of the 9:30 open
  static evaluateEarlyMarketTrade(snapshot, minutesFromOpen) {
    const earlyTrades = snapshot.trades.filter(
      t => t.entry_hour === 9
        && t.entry_minute !== null
        && t.entry_minute >= 30 && t.entry_minute <= 30 + minutesFromOpen
    ).length;

    if (earlyTrades >= 1) {
      return {
        earned: true,
        metadata: {
          minutes_from_open: minutesFromOpen
        }
      };
    }

    return false;
  }

  static evaluateRiskRewardRatio(snapshot, minRatio) {
    const goodRRTrades = snapshot.closedTrades.filter(
      t => t.pnl !== null && t.pnl > 0 && t.exit_price !== null
        && t.price_move_fraction !== null && t.price_move_fraction >= minRatio * 0.01
    ).length;

    if (goodRRTrades >= 1) {
      return {
        earned: true,
        metadata: {
          min_ratio: minRatio
        }
      };
    }

    return false;
  }

  // Trend following profit (notes mention trend/MA/crossover)
  static evaluateTrendFollowingProfit(snapshot) {
    const trendTrades = snapshot.trades.filter(
      t => t.pnl !== null && t.pnl > 0 && t.notes_mention_trend
    ).length;

    if (trendTrades >= 1) {
      return {
        earned: true,
        metadata: {
          trend_trades: trendTrades
        }
      };
    }

    return false;
  }

  // News-based profit (notes mention news/earnings/catalyst/announcement)
  static evaluateNewsBasedProfit(snapshot) {
    const newsTrades = snapshot.trades.filter(
      t => t.pnl !== null && t.pnl > 0 && t.notes_mention_news
    ).length;

    if (newsTrades >= 1) {
      return {
        earned: true,
        metadata: {
          news_trades: newsTrades
        }
      };
    }

    return false;
  }

  // Daily volume: any single day whose total |quantity| meets the target
  static evaluateDailyVolume(snapshot, targetShares) {
    const byDay = new Map();
    for (const t of snapshot.trades) {
      if (!t.entry_date || t.quantity === null) continue;
      byDay.set(t.entry_date, (byDay.get(t.entry_date) || 0) + Math.abs(t.quantity));
    }

    let best = null;
    for (const [date, volume] of byDay.entries()) {
      if (volume >= targetShares && (best === null || volume > best.volume)) {
        best = { date, volume };
      }
    }

    if (best) {
      return {
        earned: true,
        metadata: {
          daily_volume: best.volume,
          target_shares: targetShares,
          trade_date: best.date
        }
      };
    }

    return false;
  }

  static evaluateSingleTradeProfit(snapshot, minProfit) {
    const bigWins = snapshot.closedTrades.filter(
      t => t.pnl !== null && t.pnl >= minProfit
    ).length;

    if (bigWins >= 1) {
      return {
        earned: true,
        metadata: {
          min_profit: minProfit
        }
      };
    }

    return false;
  }

  static evaluatePositionSize(snapshot, minSize) {
    const largePositions = snapshot.trades.filter(
      t => t.entry_price !== null && t.quantity !== null
        && Math.abs(t.entry_price * t.quantity) >= minSize
    ).length;

    if (largePositions >= 1) {
      return {
        earned: true,
        metadata: {
          min_size: minSize
        }
      };
    }

    return false;
  }

  // Daily sector diversity (simplified - first two symbol characters)
  static evaluateDailySectorDiversity(snapshot, minSectors) {
    const today = snapshot.todayStr;
    const sectorCount = new Set(
      snapshot.trades
        .filter(t => t.entry_date === today && t.symbol !== null && t.symbol !== undefined)
        .map(t => String(t.symbol).substring(0, 2))
    ).size;

    if (sectorCount >= minSectors) {
      return {
        earned: true,
        metadata: {
          sectors_traded: sectorCount,
          min_sectors: minSectors,
          trade_date: today
        }
      };
    }

    return false;
  }

  // Weekly portfolio gain against the simplified $10k starting balance
  static evaluateWeeklyPortfolioGain(snapshot, minPercentage) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of current week

    const weekTrades = snapshot.closedTrades.filter(
      t => t.pnl !== null && t.entry_time !== null && new Date(t.entry_time) >= weekStart
    );

    // Old SQL only returned a row when SUM(pnl) was non-NULL
    if (weekTrades.length === 0) {
      return false;
    }

    const weeklyPnl = weekTrades.reduce((sum, t) => sum + t.pnl, 0);
    const percentageGain = (weeklyPnl / 10000) * 100;

    if (percentageGain >= minPercentage) {
      return {
        earned: true,
        metadata: {
          weekly_gain_percentage: percentageGain,
          min_percentage: minPercentage,
          weekly_pnl: weeklyPnl
        }
      };
    }

    return false;
  }

  // Level progression system
  // Level 1: 0-99 XP (needs 100 to reach level 2)
  // Level 2: 100-249 XP (needs 150 more to reach level 3)
  // Level 3: 250-449 XP (needs 200 more to reach level 4)
  // Level 4: 450-699 XP (needs 250 more to reach level 5)
  // Each level requires 50 more XP than the previous level increment
  static calculateLevelFromXP(xp) {
    if (xp < 100) {
      return {
        level: 1,
        currentLevelMinXP: 0,
        nextLevelMinXP: 100
      };
    }

    let level = 1;
    let currentLevelMinXP = 0;
    let nextLevelMinXP = 100; // First milestone is 100 XP

    while (xp >= nextLevelMinXP) {
      level++;
      currentLevelMinXP = nextLevelMinXP;

      // Calculate XP needed for next level: starts at 100, then 150, 200, 250, etc.
      const xpForNextLevel = 100 + (level - 2) * 50;
      nextLevelMinXP = currentLevelMinXP + xpForNextLevel;
    }

    return {
      level,
      currentLevelMinXP,
      nextLevelMinXP
    };
  }
}

module.exports = AchievementService;
