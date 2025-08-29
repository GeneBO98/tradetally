const db = require('../config/database');
const AchievementService = require('./achievementService');
const NotificationService = require('./notificationService');

class ChallengeService {
  
  // Get active challenges
  static async getActiveChallenges() {
    const query = `
      SELECT 
        c.*,
        COUNT(DISTINCT uc.user_id) as participant_count,
        AVG(uc.progress) as avg_progress
      FROM challenges c
      LEFT JOIN user_challenges uc ON uc.challenge_id = c.id
      WHERE c.start_date <= CURRENT_TIMESTAMP
        AND c.end_date >= CURRENT_TIMESTAMP
      GROUP BY c.id
      ORDER BY c.start_date DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  // Get user's challenges
  static async getUserChallenges(userId) {
    const query = `
      SELECT 
        c.*,
        uc.status,
        uc.progress,
        uc.started_at,
        uc.completed_at,
        uc.metadata as user_metadata
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      WHERE uc.user_id = $1
      ORDER BY 
        CASE uc.status 
          WHEN 'active' THEN 1
          WHEN 'completed' THEN 2
          ELSE 3
        END,
        c.end_date DESC
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }
  
  // Join a challenge
  static async joinChallenge(userId, challengeId) {
    try {
      // Check if challenge is active
      const challenge = await db.query(
        'SELECT * FROM challenges WHERE id = $1 AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP',
        [challengeId]
      );
      
      if (challenge.rows.length === 0) {
        throw new Error('Challenge not found or not active');
      }
      
      // Check privacy settings
      const privacyCheck = await db.query(
        'SELECT participate_in_challenges FROM gamification_privacy WHERE user_id = $1',
        [userId]
      );
      
      if (privacyCheck.rows.length > 0 && !privacyCheck.rows[0].participate_in_challenges) {
        throw new Error('User has disabled challenge participation');
      }
      
      // Join challenge
      const query = `
        INSERT INTO user_challenges (user_id, challenge_id, status, progress)
        VALUES ($1, $2, 'active', 0)
        ON CONFLICT (user_id, challenge_id) DO NOTHING
        RETURNING *
      `;
      
      const result = await db.query(query, [userId, challengeId]);
      
      if (result.rows.length > 0) {
        await NotificationService.sendChallengeJoinedNotification(userId, challenge.rows[0]);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error joining challenge:', error);
      throw error;
    }
  }
  
  // Update challenge progress
  static async updateChallengeProgress(userId, challengeId, progress, metadata = {}) {
    try {
      const challenge = await db.query(
        'SELECT * FROM challenges WHERE id = $1',
        [challengeId]
      );
      
      if (challenge.rows.length === 0) return;
      
      const targetValue = challenge.rows[0].target_value;
      
      // Update progress
      const updateQuery = `
        UPDATE user_challenges
        SET 
          progress = $3,
          metadata = metadata || $4,
          status = CASE 
            WHEN $3 >= $5 THEN 'completed'
            WHEN CURRENT_TIMESTAMP > (SELECT end_date FROM challenges WHERE id = $2) THEN 'expired'
            ELSE status
          END,
          completed_at = CASE 
            WHEN $3 >= $5 AND completed_at IS NULL THEN CURRENT_TIMESTAMP
            ELSE completed_at
          END
        WHERE user_id = $1 AND challenge_id = $2 AND status = 'active'
        RETURNING *
      `;
      
      const result = await db.query(updateQuery, [userId, challengeId, progress, metadata, targetValue || 100]);
      
      if (result.rows.length > 0 && result.rows[0].status === 'completed') {
        // Award completion
        await this.awardChallengeCompletion(userId, challenge.rows[0]);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error updating challenge progress:', error);
      throw error;
    }
  }
  
  // Award challenge completion
  static async awardChallengeCompletion(userId, challenge) {
    try {
      // Award points
      await db.query(`
        UPDATE user_gamification_stats
        SET 
          total_points = total_points + $2,
          challenge_count = challenge_count + 1,
          experience_points = experience_points + $2,
          level = FLOOR((experience_points + $2) / 1000) + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
      `, [userId, challenge.reward_points]);
      
      // Award achievement if linked
      if (challenge.reward_achievement_id) {
        await AchievementService.awardAchievement(userId, challenge.reward_achievement_id, {
          from_challenge: challenge.key
        });
      }
      
      // Send notification
      await NotificationService.sendChallengeCompletedNotification(userId, challenge);
      
    } catch (error) {
      console.error('Error awarding challenge completion:', error);
      throw error;
    }
  }
  
  // Check and update all active challenges
  static async checkAndUpdateChallenges() {
    try {
      // Get all active user challenges
      const activeQuery = `
        SELECT 
          uc.*,
          c.criteria,
          c.target_value,
          c.end_date
        FROM user_challenges uc
        JOIN challenges c ON c.id = uc.challenge_id
        WHERE uc.status = 'active'
          AND c.end_date >= CURRENT_TIMESTAMP
      `;
      
      const activeChallenges = await db.query(activeQuery);
      
      for (const userChallenge of activeChallenges.rows) {
        const progress = await this.calculateChallengeProgress(
          userChallenge.user_id,
          userChallenge.criteria
        );
        
        if (progress !== userChallenge.progress) {
          await this.updateChallengeProgress(
            userChallenge.user_id,
            userChallenge.challenge_id,
            progress
          );
        }
      }
      
      // Mark expired challenges
      await db.query(`
        UPDATE user_challenges
        SET status = 'expired'
        WHERE status = 'active'
          AND challenge_id IN (
            SELECT id FROM challenges WHERE end_date < CURRENT_TIMESTAMP
          )
      `);
      
    } catch (error) {
      console.error('Error checking challenges:', error);
      throw error;
    }
  }
  
  // Calculate progress for challenge criteria
  static async calculateChallengeProgress(userId, criteria) {
    switch (criteria.type) {
      case 'trades_without_revenge':
        return await this.calculateTradesWithoutRevenge(userId, criteria);
        
      case 'maintain_discipline':
        return await this.calculateDisciplineMaintenance(userId, criteria);
        
      case 'risk_management':
        return await this.calculateRiskManagement(userId, criteria);
        
      case 'consecutive_profits':
        return await this.calculateConsecutiveProfits(userId, criteria);
        
      case 'community_improvement':
        return await this.calculateCommunityImprovement(criteria);
        
      default:
        return 0;
    }
  }
  
  // Calculate trades without revenge trading
  static async calculateTradesWithoutRevenge(userId, criteria) {
    const query = `
      WITH recent_trades AS (
        SELECT COUNT(*) as trade_count
        FROM trades
        WHERE user_id = $1
          AND entry_time >= $2
      ),
      revenge_events AS (
        SELECT COUNT(*) as revenge_count
        FROM revenge_trading_events
        WHERE user_id = $1
          AND created_at >= $2
      )
      SELECT 
        rt.trade_count,
        re.revenge_count
      FROM recent_trades rt, revenge_events re
    `;
    
    const startDate = criteria.start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await db.query(query, [userId, startDate]);
    
    if (result.rows[0].revenge_count === 0) {
      return result.rows[0].trade_count;
    }
    
    return 0; // Reset if any revenge trading occurred
  }
  
  // Calculate discipline maintenance
  static async calculateDisciplineMaintenance(userId, criteria) {
    const query = `
      WITH daily_discipline AS (
        SELECT 
          DATE(entry_time) as trade_date,
          COUNT(CASE 
            WHEN pnl > 0 AND exit_price IS NOT NULL THEN
              CASE 
                WHEN side = 'long' AND ((exit_price - entry_price) / entry_price) >= 0.015 THEN 1
                WHEN side = 'short' AND ((entry_price - exit_price) / entry_price) >= 0.015 THEN 1
                ELSE NULL
              END
            ELSE NULL
          END)::float / COUNT(*)::float * 100 as discipline_score
        FROM trades
        WHERE user_id = $1
          AND entry_time >= $2
          AND exit_time IS NOT NULL
        GROUP BY DATE(entry_time)
      )
      SELECT COUNT(*) as days_maintained
      FROM daily_discipline
      WHERE discipline_score >= $3
    `;
    
    const startDate = criteria.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const threshold = criteria.threshold || 80;
    
    const result = await db.query(query, [userId, startDate, threshold]);
    return parseInt(result.rows[0].days_maintained);
  }
  
  // Calculate risk management
  static async calculateRiskManagement(userId, criteria) {
    const query = `
      SELECT COUNT(*) as compliant_trades
      FROM trades t
      JOIN user_settings us ON us.user_id = t.user_id
      WHERE t.user_id = $1
        AND t.entry_time >= $2
        AND t.exit_time IS NOT NULL
        AND t.quantity IS NOT NULL
        AND t.entry_price IS NOT NULL
        AND ABS(t.pnl) <= (
          -- Use 2% of average position size as risk threshold since account balance columns don't exist
          (SELECT AVG(ABS(quantity * entry_price)) FROM trades WHERE user_id = $1 AND quantity IS NOT NULL AND entry_price IS NOT NULL) * 0.02
        )
    `;
    
    const startDate = criteria.start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await db.query(query, [userId, startDate]);
    
    return parseInt(result.rows[0].compliant_trades);
  }
  
  // Calculate consecutive profitable days
  static async calculateConsecutiveProfits(userId, criteria) {
    const query = `
      WITH daily_pnl AS (
        SELECT 
          DATE(exit_time) as trade_date,
          SUM(pnl) as daily_pnl
        FROM trades
        WHERE user_id = $1
          AND exit_time >= $2
          AND exit_time IS NOT NULL
        GROUP BY DATE(exit_time)
        ORDER BY trade_date DESC
      ),
      streaks AS (
        SELECT 
          trade_date,
          daily_pnl,
          SUM(CASE WHEN daily_pnl < 0 THEN 1 ELSE 0 END) OVER (ORDER BY trade_date DESC) as loss_group
        FROM daily_pnl
      )
      SELECT COUNT(*) as current_streak
      FROM streaks
      WHERE loss_group = 0 AND daily_pnl > 0
    `;
    
    const startDate = criteria.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db.query(query, [userId, startDate]);
    
    return parseInt(result.rows[0].current_streak);
  }
  
  // Calculate community improvement (aggregate metric)
  static async calculateCommunityImprovement(criteria) {
    const query = `
      WITH baseline AS (
        SELECT AVG(${criteria.metric}) as baseline_value
        FROM behavioral_analytics_aggregate
        WHERE date = $1
      ),
      current AS (
        SELECT AVG(${criteria.metric}) as current_value
        FROM behavioral_analytics_aggregate
        WHERE date = CURRENT_DATE
      )
      SELECT 
        ((c.current_value - b.baseline_value) / b.baseline_value * 100) as improvement_pct
      FROM baseline b, current c
    `;
    
    const baselineDate = criteria.baseline_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db.query(query, [baselineDate]);
    
    return Math.max(0, parseFloat(result.rows[0].improvement_pct || 0));
  }
  
  // Create a new challenge
  static async createChallenge(challengeData) {
    const {
      key,
      name,
      description,
      category,
      startDate,
      endDate,
      criteria,
      rewardPoints,
      rewardAchievementId,
      isCommunity,
      targetValue
    } = challengeData;
    
    const query = `
      INSERT INTO challenges (
        key, name, description, category, start_date, end_date,
        criteria, reward_points, reward_achievement_id, is_community, target_value
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const values = [
      key, name, description, category, startDate, endDate,
      criteria, rewardPoints, rewardAchievementId, isCommunity, targetValue
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  // Get challenge leaderboard
  static async getChallengeLeaderboard(challengeId) {
    const query = `
      SELECT 
        uc.user_id,
        COALESCE(gp.anonymous_name, generate_anonymous_name(uc.user_id)) as display_name,
        uc.progress,
        uc.completed_at,
        RANK() OVER (ORDER BY uc.progress DESC, uc.completed_at ASC) as rank
      FROM user_challenges uc
      LEFT JOIN gamification_privacy gp ON gp.user_id = uc.user_id
      WHERE uc.challenge_id = $1
        AND uc.status IN ('active', 'completed')
        AND (gp.show_on_leaderboards IS NULL OR gp.show_on_leaderboards = true)
      ORDER BY rank
      LIMIT 100
    `;
    
    const result = await db.query(query, [challengeId]);
    return result.rows;
  }
}

module.exports = ChallengeService;