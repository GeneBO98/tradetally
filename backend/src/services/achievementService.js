const db = require('../config/database');
const { fxUsd } = require('../utils/tradeFx');
const NotificationService = require('./notificationService');
const logger = require('../utils/logger');

// Lightweight per-trade snapshot: everything the achievement criteria need,
// computed in a single pass over the user's trades. Date/hour/window values
// are derived in SQL so they match the semantics of the old per-criterion
// queries exactly (DB session timezone, CURRENT_TIMESTAMP, ILIKE on NULL).
// Times follow the analytics convention: a trade's local time is
// entry_time AT TIME ZONE the user's timezone (most users store wall-clock
// times with timezone UTC). Imports without a time land at exactly 00:00 UTC;
// those trades are flagged so hour-based criteria skip them and their dates
// stay on the calendar day they were logged.
const TRADES_SNAPSHOT_QUERY = `
  SELECT
    -- Achievement criteria compare against dollar thresholds, so amounts are
    -- normalized to USD here rather than taken as stored.
    ${fxUsd('pnl', 't')}::float8 AS pnl,
    t.side,
    ${fxUsd('entry_price', 't')}::float8 AS entry_price,
    ${fxUsd('exit_price', 't')}::float8 AS exit_price,
    t.quantity::float8 AS quantity,
    t.instrument_type,
    t.contract_size::float8 AS contract_size,
    t.symbol,
    COALESCE(t.account_identifier, '') AS account_identifier,
    UPPER(COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol)) AS symbol_key,
    COALESCE(sc.gics_sector, sc.finnhub_industry) AS sector,
    t.r_value::float8 AS r_value,
    COALESCE(t.has_news, false) AS has_news,
    t.entry_time,
    (t.exit_time IS NOT NULL) AS is_closed,
    (t.stop_loss IS NOT NULL) AS has_stop_loss,
    (t.take_profit IS NOT NULL) AS has_take_profit,
    tm.entry_has_time,
    tm.exit_has_time,
    (CASE WHEN tm.entry_has_time THEN tm.entry_local ELSE tm.entry_utc END)::date::text AS entry_date,
    (CASE WHEN tm.exit_has_time THEN tm.exit_local ELSE tm.exit_utc END)::date::text AS exit_date,
    EXTRACT(HOUR FROM tm.entry_local)::int AS entry_hour,
    EXTRACT(DOW FROM (CASE WHEN tm.entry_has_time THEN tm.entry_local ELSE tm.entry_utc END))::int AS entry_dow,
    -- Minutes after midnight Eastern, for market-open checks. Users on the
    -- UTC default store Eastern wall-clock times, so read those as-is.
    (EXTRACT(HOUR FROM tm.entry_et) * 60 + EXTRACT(MINUTE FROM tm.entry_et))::int AS entry_et_minutes,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.entry_time))::float8 AS entry_age_seconds,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.exit_time))::float8 AS exit_age_seconds,
    EXTRACT(EPOCH FROM (t.exit_time - t.entry_time))::float8 / 60 AS duration_minutes,
    EXTRACT(EPOCH FROM t.exit_time)::float8 AS exit_epoch,
    EXTRACT(EPOCH FROM t.entry_time)::float8 AS entry_epoch,
    LENGTH(BTRIM(COALESCE(t.notes, ''))) AS notes_length,
    LENGTH(BTRIM(COALESCE(t.setup, ''))) AS setup_length,
    COALESCE(t.notes ~* '\\m((up|down)?trend(s|ing|ed|lines?)?|moving averages?|ma|ema|sma|crossovers?)\\M', false) AS notes_mention_trend,
    COALESCE(t.notes ~* '\\m(news|earnings|catalyst|announcement|fda|guidance)', false) AS notes_mention_news,
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
  JOIN users u ON u.id = t.user_id
  CROSS JOIN LATERAL (
    SELECT
      t.entry_time AT TIME ZONE 'UTC' AS entry_utc,
      t.exit_time AT TIME ZONE 'UTC' AS exit_utc,
      t.entry_time AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC') AS entry_local,
      t.exit_time AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC') AS exit_local,
      t.entry_time AT TIME ZONE (CASE WHEN COALESCE(NULLIF(u.timezone, ''), 'UTC') = 'UTC'
                                      THEN 'UTC' ELSE 'America/New_York' END) AS entry_et,
      (t.entry_time AT TIME ZONE 'UTC')::time <> '00:00:00' AS entry_has_time,
      (t.exit_time AT TIME ZONE 'UTC')::time <> '00:00:00' AS exit_has_time
  ) tm
  LEFT JOIN symbol_categories sc
    ON sc.symbol = UPPER(COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol))
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
    (SELECT (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(timezone, ''), 'UTC'))::date::text
       FROM users WHERE id = $1) AS today_local,
    (SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - revenge_analysis_at))::float8
       FROM user_gamification_stats WHERE user_id = $1) AS revenge_analysis_age_seconds,
    (SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MAX(e.created_at)))::float8
       FROM revenge_trading_events e
       JOIN user_gamification_stats s ON s.user_id = e.user_id
      WHERE e.user_id = $1 AND e.created_at <= s.revenge_analysis_at) AS latest_analyzed_revenge_age_seconds,
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
  // options.skipRevengeAnalysis: set by the revenge_analysis job itself so
  // its follow-up check doesn't enqueue another analysis.
  static async checkAndAwardAchievements(userId, options = {}) {
    if (!options.skipRevengeAnalysis) {
      AchievementService.enqueueRevengeAnalysis(userId).catch(error => {
        console.warn(`Failed to enqueue revenge analysis for user ${userId}:`, error.message);
      });
    }

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
          const awarded = await this.awardAchievement(userId, achievement.id, earned.metadata, achievement.points);
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

      // Trade changes can move challenge progress too. Lazy require:
      // challengeService depends on this module.
      try {
        const ChallengeService = require('./challengeService');
        await ChallengeService.updateUserChallenges(userId);
      } catch (e) {
        console.warn(`Failed to update challenges for user ${userId}:`, e.message);
      }

      return newAchievements;
    } catch (error) {
      console.error('Error checking achievements:', error);
      throw error;
    }
  }

  // Queue a background revenge analysis so the no-revenge achievements are
  // judged on real detection. Skipped when the user lacks behavioral
  // analytics access, a job is already pending, or no trade has changed
  // since the last full analysis.
  static async enqueueRevengeAnalysis(userId) {
    const TierService = require('./tierService');
    const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
    if (!hasAccess) return null;

    const result = await db.query(`
      INSERT INTO job_queue (type, data, priority, user_id, status, created_at)
      SELECT 'revenge_analysis', jsonb_build_object('userId', $1::uuid::text), 5, $1::uuid, 'pending', CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM job_queue
        WHERE type = 'revenge_analysis' AND user_id = $1::uuid AND status IN ('pending', 'processing')
      )
      AND EXISTS (
        SELECT 1 FROM trades t
        LEFT JOIN user_gamification_stats s ON s.user_id = t.user_id
        WHERE t.user_id = $1::uuid
          AND (s.revenge_analysis_at IS NULL
               OR GREATEST(t.created_at, t.updated_at) > s.revenge_analysis_at)
      )
      RETURNING id
    `, [userId]);

    if (result.rows.length > 0) {
      try {
        const jobQueue = require('../utils/jobQueue');
        jobQueue.startProcessing();
        jobQueue.resetBackoff();
      } catch (e) {
        console.warn('Failed to nudge job queue after revenge analysis enqueue:', e.message);
      }
    }

    return result.rows[0]?.id || null;
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
      // The user's calendar day, matching entry_date/exit_date
      todayStr: (miscResult.rows[0] || {}).today_local || new Date().toISOString().split('T')[0]
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
        // Needs account balances, which aren't in the per-trade snapshot
        return await AchievementService.checkWeeklyPortfolioGain(userId, snapshot, criteria.min_percentage);

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
  // pointsAwarded is recorded on the row so later point rebalances don't
  // change what an existing earner was given (see migration 263).
  static async awardAchievement(userId, achievementId, metadata = {}, pointsAwarded = null) {
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
      INSERT INTO user_achievements (user_id, achievement_id, metadata, earned_at, points_awarded)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, COALESCE($4::int, (SELECT points FROM achievements WHERE id = $2)))
      ON CONFLICT (user_id, achievement_id) DO NOTHING
      RETURNING *
    `;

    const result = await db.query(query, [userId, achievementId, JSON.stringify(metadata), pointsAwarded]);
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

  // No revenge trades for X days, judged only on a window that a full
  // revenge analysis has actually covered: the N days ending at the last
  // analysis run. The user must have been trading for at least N days
  // before that point, traded during the window, and had no revenge events
  // in it. Without an analysis run there is nothing to verify, so no award.
  static evaluateNoRevengeTrades(snapshot, days) {
    const analysisAge = snapshot.misc.revenge_analysis_age_seconds;
    if (analysisAge === null || analysisAge === undefined) return false;

    const windowSeconds = days * DAY_SECONDS;
    const windowStartAge = analysisAge + windowSeconds;

    // Most recent event at or before the analysis run, so a later real-time
    // event can't hide one inside the window
    const latestRevengeAge = snapshot.misc.latest_analyzed_revenge_age_seconds;
    const revengeInWindow = latestRevengeAge !== null && latestRevengeAge !== undefined
      && latestRevengeAge <= windowStartAge;
    if (revengeInWindow) return false;

    const entryAges = snapshot.trades
      .map(t => t.entry_age_seconds)
      .filter(age => age !== null && age !== undefined);
    const tradesDuringPeriod = entryAges.filter(
      age => age >= analysisAge && age <= windowStartAge
    ).length;
    const tradingLongEnough = entryAges.some(age => age >= windowStartAge);

    if (tradesDuringPeriod > 0 && tradingLongEnough) {
      return {
        earned: true,
        metadata: {
          days_clean: days,
          trades_during_period: tradesDuringPeriod
        }
      };
    }

    return false;
  }

  // A closed trade stayed within plan: it had a stop loss and didn't lose
  // more than 1R. R is net of commissions, so allow 10% for fees/slippage.
  // With a stop but no stored R (stop moved past entry), only a non-losing
  // trade can be confirmed as within plan.
  static isWithinRisk(t) {
    if (!t.has_stop_loss) return false;
    if (t.r_value !== null && t.r_value !== undefined) return t.r_value >= -1.1;
    return t.pnl !== null && t.pnl >= 0;
  }

  // Discipline score: share of closed trades within plan (isWithinRisk) over
  // any rolling `days` window that has at least 20 closed trades
  static evaluateDisciplineScore(snapshot, threshold, days) {
    const MIN_TRADES = 20;
    const windowSeconds = days * DAY_SECONDS;
    const trades = snapshot.closedTrades
      .filter(t => t.exit_epoch !== null && t.exit_epoch !== undefined)
      .sort((a, b) => a.exit_epoch - b.exit_epoch);

    let best = null;
    let start = 0;
    let withinCount = 0;
    for (let end = 0; end < trades.length; end++) {
      if (AchievementService.isWithinRisk(trades[end])) withinCount++;
      while (trades[end].exit_epoch - trades[start].exit_epoch > windowSeconds) {
        if (AchievementService.isWithinRisk(trades[start])) withinCount--;
        start++;
      }
      const total = end - start + 1;
      if (total >= MIN_TRADES) {
        const score = (withinCount / total) * 100;
        if (best === null || score > best.score) best = { score, total };
      }
    }

    if (best && best.score >= threshold) {
      return {
        earned: true,
        metadata: {
          discipline_score: best.score,
          trades_in_window: best.total,
          window_days: days
        }
      };
    }

    return false;
  }

  // N closed trades in a row (by exit time) that each stayed within plan
  static evaluateRiskAdherence(snapshot, requiredTrades) {
    const trades = snapshot.closedTrades
      .filter(t => t.exit_epoch !== null && t.exit_epoch !== undefined)
      .sort((a, b) => a.exit_epoch - b.exit_epoch);

    let run = 0;
    let longest = 0;
    for (const t of trades) {
      run = AchievementService.isWithinRisk(t) ? run + 1 : 0;
      if (run > longest) longest = run;
    }

    if (longest >= requiredTrades) {
      return {
        earned: true,
        metadata: {
          trades_in_a_row: longest,
          required_trades: requiredTrades
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

  // Cooling period: of the losses closed in the last 30 days, the share
  // followed by at least 30 minutes before the next trade of any kind (no
  // later trade counts as cooled). Losses without a recorded exit time skip.
  static evaluateCoolingPeriodUsage(snapshot, percentage) {
    const losses = snapshot.trades.filter(
      t => t.is_closed && t.pnl !== null && t.pnl < 0 && t.exit_has_time
        && t.exit_age_seconds !== null && t.exit_age_seconds <= 30 * DAY_SECONDS
    );
    const entries = snapshot.trades
      .filter(t => t.entry_has_time && t.entry_epoch !== null)
      .map(t => t.entry_epoch)
      .sort((a, b) => a - b);

    let withCooling = 0;
    for (const loss of losses) {
      const nextEntry = entries.find(e => e > loss.exit_epoch);
      if (nextEntry === undefined || (nextEntry - loss.exit_epoch) / 60 >= 30) {
        withCooling++;
      }
    }

    const totalLosses = losses.length;
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

  // N completed reviews inside any rolling window of `days` days
  static evaluateReviewHabit(snapshot, requiredReviews, days) {
    const windowSeconds = days * DAY_SECONDS;
    const ages = snapshot.reviews
      .map(r => r.reviewed_age_seconds)
      .filter(age => age !== null && age !== undefined)
      .sort((a, b) => a - b);

    let best = 0;
    let start = 0;
    for (let end = 0; end < ages.length; end++) {
      while (ages[end] - ages[start] > windowSeconds) start++;
      best = Math.max(best, end - start + 1);
    }

    if (best >= requiredReviews) {
      return {
        earned: true,
        metadata: {
          completed_reviews: best,
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

  // Any week (Monday start, by exit date) net positive with at least 5 closed trades
  static evaluateWeeklyPnL(snapshot, mustBePositive) {
    const byWeek = new Map();
    for (const t of snapshot.closedTrades) {
      if (!t.exit_date) continue;
      const d = new Date(`${t.exit_date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const key = d.toISOString().slice(0, 10);
      const week = byWeek.get(key) || { pnl: 0, hasPnl: false, count: 0 };
      week.count++;
      if (t.pnl !== null) {
        week.pnl += t.pnl;
        week.hasPnl = true;
      }
      byWeek.set(key, week);
    }

    for (const [weekStart, week] of byWeek.entries()) {
      if (mustBePositive && week.hasPnl && week.pnl > 0 && week.count >= 5) {
        return {
          earned: true,
          metadata: {
            weekly_pnl: week.pnl,
            trade_count: week.count,
            week_start: weekStart
          }
        };
      }
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

  // N closed trades that each returned at least targetRatio R
  static evaluateRiskReward(snapshot, targetRatio, requiredTrades) {
    const goodRRTrades = snapshot.closedTrades.filter(
      t => t.r_value !== null && t.r_value >= targetRatio
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
        COALESCE(ua.points_awarded, a.points) AS points,
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

  // Any trade with a stop loss set
  static evaluateFirstStopLoss(snapshot) {
    const withStop = snapshot.trades.filter(t => t.has_stop_loss).length;

    if (withStop >= 1) {
      return {
        earned: true,
        metadata: {
          trades_with_stop_loss: withStop
        }
      };
    }

    return false;
  }

  // Any trade with a take profit set
  static evaluateFirstTakeProfit(snapshot) {
    const withTarget = snapshot.trades.filter(t => t.has_take_profit).length;

    if (withTarget >= 1) {
      return {
        earned: true,
        metadata: {
          trades_with_take_profit: withTarget
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

  // Entry before the given hour, local time; trades with no recorded time skip
  static evaluateEarlyTrade(snapshot, beforeHour) {
    const earlyCount = snapshot.trades.filter(
      t => t.entry_has_time && t.entry_hour !== null && t.entry_hour < beforeHour
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

  // Entry at or after the given hour, local time; trades with no recorded time skip
  static evaluateLateTrade(snapshot, afterHour) {
    const lateCount = snapshot.trades.filter(
      t => t.entry_has_time && t.entry_hour !== null && t.entry_hour >= afterHour
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

  // Longest run of consecutive trading days. Markets are closed on weekends,
  // so a gap made up only of Saturdays/Sundays (Fri -> Mon) does not break a
  // streak. Market holidays are not skipped.
  static longestTradingStreak(dateStrs) {
    const days = [...new Set(dateStrs.filter(Boolean))]
      .map(d => Date.parse(`${d}T00:00:00Z`) / (DAY_SECONDS * 1000))
      .filter(d => Number.isFinite(d))
      .sort((x, y) => x - y);

    let longest = 0;
    let current = 0;
    for (let i = 0; i < days.length; i++) {
      if (i > 0 && AchievementService.onlyWeekendBetween(days[i - 1], days[i])) {
        current += 1;
      } else {
        current = 1;
      }
      if (current > longest) longest = current;
    }
    return longest;
  }

  // True when every calendar day strictly between two day numbers (days since
  // epoch, UTC) is a weekend day. Adjacent days trivially qualify.
  static onlyWeekendBetween(prevDay, nextDay) {
    for (let d = prevDay + 1; d < nextDay; d++) {
      const weekday = new Date(d * DAY_SECONDS * 1000).getUTCDay();
      if (weekday !== 0 && weekday !== 6) return false;
    }
    return true;
  }

  static evaluateTradingStreak(snapshot, requiredDays) {
    const maxStreak = AchievementService.longestTradingStreak(
      snapshot.trades.map(t => t.entry_date)
    );

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

  // Distinct symbols, counting option contracts by their underlying
  static evaluateDifferentSymbols(snapshot, requiredCount) {
    const symbolCount = new Set(
      snapshot.trades.map(t => t.symbol_key).filter(Boolean)
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

  // Quick flip: profitable closed trade held more than 0 and at most X minutes.
  // Both times must be recorded, or a date-only trade reads as a 0 minute hold.
  static evaluateQuickFlip(snapshot, maxMinutes) {
    const quickFlips = snapshot.closedTrades.filter(
      t => t.pnl !== null && t.pnl > 0
        && t.entry_has_time && t.exit_has_time
        && t.duration_minutes !== null && t.duration_minutes > 0 && t.duration_minutes <= maxMinutes
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

  // Green day: any calendar day (by exit date) with positive net closed P&L
  static evaluateGreenDay(snapshot) {
    const byDay = new Map();
    for (const t of snapshot.closedTrades) {
      if (!t.exit_date || t.pnl === null) continue;
      byDay.set(t.exit_date, (byDay.get(t.exit_date) || 0) + t.pnl);
    }

    for (const [date, dailyPnl] of byDay.entries()) {
      if (dailyPnl > 0) {
        return {
          earned: true,
          metadata: {
            daily_pnl: dailyPnl,
            trade_date: date
          }
        };
      }
    }

    return false;
  }

  // Longest run of consecutive profitable trading days (days with closed
  // trades, by exit date; days without closed trades don't break the run)
  static evaluateProfitableStreak(snapshot, requiredDays) {
    const byDay = new Map();
    for (const t of snapshot.closedTrades) {
      if (!t.exit_date || t.pnl === null) continue;
      byDay.set(t.exit_date, (byDay.get(t.exit_date) || 0) + t.pnl);
    }

    let maxStreak = 0;
    let current = 0;
    for (const date of [...byDay.keys()].sort()) {
      current = byDay.get(date) > 0 ? current + 1 : 0;
      if (current > maxStreak) maxStreak = current;
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

  // Entry within X minutes of the 9:30 Eastern open
  static evaluateEarlyMarketTrade(snapshot, minutesFromOpen) {
    const open = 9 * 60 + 30;
    const earlyTrades = snapshot.trades.filter(
      t => t.entry_has_time && t.entry_et_minutes !== null
        && t.entry_et_minutes >= open && t.entry_et_minutes <= open + minutesFromOpen
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

  // A closed trade that returned at least minRatio R (stored net R-multiple)
  static evaluateRiskRewardRatio(snapshot, minRatio) {
    const goodRRTrades = snapshot.closedTrades.filter(
      t => t.r_value !== null && t.r_value >= minRatio
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

  // Profitable closed trade whose notes describe a trend setup
  static evaluateTrendFollowingProfit(snapshot) {
    const trendTrades = snapshot.closedTrades.filter(
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

  // Profitable closed trade on a symbol with news that day (news enrichment)
  // or whose notes name the catalyst
  static evaluateNewsBasedProfit(snapshot) {
    const newsTrades = snapshot.closedTrades.filter(
      t => t.pnl !== null && t.pnl > 0 && (t.has_news || t.notes_mention_news)
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

  // Shares traded in a single day. Stocks only: option and futures contracts
  // and crypto units aren't shares.
  static evaluateDailyVolume(snapshot, targetShares) {
    const byDay = new Map();
    for (const t of snapshot.trades) {
      if (!t.entry_date || t.quantity === null) continue;
      if (t.instrument_type && t.instrument_type !== 'stock') continue;
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

  // Dollars actually put into a position, for the High Roller tiers.
  // Options count the premium paid (contracts x multiplier) on bought
  // contracts only: never underlying notional, and premium received on a
  // short option isn't a large position. Futures are excluded because
  // price x contracts is index points, not dollars.
  static capitalDeployed(t) {
    if (t.entry_price === null || t.quantity === null) return 0;
    if (t.instrument_type === 'future') return 0;
    if (t.instrument_type === 'option') {
      if (t.side !== 'long') return 0;
      return Math.abs(t.entry_price * t.quantity * (t.contract_size || 100));
    }
    return Math.abs(t.entry_price * t.quantity);
  }

  static evaluatePositionSize(snapshot, minSize) {
    const largePositions = snapshot.trades.filter(
      t => AchievementService.capitalDeployed(t) >= minSize
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

  // Any single day with trades in N different sectors (symbol_categories)
  static evaluateDailySectorDiversity(snapshot, minSectors) {
    const byDay = new Map();
    for (const t of snapshot.trades) {
      if (!t.entry_date || !t.sector) continue;
      if (!byDay.has(t.entry_date)) byDay.set(t.entry_date, new Set());
      byDay.get(t.entry_date).add(t.sector);
    }

    for (const [date, sectors] of byDay.entries()) {
      if (sectors.size >= minSectors) {
        return {
          earned: true,
          metadata: {
            sectors_traded: sectors.size,
            min_sectors: minSectors,
            trade_date: date
          }
        };
      }
    }

    return false;
  }

  // Weekly gain on real account balances (Account & Cashflow). For each
  // Monday-start week, equity at the week's start is each account's starting
  // balance plus deposits minus withdrawals plus realized P&L since its
  // balance date; the week's realized P&L must be at least minPercentage of
  // it. Accounts without a starting balance can't be measured and are skipped.
  static async checkWeeklyPortfolioGain(userId, snapshot, minPercentage) {
    const accountsResult = await db.query(`
      SELECT id, COALESCE(account_identifier, '') AS account_identifier,
             initial_balance::float8 AS initial_balance,
             initial_balance_date::text AS initial_balance_date
      FROM user_accounts
      WHERE user_id = $1
        AND initial_balance > 0
        AND initial_balance_date IS NOT NULL
        AND COALESCE(is_archived, false) = false
    `, [userId]);
    return AchievementService.evaluateWeeklyPortfolioGain(
      snapshot,
      minPercentage,
      accountsResult.rows,
      accountsResult.rows.length > 0
        ? (await db.query(`
            SELECT account_id, transaction_type, amount::float8 AS amount, transaction_date::text AS transaction_date
            FROM account_transactions
            WHERE user_id = $1 AND account_id = ANY($2::uuid[])
          `, [userId, accountsResult.rows.map(a => a.id)])).rows
        : []
    );
  }

  static evaluateWeeklyPortfolioGain(snapshot, minPercentage, accounts = [], transactions = []) {
    if (accounts.length === 0) return false;

    const weekStartOf = (dateStr) => {
      const d = new Date(`${dateStr}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };

    const byIdentifier = new Map(accounts.map(a => [a.account_identifier, a]));
    const trades = snapshot.closedTrades.filter(
      t => t.exit_date && t.pnl !== null && byIdentifier.has(t.account_identifier || '')
    );
    const weeks = [...new Set(trades.map(t => weekStartOf(t.exit_date)))].sort();

    for (const weekStart of weeks) {
      let equity = 0;
      let weekPnl = 0;
      for (const account of accounts) {
        if (account.initial_balance_date > weekStart) continue;
        equity += account.initial_balance;
        for (const tx of transactions) {
          if (tx.account_id !== account.id) continue;
          if (tx.transaction_date < account.initial_balance_date || tx.transaction_date >= weekStart) continue;
          equity += tx.transaction_type === 'withdrawal' ? -tx.amount : tx.amount;
        }
        for (const t of trades) {
          if ((t.account_identifier || '') !== account.account_identifier) continue;
          if (t.exit_date < account.initial_balance_date) continue;
          if (t.exit_date < weekStart) equity += t.pnl;
          else if (weekStartOf(t.exit_date) === weekStart) weekPnl += t.pnl;
        }
      }

      if (equity <= 0) continue;
      const percentageGain = (weekPnl / equity) * 100;
      if (percentageGain >= minPercentage) {
        return {
          earned: true,
          metadata: {
            weekly_gain_percentage: percentageGain,
            min_percentage: minPercentage,
            weekly_pnl: weekPnl,
            week_start: weekStart
          }
        };
      }
    }

    return false;
  }

  // Level progression system
  // Level 1: 0-99 XP (needs 100 to reach level 2)
  // Level 2: 100-199 XP (needs 100 more to reach level 3)
  // Level 3: 200-349 XP (needs 150 more to reach level 4)
  // Level 4: 350-549 XP (needs 200 more to reach level 5)
  // From level 3 on, each step needs 50 more XP than the previous one
  // (level L starts at 25L^2 - 25L + 50 XP for L >= 2; see migration 265)
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

      // XP from this level to the next: 100 (level 2 to 3), then 150, 200, 250, etc.
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
