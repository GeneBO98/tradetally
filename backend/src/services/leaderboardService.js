const db = require('../config/database');
const BehavioralAnalyticsService = require('./behavioralAnalyticsService');

class LeaderboardService {
  
  // Update all active leaderboards
  static async updateLeaderboards() {
    try {
      const activeLeaderboards = await db.query(
        'SELECT * FROM leaderboards WHERE is_active = true'
      );
      
      for (const leaderboard of activeLeaderboards.rows) {
        await this.updateLeaderboard(leaderboard);
      }
    } catch (error) {
      console.error('Error updating leaderboards:', error);
      throw error;
    }
  }
  
  // Update a specific leaderboard
  static async updateLeaderboard(leaderboard) {
    try {
      let scores;
      
      // Calculate scores based on metric
      switch (leaderboard.metric_key) {
        case 'discipline_score':
          scores = await this.calculateDisciplineScores(leaderboard);
          break;
          
        case 'revenge_free_days':
          scores = await this.calculateRevengeFreeStreaks(leaderboard);
          break;
          
        case 'consistency_score':
          scores = await this.calculateConsistencyScores(leaderboard);
          break;
          
        case 'risk_adherence_score':
          scores = await this.calculateRiskAdherenceScores(leaderboard);
          break;
          
        case 'achievement_points':
          scores = await this.calculateAchievementPoints(leaderboard);
          break;
          
        default:
          return;
      }
      
      // Only update if we have enough participants
      if (scores.length >= leaderboard.min_participants) {
        await this.saveLeaderboardEntries(leaderboard.id, scores);
      }
      
    } catch (error) {
      console.error(`Error updating leaderboard ${leaderboard.key}:`, error);
      throw error;
    }
  }
  
