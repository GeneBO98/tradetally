const db = require('../config/database');
const logger = require('../utils/logger');

class NotificationPreferencesController {
  /**
   * Get user's notification preferences
   */
  async getPreferences(req, res) {
    try {
      const userId = req.user.id;

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
        return res.status(404).json({ error: 'User not found' });
      }

      const preferences = result.rows[0];
      
      // Convert database boolean values to ensure proper JSON response
      // PostgreSQL returns 't'/'f' strings, so we need to handle them correctly
      const convertPgBoolean = (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value === 't' || value === 'true';
        return Boolean(value);
      };

      const formattedPreferences = {
        notify_news_open_positions: convertPgBoolean(preferences.notify_news_open_positions),
        notify_earnings_announcements: convertPgBoolean(preferences.notify_earnings_announcements),
        notify_price_alerts: convertPgBoolean(preferences.notify_price_alerts),
        notify_trade_reminders: convertPgBoolean(preferences.notify_trade_reminders)
      };

      res.json(formattedPreferences);
    } catch (error) {
      logger.logError(`Error getting notification preferences: ${error.message}`);
      res.status(500).json({ error: 'Failed to get notification preferences' });
    }
  }

  /**
   * Update user's notification preferences
   */
  async updatePreferences(req, res) {
    try {
      const userId = req.user.id;
      const {
        notify_news_open_positions,
        notify_earnings_announcements,
        notify_price_alerts,
        notify_trade_reminders
      } = req.body;

      // Validate that at least one preference field is provided
      const validFields = [
        'notify_news_open_positions',
        'notify_earnings_announcements', 
        'notify_price_alerts',
        'notify_trade_reminders'
      ];

      const providedFields = validFields.filter(field => req.body.hasOwnProperty(field));
      
      if (providedFields.length === 0) {
        return res.status(400).json({ 
          error: 'At least one notification preference must be provided',
          validFields
        });
      }

      // Build dynamic query based on provided fields
      const updateFields = [];
      const values = [userId];
      let paramCount = 2;

      providedFields.forEach(field => {
        updateFields.push(`${field} = $${paramCount}`);
        values.push(Boolean(req.body[field]));
        paramCount++;
      });

      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING 
          notify_news_open_positions,
          notify_earnings_announcements,
          notify_price_alerts,
          notify_trade_reminders
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const updatedPreferences = result.rows[0];

      // Log the preference change for audit purposes
      logger.logImport(`User ${userId} updated notification preferences: ${providedFields.join(', ')}`);

      // Convert database boolean values to ensure proper JSON response
      // PostgreSQL returns 't'/'f' strings, so we need to handle them correctly
      const convertPgBoolean = (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value === 't' || value === 'true';
        return Boolean(value);
      };

      const formattedPreferences = {
        notify_news_open_positions: convertPgBoolean(updatedPreferences.notify_news_open_positions),
        notify_earnings_announcements: convertPgBoolean(updatedPreferences.notify_earnings_announcements),
        notify_price_alerts: convertPgBoolean(updatedPreferences.notify_price_alerts),
        notify_trade_reminders: convertPgBoolean(updatedPreferences.notify_trade_reminders)
      };

      res.json({
        message: 'Notification preferences updated successfully',
        preferences: formattedPreferences
      });
    } catch (error) {
      logger.logError(`Error updating notification preferences: ${error.message}`);
      res.status(500).json({ error: 'Failed to update notification preferences' });
    }
  }

  /**
   * Get notification preference definitions/descriptions
   */
  async getPreferenceDefinitions(req, res) {
    try {
      const definitions = {
        notify_news_open_positions: {
          label: 'News on Open Positions',
          description: 'Receive notifications when news breaks for stocks you currently have open positions in',
          category: 'Trading'
        },
        notify_earnings_announcements: {
          label: 'Earnings Announcements',
          description: 'Get notified about upcoming earnings announcements for your watchlist and open positions',
          category: 'Trading'
        },
        notify_price_alerts: {
          label: 'Price Alerts',
          description: 'Receive notifications when your price alerts and watchlist triggers are activated',
          category: 'Alerts'
        },
        notify_trade_reminders: {
          label: 'Trade Reminders',
          description: 'Receive behavioral analytics alerts for patterns like revenge trading and overconfidence warnings',
          category: 'Trading'
        }
      };

      res.json(definitions);
    } catch (error) {
      logger.logError(`Error getting preference definitions: ${error.message}`);
      res.status(500).json({ error: 'Failed to get preference definitions' });
    }
  }

  /**
   * Check if user has specific notification enabled
   * This is a utility endpoint for other services to check preferences
   */
  async checkPreference(req, res) {
    try {
      const userId = req.user.id;
      const { preference } = req.params;

      const validPreferences = [
        'notify_news_open_positions',
        'notify_earnings_announcements',
        'notify_price_alerts', 
        'notify_trade_reminders'
      ];

      if (!validPreferences.includes(preference)) {
        return res.status(400).json({ 
          error: 'Invalid preference type',
          validPreferences
        });
      }

      const query = `SELECT ${preference} FROM users WHERE id = $1`;
      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Convert PostgreSQL boolean correctly
      const convertPgBoolean = (value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value === 't' || value === 'true';
        return Boolean(value);
      };

      const isEnabled = convertPgBoolean(result.rows[0][preference]);

      res.json({
        preference,
        enabled: isEnabled
      });
    } catch (error) {
      logger.logError(`Error checking notification preference: ${error.message}`);
      res.status(500).json({ error: 'Failed to check notification preference' });
    }
  }
}

module.exports = new NotificationPreferencesController();