const db = require('../config/database');
const NotificationService = require('./notificationService');

class AchievementService {
  
  // Check and award achievements for a user based on their current stats
  static async checkAndAwardAchievements(userId) {
    try {
      // Get all achievements the user hasn't earned yet
      const unearned = await this.getUnearnedAchievements(userId);
      const newAchievements = [];
      
      for (const achievement of unearned) {
        const earned = await this.checkAchievementCriteria(userId, achievement);
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
        await this.updateUserStats(userId, newAchievements);
        
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
  
  // Check if user meets criteria for a specific achievement
  static async checkAchievementCriteria(userId, achievement) {
    try {
      const criteria = achievement.criteria;
      console.log(`Checking criteria for achievement ${achievement.name}, type: ${criteria.type}`);
      
      switch (criteria.type) {
      case 'no_revenge_trades':
        return await AchievementService.checkNoRevengeTrades(userId, criteria.days);
        
      case 'discipline_score':
        return await AchievementService.checkDisciplineScore(userId, criteria.threshold, criteria.days);
        
      case 'risk_adherence':
        return await AchievementService.checkRiskAdherence(userId, criteria.trades);
        
      case 'cooling_period_usage':
        return await AchievementService.checkCoolingPeriodUsage(userId, criteria.percentage);
        
      case 'weekly_pnl':
        return await AchievementService.checkWeeklyPnL(userId, criteria.positive);
        
      case 'win_rate':
        return await AchievementService.checkWinRate(userId, criteria.threshold, criteria.trades);
        
      case 'risk_reward':
        return await AchievementService.checkRiskReward(userId, criteria.ratio, criteria.trades);
        
      case 'patterns_identified':
        return await AchievementService.checkPatternsIdentified(userId, criteria.count);
        
      case 'challenges_completed':
        return await AchievementService.checkChallengesCompleted(userId, criteria.count);
        
      case 'peer_rank':
        return await AchievementService.checkPeerRank(userId, criteria.percentile);
        
      case 'community_challenges':
        return await AchievementService.checkCommunityChallenges(userId, criteria.count);
        
      case 'trade_count':
        return await AchievementService.checkTradeCount(userId, criteria.count);
        
      case 'registration':
      case 'dashboard_visit':
      case 'achievement_page_visit':
        return await AchievementService.checkImmediateAchievement(userId, criteria.type);
        
      case 'first_profitable_trade':
        return await AchievementService.checkFirstProfitableTrade(userId);
        
      case 'first_stop_loss':
        return await AchievementService.checkFirstStopLoss(userId);
        
      case 'first_take_profit':
        return await AchievementService.checkFirstTakeProfit(userId);
        
      case 'weekend_trade':
        return await AchievementService.checkWeekendTrade(userId);
        
      case 'early_trade':
        return await AchievementService.checkEarlyTrade(userId, criteria.before_hour);
        
      case 'late_trade':
        return await AchievementService.checkLateTrade(userId, criteria.after_hour);
        
      case 'trading_streak':
        return await AchievementService.checkTradingStreak(userId, criteria.days);
        
      case 'different_symbols':
        return await AchievementService.checkDifferentSymbols(userId, criteria.count);
        
      case 'first_trade_daily':
        return await AchievementService.checkFirstTradeDaily(userId);
        
      case 'quick_flip':
        return await AchievementService.checkQuickFlip(userId, criteria.max_duration_minutes);
        
      case 'green_day':
        return await AchievementService.checkGreenDay(userId);
        
      case 'profitable_streak':
        return await AchievementService.checkProfitableStreak(userId, criteria.days);
        
      case 'early_market_trade':
        return await AchievementService.checkEarlyMarketTrade(userId, criteria.minutes_from_open);
        
      case 'risk_reward_ratio':
        return await AchievementService.checkRiskRewardRatio(userId, criteria.min_ratio);
        
      case 'trend_following_profit':
        return await AchievementService.checkTrendFollowingProfit(userId);
        
      case 'news_based_profit':
        return await AchievementService.checkNewsBasedProfit(userId);
        
      case 'daily_volume':
        return await AchievementService.checkDailyVolume(userId, criteria.shares);
        
      case 'single_trade_profit':
        return await AchievementService.checkSingleTradeProfit(userId, criteria.min_profit);
        
      case 'position_size':
        return await AchievementService.checkPositionSize(userId, criteria.min_size);
        
      case 'daily_sector_diversity':
        return await AchievementService.checkDailySectorDiversity(userId, criteria.min_sectors);
        
      case 'weekly_portfolio_gain':
        return await AchievementService.checkWeeklyPortfolioGain(userId, criteria.min_percentage);
        
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
  
  // Check no revenge trades for X days
  static async checkNoRevengeTrades(userId, days) {
    const query = `
      SELECT COUNT(*) as revenge_count
      FROM revenge_trading_events
      WHERE user_id = $1
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].revenge_count) === 0) {
      // Also check if user has been trading during this period
      const tradesQuery = `
        SELECT COUNT(*) as trade_count
        FROM trades
        WHERE user_id = $1
          AND entry_time >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
      `;
      
      const tradesResult = await db.query(tradesQuery, [userId]);
      
      if (parseInt(tradesResult.rows[0].trade_count) > 0) {
        return {
          earned: true,
          metadata: {
            days_clean: days,
            trades_during_period: tradesResult.rows[0].trade_count
          }
        };
      }
    }
    
    return false;
  }
  
  // Check discipline score maintenance
  static async checkDisciplineScore(userId, threshold, days) {
    // This would integrate with behavioral analytics
    // For now, checking if recent trades follow risk management rules
    const query = `
      WITH trade_discipline AS (
        SELECT 
          t.entry_time::date as trade_date,
          COUNT(CASE 
            WHEN t.pnl > 0 AND t.exit_price IS NOT NULL THEN
              CASE 
                WHEN t.side = 'long' AND ((t.exit_price - t.entry_price) / t.entry_price) >= 0.015 THEN 1
                WHEN t.side = 'short' AND ((t.entry_price - t.exit_price) / t.entry_price) >= 0.015 THEN 1
                ELSE NULL
              END
            ELSE NULL
          END)::float / COUNT(*)::float * 100 as discipline_score
        FROM trades t
        WHERE t.user_id = $1
          AND t.entry_time >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
          AND t.exit_time IS NOT NULL
        GROUP BY t.entry_time::date
      )
      SELECT 
        AVG(discipline_score) as avg_discipline,
        COUNT(*) as days_traded
      FROM trade_discipline
      WHERE discipline_score >= $2
    `;
    
    const result = await db.query(query, [userId, threshold]);
    
    if (result.rows[0].avg_discipline >= threshold && result.rows[0].days_traded >= days * 0.7) {
      return {
        earned: true,
        metadata: {
          average_discipline: result.rows[0].avg_discipline,
          days_maintained: result.rows[0].days_traded
        }
      };
    }
    
    return false;
  }
  
  // Check risk adherence
  static async checkRiskAdherence(userId, requiredTrades) {
    // Simplified risk check - count trades with reasonable position sizes
    // For now, we'll assume good risk management if no single trade exceeds 5% loss
    const query = `
      SELECT 
        COUNT(*) as total_trades,
        COUNT(CASE WHEN ABS(pnl) <= 1000 THEN 1 END) as within_risk_trades
      FROM trades
      WHERE user_id = $1
        AND exit_time IS NOT NULL
      ORDER BY exit_time DESC
      LIMIT $2
    `;
    
    const result = await db.query(query, [userId, requiredTrades]);
    
    if (result.rows[0].total_trades >= requiredTrades && 
        result.rows[0].within_risk_trades === result.rows[0].total_trades) {
      return {
        earned: true,
        metadata: {
          trades_checked: result.rows[0].total_trades,
          all_within_risk: true
        }
      };
    }
    
    return false;
  }
  
  // Check cooling period usage
  static async checkCoolingPeriodUsage(userId, percentage) {
    const query = `
      WITH loss_trades AS (
        SELECT 
          t.id,
          t.exit_time,
          LEAD(t.entry_time) OVER (ORDER BY t.exit_time) as next_trade_time
        FROM trades t
        WHERE t.user_id = $1
          AND t.pnl < 0
          AND t.exit_time IS NOT NULL
          AND t.exit_time >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      ),
      cooling_periods AS (
        SELECT 
          COUNT(*) as total_losses,
          COUNT(CASE 
            WHEN EXTRACT(EPOCH FROM (next_trade_time - exit_time)) / 60 >= 30 
            THEN 1 
          END) as with_cooling_period
        FROM loss_trades
      )
      SELECT 
        total_losses,
        with_cooling_period,
        CASE 
          WHEN total_losses > 0 
          THEN (with_cooling_period::float / total_losses::float * 100)
          ELSE 0 
        END as usage_percentage
      FROM cooling_periods
    `;
    
    const result = await db.query(query, [userId]);
    
    if (result.rows[0].usage_percentage >= percentage && result.rows[0].total_losses >= 10) {
      return {
        earned: true,
        metadata: {
          usage_percentage: result.rows[0].usage_percentage,
          losses_with_cooling: result.rows[0].with_cooling_period,
          total_losses: result.rows[0].total_losses
        }
      };
    }
    
    return false;
  }
  
  // Check weekly P&L
  static async checkWeeklyPnL(userId, mustBePositive) {
    const query = `
      SELECT 
        SUM(pnl) as weekly_pnl,
        COUNT(*) as trade_count
      FROM trades
      WHERE user_id = $1
        AND exit_time >= date_trunc('week', CURRENT_TIMESTAMP)
        AND exit_time IS NOT NULL
    `;
    
    const result = await db.query(query, [userId]);
    
    if (mustBePositive && parseFloat(result.rows[0].weekly_pnl) > 0 && result.rows[0].trade_count >= 5) {
      return {
        earned: true,
        metadata: {
          weekly_pnl: result.rows[0].weekly_pnl,
          trade_count: result.rows[0].trade_count
        }
      };
    }
    
    return false;
  }
  
  // Check win rate
  static async checkWinRate(userId, threshold, requiredTrades) {
    const query = `
      WITH recent_trades AS (
        SELECT pnl
        FROM trades
        WHERE user_id = $1
          AND exit_time IS NOT NULL
        ORDER BY exit_time DESC
        LIMIT $2
      )
      SELECT 
        COUNT(*) as total_trades,
        COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
        CASE 
          WHEN COUNT(*) > 0 
          THEN (COUNT(CASE WHEN pnl > 0 THEN 1 END)::float / COUNT(*)::float * 100)
          ELSE 0 
        END as win_rate
      FROM recent_trades
    `;
    
    const result = await db.query(query, [userId, requiredTrades]);
    
    if (result.rows[0].total_trades >= requiredTrades && result.rows[0].win_rate >= threshold) {
      return {
        earned: true,
        metadata: {
          win_rate: result.rows[0].win_rate,
          trades_analyzed: result.rows[0].total_trades,
          winning_trades: result.rows[0].winning_trades
        }
      };
    }
    
    return false;
  }
  
  // Check risk/reward ratio
  static async checkRiskReward(userId, targetRatio, requiredTrades) {
    const query = `
      WITH recent_trades AS (
        SELECT *
        FROM trades
        WHERE user_id = $1
          AND exit_time IS NOT NULL
        ORDER BY exit_time DESC
        LIMIT $3
      ),
      rr_trades AS (
        SELECT 
          COUNT(*) as total_trades,
          COUNT(CASE 
            WHEN pnl > 0 AND exit_price IS NOT NULL THEN
              CASE 
                WHEN side = 'long' AND ((exit_price - entry_price) / entry_price) >= ($2 * 0.01) THEN 1
                WHEN side = 'short' AND ((entry_price - exit_price) / entry_price) >= ($2 * 0.01) THEN 1
                ELSE NULL
              END
            ELSE NULL
          END) as good_rr_trades
        FROM recent_trades
      )
      SELECT * FROM rr_trades
    `;
    
    const result = await db.query(query, [userId, targetRatio, requiredTrades]);
    
    if (result.rows[0].good_rr_trades >= requiredTrades) {
      return {
        earned: true,
        metadata: {
          trades_with_good_rr: result.rows[0].good_rr_trades,
          target_ratio: targetRatio
        }
      };
    }
    
    return false;
  }
  
  // Check patterns identified
  static async checkPatternsIdentified(userId, requiredCount) {
    const query = `
      SELECT COUNT(DISTINCT pattern_type) as patterns_count
      FROM behavioral_patterns
      WHERE user_id = $1
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].patterns_count) >= requiredCount) {
      return {
        earned: true,
        metadata: {
          patterns_identified: result.rows[0].patterns_count
        }
      };
    }
    
    return false;
  }
  
  // Check challenges completed
  static async checkChallengesCompleted(userId, requiredCount) {
    const query = `
      SELECT COUNT(*) as completed_count
      FROM user_challenges
      WHERE user_id = $1
        AND status = 'completed'
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].completed_count) >= requiredCount) {
      return {
        earned: true,
        metadata: {
          challenges_completed: result.rows[0].completed_count
        }
      };
    }
    
    return false;
  }
  
  // Check peer rank
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
  
  // Check community challenges
  static async checkCommunityChallenges(userId, requiredCount) {
    const query = `
      SELECT COUNT(*) as participated_count
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      WHERE uc.user_id = $1
        AND c.is_community = true
        AND uc.status IN ('completed', 'active')
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].participated_count) >= requiredCount) {
      return {
        earned: true,
        metadata: {
          community_challenges: result.rows[0].participated_count
        }
      };
    }
    
    return false;
  }
  
