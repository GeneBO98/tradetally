const AchievementService = require('./achievementService');
const ChallengeService = require('./challengeService');
const LeaderboardService = require('./leaderboardService');
const PeerGroupService = require('./peerGroupService');
const db = require('../config/database');

class GamificationScheduler {
  
  // Run all gamification tasks
  static async runScheduledTasks() {
    try {
      console.log('[TARGET] Running gamification scheduled tasks...');
      
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
      
      console.log('[SUCCESS] Gamification scheduled tasks completed');
      
    } catch (error) {
      console.error('[ERROR] Error running gamification scheduled tasks:', error);
    }
  }
  
  // Update challenge progress for all active participants
  static async updateAllChallengeProgress() {
    try {
      console.log('[STATS] Updating challenge progress...');
      
      // Also rotates in this week's and this month's challenges
      await ChallengeService.checkAndUpdateChallenges();
      
    } catch (error) {
      console.error('Error updating challenge progress:', error);
    }
  }
  
  // Update trading streaks for all users
  static async updateAllTradingStreaks() {
    try {
      console.log('[ANALYTICS] Updating trading streaks for all users...');
      
      // Get all users who have trades
      const usersWithTrades = await db.query(`
        SELECT DISTINCT user_id
        FROM trades
        WHERE user_id IS NOT NULL
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
      
      console.log(`[SUCCESS] Updated trading streaks for ${updated} users`);
      
    } catch (error) {
      console.error('Error updating trading streaks:', error);
    }
  }
  
  // Check achievements for users who have been active recently
  static async checkAchievementsForActiveUsers() {
    try {
      console.log('[ACHIEVEMENT] Checking achievements for active users...');
      
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
      
      console.log(`[SUCCESS] Awarded ${achievementsAwarded} new achievements to ${activeUsers.rows.length} active users`);
      
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  }
  
  // Assign new users to appropriate peer groups
  static async assignNewUsersToPeerGroups() {
    try {
      console.log('[PROCESS] Assigning users to peer groups...');
      
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
      
      console.log(`[PROCESS] Assigned ${unassignedUsers.rows.length} users to peer groups`);
      
    } catch (error) {
      console.error('Error assigning users to peer groups:', error);
    }
  }
  
  // Run maintenance tasks
  static async runMaintenance() {
    try {
      console.log('[CLEAN] Running maintenance tasks...');
      
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
      
      console.log('[CLEAN] Maintenance tasks completed');
      
    } catch (error) {
      console.error('Error running maintenance:', error);
    }
  }
  
  // Re-derive stored levels from XP with AchievementService.calculateLevelFromXP
  // (levels 2, 3, 4, 5 at 100, 200, 350, 550 XP). Only rows that disagree are written.
  static async updateUserLevels() {
    try {
      const result = await db.query(
        'SELECT user_id, experience_points, level FROM user_gamification_stats'
      );
      const userIds = [];
      const levels = [];
      for (const row of result.rows) {
        const level = AchievementService.calculateLevelFromXP(row.experience_points || 0).level;
        if (level !== row.level) {
          userIds.push(row.user_id);
          levels.push(level);
        }
      }
      if (userIds.length > 0) {
        await db.query(`
          UPDATE user_gamification_stats s
          SET level = v.level, updated_at = CURRENT_TIMESTAMP
          FROM unnest($1::uuid[], $2::int[]) AS v(user_id, level)
          WHERE s.user_id = v.user_id
        `, [userIds, levels]);
      }
    } catch (error) {
      console.error('Error updating user levels:', error);
    }
  }

  // Cleanup old notifications
  static async cleanupOldNotifications() {
    try {
      // Check if notifications table exists first
      const tableExists = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'notifications'
        );
      `);
      
      if (!tableExists.rows[0].exists) {
        console.log('[INFO] Notifications table does not exist yet, skipping cleanup');
        return;
      }
      
      const result = await db.query(`
        DELETE FROM notifications
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
      `);
      
      console.log(`[INFO] Cleaned up ${result.rowCount} old notifications`);
      
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
      
      console.log('[ANALYTICS] Weekly Gamification Report:', JSON.stringify(report, null, 2));
      
      return report;
      
    } catch (error) {
      console.error('Error generating weekly report:', error);
      return null;
    }
  }
  
  // Start the gamification scheduler
  static startScheduler() {
    if (this.schedulerInterval || this.weeklyTimeout || this.weeklyInterval) {
      console.log('[TARGET] Gamification scheduler is already running');
      return;
    }

    console.log('[TARGET] Starting gamification scheduler...');
    
    // Run immediately
    this.runScheduledTasks();
    
    // Run every hour
    this.schedulerInterval = setInterval(() => {
      this.runScheduledTasks();
    }, 60 * 60 * 1000);
    
    // Generate weekly report every Sunday at midnight
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(0, 0, 0, 0);
    
    const timeToNextSunday = nextSunday.getTime() - now.getTime();
    
    this.weeklyTimeout = setTimeout(() => {
      this.weeklyTimeout = null;
      this.generateWeeklyReport();
      
      // Then run weekly reports every week
      this.weeklyInterval = setInterval(() => {
        this.generateWeeklyReport();
      }, 7 * 24 * 60 * 60 * 1000);
      
    }, timeToNextSunday);
  }

  static stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    if (this.weeklyInterval) {
      clearInterval(this.weeklyInterval);
      this.weeklyInterval = null;
    }

    if (this.weeklyTimeout) {
      clearTimeout(this.weeklyTimeout);
      this.weeklyTimeout = null;
    }

    console.log('[TARGET] Gamification scheduler stopped');
  }
}

module.exports = GamificationScheduler;
