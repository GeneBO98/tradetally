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
        case 'total_pnl':
        case 'monthly_pnl':
        case 'weekly_pnl':
          scores = await this.calculatePnLScores(leaderboard);
          break;
          
        case 'best_trade':
          scores = await this.calculateBestTrades(leaderboard);
          break;
          
        case 'worst_trade':
          scores = await this.calculateWorstTrades(leaderboard);
          break;
          
        case 'consistency_score':
          scores = await this.calculateTradingConsistency(leaderboard);
          break;
          
        default:
          console.warn(`Unknown metric key: ${leaderboard.metric_key}`);
          return;
      }
      
      // Save leaderboard entries regardless of participant count
      if (scores.length > 0) {
        await this.saveLeaderboardEntries(leaderboard.id, scores);
      }
      
    } catch (error) {
      console.error(`Error updating leaderboard ${leaderboard.key}:`, error);
      throw error;
    }
  }
  
  // Calculate P&L scores (total, monthly, weekly)
  static async calculatePnLScores(leaderboard) {
    const dateFilter = this.getDateFilter(leaderboard);
    
    const query = `
      SELECT 
        t.user_id,
        COALESCE(SUM(t.pnl), 0) as score,
        json_build_object(
          'total_pnl', COALESCE(SUM(t.pnl), 0),
          'trade_count', COUNT(*),
          'win_rate', ROUND(COUNT(CASE WHEN t.pnl > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2),
          'avg_trade', ROUND(COALESCE(AVG(t.pnl), 0)::numeric, 2)
        ) as metadata
      FROM trades t
      JOIN gamification_privacy gp ON gp.user_id = t.user_id
      WHERE gp.show_on_leaderboards = true
        AND t.exit_time IS NOT NULL
        AND t.pnl IS NOT NULL
        ${dateFilter}
      GROUP BY t.user_id
      HAVING COUNT(*) >= 1
      ORDER BY score DESC
      LIMIT 100
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  // Calculate best single trades
  static async calculateBestTrades(leaderboard) {
    const query = `
      SELECT 
        t.user_id,
        MAX(t.pnl) as score,
        json_build_object(
          'best_trade_pnl', MAX(t.pnl),
          'best_trade_symbol', (
            SELECT symbol FROM trades t2 
            WHERE t2.user_id = t.user_id AND t2.pnl = MAX(t.pnl) 
            LIMIT 1
          ),
          'best_trade_date', (
            SELECT exit_time FROM trades t2 
            WHERE t2.user_id = t.user_id AND t2.pnl = MAX(t.pnl) 
            LIMIT 1
          )
        ) as metadata
      FROM trades t
      JOIN gamification_privacy gp ON gp.user_id = t.user_id
      WHERE gp.show_on_leaderboards = true
        AND t.exit_time IS NOT NULL
        AND t.pnl IS NOT NULL
        AND t.pnl > 0
      GROUP BY t.user_id
      ORDER BY score DESC
      LIMIT 100
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  // Calculate worst single trades
  static async calculateWorstTrades(leaderboard) {
    const query = `
      SELECT 
        t.user_id,
        MIN(t.pnl) as score,
        json_build_object(
          'worst_trade_pnl', MIN(t.pnl),
          'worst_trade_symbol', (
            SELECT symbol FROM trades t2 
            WHERE t2.user_id = t.user_id AND t2.pnl = MIN(t.pnl) 
            LIMIT 1
          ),
          'worst_trade_date', (
            SELECT exit_time FROM trades t2 
            WHERE t2.user_id = t.user_id AND t2.pnl = MIN(t.pnl) 
            LIMIT 1
          )
        ) as metadata
      FROM trades t
      JOIN gamification_privacy gp ON gp.user_id = t.user_id
      WHERE gp.show_on_leaderboards = true
        AND t.exit_time IS NOT NULL
        AND t.pnl IS NOT NULL
        AND t.pnl < 0
      GROUP BY t.user_id
      ORDER BY score ASC
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
        HAVING COUNT(DISTINCT trade_date) >= 1
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
        HAVING COUNT(*) >= 1
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
        
        // Always generate anonymous names for leaderboards (privacy protection)
        const anonymousName = await this.generateAnonymousName(score.user_id);
        
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
  static async getLeaderboard(leaderboardKey, userId = null, limit = 100) {
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
        ${limit > 0 ? `LIMIT ${limit}` : ''}
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
  
  // Calculate trading consistency based on volume and average P&L
  static async calculateTradingConsistency(leaderboard) {
    const query = `
      WITH user_stats AS (
        SELECT 
          t.user_id,
          COUNT(*) as total_trades,
          AVG(ABS(t.quantity * t.entry_price)) as avg_volume,
          AVG(t.pnl) as avg_pnl,
          STDDEV(t.pnl) as pnl_stddev,
          COUNT(CASE WHEN t.pnl > 0 THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 as win_rate
        FROM trades t
        JOIN gamification_privacy gp ON gp.user_id = t.user_id
        WHERE gp.show_on_leaderboards = true
          AND t.exit_time IS NOT NULL
          AND t.pnl IS NOT NULL
          AND t.quantity IS NOT NULL
          AND t.entry_price IS NOT NULL
        GROUP BY t.user_id
        HAVING COUNT(*) >= 10  -- Need at least 10 trades for meaningful consistency
      ),
      consistency_scores AS (
        SELECT 
          user_id,
          total_trades,
          avg_volume,
          avg_pnl,
          pnl_stddev,
          win_rate,
          -- Consistency score: Higher avg_pnl and lower volatility = better
          -- Also factor in volume (bigger positions = more impressive)
          CASE 
            WHEN pnl_stddev = 0 OR pnl_stddev IS NULL THEN 100
            ELSE GREATEST(0, 
              (avg_pnl / NULLIF(pnl_stddev, 0)) * 
              (win_rate / 100) * 
              (1 + LOG(GREATEST(1, avg_volume / 1000))) -- Volume bonus
            )
          END as consistency_score
        FROM user_stats
      )
      SELECT 
        user_id,
        ROUND(consistency_score::numeric, 2) as score,
        json_build_object(
          'total_trades', total_trades,
          'avg_volume', ROUND(avg_volume::numeric, 0),
          'avg_pnl', ROUND(avg_pnl::numeric, 2),
          'win_rate', ROUND(win_rate::numeric, 2),
          'volatility', ROUND(pnl_stddev::numeric, 2),
          'consistency_score', ROUND(consistency_score::numeric, 2)
        ) as metadata
      FROM consistency_scores
      ORDER BY score DESC
      LIMIT 100
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = LeaderboardService;