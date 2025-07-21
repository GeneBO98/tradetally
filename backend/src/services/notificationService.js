const db = require('../config/database');

class NotificationService {
  
  // Get SSE connections from notifications controller
  static getSSEConnections() {
    try {
      const notificationsController = require('../controllers/notifications.controller');
      return notificationsController.getConnections ? notificationsController.getConnections() : new Map();
    } catch (error) {
      return new Map();
    }
  }
  
  // Send achievement notification
  static async sendAchievementNotification(userId, achievement) {
    try {
      const message = {
        type: 'achievement_earned',
        data: {
          achievement: {
            id: achievement.id,
            name: achievement.name,
            description: achievement.description,
            points: achievement.points,
            difficulty: achievement.difficulty,
            icon_name: achievement.icon_name
          },
          timestamp: new Date().toISOString()
        }
      };
      
      await this.sendSSENotification(userId, message);
      await this.saveNotification(userId, 'achievement_earned', message.data);
      
    } catch (error) {
      console.error('Error sending achievement notification:', error);
    }
  }
  
  // Send challenge joined notification
  static async sendChallengeJoinedNotification(userId, challenge) {
    try {
      const message = {
        type: 'challenge_joined',
        data: {
          challenge: {
            id: challenge.id,
            name: challenge.name,
            description: challenge.description,
            end_date: challenge.end_date,
            reward_points: challenge.reward_points
          },
          timestamp: new Date().toISOString()
        }
      };
      
      await this.sendSSENotification(userId, message);
      await this.saveNotification(userId, 'challenge_joined', message.data);
      
    } catch (error) {
      console.error('Error sending challenge joined notification:', error);
    }
  }
  
  // Send challenge completed notification
  static async sendChallengeCompletedNotification(userId, challenge) {
    try {
      const message = {
        type: 'challenge_completed',
        data: {
          challenge: {
            id: challenge.id,
            name: challenge.name,
            reward_points: challenge.reward_points
          },
          timestamp: new Date().toISOString()
        }
      };
      
      await this.sendSSENotification(userId, message);
      await this.saveNotification(userId, 'challenge_completed', message.data);
      
    } catch (error) {
      console.error('Error sending challenge completed notification:', error);
    }
  }
  
  // Send level up notification
  static async sendLevelUpNotification(userId, newLevel, oldLevel) {
    try {
      const message = {
        type: 'level_up',
        data: {
          newLevel,
          oldLevel,
          timestamp: new Date().toISOString()
        }
      };
      
      await this.sendSSENotification(userId, message);
      await this.saveNotification(userId, 'level_up', message.data);
      
    } catch (error) {
      console.error('Error sending level up notification:', error);
    }
  }
  
  // Send leaderboard ranking notification
  static async sendLeaderboardRankingNotification(userId, leaderboard, rank, previousRank) {
    try {
      const message = {
        type: 'leaderboard_ranking',
        data: {
          leaderboard: leaderboard.name,
          rank,
          previousRank,
          movement: previousRank ? (previousRank - rank) : null,
          timestamp: new Date().toISOString()
        }
      };
      
      await this.sendSSENotification(userId, message);
      await this.saveNotification(userId, 'leaderboard_ranking', message.data);
      
    } catch (error) {
      console.error('Error sending leaderboard ranking notification:', error);
    }
  }
  
  // Send SSE notification if user is connected
  static async sendSSENotification(userId, message) {
    try {
      const connections = this.getSSEConnections();
      const userConnection = connections.get(userId);
      
      if (userConnection) {
        userConnection.write(`data: ${JSON.stringify(message)}\n\n`);
      }
    } catch (error) {
      console.error('Error sending SSE notification:', error);
    }
  }
  
  // Save notification to database for offline users
  static async saveNotification(userId, type, data) {
    try {
      // Check if we have a notifications table
      const tableExists = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'notifications'
        );
      `);
      
      if (!tableExists.rows[0].exists) {
        // Create notifications table if it doesn't exist
        await db.query(`
          CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(50) NOT NULL,
            data JSONB NOT NULL,
            read BOOLEAN DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
          CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
        `);
      }
      
      await db.query(`
        INSERT INTO notifications (user_id, type, data)
        VALUES ($1, $2, $3)
      `, [userId, type, data]);
      
    } catch (error) {
      console.error('Error saving notification:', error);
    }
  }
  
  // Get unread notifications for user
  static async getUnreadNotifications(userId) {
    try {
      const query = `
        SELECT *
        FROM notifications
        WHERE user_id = $1 AND read = false
        ORDER BY created_at DESC
        LIMIT 20
      `;
      
      const result = await db.query(query, [userId]);
      return result.rows;
      
    } catch (error) {
      console.error('Error getting unread notifications:', error);
      return [];
    }
  }
  
  // Mark notifications as read
  static async markAsRead(userId, notificationIds) {
    try {
      await db.query(`
        UPDATE notifications
        SET read = true
        WHERE user_id = $1 AND id = ANY($2)
      `, [userId, notificationIds]);
      
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  }
  
  // Send behavioral pattern alert
  static async sendBehavioralAlert(userId, patternType, severity, message) {
    try {
      const notification = {
        type: 'behavioral_alert',
        data: {
          pattern_type: patternType,
          severity,
          message,
          timestamp: new Date().toISOString()
        }
      };
      
      await this.sendSSENotification(userId, notification);
      await this.saveNotification(userId, 'behavioral_alert', notification.data);
      
    } catch (error) {
      console.error('Error sending behavioral alert:', error);
    }
  }
  
  // Send price alert notification (existing functionality)
  static async sendPriceAlert(userId, alert) {
    try {
      const message = {
        type: 'price_alert',
        data: alert
      };
      
      await this.sendSSENotification(userId, message);
      await this.saveNotification(userId, 'price_alert', alert);
      
    } catch (error) {
      console.error('Error sending price alert:', error);
    }
  }

  // Send CUSIP resolution notification
  static async sendCusipResolutionNotification(userId, cusipMappings) {
    try {
      const message = {
        type: 'cusip_resolved',
        data: {
          mappings: cusipMappings, // { "CUSIP123": "AAPL", "CUSIP456": "TSLA" }
          timestamp: new Date().toISOString()
        }
      };
      
      console.log(`Sending CUSIP resolution notification to user ${userId}:`, cusipMappings);
      await this.sendSSENotification(userId, message);
      
      // Don't save to database - this is a real-time update only
      
    } catch (error) {
      console.error('Error sending CUSIP resolution notification:', error);
    }
  }
}

module.exports = NotificationService;