  // Calculate discipline scores
  static async calculateDisciplineScores(leaderboard) {
    const dateFilter = this.getDateFilter(leaderboard);
    
    const query = `
      WITH user_discipline AS (
        SELECT 
          t.user_id,
          COUNT(CASE 
            WHEN t.pnl > 0 AND t.exit_price IS NOT NULL THEN
              CASE 
                -- For long trades: risk/reward = (exit_price - entry_price) / (entry_price - stop_loss)
                -- For short trades: risk/reward = (entry_price - exit_price) / (stop_loss - entry_price)
                -- Since we don't have stop_loss, we'll use a simpler metric: profitable trades with good returns
                WHEN t.side = 'long' AND ((t.exit_price - t.entry_price) / t.entry_price) >= 0.015 THEN 1
                WHEN t.side = 'short' AND ((t.entry_price - t.exit_price) / t.entry_price) >= 0.015 THEN 1
                ELSE NULL
              END
            ELSE NULL
          END)::float / NULLIF(COUNT(*)::float, 0) * 100 as discipline_score,
          COUNT(*) as trade_count
        FROM trades t
        JOIN gamification_privacy gp ON gp.user_id = t.user_id
        WHERE gp.show_on_leaderboards = true
          AND t.exit_time IS NOT NULL
          ${dateFilter}
        GROUP BY t.user_id
        HAVING COUNT(*) >= 10  -- Minimum trades for meaningful score
      )
      SELECT 
        ud.user_id,
        ud.discipline_score as score,
        json_build_object(
          'trade_count', ud.trade_count,
          'discipline_percentage', ud.discipline_score
        ) as metadata
      FROM user_discipline ud
      ORDER BY ud.discipline_score DESC
      LIMIT 100
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  // Calculate revenge-free streaks
  static async calculateRevengeFreeStreaks(leaderboard) {
    const query = `
      WITH user_streaks AS (
        SELECT 
          u.id as user_id,
          COALESCE(
            EXTRACT(DAY FROM (CURRENT_TIMESTAMP - MAX(rte.created_at))),
            EXTRACT(DAY FROM (CURRENT_TIMESTAMP - u.created_at))
          ) as revenge_free_days
        FROM users u
        JOIN gamification_privacy gp ON gp.user_id = u.id
        LEFT JOIN revenge_trading_events rte ON rte.user_id = u.id
        WHERE gp.show_on_leaderboards = true
          AND EXISTS (
            SELECT 1 FROM trades t 
            WHERE t.user_id = u.id 
              AND t.entry_time >= CURRENT_TIMESTAMP - INTERVAL '30 days'
          )
        GROUP BY u.id
      )
      SELECT 
        user_id,
        revenge_free_days as score,
        json_build_object(
          'streak_days', revenge_free_days,
          'last_incident', null
        ) as metadata
      FROM user_streaks
      WHERE revenge_free_days > 0
      ORDER BY revenge_free_days DESC
      LIMIT 100
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  // Calculate consistency scores
  static async calculateConsistencyScores(leaderboard) {
    const dateFilter = this.getDateFilter(leaderboard);
    
    const query = `
      WITH daily_results AS (
        SELECT 
          t.user_id,
          DATE(t.exit_time) as trade_date,
          SUM(t.pnl) as daily_pnl,
          COUNT(*) as daily_trades
        FROM trades t
        JOIN gamification_privacy gp ON gp.user_id = t.user_id
        WHERE gp.show_on_leaderboards = true
          AND t.exit_time IS NOT NULL
          ${dateFilter}
        GROUP BY t.user_id, DATE(t.exit_time)
      ),
      user_consistency AS (
        SELECT 
          user_id,
          COUNT(DISTINCT trade_date) as trading_days,
          STDDEV(daily_pnl) as pnl_stddev,
          AVG(daily_trades) as avg_daily_trades,
          COUNT(CASE WHEN daily_pnl > 0 THEN 1 END)::float / NULLIF(COUNT(*)::float, 0) * 100 as profitable_days_pct
        FROM daily_results
        GROUP BY user_id
        HAVING COUNT(DISTINCT trade_date) >= 10
      )
      SELECT 
        user_id,
        CASE 
          WHEN pnl_stddev > 0 
          THEN (100 - LEAST(100, pnl_stddev / 100)) * (profitable_days_pct / 100)
          ELSE profitable_days_pct 
        END as score,
        json_build_object(
          'trading_days', trading_days,
          'profitable_days_pct', profitable_days_pct,
          'consistency_rating', CASE 
            WHEN pnl_stddev < 50 THEN 'Excellent'
            WHEN pnl_stddev < 100 THEN 'Good'
            WHEN pnl_stddev < 200 THEN 'Fair'
            ELSE 'Needs Improvement'
          END
        ) as metadata
      FROM user_consistency
      ORDER BY score DESC
      LIMIT 100
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  // Calculate risk adherence scores
  static async calculateRiskAdherenceScores(leaderboard) {
    const dateFilter = this.getDateFilter(leaderboard);
    
    const query = `
      WITH user_avg_position AS (
        SELECT 
          t.user_id,
          AVG(ABS(t.quantity * t.entry_price)) as avg_position_size
        FROM trades t
        JOIN user_settings us ON us.user_id = t.user_id
        JOIN gamification_privacy gp ON gp.user_id = t.user_id
        WHERE gp.show_on_leaderboards = true
          AND t.exit_time IS NOT NULL
          AND t.quantity IS NOT NULL
          AND t.entry_price IS NOT NULL
          ${dateFilter}
        GROUP BY t.user_id
      ),
      user_risk AS (
        SELECT 
          t.user_id,
          COUNT(*) as total_trades,
          uap.avg_position_size,
          -- Calculate risk adherence based on position sizing consistency
          -- Use 2% of average position size as risk threshold
          COUNT(CASE 
            WHEN ABS(t.pnl) <= (uap.avg_position_size * 0.02) 
            THEN 1 
          END) as within_risk_trades
        FROM trades t
        JOIN user_settings us ON us.user_id = t.user_id
        JOIN gamification_privacy gp ON gp.user_id = t.user_id
        JOIN user_avg_position uap ON uap.user_id = t.user_id
        WHERE gp.show_on_leaderboards = true
          AND t.exit_time IS NOT NULL
          AND t.quantity IS NOT NULL
          AND t.entry_price IS NOT NULL
          ${dateFilter}
        GROUP BY t.user_id, uap.avg_position_size
        HAVING COUNT(*) >= 20
      )
      SELECT 
        user_id,
        (within_risk_trades::float / total_trades::float * 100) as score,
        json_build_object(
          'total_trades', total_trades,
          'within_risk_trades', within_risk_trades,
          'avg_position_size', ROUND(avg_position_size::numeric, 2),
          'risk_adherence_pct', (within_risk_trades::float / total_trades::float * 100)
        ) as metadata
      FROM user_risk
      ORDER BY score DESC
      LIMIT 100
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  // Calculate achievement points
  static async calculateAchievementPoints(leaderboard) {
    const dateFilter = this.getDateFilter(leaderboard);
    
    const query = `
      SELECT 
        gs.user_id,
        gs.total_points as score,
        json_build_object(
          'achievement_count', gs.achievement_count,
          'challenge_count', gs.challenge_count,
          'level', gs.level,
          'badges', gs.badges
        ) as metadata
      FROM user_gamification_stats gs
      JOIN gamification_privacy gp ON gp.user_id = gs.user_id
      WHERE gp.show_on_leaderboards = true
        AND gs.total_points > 0
      ORDER BY gs.total_points DESC
      LIMIT 100
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  // Get date filter based on period type
  static getDateFilter(leaderboard) {
    switch (leaderboard.period_type) {
      case 'daily':
        return "AND t.exit_time >= CURRENT_DATE";
        
      case 'weekly':
        return "AND t.exit_time >= date_trunc('week', CURRENT_DATE)";
        
      case 'monthly':
        return "AND t.exit_time >= date_trunc('month', CURRENT_DATE)";
        
      case 'custom':
        return `AND t.exit_time >= '${leaderboard.period_start}' AND t.exit_time <= '${leaderboard.period_end}'`;
        
      default:
        return ""; // all time
    }
  }
  
  // Save leaderboard entries
  static async saveLeaderboardEntries(leaderboardId, scores) {
    try {
      // Begin transaction
      await db.query('BEGIN');
      
      // Clear existing entries for this period
      await db.query(
        'DELETE FROM leaderboard_entries WHERE leaderboard_id = $1 AND DATE(recorded_at) = CURRENT_DATE',
        [leaderboardId]
      );
      
      // Insert new entries with rankings
      for (let i = 0; i < scores.length; i++) {
        const score = scores[i];
        const rank = i + 1;
        
        // Get user's privacy settings
        const privacyResult = await db.query(
          'SELECT anonymous_only FROM gamification_privacy WHERE user_id = $1',
          [score.user_id]
        );
        
        const anonymousName = privacyResult.rows[0]?.anonymous_only || !privacyResult.rows.length
          ? await this.generateAnonymousName(score.user_id)
          : null;
        
        await db.query(`
          INSERT INTO leaderboard_entries (
            leaderboard_id, user_id, anonymous_name, score, rank, metadata, recorded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        `, [
          leaderboardId,
          score.user_id,
          anonymousName,
          score.score,
          rank,
          score.metadata
        ]);
      }
      
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }
  
  // Generate anonymous name for user
  static async generateAnonymousName(userId) {
    const result = await db.query(
      'SELECT generate_anonymous_name($1) as name',
      [userId]
    );
    return result.rows[0].name;
  }
  
  // Get leaderboard entries
  static async getLeaderboard(leaderboardKey, userId = null) {
    try {
      // Get leaderboard info
      const leaderboardResult = await db.query(
        'SELECT * FROM leaderboards WHERE key = $1 AND is_active = true',
        [leaderboardKey]
      );
      
      if (leaderboardResult.rows.length === 0) {
        throw new Error('Leaderboard not found');
      }
      
      const leaderboard = leaderboardResult.rows[0];
      
      // Get entries
      const entriesQuery = `
        SELECT 
          le.rank,
          CASE 
            WHEN le.anonymous_name IS NOT NULL THEN le.anonymous_name
            WHEN gp.anonymous_only = true THEN generate_anonymous_name(le.user_id)
            ELSE u.username
          END as display_name,
          le.score,
          le.metadata,
          le.user_id = $2 as is_current_user,
          le.recorded_at
        FROM leaderboard_entries le
        JOIN users u ON u.id = le.user_id
        LEFT JOIN gamification_privacy gp ON gp.user_id = le.user_id
        WHERE le.leaderboard_id = $1
          AND DATE(le.recorded_at) = CURRENT_DATE
        ORDER BY le.rank
        LIMIT 100
      `;
      
      const entriesResult = await db.query(entriesQuery, [leaderboard.id, userId]);
      
      // Get user's rank if not in top 100
      let userRank = null;
      if (userId && !entriesResult.rows.some(e => e.is_current_user)) {
        const userRankResult = await db.query(`
          SELECT rank, score, metadata
          FROM leaderboard_entries
          WHERE leaderboard_id = $1 
            AND user_id = $2
            AND DATE(recorded_at) = CURRENT_DATE
        `, [leaderboard.id, userId]);
        
        if (userRankResult.rows.length > 0) {
          userRank = userRankResult.rows[0];
        }
      }
      
      return {
        leaderboard,
        entries: entriesResult.rows,
        userRank,
        lastUpdated: entriesResult.rows[0]?.recorded_at || null
      };
      
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      throw error;
    }
  }
  
  // Get user's rankings across all leaderboards
  static async getUserRankings(userId) {
    const query = `
      SELECT 
        l.key,
        l.name,
        l.period_type,
        le.rank,
        le.score,
        le.metadata,
        (SELECT COUNT(*) FROM leaderboard_entries WHERE leaderboard_id = l.id AND DATE(recorded_at) = CURRENT_DATE) as total_participants
      FROM leaderboard_entries le
      JOIN leaderboards l ON l.id = le.leaderboard_id
      WHERE le.user_id = $1
        AND DATE(le.recorded_at) = CURRENT_DATE
        AND l.is_active = true
      ORDER BY l.name
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }
  
  // Create custom leaderboard
  static async createLeaderboard(leaderboardData) {
    const {
      key,
      name,
      description,
      metricKey,
      periodType,
      periodStart,
      periodEnd,
      minParticipants
    } = leaderboardData;
    
    const query = `
      INSERT INTO leaderboards (
        key, name, description, metric_key, period_type,
        period_start, period_end, min_participants
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const values = [
      key, name, description, metricKey, periodType,
      periodStart, periodEnd, minParticipants || 10
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
}

module.exports = LeaderboardService;