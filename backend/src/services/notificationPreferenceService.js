const db = require('../config/database');
const logger = require('../utils/logger');

class NotificationPreferenceService {
  /**
   * Check if user has a specific notification preference enabled
   * @param {string} userId - User ID
   * @param {string} preferenceType - Type of notification preference to check
   * @returns {boolean} - Whether the preference is enabled
   */
  static async isNotificationEnabled(userId, preferenceType) {
    try {
      const validPreferences = [
        'notify_news_open_positions',
        'notify_earnings_announcements',
        'notify_price_alerts',
        'notify_trade_reminders'
      ];

      if (!validPreferences.includes(preferenceType)) {
        logger.logWarn(`Invalid notification preference type: ${preferenceType}`);
        return true; // Default to enabled for unknown types
      }

      const query = `SELECT ${preferenceType} FROM users WHERE id = $1`;
      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        logger.logWarn(`User not found when checking notification preference: ${userId}`);
        return false;
      }

      // Convert PostgreSQL boolean correctly
      const value = result.rows[0][preferenceType];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value === 't' || value === 'true';
      return Boolean(value);
    } catch (error) {
      logger.logError(`Error checking notification preference ${preferenceType} for user ${userId}:`, error);
      // Default to enabled if there's an error checking preferences
      return true;
    }
  }

  /**
   * Get all notification preferences for a user
   * @param {string} userId - User ID
   * @returns {object} - Object containing all notification preferences
   */
  static async getUserPreferences(userId) {
    try {
      const query = `
        SELECT 
          notify_news_open_positions,
          notify_earnings_announcements,
          notify_price_alerts,
          notify_trade_reminders
        FROM users 
        WHERE id = $1
      `;

      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        logger.logWarn(`User not found when getting notification preferences: ${userId}`);
        return null;
      }

      const preferences = result.rows[0];
      
      // Convert PostgreSQL boolean correctly
      const convertPgBoolean = (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value === 't' || value === 'true';
        return Boolean(value);
      };
      
      // Convert to boolean and return
      return {
        notify_news_open_positions: convertPgBoolean(preferences.notify_news_open_positions),
        notify_earnings_announcements: convertPgBoolean(preferences.notify_earnings_announcements),
        notify_price_alerts: convertPgBoolean(preferences.notify_price_alerts),
        notify_trade_reminders: convertPgBoolean(preferences.notify_trade_reminders)
      };
    } catch (error) {
      logger.logError(`Error getting notification preferences for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Check if multiple users have a specific notification preference enabled
   * @param {string[]} userIds - Array of user IDs
   * @param {string} preferenceType - Type of notification preference to check
   * @returns {object} - Object mapping userId to boolean preference value
   */
  static async checkMultipleUsersPreference(userIds, preferenceType) {
    try {
      const validPreferences = [
        'notify_news_open_positions',
        'notify_earnings_announcements',
        'notify_price_alerts',
        'notify_trade_reminders'
      ];

      if (!validPreferences.includes(preferenceType)) {
        logger.logWarn(`Invalid notification preference type: ${preferenceType}`);
        // Return all users as enabled for unknown types
        return userIds.reduce((acc, userId) => {
          acc[userId] = true;
          return acc;
        }, {});
      }

      if (userIds.length === 0) {
        return {};
      }

      const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
      const query = `SELECT id, ${preferenceType} FROM users WHERE id IN (${placeholders})`;
      const result = await db.query(query, userIds);

      const preferences = {};
      
      // Initialize all users to false in case they're not found
      userIds.forEach(userId => {
        preferences[userId] = false;
      });

      // Convert PostgreSQL boolean correctly
      const convertPgBoolean = (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value === 't' || value === 'true';
        return Boolean(value);
      };

      // Update with actual preferences from database
      result.rows.forEach(row => {
        preferences[row.id] = convertPgBoolean(row[preferenceType]);
      });

      return preferences;
    } catch (error) {
      logger.logError(`Error checking multiple users' notification preference ${preferenceType}:`, error);
      // Default to enabled for all users if there's an error
      return userIds.reduce((acc, userId) => {
        acc[userId] = true;
        return acc;
      }, {});
    }
  }
}

module.exports = NotificationPreferenceService;