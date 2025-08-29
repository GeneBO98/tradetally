const db = require('../config/database');

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
      LEFT JOIN gamification_privacy gp ON gp.user_id = t.user_id
      WHERE COALESCE(gp.show_on_leaderboards, true) = true
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
      LEFT JOIN gamification_privacy gp ON gp.user_id = t.user_id
      WHERE COALESCE(gp.show_on_leaderboards, true) = true
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
      LEFT JOIN gamification_privacy gp ON gp.user_id = t.user_id
      WHERE COALESCE(gp.show_on_leaderboards, true) = true
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
        LEFT JOIN gamification_privacy gp ON gp.user_id = u.id
        LEFT JOIN revenge_trading_events rte ON rte.user_id = u.id
        WHERE COALESCE(gp.show_on_leaderboards, true) = true
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
        LEFT JOIN gamification_privacy gp ON gp.user_id = t.user_id
        WHERE COALESCE(gp.show_on_leaderboards, true) = true
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
      LEFT JOIN gamification_privacy gp ON gp.user_id = gs.user_id
      WHERE COALESCE(gp.show_on_leaderboards, true) = true
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
  static async getUserRankings(userId, filters = {}) {
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
    
    // If no filters provided, return original rankings
    if (!filters || Object.keys(filters).length === 0) {
      return result.rows;
    }
    
    // If filters are provided, get filtered rankings
    return await this.getFilteredRankings(userId, filters);
  }

  // Get filtered user IDs based on strategy, volume, and P&L criteria
  static async getFilteredUserIds(filters = {}) {
    try {
      const { strategy, minVolume, maxVolume, minPnl, maxPnl } = filters;
      
      console.log('Getting filtered user IDs with filters:', filters);
      
      // Build dynamic WHERE and HAVING conditions
      let whereConditions = [];
      let havingConditions = [];
      let queryParams = [];
      let paramIndex = 1;
      
      // Base condition - only users who are on leaderboards
      whereConditions.push(`t.user_id IN (
        SELECT DISTINCT user_id 
        FROM leaderboard_entries 
        WHERE DATE(recorded_at) = CURRENT_DATE
      )`);
      
      // Strategy filter goes in WHERE clause (before grouping)
      if (strategy && strategy !== 'all') {
        whereConditions.push(`t.strategy = $${paramIndex}`);
        queryParams.push(strategy);
        paramIndex++;
      }
      
      // Volume filters go in HAVING clause (after grouping)
      if (minVolume !== undefined && minVolume !== null) {
        havingConditions.push(`AVG(ABS(t.quantity * t.entry_price)) >= $${paramIndex}`);
        queryParams.push(parseFloat(minVolume));
        paramIndex++;
      }
      
      if (maxVolume !== undefined && maxVolume !== null) {
        havingConditions.push(`AVG(ABS(t.quantity * t.entry_price)) <= $${paramIndex}`);
        queryParams.push(parseFloat(maxVolume));
        paramIndex++;
      }
      
      // P&L filters go in HAVING clause (after grouping)
      if (minPnl !== undefined && minPnl !== null) {
        havingConditions.push(`AVG(t.pnl) >= $${paramIndex}`);
        queryParams.push(parseFloat(minPnl));
        paramIndex++;
      }
      
      if (maxPnl !== undefined && maxPnl !== null) {
        havingConditions.push(`AVG(t.pnl) <= $${paramIndex}`);
        queryParams.push(parseFloat(maxPnl));
        paramIndex++;
      }
      
      // Build the WHERE clause
      let whereClause = whereConditions.join(' AND ');
      
      // Build the HAVING clause
      let havingClause = 'COUNT(*) >= 1'; // Minimum trade requirement
      if (havingConditions.length > 0) {
        havingClause = `${havingClause} AND ${havingConditions.join(' AND ')}`;
      }
      
      // Get list of users that match the filter criteria
      const userFilterQuery = `
        SELECT DISTINCT t.user_id
        FROM trades t
        WHERE ${whereClause}
        GROUP BY t.user_id
        HAVING ${havingClause}
      `;
      
      const filteredUsersResult = await db.query(userFilterQuery, queryParams);
      return filteredUsersResult.rows.map(row => row.user_id);
      
    } catch (error) {
      console.error('Error in getFilteredUserIds:', error);
      throw error;
    }
  }

  // Get filtered rankings based on strategy, volume, and P&L criteria
  static async getFilteredRankings(userId, filters = {}) {
    try {
      const { strategy, minVolume, maxVolume, minPnl, maxPnl } = filters;
      
      console.log('Getting filtered rankings with filters:', filters);
      
      // Build dynamic WHERE and HAVING conditions for filtering users
      let whereConditions = [];
      let havingConditions = [];
      let queryParams = [];
      let paramIndex = 1;
      
      // Strategy filter goes in WHERE clause (before grouping)
      if (strategy && strategy !== 'all') {
        whereConditions.push(`t.strategy = $${paramIndex}`);
        queryParams.push(strategy);
        paramIndex++;
      }
      
      // Volume filters go in HAVING clause (after grouping)
      if (minVolume !== undefined && minVolume !== null) {
        havingConditions.push(`AVG(ABS(t.quantity * t.entry_price)) >= $${paramIndex}`);
        queryParams.push(parseFloat(minVolume));
        paramIndex++;
      }
      
      if (maxVolume !== undefined && maxVolume !== null) {
        havingConditions.push(`AVG(ABS(t.quantity * t.entry_price)) <= $${paramIndex}`);
        queryParams.push(parseFloat(maxVolume));
        paramIndex++;
      }
      
      // P&L filters go in HAVING clause (after grouping)
      if (minPnl !== undefined && minPnl !== null) {
        havingConditions.push(`AVG(t.pnl) >= $${paramIndex}`);
        queryParams.push(parseFloat(minPnl));
        paramIndex++;
      }
      
      if (maxPnl !== undefined && maxPnl !== null) {
        havingConditions.push(`AVG(t.pnl) <= $${paramIndex}`);
        queryParams.push(parseFloat(maxPnl));
        paramIndex++;
      }
      
      // If no valid filters, return empty results
      if (whereConditions.length === 0 && havingConditions.length === 0) {
        return [];
      }
      
      // Build the WHERE clause
      let whereClause = `t.user_id IN (
        SELECT DISTINCT user_id 
        FROM leaderboard_entries 
        WHERE DATE(recorded_at) = CURRENT_DATE
      )`;
      
      if (whereConditions.length > 0) {
        whereClause += ` AND ${whereConditions.join(' AND ')}`;
      }
      
      // Build the HAVING clause
      let havingClause = 'COUNT(*) >= 1'; // Minimum trade requirement
      if (havingConditions.length > 0) {
        havingClause = `${havingClause} AND ${havingConditions.join(' AND ')}`;
      }
      
      // Get list of users that match the filter criteria
      const userFilterQuery = `
        SELECT DISTINCT t.user_id
        FROM trades t
        WHERE ${whereClause}
        GROUP BY t.user_id
        HAVING ${havingClause}
      `;
      
      const filteredUsersResult = await db.query(userFilterQuery, queryParams);
      const filteredUserIds = filteredUsersResult.rows.map(row => row.user_id);
      
      console.log(`Found ${filteredUserIds.length} users matching filter criteria`);
      
      if (filteredUserIds.length === 0) {
        return [];
      }
      
      // Now get leaderboard data for only the filtered users
      // Reset parameter indexing for the new query
      const rankingsQuery = `
        WITH filtered_rankings AS (
          SELECT 
            l.key,
            l.name,
            l.period_type,
            le.user_id,
            le.rank as original_rank,
            le.score,
            le.metadata,
            ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY le.score DESC) as filtered_rank
          FROM leaderboard_entries le
          JOIN leaderboards l ON l.id = le.leaderboard_id
          WHERE le.user_id = ANY($1::uuid[])
            AND DATE(le.recorded_at) = CURRENT_DATE
            AND l.is_active = true
        )
        SELECT 
          fr.key,
          fr.name,
          fr.period_type,
          CASE 
            WHEN fr.user_id = $2 THEN fr.filtered_rank
            ELSE fr.original_rank
          END as rank,
          fr.score,
          fr.metadata,
          COUNT(*) OVER (PARTITION BY fr.key) as total_participants
        FROM filtered_rankings fr
        WHERE fr.user_id = $2
        UNION ALL
        -- Include the requesting user's original rankings even if they don't match filters
        SELECT 
          l.key,
          l.name,
          l.period_type,
          le.rank,
          le.score,
          le.metadata,
          (SELECT COUNT(*) FROM leaderboard_entries le2 WHERE le2.leaderboard_id = l.id AND le2.user_id = ANY($1::uuid[]) AND DATE(le2.recorded_at) = CURRENT_DATE) as total_participants
        FROM leaderboard_entries le
        JOIN leaderboards l ON l.id = le.leaderboard_id
        WHERE le.user_id = $2
          AND DATE(le.recorded_at) = CURRENT_DATE
          AND l.is_active = true
          AND le.user_id NOT IN (
            SELECT fr2.user_id FROM filtered_rankings fr2 WHERE fr2.key = l.key
          )
        ORDER BY name
      `;
      
      // Fresh parameter array for the new query
      const rankingsQueryParams = [filteredUserIds, userId];
      
      const result = await db.query(rankingsQuery, rankingsQueryParams);
      
      // Add filter information to the results
      const rankings = result.rows.map(row => ({
        ...row,
        filtered: true,
        filter_criteria: filters,
        total_filtered_users: filteredUserIds.length
      }));
      
      return rankings;
      
    } catch (error) {
      console.error('Error in getFilteredRankings:', error);
      throw error;
    }
  }

  // Get available filter options for rankings
  static async getRankingFilterOptions() {
    try {
      // Get all unique strategies from trades
      const strategiesQuery = `
        SELECT DISTINCT strategy 
        FROM trades 
        WHERE strategy IS NOT NULL 
          AND strategy != '' 
          AND user_id IN (
            SELECT DISTINCT user_id 
            FROM leaderboard_entries 
            WHERE DATE(recorded_at) = CURRENT_DATE
          )
        ORDER BY strategy
      `;
      
      // Get volume ranges (min/max average volume traded)
      const volumeRangesQuery = `
        SELECT 
          MIN(avg_volume) as min_volume,
          MAX(avg_volume) as max_volume,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_volume) as q25_volume,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_volume) as median_volume,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_volume) as q75_volume
        FROM (
          SELECT 
            t.user_id,
            AVG(ABS(t.quantity * t.entry_price)) as avg_volume
          FROM trades t
          WHERE t.user_id IN (
            SELECT DISTINCT user_id 
            FROM leaderboard_entries 
            WHERE DATE(recorded_at) = CURRENT_DATE
          )
          GROUP BY t.user_id
          HAVING COUNT(*) >= 5  -- Users with at least 5 trades
        ) user_volumes
      `;
      
      // Get P&L ranges (min/max average P&L)
      const pnlRangesQuery = `
        SELECT 
          MIN(avg_pnl) as min_pnl,
          MAX(avg_pnl) as max_pnl,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_pnl) as q25_pnl,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_pnl) as median_pnl,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_pnl) as q75_pnl
        FROM (
          SELECT 
            t.user_id,
            AVG(t.pnl) as avg_pnl
          FROM trades t
          WHERE t.user_id IN (
            SELECT DISTINCT user_id 
            FROM leaderboard_entries 
            WHERE DATE(recorded_at) = CURRENT_DATE
          )
          GROUP BY t.user_id
          HAVING COUNT(*) >= 5  -- Users with at least 5 trades
        ) user_pnls
      `;
      
      console.log('Getting ranking filter options...');
      
      const [strategiesResult, volumeResult, pnlResult] = await Promise.all([
        db.query(strategiesQuery),
        db.query(volumeRangesQuery),
        db.query(pnlRangesQuery)
      ]);
      
      const strategies = strategiesResult.rows.map(row => row.strategy);
      const volumeRanges = volumeResult.rows[0] || {};
      const pnlRanges = pnlResult.rows[0] || {};
      
      // Create suggested filter ranges
      const filterOptions = {
        strategies: [
          { value: 'all', label: 'All Strategies' },
          ...strategies.map(strategy => ({
            value: strategy,
            label: strategy
          }))
        ],
        volumeRanges: {
          min: Math.floor(volumeRanges.min_volume || 0),
          max: Math.ceil(volumeRanges.max_volume || 100000),
          quartiles: {
            q25: Math.floor(volumeRanges.q25_volume || 0),
            median: Math.floor(volumeRanges.median_volume || 0),
            q75: Math.floor(volumeRanges.q75_volume || 0)
          },
          suggestedRanges: [
            { label: 'Small ($0 - $10K)', min: 0, max: 10000 },
            { label: 'Medium ($10K - $50K)', min: 10000, max: 50000 },
            { label: 'Large ($50K - $250K)', min: 50000, max: 250000 },
            { label: 'Extra Large ($250K+)', min: 250000, max: null }
          ]
        },
        pnlRanges: {
          min: Math.floor(pnlRanges.min_pnl || -1000),
          max: Math.ceil(pnlRanges.max_pnl || 1000),
          quartiles: {
            q25: Math.floor(pnlRanges.q25_pnl || 0),
            median: Math.floor(pnlRanges.median_pnl || 0),
            q75: Math.floor(pnlRanges.q75_pnl || 0)
          },
          suggestedRanges: [
            { label: 'Struggling (Below $0)', min: null, max: 0 },
            { label: 'Break Even ($0 - $50)', min: 0, max: 50 },
            { label: 'Profitable ($50 - $200)', min: 50, max: 200 },
            { label: 'Highly Profitable ($200+)', min: 200, max: null }
          ]
        }
      };
      
      console.log('Filter options prepared:', {
        strategiesCount: strategies.length,
        volumeRange: `$${filterOptions.volumeRanges.min} - $${filterOptions.volumeRanges.max}`,
        pnlRange: `$${filterOptions.pnlRanges.min} - $${filterOptions.pnlRanges.max}`
      });
      
      return filterOptions;
      
    } catch (error) {
      console.error('Error getting ranking filter options:', error);
      throw error;
    }
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
        LEFT JOIN gamification_privacy gp ON gp.user_id = t.user_id
        WHERE COALESCE(gp.show_on_leaderboards, true) = true
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