  // Check trade count
  static async checkTradeCount(userId, requiredCount) {
    const query = `
      SELECT COUNT(*) as trade_count
      FROM trades
      WHERE user_id = $1
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].trade_count) >= requiredCount) {
      return {
        earned: true,
        metadata: {
          total_trades: result.rows[0].trade_count
        }
      };
    }
    
    return false;
  }
  
  // Get user achievements
  static async getUserAchievements(userId) {
    const query = `
      SELECT 
        a.*,
        ua.earned_at,
        ua.progress,
        ua.metadata as earn_metadata
      FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id
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
    const query = `
      SELECT 
        a.*,
        CASE 
          WHEN ua.achievement_id IS NOT NULL THEN true 
          ELSE false 
        END as earned,
        ua.earned_at,
        ua.progress
      FROM achievements a
      LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
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
  
  // New achievement check methods
  
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
  
  // Check first profitable trade
  static async checkFirstProfitableTrade(userId) {
    const query = `
      SELECT COUNT(*) as profitable_count
      FROM trades
      WHERE user_id = $1
        AND pnl > 0
        AND exit_time IS NOT NULL
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].profitable_count) >= 1) {
      return {
        earned: true,
        metadata: {
          first_profit_date: new Date().toISOString()
        }
      };
    }
    
    return false;
  }
  
  // Check first stop loss
  static async checkFirstStopLoss(userId) {
    const query = `
      SELECT COUNT(*) as stop_loss_count
      FROM trades
      WHERE user_id = $1
        AND stop_loss IS NOT NULL
        AND stop_loss > 0
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].stop_loss_count) >= 1) {
      return {
        earned: true,
        metadata: {
          first_stop_loss_date: new Date().toISOString()
        }
      };
    }
    
    return false;
  }
  
  // Check first take profit
  static async checkFirstTakeProfit(userId) {
    const query = `
      SELECT COUNT(*) as take_profit_count
      FROM trades
      WHERE user_id = $1
        AND take_profit IS NOT NULL
        AND take_profit > 0
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].take_profit_count) >= 1) {
      return {
        earned: true,
        metadata: {
          first_take_profit_date: new Date().toISOString()
        }
      };
    }
    
    return false;
  }
  
  // Check weekend trade
  static async checkWeekendTrade(userId) {
    const query = `
      SELECT COUNT(*) as weekend_count
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(DOW FROM entry_time) IN (0, 6)  -- Sunday = 0, Saturday = 6
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].weekend_count) >= 1) {
      return {
        earned: true,
        metadata: {
          weekend_trades: result.rows[0].weekend_count
        }
      };
    }
    
    return false;
  }
  
  // Check early trade
  static async checkEarlyTrade(userId, beforeHour) {
    const query = `
      SELECT COUNT(*) as early_count
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(HOUR FROM entry_time) < $2
    `;
    
    const result = await db.query(query, [userId, beforeHour]);
    
    if (parseInt(result.rows[0].early_count) >= 1) {
      return {
        earned: true,
        metadata: {
          early_trades: result.rows[0].early_count,
          before_hour: beforeHour
        }
      };
    }
    
    return false;
  }
  
  // Check late trade
  static async checkLateTrade(userId, afterHour) {
    const query = `
      SELECT COUNT(*) as late_count
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(HOUR FROM entry_time) >= $2
    `;
    
    const result = await db.query(query, [userId, afterHour]);
    
    if (parseInt(result.rows[0].late_count) >= 1) {
      return {
        earned: true,
        metadata: {
          late_trades: result.rows[0].late_count,
          after_hour: afterHour
        }
      };
    }
    
    return false;
  }
  
  // Check trading streak
  static async checkTradingStreak(userId, requiredDays) {
    const query = `
      WITH trading_days AS (
        SELECT DISTINCT DATE(entry_time) as trade_date
        FROM trades
        WHERE user_id = $1
        ORDER BY trade_date DESC
      ),
      consecutive_days AS (
        SELECT 
          trade_date,
          ROW_NUMBER() OVER (ORDER BY trade_date DESC) as rn,
          trade_date - INTERVAL '1 day' * (ROW_NUMBER() OVER (ORDER BY trade_date DESC) - 1) as group_date
        FROM trading_days
      ),
      streak_groups AS (
        SELECT 
          group_date,
          COUNT(*) as streak_length
        FROM consecutive_days
        GROUP BY group_date
      )
      SELECT MAX(streak_length) as max_streak
      FROM streak_groups
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].max_streak || 0) >= requiredDays) {
      return {
        earned: true,
        metadata: {
          streak_length: result.rows[0].max_streak,
          required_days: requiredDays
        }
      };
    }
    
    return false;
  }
  
  // Check different symbols
  static async checkDifferentSymbols(userId, requiredCount) {
    const query = `
      SELECT COUNT(DISTINCT symbol) as symbol_count
      FROM trades
      WHERE user_id = $1
        AND symbol IS NOT NULL
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].symbol_count) >= requiredCount) {
      return {
        earned: true,
        metadata: {
          symbols_traded: result.rows[0].symbol_count,
          required_count: requiredCount
        }
      };
    }
    
    return false;
  }

  // New trading achievement methods
  
  // Check first trade of the day
  static async checkFirstTradeDaily(userId) {
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT COUNT(*) as trade_count
      FROM trades
      WHERE user_id = $1
        AND DATE(entry_time) = $2
      ORDER BY entry_time ASC
      LIMIT 1
    `;
    
    const result = await db.query(query, [userId, today]);
    
    if (parseInt(result.rows[0].trade_count) >= 1) {
      return {
        earned: true,
        metadata: {
          trade_date: today
        }
      };
    }
    
    return false;
  }
  
  // Check quick flip (profitable trade within X minutes)
  static async checkQuickFlip(userId, maxMinutes) {
    const query = `
      SELECT COUNT(*) as quick_flips
      FROM trades
      WHERE user_id = $1
        AND pnl > 0
        AND exit_time IS NOT NULL
        AND EXTRACT(EPOCH FROM (exit_time - entry_time))/60 <= $2
    `;
    
    const result = await db.query(query, [userId, maxMinutes]);
    
    if (parseInt(result.rows[0].quick_flips) >= 1) {
      return {
        earned: true,
        metadata: {
          max_duration_minutes: maxMinutes
        }
      };
    }
    
    return false;
  }
  
  // Check green day (positive daily P&L)
  static async checkGreenDay(userId) {
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT SUM(pnl) as daily_pnl
      FROM trades
      WHERE user_id = $1
        AND DATE(entry_time) = $2
        AND exit_time IS NOT NULL
    `;
    
    const result = await db.query(query, [userId, today]);
    
    if (parseFloat(result.rows[0].daily_pnl || 0) > 0) {
      return {
        earned: true,
        metadata: {
          daily_pnl: result.rows[0].daily_pnl,
          trade_date: today
        }
      };
    }
    
    return false;
  }
  
  // Check profitable streak
  static async checkProfitableStreak(userId, requiredDays) {
    const query = `
      WITH daily_pnl AS (
        SELECT 
          DATE(entry_time) as trade_date,
          SUM(pnl) as daily_pnl
        FROM trades
        WHERE user_id = $1
          AND exit_time IS NOT NULL
        GROUP BY DATE(entry_time)
        ORDER BY trade_date DESC
        LIMIT 30
      ),
      consecutive_profitable AS (
        SELECT 
          trade_date,
          daily_pnl,
          ROW_NUMBER() OVER (ORDER BY trade_date DESC) as rn,
          CASE WHEN daily_pnl > 0 THEN 1 ELSE 0 END as is_profitable
        FROM daily_pnl
      ),
      streak_calc AS (
        SELECT 
          COUNT(*) as streak_length
        FROM consecutive_profitable
        WHERE rn <= (
          SELECT COALESCE(MIN(rn), 0)
          FROM consecutive_profitable
          WHERE is_profitable = 0
        ) - 1
        AND is_profitable = 1
      )
      SELECT COALESCE(MAX(streak_length), 0) as max_streak
      FROM streak_calc
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].max_streak || 0) >= requiredDays) {
      return {
        earned: true,
        metadata: {
          streak_length: result.rows[0].max_streak,
          required_days: requiredDays
        }
      };
    }
    
    return false;
  }
  
  // Check early market trade (within X minutes of market open)
  static async checkEarlyMarketTrade(userId, minutesFromOpen) {
    // Assuming market opens at 9:30 AM ET
    const query = `
      SELECT COUNT(*) as early_trades
      FROM trades
      WHERE user_id = $1
        AND EXTRACT(HOUR FROM entry_time) = 9
        AND EXTRACT(MINUTE FROM entry_time) BETWEEN 30 AND ${30 + minutesFromOpen}
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].early_trades) >= 1) {
      return {
        earned: true,
        metadata: {
          minutes_from_open: minutesFromOpen
        }
      };
    }
    
    return false;
  }
  
  // Check risk-reward ratio
  static async checkRiskRewardRatio(userId, minRatio) {
    const query = `
      SELECT COUNT(CASE 
        WHEN pnl > 0 AND exit_price IS NOT NULL THEN
          CASE 
            WHEN side = 'long' AND ((exit_price - entry_price) / entry_price) >= ($2 * 0.01) THEN 1
            WHEN side = 'short' AND ((entry_price - exit_price) / entry_price) >= ($2 * 0.01) THEN 1
            ELSE NULL
          END
        ELSE NULL
      END) as good_rr_trades
      FROM trades
      WHERE user_id = $1
        AND exit_time IS NOT NULL
    `;
    
    const result = await db.query(query, [userId, minRatio]);
    
    if (parseInt(result.rows[0].good_rr_trades) >= 1) {
      return {
        earned: true,
        metadata: {
          min_ratio: minRatio
        }
      };
    }
    
    return false;
  }
  
  // Check trend following profit (simplified - look for trades with notes mentioning trend)
  static async checkTrendFollowingProfit(userId) {
    const query = `
      SELECT COUNT(*) as trend_trades
      FROM trades
      WHERE user_id = $1
        AND pnl > 0
        AND (
          LOWER(notes) LIKE '%trend%' OR
          LOWER(notes) LIKE '%moving average%' OR
          LOWER(notes) LIKE '%ma%' OR
          LOWER(notes) LIKE '%crossover%'
        )
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].trend_trades) >= 1) {
      return {
        earned: true,
        metadata: {
          trend_trades: result.rows[0].trend_trades
        }
      };
    }
    
    return false;
  }
  
  // Check news-based profit (simplified - look for trades with notes mentioning news/earnings)
  static async checkNewsBasedProfit(userId) {
    const query = `
      SELECT COUNT(*) as news_trades
      FROM trades
      WHERE user_id = $1
        AND pnl > 0
        AND (
          LOWER(notes) LIKE '%news%' OR
          LOWER(notes) LIKE '%earnings%' OR
          LOWER(notes) LIKE '%catalyst%' OR
          LOWER(notes) LIKE '%announcement%'
        )
    `;
    
    const result = await db.query(query, [userId]);
    
    if (parseInt(result.rows[0].news_trades) >= 1) {
      return {
        earned: true,
        metadata: {
          news_trades: result.rows[0].news_trades
        }
      };
    }
    
    return false;
  }
  
  // Check daily volume
  static async checkDailyVolume(userId, targetShares) {
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT SUM(ABS(quantity)) as daily_volume
      FROM trades
      WHERE user_id = $1
        AND DATE(entry_time) = $2
    `;
    
    const result = await db.query(query, [userId, today]);
    
    if (parseFloat(result.rows[0].daily_volume || 0) >= targetShares) {
      return {
        earned: true,
        metadata: {
          daily_volume: result.rows[0].daily_volume,
          target_shares: targetShares,
          trade_date: today
        }
      };
    }
    
    return false;
  }
  
  // Check single trade profit
  static async checkSingleTradeProfit(userId, minProfit) {
    const query = `
      SELECT COUNT(*) as big_wins
      FROM trades
      WHERE user_id = $1
        AND pnl >= $2
        AND exit_time IS NOT NULL
    `;
    
    const result = await db.query(query, [userId, minProfit]);
    
    if (parseInt(result.rows[0].big_wins) >= 1) {
      return {
        earned: true,
        metadata: {
          min_profit: minProfit
        }
      };
    }
    
    return false;
  }
  
  // Check position size
  static async checkPositionSize(userId, minSize) {
    const query = `
      SELECT COUNT(*) as large_positions
      FROM trades
      WHERE user_id = $1
        AND ABS(entry_price * quantity) >= $2
    `;
    
    const result = await db.query(query, [userId, minSize]);
    
    if (parseInt(result.rows[0].large_positions) >= 1) {
      return {
        earned: true,
        metadata: {
          min_size: minSize
        }
      };
    }
    
    return false;
  }
  
  // Check daily sector diversity (simplified - assumes symbol format indicates sector)
  static async checkDailySectorDiversity(userId, minSectors) {
    const today = new Date().toISOString().split('T')[0];
    
    // This is simplified - in real implementation, you'd need a sectors table
    const query = `
      SELECT COUNT(DISTINCT LEFT(symbol, 2)) as sector_count
      FROM trades
      WHERE user_id = $1
        AND DATE(entry_time) = $2
        AND symbol IS NOT NULL
    `;
    
    const result = await db.query(query, [userId, today]);
    
    if (parseInt(result.rows[0].sector_count) >= minSectors) {
      return {
        earned: true,
        metadata: {
          sectors_traded: result.rows[0].sector_count,
          min_sectors: minSectors,
          trade_date: today
        }
      };
    }
    
    return false;
  }
  
  // Check weekly portfolio gain
  static async checkWeeklyPortfolioGain(userId, minPercentage) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of current week
    
    const query = `
      WITH week_trades AS (
        SELECT SUM(pnl) as weekly_pnl
        FROM trades
        WHERE user_id = $1
          AND entry_time >= $2
          AND exit_time IS NOT NULL
      ),
      initial_balance AS (
        SELECT 10000 as balance  -- Simplified: assuming starting balance
      )
      SELECT 
        weekly_pnl,
        (weekly_pnl / balance * 100) as percentage_gain
      FROM week_trades, initial_balance
      WHERE weekly_pnl IS NOT NULL
    `;
    
    const result = await db.query(query, [userId, weekStart.toISOString()]);
    
    if (result.rows.length > 0 && parseFloat(result.rows[0].percentage_gain || 0) >= minPercentage) {
      return {
        earned: true,
        metadata: {
          weekly_gain_percentage: result.rows[0].percentage_gain,
          min_percentage: minPercentage,
          weekly_pnl: result.rows[0].weekly_pnl
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