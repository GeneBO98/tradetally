const AchievementService = require('./achievementService');
const ChallengeService = require('./challengeService');
const LeaderboardService = require('./leaderboardService');
const PeerGroupService = require('./peerGroupService');
const db = require('../config/database');

class GamificationScheduler {
  
  // Run all gamification tasks
  static async runScheduledTasks() {
    try {
      console.log('🎯 Running gamification scheduled tasks...');
      
      // Update challenge progress for all active users
      await this.updateAllChallengeProgress();
      
      // Check for new achievements for active users
      await this.checkAchievementsForActiveUsers();
      
      // Update leaderboards
      await LeaderboardService.updateLeaderboards();
      
      // Update trading streaks for all users
      await this.updateAllTradingStreaks();
      
      // Assign new users to peer groups
      await this.assignNewUsersToPeerGroups();
      
      // Cleanup and maintenance
      await this.runMaintenance();
      
      console.log('✅ Gamification scheduled tasks completed');
      
    } catch (error) {
      console.error('❌ Error running gamification scheduled tasks:', error);
    }
  }
  
  // Update challenge progress for all active participants
  static async updateAllChallengeProgress() {
    try {
      console.log('📊 Updating challenge progress...');
      
      await ChallengeService.checkAndUpdateChallenges();
      
      // Create new weekly challenges if needed
      await this.createWeeklyChallenges();
      
    } catch (error) {
      console.error('Error updating challenge progress:', error);
    }
  }
  
  // Update trading streaks for all users
  static async updateAllTradingStreaks() {
    try {
      console.log('📈 Updating trading streaks for all users...');
      
      // Get all users who have trades
      const usersWithTrades = await db.query(`
        SELECT DISTINCT user_id 
        FROM trades
      `);
      
      let updated = 0;
      for (const user of usersWithTrades.rows) {
        try {
          await AchievementService.updateTradingStreak(user.user_id);
          updated++;
        } catch (error) {
          console.warn(`Failed to update streak for user ${user.user_id}:`, error.message);
        }
      }
      
      console.log(`✅ Updated trading streaks for ${updated} users`);
      
    } catch (error) {
      console.error('Error updating trading streaks:', error);
    }
  }
  
  // Check achievements for users who have been active recently
  static async checkAchievementsForActiveUsers() {
    try {
      console.log('🏆 Checking achievements for active users...');
      
      // Get users who have traded in the last 7 days
      const activeUsersQuery = `
        SELECT DISTINCT user_id
        FROM trades
        WHERE entry_time >= CURRENT_TIMESTAMP - INTERVAL '7 days'
        UNION
        SELECT DISTINCT user_id
        FROM user_challenges
        WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
          AND status = 'active'
      `;
      
      const activeUsers = await db.query(activeUsersQuery);
      
      let achievementsAwarded = 0;
      
      for (const user of activeUsers.rows) {
        try {
          const newAchievements = await AchievementService.checkAndAwardAchievements(user.user_id);
          achievementsAwarded += newAchievements.length;
        } catch (error) {
          console.error(`Error checking achievements for user ${user.user_id}:`, error);
        }
      }
      
      console.log(`🎉 Awarded ${achievementsAwarded} new achievements to ${activeUsers.rows.length} active users`);
      
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  }
  
  // Assign new users to appropriate peer groups
  static async assignNewUsersToPeerGroups() {
    try {
      console.log('👥 Assigning users to peer groups...');
      
      // Get users who have enough trades but aren't in any peer group
      const unassignedUsersQuery = `
        SELECT u.id
        FROM users u
        WHERE u.id NOT IN (
          SELECT DISTINCT user_id 
          FROM user_peer_groups 
          WHERE is_active = true
        )
        AND (
          SELECT COUNT(*) 
          FROM trades 
          WHERE user_id = u.id 
            AND exit_time IS NOT NULL
        ) >= 20  -- Minimum trades for peer group assignment
        AND u.created_at <= CURRENT_TIMESTAMP - INTERVAL '7 days'  -- Account at least a week old
      `;
      
      const unassignedUsers = await db.query(unassignedUsersQuery);
      
      for (const user of unassignedUsers.rows) {
        try {
          await PeerGroupService.assignUserToPeerGroups(user.id);
        } catch (error) {
          console.error(`Error assigning user ${user.id} to peer groups:`, error);
        }
      }
      
      console.log(`👥 Assigned ${unassignedUsers.rows.length} users to peer groups`);
      
    } catch (error) {
      console.error('Error assigning users to peer groups:', error);
    }
  }
  
  // Create new weekly challenges
  static async createWeeklyChallenges() {
    try {
      // Check if we need new weekly challenges
      const hasActiveChallenges = await db.query(`
        SELECT COUNT(*) as count
        FROM challenges
        WHERE key LIKE '%_week_%'
          AND end_date >= CURRENT_DATE
          AND start_date <= CURRENT_DATE
      `);
      
      if (parseInt(hasActiveChallenges.rows[0].count) < 2) {
        // Create new weekly challenges
        const weeklyChallenge = {
          key: `revenge_free_week_${Date.now()}`,
          name: 'Weekly Revenge Trading Challenge',
          description: 'Go a full week without revenge trading incidents',
          category: 'behavioral',
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          criteria: { type: 'trades_without_revenge', days: 7 },
          rewardPoints: 100,
          isCommunity: false,
          targetValue: 7
        };
        
        await ChallengeService.createChallenge(weeklyChallenge);
        console.log('📅 Created new weekly challenge');
      }
      
    } catch (error) {
      console.error('Error creating weekly challenges:', error);
    }
  }
  
  // Run maintenance tasks
  static async runMaintenance() {
    try {
      console.log('🧹 Running maintenance tasks...');
      
      // Cleanup expired challenges
      await db.query(`
        UPDATE user_challenges
        SET status = 'expired'
        WHERE status = 'active'
          AND challenge_id IN (
            SELECT id FROM challenges WHERE end_date < CURRENT_TIMESTAMP
          )
      `);
      
      // Cleanup inactive peer group memberships
      await PeerGroupService.cleanupInactiveUsers();
      
      // Rebalance overcrowded peer groups
      await PeerGroupService.rebalancePeerGroups();
      
      // Update user levels based on experience points
      await this.updateUserLevels();
      
      // Cleanup old notifications (keep last 30 days)
      await this.cleanupOldNotifications();
      
      console.log('✨ Maintenance tasks completed');
      
    } catch (error) {
      console.error('Error running maintenance:', error);
    }
  }
  
  // Update user levels based on experience points
  static async updateUserLevels() {
    try {
      await db.query(`
        UPDATE user_gamification_stats
        SET 
          level = FLOOR(experience_points / 1000) + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE level != FLOOR(experience_points / 1000) + 1
      `);
      
    } catch (error) {
      console.error('Error updating user levels:', error);
    }
  }
  
  // Cleanup old notifications
  static async cleanupOldNotifications() {
    try {
      const result = await db.query(`
        DELETE FROM notifications
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
      `);
      
      console.log(`🗑️ Cleaned up ${result.rowCount} old notifications`);
      
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
    }
  }
  
  // Generate weekly gamification report
  static async generateWeeklyReport() {
    try {
      const report = {
        week_ending: new Date(),
        achievements_earned: 0,
        challenges_completed: 0,
        new_users_assigned: 0,
        active_participants: 0,
        top_performers: []
      };
      
      // Get achievements earned this week
      const achievementsQuery = await db.query(`
        SELECT COUNT(*) as count
        FROM user_achievements
        WHERE earned_at >= date_trunc('week', CURRENT_DATE)
      `);
      report.achievements_earned = parseInt(achievementsQuery.rows[0].count);
      
      // Get challenges completed this week
      const challengesQuery = await db.query(`
        SELECT COUNT(*) as count
        FROM user_challenges
        WHERE completed_at >= date_trunc('week', CURRENT_DATE)
      `);
      report.challenges_completed = parseInt(challengesQuery.rows[0].count);
      
      // Get active participants this week
      const participantsQuery = await db.query(`
        SELECT COUNT(DISTINCT user_id) as count
        FROM (
          SELECT user_id FROM user_achievements WHERE earned_at >= date_trunc('week', CURRENT_DATE)
          UNION
          SELECT user_id FROM user_challenges WHERE started_at >= date_trunc('week', CURRENT_DATE)
        ) active_users
      `);
      report.active_participants = parseInt(participantsQuery.rows[0].count);
      
      // Get top performers this week
      const topPerformersQuery = await db.query(`
        SELECT 
          u.username,
          COUNT(ua.id) as achievements_this_week,
          COALESCE(gs.total_points, 0) as total_points
        FROM users u
        LEFT JOIN user_achievements ua ON ua.user_id = u.id 
          AND ua.earned_at >= date_trunc('week', CURRENT_DATE)
        LEFT JOIN user_gamification_stats gs ON gs.user_id = u.id
        GROUP BY u.id, u.username, gs.total_points
        HAVING COUNT(ua.id) > 0
        ORDER BY COUNT(ua.id) DESC, gs.total_points DESC
        LIMIT 5
      `);
      report.top_performers = topPerformersQuery.rows;
      
      console.log('📈 Weekly Gamification Report:', JSON.stringify(report, null, 2));
      
      return report;
      
    } catch (error) {
      console.error('Error generating weekly report:', error);
      return null;
    }
  }
  
  // Start the gamification scheduler
  static startScheduler() {
    console.log('🎯 Starting gamification scheduler...');
    
    // Run immediately
    this.runScheduledTasks();
    
    // Run every hour
    setInterval(() => {
      this.runScheduledTasks();
    }, 60 * 60 * 1000);
    
    // Generate weekly report every Sunday at midnight
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(0, 0, 0, 0);
    
    const timeToNextSunday = nextSunday.getTime() - now.getTime();
    
    setTimeout(() => {
      this.generateWeeklyReport();
      
      // Then run weekly reports every week
      setInterval(() => {
        this.generateWeeklyReport();
      }, 7 * 24 * 60 * 60 * 1000);
      
    }, timeToNextSunday);
  }
}

module.exports = GamificationScheduler;