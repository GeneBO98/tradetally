const db = require('../config/database');

class PeerGroupService {
  
  // Auto-assign users to peer groups based on trading patterns
  static async assignUserToPeerGroups(userId) {
    try {
      // Get user's trading statistics
      const userStats = await this.getUserTradingStats(userId);
      
      if (!userStats || userStats.total_trades < 20) {
        // Not enough data for meaningful peer grouping
        return;
      }
      
      // Find matching peer groups
      const matchingGroups = await this.findMatchingPeerGroups(userStats);
      
      // Assign to best matching groups
      for (const group of matchingGroups) {
        await this.addUserToPeerGroup(userId, group.id);
      }
      
    } catch (error) {
      console.error('Error assigning user to peer groups:', error);
      throw error;
    }
  }
  
  // Get user's trading statistics for peer group matching
  static async getUserTradingStats(userId) {
    const query = `
      WITH user_trades AS (
        SELECT 
          COUNT(*) as total_trades,
          AVG(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60) as avg_hold_time_minutes,
          COUNT(CASE WHEN side = 'buy' THEN 1 END)::float / COUNT(*) * 100 as long_bias_pct,
          AVG(ABS(pnl)) as avg_trade_size,
          STDDEV(pnl) as volatility,
          COUNT(CASE WHEN pnl > 0 THEN 1 END)::float / COUNT(*) * 100 as win_rate,
          COUNT(DISTINCT symbol) as symbols_traded,
          COUNT(DISTINCT DATE(entry_time)) as trading_days,
          AVG(quantity * entry_price) as avg_position_size
        FROM trades
        WHERE user_id = $1 
          AND exit_time IS NOT NULL
          AND entry_time >= CURRENT_TIMESTAMP - INTERVAL '90 days'
      ),
      trading_hours AS (
        SELECT 
          EXTRACT(HOUR FROM entry_time) as hour,
          COUNT(*) as trade_count
        FROM trades
        WHERE user_id = $1
          AND entry_time >= CURRENT_TIMESTAMP - INTERVAL '90 days'
        GROUP BY EXTRACT(HOUR FROM entry_time)
        ORDER BY trade_count DESC
        LIMIT 1
      ),
      behavioral_profile AS (
        SELECT 
          COUNT(CASE WHEN pattern_type = 'revenge_trading' THEN 1 END) as revenge_events,
          COUNT(CASE WHEN pattern_type = 'overconfidence' THEN 1 END) as overconfidence_events,
          COUNT(CASE WHEN pattern_type = 'fomo' THEN 1 END) as fomo_events
        FROM behavioral_patterns
        WHERE user_id = $1
          AND created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
      )
      SELECT 
        ut.*,
        th.hour as primary_trading_hour,
        bp.revenge_events,
        bp.overconfidence_events,
        bp.fomo_events,
        CASE 
          WHEN ut.avg_hold_time_minutes < 60 THEN 'scalper'
          WHEN ut.avg_hold_time_minutes < 1440 THEN 'day_trader'
          WHEN ut.avg_hold_time_minutes < 10080 THEN 'swing_trader'
          ELSE 'position_trader'
        END as trading_style,
        CASE 
          WHEN ut.avg_position_size < 1000 THEN 'micro'
          WHEN ut.avg_position_size < 10000 THEN 'small'
          WHEN ut.avg_position_size < 100000 THEN 'medium'
          ELSE 'large'
        END as account_size_tier,
        CASE 
          WHEN ut.volatility < 50 THEN 'conservative'
          WHEN ut.volatility < 200 THEN 'moderate'
          ELSE 'aggressive'
        END as risk_profile
      FROM user_trades ut, trading_hours th, behavioral_profile bp
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }
  
  // Find peer groups that match user's profile
  static async findMatchingPeerGroups(userStats) {
    const query = `
      SELECT 
        pg.*,
        (SELECT COUNT(*) FROM user_peer_groups WHERE peer_group_id = pg.id AND is_active = true) as current_members
      FROM peer_groups pg
      WHERE pg.is_active = true
        AND (
          -- Trading style match
          (pg.criteria->>'trading_style' = $1) OR
          -- Account size tier match
          (pg.criteria->>'account_size_tier' = $2) OR
          -- Risk profile match
          (pg.criteria->>'risk_profile' = $3) OR
          -- Geographic/timezone match (if available)
          (pg.criteria->>'timezone_group' IS NULL)
        )
        AND (
          SELECT COUNT(*) 
          FROM user_peer_groups 
          WHERE peer_group_id = pg.id AND is_active = true
        ) < pg.max_members
      ORDER BY 
        -- Prioritize exact matches
        CASE 
          WHEN pg.criteria->>'trading_style' = $1 AND pg.criteria->>'account_size_tier' = $2 THEN 1
          WHEN pg.criteria->>'trading_style' = $1 OR pg.criteria->>'account_size_tier' = $2 THEN 2
          ELSE 3
        END,
        current_members ASC
      LIMIT 3
    `;
    
    const result = await db.query(query, [
      userStats.trading_style,
      userStats.account_size_tier,
      userStats.risk_profile
    ]);
    
    return result.rows;
  }
  
  // Add user to peer group
  static async addUserToPeerGroup(userId, peerGroupId) {
    try {
      await db.query(`
        INSERT INTO user_peer_groups (user_id, peer_group_id, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (user_id, peer_group_id) 
        DO UPDATE SET is_active = true, joined_at = CURRENT_TIMESTAMP
      `, [userId, peerGroupId]);
      
    } catch (error) {
      console.error('Error adding user to peer group:', error);
      throw error;
    }
  }
  
  // Create default peer groups
  static async createDefaultPeerGroups() {
    const defaultGroups = [
      {
        name: 'Day Traders - Small Accounts',
        criteria: { trading_style: 'day_trader', account_size_tier: 'small' },
        min_members: 10,
        max_members: 50
      },
      {
        name: 'Day Traders - Medium Accounts',
        criteria: { trading_style: 'day_trader', account_size_tier: 'medium' },
        min_members: 10,
        max_members: 50
      },
      {
        name: 'Swing Traders - Conservative',
        criteria: { trading_style: 'swing_trader', risk_profile: 'conservative' },
        min_members: 10,
        max_members: 50
      },
      {
        name: 'Swing Traders - Aggressive',
        criteria: { trading_style: 'swing_trader', risk_profile: 'aggressive' },
        min_members: 10,
        max_members: 50
      },
      {
        name: 'Scalpers',
        criteria: { trading_style: 'scalper' },
        min_members: 10,
        max_members: 30
      },
      {
        name: 'Position Traders',
        criteria: { trading_style: 'position_trader' },
        min_members: 5,
        max_members: 25
      },
      {
        name: 'High Volume Traders',
        criteria: { account_size_tier: 'large' },
        min_members: 5,
        max_members: 20
      },
      {
        name: 'Conservative Traders',
        criteria: { risk_profile: 'conservative' },
        min_members: 15,
        max_members: 60
      }
    ];
    
    for (const group of defaultGroups) {
      try {
        await db.query(`
          INSERT INTO peer_groups (name, criteria, min_members, max_members, is_active)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (name) DO NOTHING
        `, [group.name, JSON.stringify(group.criteria), group.min_members, group.max_members]);
        
      } catch (error) {
        console.error(`Error creating peer group ${group.name}:`, error);
      }
    }
  }
  
  // Get user's peer groups
  static async getUserPeerGroups(userId) {
    const query = `
      SELECT 
        pg.*,
        upg.joined_at,
        (SELECT COUNT(*) FROM user_peer_groups WHERE peer_group_id = pg.id AND is_active = true) as member_count
      FROM user_peer_groups upg
      JOIN peer_groups pg ON pg.id = upg.peer_group_id
      WHERE upg.user_id = $1 AND upg.is_active = true
      ORDER BY upg.joined_at DESC
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }
  
  // Get peer group comparison stats
  static async getPeerGroupStats(peerGroupId, userId) {
    const query = `
      WITH peer_stats AS (
        SELECT 
          u.id,
          COALESCE(gs.total_points, 0) as points,
          COALESCE(gs.achievement_count, 0) as achievements,
          COUNT(DISTINCT ua.achievement_id) as recent_achievements
        FROM user_peer_groups upg
        JOIN users u ON u.id = upg.user_id
        LEFT JOIN user_gamification_stats gs ON gs.user_id = u.id
        LEFT JOIN user_achievements ua ON ua.user_id = u.id 
          AND ua.earned_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
        WHERE upg.peer_group_id = $1 AND upg.is_active = true
        GROUP BY u.id, gs.total_points, gs.achievement_count
      ),
      user_rank AS (
        SELECT 
          id,
          points,
          achievements,
          recent_achievements,
          RANK() OVER (ORDER BY points DESC) as points_rank,
          RANK() OVER (ORDER BY achievements DESC) as achievement_rank
        FROM peer_stats
      )
      SELECT 
        COUNT(*) as total_members,
        AVG(points) as avg_points,
        MAX(points) as top_points,
        AVG(achievements) as avg_achievements,
        (SELECT points_rank FROM user_rank WHERE id = $2) as user_points_rank,
        (SELECT achievement_rank FROM user_rank WHERE id = $2) as user_achievement_rank,
        (SELECT points FROM user_rank WHERE id = $2) as user_points,
        (SELECT achievements FROM user_rank WHERE id = $2) as user_achievements
      FROM peer_stats
    `;
    
    const result = await db.query(query, [peerGroupId, userId]);
    return result.rows[0];
  }
  
  // Remove inactive users from peer groups
  static async cleanupInactiveUsers() {
    try {
      // Remove users who haven't traded in 90 days
      await db.query(`
        UPDATE user_peer_groups
        SET is_active = false
        WHERE user_id NOT IN (
          SELECT DISTINCT user_id
          FROM trades
          WHERE entry_time >= CURRENT_TIMESTAMP - INTERVAL '90 days'
        )
      `);
      
    } catch (error) {
      console.error('Error cleaning up inactive users:', error);
      throw error;
    }
  }
  
  // Rebalance peer groups if they become too uneven
  static async rebalancePeerGroups() {
    try {
      // Find overcrowded groups
      const overcrowdedGroups = await db.query(`
        SELECT 
          pg.id,
          pg.name,
          pg.max_members,
          COUNT(upg.user_id) as current_members
        FROM peer_groups pg
        JOIN user_peer_groups upg ON upg.peer_group_id = pg.id AND upg.is_active = true
        GROUP BY pg.id, pg.name, pg.max_members
        HAVING COUNT(upg.user_id) > pg.max_members * 1.2
      `);
      
      // Find similar groups with space
      for (const group of overcrowdedGroups.rows) {
        const similarGroups = await db.query(`
          SELECT 
            pg2.id,
            pg2.name,
            pg2.max_members,
            COUNT(upg2.user_id) as current_members
          FROM peer_groups pg2
          LEFT JOIN user_peer_groups upg2 ON upg2.peer_group_id = pg2.id AND upg2.is_active = true
          WHERE pg2.id != $1
            AND pg2.criteria ?& (SELECT array_agg(key) FROM jsonb_object_keys((SELECT criteria FROM peer_groups WHERE id = $1)) AS key)
          GROUP BY pg2.id, pg2.name, pg2.max_members
          HAVING COUNT(upg2.user_id) < pg2.max_members * 0.8
          ORDER BY COUNT(upg2.user_id) ASC
          LIMIT 2
        `, [group.id]);
        
        // Move some users to similar groups
        if (similarGroups.rows.length > 0) {
          const usersToMove = Math.floor((group.current_members - group.max_members) / 2);
          
          await db.query(`
            WITH users_to_move AS (
              SELECT user_id
              FROM user_peer_groups
              WHERE peer_group_id = $1 AND is_active = true
              ORDER BY joined_at DESC
              LIMIT $2
            )
            UPDATE user_peer_groups
            SET peer_group_id = $3
            WHERE user_id IN (SELECT user_id FROM users_to_move)
          `, [group.id, usersToMove, similarGroups.rows[0].id]);
        }
      }
      
    } catch (error) {
      console.error('Error rebalancing peer groups:', error);
      throw error;
    }
  }
}

module.exports = PeerGroupService;