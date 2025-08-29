const AchievementService = require('../services/achievementService');
const ChallengeService = require('../services/challengeService');
const LeaderboardService = require('../services/leaderboardService');
const db = require('../config/database');

const gamificationController = {
  
  // Get user achievements
  async getUserAchievements(req, res, next) {
    try {
      const userId = req.user.id;
      
      const achievements = await AchievementService.getUserAchievements(userId);
      const stats = await AchievementService.getUserStats(userId);
      
      res.json({
        success: true,
        data: {
          achievements,
          stats
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get available achievements
  async getAvailableAchievements(req, res, next) {
    try {
      const userId = req.user.id;
      
      console.log(`Getting achievements for user ${userId}`);
      const achievements = await AchievementService.getAvailableAchievements(userId);
      console.log(`Found ${achievements.length} achievements:`, achievements.map(a => a.name));
      
      // Transform the data to match frontend expectations
      const transformedAchievements = achievements.map(achievement => ({
        ...achievement,
        is_earned: achievement.earned === true || achievement.earned_at !== null
      }));
      
      // console.log(`Returning ${transformedAchievements.length} transformed achievements`);
      
      res.json({
        success: true,
        data: {
          achievements: transformedAchievements
        }
      });
    } catch (error) {
      console.error('Error in getAvailableAchievements:', error);
      next(error);
    }
  },
  
  // Check for new achievements
  async checkAchievements(req, res, next) {
    try {
      const userId = req.user.id;
      
      console.log(`Checking achievements for user ${userId}`);
      
      let newAchievements = [];
      try {
        newAchievements = await AchievementService.checkAndAwardAchievements(userId);
        console.log(`Found ${newAchievements.length} new achievements`);
      } catch (achievementError) {
        console.error('Error in checkAndAwardAchievements:', achievementError);
        console.error('Stack trace:', achievementError.stack);
        // Continue with empty array
      }
      
      res.json({
        success: true,
        data: {
          newAchievements: newAchievements,
          count: newAchievements.length
        }
      });
    } catch (error) {
      console.error('Error checking achievements:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check achievements',
        message: error.message
      });
    }
  },
  
  // Get user challenges
  async getUserChallenges(req, res, next) {
    try {
      const userId = req.user.id;
      
      const challenges = await ChallengeService.getUserChallenges(userId);
      
      res.json({
        success: true,
        data: challenges
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get active challenges
  async getActiveChallenges(req, res, next) {
    try {
      const challenges = await ChallengeService.getActiveChallenges();
      
      res.json({
        success: true,
        data: challenges
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Join a challenge
  async joinChallenge(req, res, next) {
    try {
      const userId = req.user.id;
      const { challengeId } = req.params;
      
      const result = await ChallengeService.joinChallenge(userId, challengeId);
      
      res.json({
        success: true,
        data: result,
        message: 'Successfully joined challenge'
      });
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('not active')) {
        return res.status(404).json({
          error: 'Challenge not found',
          message: error.message
        });
      }
      
      if (error.message.includes('disabled')) {
        return res.status(403).json({
          error: 'Challenge participation disabled',
          message: 'You have disabled challenge participation in your privacy settings'
        });
      }
      
      next(error);
    }
  },
  
  // Get challenge leaderboard
  async getChallengeLeaderboard(req, res, next) {
    try {
      const { challengeId } = req.params;
      
      const leaderboard = await ChallengeService.getChallengeLeaderboard(challengeId);
      
      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get leaderboard
  async getLeaderboard(req, res, next) {
    try {
      const { key } = req.params;
      const userId = req.user.id;
      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      
      const leaderboard = await LeaderboardService.getLeaderboard(key, userId, limit);
      
      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Leaderboard not found',
          message: error.message
        });
      }
      
      next(error);
    }
  },
  
  // Get user rankings
  async getUserRankings(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Extract filter parameters from query string
      const filters = {};
      
      if (req.query.strategy) {
        filters.strategy = req.query.strategy;
      }
      
      if (req.query.minVolume) {
        filters.minVolume = parseFloat(req.query.minVolume);
      }
      
      if (req.query.maxVolume) {
        filters.maxVolume = parseFloat(req.query.maxVolume);
      }
      
      if (req.query.minPnl) {
        filters.minPnl = parseFloat(req.query.minPnl);
      }
      
      if (req.query.maxPnl) {
        filters.maxPnl = parseFloat(req.query.maxPnl);
      }
      
      console.log('Rankings request with filters:', filters);
      
      const rankings = await LeaderboardService.getUserRankings(userId, filters);
      
      res.json({
        success: true,
        data: rankings,
        filters: Object.keys(filters).length > 0 ? filters : null
      });
    } catch (error) {
      next(error);
    }
  },

  // Get available filter options for rankings
  async getRankingFilters(req, res, next) {
    try {
      const filterOptions = await LeaderboardService.getRankingFilterOptions();
      
      res.json({
        success: true,
        data: filterOptions
      });
    } catch (error) {
      next(error);
    }
  },

  // Get all leaderboards with entries (for frontend rankings tab)
  async getAllLeaderboards(req, res, next) {
    try {
      const userId = req.user?.id;
      
      // Extract filter parameters from query string
      const filters = {};
      
      if (req.query.strategy) {
        filters.strategy = req.query.strategy;
      }
      
      if (req.query.minVolume) {
        filters.minVolume = parseFloat(req.query.minVolume);
      }
      
      if (req.query.maxVolume) {
        filters.maxVolume = parseFloat(req.query.maxVolume);
      }
      
      if (req.query.minPnl) {
        filters.minPnl = parseFloat(req.query.minPnl);
      }
      
      if (req.query.maxPnl) {
        filters.maxPnl = parseFloat(req.query.maxPnl);
      }
      
      console.log('getAllLeaderboards with filters:', filters);
      
      // Get filtered user IDs if filters are provided
      let filteredUserIds = null;
      if (Object.keys(filters).length > 0) {
        filteredUserIds = await LeaderboardService.getFilteredUserIds(filters);
        console.log(`Found ${filteredUserIds.length} users matching filters`);
        
        // If no users match filters, return empty leaderboards
        if (filteredUserIds.length === 0) {
          const leaderboards = await db.query(`
            SELECT * FROM leaderboards 
            WHERE is_active = true 
            ORDER BY name
          `);
          
          // Return leaderboards with empty entries
          const result = leaderboards.rows.map(lb => ({
            key: lb.key,
            name: lb.name,
            description: lb.description,
            metric_key: lb.metric_key,
            period_type: lb.period_type,
            entries: [],
            filtered: true,
            totalFilteredUsers: 0
          }));
          
          return res.json({
            success: true,
            data: result,
            filtered: true
          });
        }
      }
      
      // Get all active leaderboards
      const leaderboards = await db.query(`
        SELECT * FROM leaderboards 
        WHERE is_active = true 
        ORDER BY name
      `);
      
      const result = [];
      
      for (const lb of leaderboards.rows) {
        let entries;
        
        if (filteredUserIds) {
          // Get filtered entries for this leaderboard
          entries = await db.query(`
            WITH filtered_entries AS (
              SELECT 
                le.user_id,
                le.anonymous_name,
                le.score,
                ROW_NUMBER() OVER (ORDER BY le.score DESC) as filtered_rank
              FROM leaderboard_entries le
              WHERE le.leaderboard_id = $1
                AND DATE(le.recorded_at) = CURRENT_DATE
                AND le.user_id = ANY($2::uuid[])
            )
            SELECT 
              fe.filtered_rank as rank,
              COALESCE(fe.anonymous_name, CONCAT('Trader', SUBSTRING(u.id::text, 1, 4))) as display_name,
              fe.score as value,
              CASE WHEN $3::uuid IS NOT NULL THEN fe.user_id = $3 ELSE false END as is_current_user
            FROM filtered_entries fe
            JOIN users u ON u.id = fe.user_id
            ORDER BY fe.filtered_rank
            LIMIT 10
          `, [lb.id, filteredUserIds, userId]);
        } else {
          // Get all entries for this leaderboard (original behavior)
          entries = await db.query(`
            SELECT 
              le.rank,
              COALESCE(le.anonymous_name, CONCAT('Trader', SUBSTRING(u.id::text, 1, 4))) as display_name,
              le.score as value,
              CASE WHEN $2::uuid IS NOT NULL THEN le.user_id = $2 ELSE false END as is_current_user
            FROM leaderboard_entries le
            JOIN users u ON u.id = le.user_id
            LEFT JOIN gamification_privacy gp ON gp.user_id = le.user_id
            WHERE le.leaderboard_id = $1
              AND DATE(le.recorded_at) = CURRENT_DATE
            ORDER BY le.rank
            LIMIT 10
          `, [lb.id, userId]);
        }
        
        result.push({
          key: lb.key,
          name: lb.name,
          description: lb.description,
          metric_key: lb.metric_key,
          period_type: lb.period_type,
          entries: entries.rows,
          filtered: !!filteredUserIds,
          totalFilteredUsers: filteredUserIds ? filteredUserIds.length : null
        });
      }
      
      res.json({
        success: true,
        data: result,
        filtered: !!filteredUserIds
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get gamification privacy settings
  async getPrivacySettings(req, res, next) {
    try {
      const userId = req.user.id;
      
      const query = `
        SELECT *
        FROM gamification_privacy
        WHERE user_id = $1
      `;
      
      const result = await db.query(query, [userId]);
      
      // Return default settings if none exist
      const defaultSettings = {
        show_on_leaderboards: true,
        anonymous_only: false,
        share_achievements: true,
        participate_in_challenges: true,
        share_with_peer_group: true,
        visible_metrics: ['discipline_score', 'consistency_score']
      };
      
      const settings = result.rows.length > 0 ? result.rows[0] : defaultSettings;
      
      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Update gamification privacy settings
  async updatePrivacySettings(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        showOnLeaderboards,
        anonymousOnly,
        shareAchievements,
        participateInChallenges,
        shareWithPeerGroup,
        visibleMetrics
      } = req.body;
      
      const query = `
        INSERT INTO gamification_privacy (
          user_id, show_on_leaderboards, anonymous_only, share_achievements,
          participate_in_challenges, share_with_peer_group, visible_metrics
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id)
        DO UPDATE SET
          show_on_leaderboards = $2,
          anonymous_only = $3,
          share_achievements = $4,
          participate_in_challenges = $5,
          share_with_peer_group = $6,
          visible_metrics = $7,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const values = [
        userId,
        showOnLeaderboards,
        anonymousOnly,
        shareAchievements,
        participateInChallenges,
        shareWithPeerGroup,
        JSON.stringify(visibleMetrics)
      ];
      
      const result = await db.query(query, values);
      
      res.json({
        success: true,
        data: result.rows[0],
        message: 'Privacy settings updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get gamification dashboard data
  async getDashboard(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Get user stats
      const stats = await AchievementService.getUserStats(userId);
      console.log('User stats from getUserStats:', stats);
      
      // Get user's anonymous name for leaderboards
      const anonymousNameResult = await db.query(`
        SELECT generate_anonymous_name($1::uuid) as anonymous_name
      `, [userId]);
      const anonymousName = anonymousNameResult.rows[0]?.anonymous_name;
      
      // Get recent achievements (last 5)
      const recentAchievements = await db.query(`
        SELECT 
          a.name,
          a.description,
          a.icon_name,
          a.points,
          ua.earned_at
        FROM user_achievements ua
        JOIN achievements a ON a.id = ua.achievement_id
        WHERE ua.user_id = $1
        ORDER BY ua.earned_at DESC
        LIMIT 5
      `, [userId]);
      
      // Get active challenges
      const activeChallenges = await db.query(`
        SELECT 
          c.name,
          c.description,
          c.end_date,
          uc.progress,
          uc.status,
          c.target_value
        FROM user_challenges uc
        JOIN challenges c ON c.id = uc.challenge_id
        WHERE uc.user_id = $1
          AND uc.status = 'active'
        ORDER BY c.end_date ASC
        LIMIT 3
      `, [userId]);
      
      // Get user rankings
      const rankings = await LeaderboardService.getUserRankings(userId);
      
      // Calculate average rank across all leaderboards for overview display
      let averageRank = null;
      if (rankings && rankings.length > 0) {
        const totalRank = rankings.reduce((sum, ranking) => sum + ranking.rank, 0);
        averageRank = Math.round(totalRank / rankings.length);
      }
      
      // Update stats with calculated average rank
      if (stats) {
        stats.rank = averageRank;
      }
      
      // Get upcoming achievements (closest to completion)
      const upcomingAchievements = await db.query(`
        SELECT 
          a.name,
          a.description,
          a.points,
          a.criteria,
          COALESCE(ua.progress, 0) as current_progress,
          a.max_progress
        FROM achievements a
        LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
        WHERE a.is_active = true
          AND (ua.achievement_id IS NULL OR ua.earned_at IS NULL)
        ORDER BY COALESCE(ua.progress, 0) DESC
        LIMIT 5
      `, [userId]);
      
      res.json({
        success: true,
        data: {
          stats,
          anonymousName,
          recentAchievements: recentAchievements.rows,
          activeChallenges: activeChallenges.rows,
          rankings: rankings.slice(0, 3), // Top 3 rankings
          upcomingAchievements: upcomingAchievements.rows
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Get peer comparison data
  async getPeerComparison(req, res, next) {
    try {
      const userId = req.user.id;
      const { metric, timeframe = 'monthly' } = req.query;
      
      // Check if user allows peer comparison
      const privacyCheck = await db.query(
        'SELECT share_with_peer_group, visible_metrics FROM gamification_privacy WHERE user_id = $1',
        [userId]
      );
      
      if (privacyCheck.rows.length > 0) {
        const settings = privacyCheck.rows[0];
        if (!settings.share_with_peer_group || !settings.visible_metrics.includes(metric)) {
          return res.status(403).json({
            error: 'Privacy settings restrict this comparison',
            message: 'You have disabled peer comparison for this metric'
          });
        }
      }
      
      // Get user's peer group(s)
      const peerGroups = await db.query(`
        SELECT pg.* 
        FROM user_peer_groups upg
        JOIN peer_groups pg ON pg.id = upg.peer_group_id
        WHERE upg.user_id = $1 AND upg.is_active = true
      `, [userId]);
      
      if (peerGroups.rows.length === 0) {
        return res.json({
          success: true,
          data: {
            userScore: null,
            peerAverage: null,
            percentile: null,
            message: 'No peer group assigned'
          }
        });
      }
      
      // Calculate comparison based on metric
      let userScore, peerStats;
      
      switch (metric) {
        case 'discipline_score':
          userScore = await this.calculateUserDisciplineScore(userId, timeframe);
          peerStats = await this.calculatePeerDisciplineStats(peerGroups.rows[0].id, userId, timeframe);
          break;
          
        case 'consistency_score':
          userScore = await this.calculateUserConsistencyScore(userId, timeframe);
          peerStats = await this.calculatePeerConsistencyStats(peerGroups.rows[0].id, userId, timeframe);
          break;
          
        case 'achievement_points':
          userScore = await this.getUserAchievementPoints(userId);
          peerStats = await this.getPeerAchievementStats(peerGroups.rows[0].id, userId);
          break;
          
        default:
          return res.status(400).json({
            error: 'Invalid metric',
            message: 'Supported metrics: discipline_score, consistency_score, achievement_points'
          });
      }
      
      res.json({
        success: true,
        data: {
          userScore,
          peerAverage: peerStats.average,
          percentile: peerStats.percentile,
          peerCount: peerStats.count,
          topPerformer: peerStats.topPerformer,
          metric,
          timeframe
        }
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Create custom challenge (admin only)
  async createChallenge(req, res, next) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin' && req.user.role !== 'owner') {
        return res.status(403).json({
          error: 'Admin access required',
          message: 'Only administrators can create challenges'
        });
      }
      
      const challengeData = req.body;
      const challenge = await ChallengeService.createChallenge(challengeData);
      
      res.status(201).json({
        success: true,
        data: challenge,
        message: 'Challenge created successfully'
      });
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(409).json({
          error: 'Challenge key already exists',
          message: 'A challenge with this key already exists'
        });
      }
      
      next(error);
    }
  },
  
  // Trigger leaderboard update (admin only)
  async updateLeaderboards(req, res, next) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin' && req.user.role !== 'owner') {
        return res.status(403).json({
          error: 'Admin access required',
          message: 'Only administrators can trigger leaderboard updates'
        });
      }
      
      await LeaderboardService.updateLeaderboards();
      
      res.json({
        success: true,
        message: 'Leaderboards updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },
  
  // Helper methods for peer comparison
  async calculateUserDisciplineScore(userId, timeframe) {
    const dateFilter = this.getTimeframeFilter(timeframe);
    
    const query = `
      SELECT 
        COUNT(CASE 
          WHEN pnl > 0 AND exit_price IS NOT NULL THEN
            CASE 
              WHEN side = 'long' AND ((exit_price - entry_price) / entry_price) >= 0.015 THEN 1
              WHEN side = 'short' AND ((entry_price - exit_price) / entry_price) >= 0.015 THEN 1
              ELSE NULL
            END
          ELSE NULL
        END)::float / NULLIF(COUNT(*)::float, 0) * 100 as score
      FROM trades
      WHERE user_id = $1
        AND exit_time IS NOT NULL
        ${dateFilter}
    `;
    
    const result = await db.query(query, [userId]);
    return parseFloat(result.rows[0].score || 0);
  },
  
  async calculatePeerDisciplineStats(peerGroupId, excludeUserId, timeframe) {
    const dateFilter = this.getTimeframeFilter(timeframe);
    
    const query = `
      WITH peer_scores AS (
        SELECT 
          t.user_id,
          COUNT(CASE 
            WHEN t.pnl > 0 AND t.exit_price IS NOT NULL THEN
              CASE 
                WHEN t.side = 'long' AND ((t.exit_price - t.entry_price) / t.entry_price) >= 0.015 THEN 1
                WHEN t.side = 'short' AND ((t.entry_price - t.exit_price) / t.entry_price) >= 0.015 THEN 1
                ELSE NULL
              END
            ELSE NULL
          END)::float / NULLIF(COUNT(*)::float, 0) * 100 as score
        FROM trades t
        JOIN user_peer_groups upg ON upg.user_id = t.user_id
        WHERE upg.peer_group_id = $1
          AND t.user_id != $2
          AND t.exit_time IS NOT NULL
          ${dateFilter}
        GROUP BY t.user_id
        HAVING COUNT(*) >= 5
      )
      SELECT 
        AVG(score) as average,
        COUNT(*) as count,
        MAX(score) as top_score
      FROM peer_scores
    `;
    
    const result = await db.query(query, [peerGroupId, excludeUserId]);
    return {
      average: parseFloat(result.rows[0].average || 0),
      count: parseInt(result.rows[0].count || 0),
      topPerformer: parseFloat(result.rows[0].top_score || 0)
    };
  },
  
  getTimeframeFilter(timeframe) {
    switch (timeframe) {
      case 'weekly':
        return "AND exit_time >= date_trunc('week', CURRENT_DATE)";
      case 'monthly':
        return "AND exit_time >= date_trunc('month', CURRENT_DATE)";
      case 'quarterly':
        return "AND exit_time >= date_trunc('quarter', CURRENT_DATE)";
      default:
        return "AND exit_time >= CURRENT_DATE - INTERVAL '30 days'";
    }
  },

  // Sync user stats from existing achievements (admin/debug function)
  async syncUserStats(req, res, next) {
    try {
      const userId = req.user.id;
      
      console.log(`Syncing stats for user ${userId}`);
      
      // Get all earned achievements for this user
      const achievementsQuery = `
        SELECT ua.user_id, a.points, ua.earned_at, a.name
        FROM user_achievements ua
        JOIN achievements a ON a.id = ua.achievement_id
        WHERE ua.user_id = $1
      `;
      
      const achievementsResult = await db.query(achievementsQuery, [userId]);
      const userAchievements = achievementsResult.rows;
      
      console.log(`Found ${userAchievements.length} achievements for user:`, userAchievements);
      
      // Calculate totals
      const totalPoints = userAchievements.reduce((sum, achievement) => sum + (achievement.points || 0), 0);
      const achievementCount = userAchievements.length;
      
      console.log(`Calculated totals: ${totalPoints} points, ${achievementCount} achievements`);
      
      // Calculate level from total XP using the same logic as AchievementService
      let level = 1;
      let currentLevelMinXP = 0;
      let nextLevelMinXP = 100;
      
      if (totalPoints >= 100) {
        while (totalPoints >= nextLevelMinXP) {
          level++;
          currentLevelMinXP = nextLevelMinXP;
          const xpForNextLevel = 100 + (level - 2) * 50;
          nextLevelMinXP = currentLevelMinXP + xpForNextLevel;
        }
      }
      
      console.log(`Calculated level: ${level} (${currentLevelMinXP} to ${nextLevelMinXP})`);
      
      // Update user_gamification_stats
      const updateQuery = `
        INSERT INTO user_gamification_stats (
          user_id, level, total_points, experience_points, achievement_count,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id)
        DO UPDATE SET
          level = $2,
          total_points = $3,
          experience_points = $3,
          achievement_count = $4,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const updateResult = await db.query(updateQuery, [userId, level, totalPoints, achievementCount]);
      const updatedStats = updateResult.rows[0];
      
      console.log('Updated stats:', updatedStats);
      
      res.json({
        success: true,
        data: {
          before: {
            achievements: userAchievements,
            calculatedTotals: { totalPoints, achievementCount, level }
          },
          after: updatedStats
        },
        message: `Successfully synced stats: ${achievementCount} achievements, ${totalPoints} XP, Level ${level}`
      });
    } catch (error) {
      console.error('Error syncing user stats:', error);
      next(error);
    }
  }
};

module.exports = gamificationController;