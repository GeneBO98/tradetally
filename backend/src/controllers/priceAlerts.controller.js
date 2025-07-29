const db = require('../config/database');
const logger = require('../utils/logger');
const finnhub = require('../utils/finnhub');
const { v4: uuidv4 } = require('uuid');
const notificationsController = require('./notifications.controller');

const priceAlertsController = {
  // Get all price alerts for a user
  async getUserPriceAlerts(req, res, next) {
    try {
      const userId = req.user.id;
      const { symbol, active_only = 'true' } = req.query;
      
      let query = `
        SELECT 
          pa.id,
          pa.symbol,
          pa.alert_type,
          pa.target_price,
          pa.change_percent,
          pa.current_price as alert_creation_price,
          pa.is_active,
          pa.email_enabled,
          pa.browser_enabled,
          pa.repeat_enabled,
          pa.triggered_at,
          pa.created_at,
          pa.updated_at,
          pm.current_price,
          pm.percent_change as current_percent_change,
          pm.last_updated as price_last_updated
        FROM price_alerts pa
        LEFT JOIN price_monitoring pm ON pa.symbol = pm.symbol
        WHERE pa.user_id = $1
      `;
      
      const queryParams = [userId];
      let paramIndex = 2;
      
      if (symbol) {
        query += ` AND pa.symbol = $${paramIndex++}`;
        queryParams.push(symbol.toUpperCase());
      }
      
      if (active_only === 'true') {
        query += ` AND pa.is_active = true`;
      }
      
      query += ` ORDER BY pa.created_at DESC`;
      
      const result = await db.query(query, queryParams);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.logError('Error fetching price alerts:', error);
      next(error);
    }
  },

  // Create a new price alert
  async createPriceAlert(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        symbol,
        alert_type,
        target_price,
        change_percent,
        email_enabled = true,
        browser_enabled = true,
        repeat_enabled = false
      } = req.body;
      
      
      // Validation
      if (!symbol || !symbol.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Symbol is required'
        });
      }
      
      if (!alert_type || !['above', 'below', 'change_percent'].includes(alert_type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid alert type. Must be: above, below, or change_percent'
        });
      }
      
      if ((alert_type === 'above' || alert_type === 'below') && !target_price) {
        return res.status(400).json({
          success: false,
          error: 'Target price is required for above/below alerts'
        });
      }
      
      if (alert_type === 'change_percent' && !change_percent) {
        return res.status(400).json({
          success: false,
          error: 'Change percentage is required for change_percent alerts'
        });
      }
      
      if (!email_enabled && !browser_enabled) {
        return res.status(400).json({
          success: false,
          error: 'At least one notification method must be enabled'
        });
      }
      
      const symbolUpper = symbol.trim().toUpperCase();
      
      // Check for duplicate price alerts (same symbol, same target price, same alert type)
      if (alert_type === 'above' || alert_type === 'below') {
        const duplicateQuery = `
          SELECT id FROM price_alerts 
          WHERE user_id = $1 AND symbol = $2 AND alert_type = $3 AND target_price = $4 AND is_active = true
        `;
        const duplicateResult = await db.query(duplicateQuery, [userId, symbolUpper, alert_type, target_price]);
        
        if (duplicateResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            error: `You already have an active ${alert_type} alert for ${symbolUpper} at $${target_price}`
          });
        }
      }
      
      // Get current price for reference
      let currentPrice = null;
      try {
        const priceData = await finnhub.getQuote(symbolUpper);
        if (priceData && priceData.c) {
          currentPrice = priceData.c;
          
          // Validate price direction against current price
          if (alert_type === 'above' && target_price <= currentPrice) {
            return res.status(400).json({
              success: false,
              error: `Warning: You've set an "above" alert for $${target_price}, but ${symbolUpper} is currently trading at $${currentPrice.toFixed(2)}. Your target price should be higher than the current price for "above" alerts.`
            });
          }
          
          if (alert_type === 'below' && target_price >= currentPrice) {
            return res.status(400).json({
              success: false,
              error: `Warning: You've set a "below" alert for $${target_price}, but ${symbolUpper} is currently trading at $${currentPrice.toFixed(2)}. Your target price should be lower than the current price for "below" alerts.`
            });
          }
          
          // Update price monitoring data
          await db.query(`
            INSERT INTO price_monitoring (symbol, current_price, previous_price, price_change, percent_change, volume, data_source)
            VALUES ($1, $2, $3, $4, $5, $6, 'finnhub')
            ON CONFLICT (symbol) DO UPDATE SET
              previous_price = price_monitoring.current_price,
              current_price = $2,
              price_change = $2 - price_monitoring.current_price,
              percent_change = CASE 
                WHEN price_monitoring.current_price > 0 
                THEN (($2 - price_monitoring.current_price) / price_monitoring.current_price) * 100 
                ELSE 0 
              END,
              volume = $6,
              last_updated = CURRENT_TIMESTAMP,
              data_source = 'finnhub'
          `, [symbolUpper, currentPrice, null, 0, 0, priceData.pc || 0]);
        }
      } catch (priceError) {
        logger.logWarn(`Could not fetch current price for ${symbolUpper}:`, priceError.message);
      }
      
      const alertId = uuidv4();
      const query = `
        INSERT INTO price_alerts (
          id, user_id, symbol, alert_type, target_price, change_percent,
          current_price, email_enabled, browser_enabled, repeat_enabled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, symbol, alert_type, target_price, change_percent, current_price,
                 email_enabled, browser_enabled, repeat_enabled, created_at
      `;
      
      const result = await db.query(query, [
        alertId, userId, symbolUpper, alert_type, target_price, change_percent,
        currentPrice, email_enabled, browser_enabled, repeat_enabled
      ]);
      
      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.logError('Error creating price alert:', error);
      next(error);
    }
  },

  // Update a price alert
  async updatePriceAlert(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const {
        target_price,
        change_percent,
        email_enabled,
        browser_enabled,
        repeat_enabled,
        is_active
      } = req.body;
      
      // Check if alert exists and get current alert data
      const existsQuery = 'SELECT alert_type, symbol, target_price FROM price_alerts WHERE id = $1 AND user_id = $2';
      const existsResult = await db.query(existsQuery, [id, userId]);
      
      if (existsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Price alert not found'
        });
      }
      
      const alertType = existsResult.rows[0].alert_type;
      const alertSymbol = existsResult.rows[0].symbol;
      const currentTargetPrice = existsResult.rows[0].target_price;
      
      // If updating target_price, check for duplicates and validate price direction
      if (target_price !== undefined && (alertType === 'above' || alertType === 'below')) {
        // Check for duplicate price alerts (excluding current alert)
        if (target_price !== currentTargetPrice) {
          const duplicateQuery = `
            SELECT id FROM price_alerts 
            WHERE user_id = $1 AND symbol = $2 AND alert_type = $3 AND target_price = $4 AND is_active = true AND id != $5
          `;
          const duplicateResult = await db.query(duplicateQuery, [userId, alertSymbol, alertType, target_price, id]);
          
          if (duplicateResult.rows.length > 0) {
            return res.status(400).json({
              success: false,
              error: `You already have an active ${alertType} alert for ${alertSymbol} at $${target_price}`
            });
          }
        }
        
        // Get current price and validate direction
        try {
          const priceData = await finnhub.getQuote(alertSymbol);
          if (priceData && priceData.c) {
            const currentPrice = priceData.c;
            
            if (alertType === 'above' && target_price <= currentPrice) {
              return res.status(400).json({
                success: false,
                error: `Warning: You've set an "above" alert for $${target_price}, but ${alertSymbol} is currently trading at $${currentPrice.toFixed(2)}. Your target price should be higher than the current price for "above" alerts.`
              });
            }
            
            if (alertType === 'below' && target_price >= currentPrice) {
              return res.status(400).json({
                success: false,
                error: `Warning: You've set a "below" alert for $${target_price}, but ${alertSymbol} is currently trading at $${currentPrice.toFixed(2)}. Your target price should be lower than the current price for "below" alerts.`
              });
            }
          }
        } catch (priceError) {
          logger.logWarn(`Could not fetch current price for ${alertSymbol}:`, priceError.message);
        }
      }
      
      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramIndex = 1;
      
      if (target_price !== undefined) {
        if ((alertType === 'above' || alertType === 'below') && !target_price) {
          return res.status(400).json({
            success: false,
            error: 'Target price cannot be null for above/below alerts'
          });
        }
        updates.push(`target_price = $${paramIndex++}`);
        values.push(target_price);
      }
      
      if (change_percent !== undefined) {
        if (alertType === 'change_percent' && !change_percent) {
          return res.status(400).json({
            success: false,
            error: 'Change percentage cannot be null for change_percent alerts'
          });
        }
        updates.push(`change_percent = $${paramIndex++}`);
        values.push(change_percent);
      }
      
      if (email_enabled !== undefined) {
        updates.push(`email_enabled = $${paramIndex++}`);
        values.push(email_enabled);
      }
      
      if (browser_enabled !== undefined) {
        updates.push(`browser_enabled = $${paramIndex++}`);
        values.push(browser_enabled);
      }
      
      if (repeat_enabled !== undefined) {
        updates.push(`repeat_enabled = $${paramIndex++}`);
        values.push(repeat_enabled);
      }
      
      if (is_active !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(is_active);
        
        // Reset triggered_at if reactivating
        if (is_active === true) {
          updates.push(`triggered_at = NULL`);
        }
      }
      
      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields to update'
        });
      }
      
      // Validate that at least one notification method is enabled
      if ((email_enabled === false || browser_enabled === false) && 
          (email_enabled !== undefined || browser_enabled !== undefined)) {
        const currentAlert = await db.query(
          'SELECT email_enabled, browser_enabled FROM price_alerts WHERE id = $1',
          [id]
        );
        
        const finalEmailEnabled = email_enabled !== undefined ? email_enabled : currentAlert.rows[0].email_enabled;
        const finalBrowserEnabled = browser_enabled !== undefined ? browser_enabled : currentAlert.rows[0].browser_enabled;
        
        if (!finalEmailEnabled && !finalBrowserEnabled) {
          return res.status(400).json({
            success: false,
            error: 'At least one notification method must be enabled'
          });
        }
      }
      
      values.push(id, userId);
      
      const query = `
        UPDATE price_alerts 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
        RETURNING id, symbol, alert_type, target_price, change_percent, current_price,
                 email_enabled, browser_enabled, repeat_enabled, is_active, triggered_at, updated_at
      `;
      
      const result = await db.query(query, values);
      
      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.logError('Error updating price alert:', error);
      next(error);
    }
  },

  // Delete a price alert
  async deletePriceAlert(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const query = 'DELETE FROM price_alerts WHERE id = $1 AND user_id = $2 RETURNING id';
      const result = await db.query(query, [id, userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Price alert not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Price alert deleted successfully'
      });
    } catch (error) {
      logger.logError('Error deleting price alert:', error);
      next(error);
    }
  },

  // Get alert notifications history
  async getAlertNotifications(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;
      
      const query = `
        SELECT 
          an.id,
          an.symbol,
          an.notification_type,
          an.trigger_price,
          an.target_price,
          an.change_percent,
          an.message,
          an.sent_at,
          an.delivery_status,
          pa.alert_type
        FROM alert_notifications an
        LEFT JOIN price_alerts pa ON an.price_alert_id = pa.id
        WHERE an.user_id = $1
        ORDER BY an.sent_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await db.query(query, [userId, parseInt(limit), parseInt(offset)]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.logError('Error fetching alert notifications:', error);
      next(error);
    }
  },

  // Test alert (trigger manually for testing)
  async testAlert(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Get alert details
      const alertQuery = `
        SELECT pa.*, u.email, us.email_notifications
        FROM price_alerts pa
        JOIN users u ON pa.user_id = u.id
        LEFT JOIN user_settings us ON u.id = us.user_id
        WHERE pa.id = $1 AND pa.user_id = $2
      `;
      
      const alertResult = await db.query(alertQuery, [id, userId]);
      
      if (alertResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Price alert not found'
        });
      }
      
      const alert = alertResult.rows[0];
      
      // Create test notification
      const notificationId = uuidv4();
      const message = `TEST ALERT: ${alert.symbol} - This is a test notification for your ${alert.alert_type} alert.`;
      
      await db.query(`
        INSERT INTO alert_notifications (
          id, price_alert_id, user_id, symbol, notification_type,
          trigger_price, target_price, change_percent, message
        )
        VALUES ($1, $2, $3, $4, 'test', $5, $6, $7, $8)
      `, [
        notificationId, alert.id, userId, alert.symbol,
        alert.current_price || 0, alert.target_price, alert.change_percent, message
      ]);
      
      res.json({
        success: true,
        message: 'Test alert sent successfully',
        data: {
          alert_id: alert.id,
          symbol: alert.symbol,
          message: message
        }
      });
    } catch (error) {
      logger.logError('Error sending test alert:', error);
      next(error);
    }
  },

  // Check and trigger price alerts (called by background job)
  async checkAndTriggerAlerts() {
    try {
      logger.logInfo('Starting price alert check...');
      
      // Get all active alerts with current prices
      const alertsQuery = `
        SELECT 
          pa.id,
          pa.user_id,
          pa.symbol,
          pa.alert_type,
          pa.target_price,
          pa.change_percent,
          pa.current_price as alert_creation_price,
          pa.email_enabled,
          pa.browser_enabled,
          pm.current_price,
          pm.previous_price,
          pm.percent_change,
          u.email
        FROM price_alerts pa
        JOIN users u ON pa.user_id = u.id
        LEFT JOIN price_monitoring pm ON pa.symbol = pm.symbol
        WHERE pa.is_active = true 
        AND pa.triggered_at IS NULL
        AND pm.current_price IS NOT NULL
      `;
      
      const alerts = await db.query(alertsQuery);
      logger.logInfo(`Found ${alerts.rows.length} active alerts to check`);
      
      for (const alert of alerts.rows) {
        const shouldTrigger = this.shouldTriggerAlert(alert);
        
        if (shouldTrigger) {
          await this.triggerAlert(alert);
        }
      }
      
      logger.logInfo('Price alert check completed');
    } catch (error) {
      logger.logError('Error in price alert check:', error);
    }
  },

  // Check if an alert should be triggered
  shouldTriggerAlert(alert) {
    const currentPrice = parseFloat(alert.current_price);
    const targetPrice = parseFloat(alert.target_price);
    const changePercent = parseFloat(alert.percent_change || 0);
    const targetChangePercent = parseFloat(alert.change_percent || 0);
    
    switch (alert.alert_type) {
      case 'above':
        return currentPrice >= targetPrice;
      case 'below':
        return currentPrice <= targetPrice;
      case 'change_percent':
        return Math.abs(changePercent) >= Math.abs(targetChangePercent);
      default:
        return false;
    }
  },

  // Trigger a specific alert
  async triggerAlert(alert) {
    try {
      const currentPrice = parseFloat(alert.current_price);
      const targetPrice = parseFloat(alert.target_price);
      
      // If repeat is not enabled, delete the alert; otherwise mark as triggered
      if (!alert.repeat_enabled) {
        await db.query('DELETE FROM price_alerts WHERE id = $1', [alert.id]);
      } else {
        await db.query(
          'UPDATE price_alerts SET triggered_at = CURRENT_TIMESTAMP WHERE id = $1',
          [alert.id]
        );
      }
      
      // Create notification message
      let message;
      switch (alert.alert_type) {
        case 'above':
          message = `${alert.symbol} is now $${currentPrice.toFixed(2)} (above your target of $${targetPrice.toFixed(2)})`;
          break;
        case 'below':
          message = `${alert.symbol} is now $${currentPrice.toFixed(2)} (below your target of $${targetPrice.toFixed(2)})`;
          break;
        case 'change_percent':
          message = `${alert.symbol} has changed by ${alert.percent_change}% (threshold: ${alert.change_percent}%)`;
          break;
        default:
          message = `Price alert triggered for ${alert.symbol}`;
      }
      
      // Send push notification
      await this.sendPushNotification(alert.user_id, {
        title: 'Price Alert Triggered',
        body: message,
        symbol: alert.symbol,
        currentPrice: currentPrice,
        targetPrice: targetPrice,
        alertType: alert.alert_type
      });
      
      // Send browser notification (existing SSE functionality)
      if (alert.browser_enabled) {
        const notification = {
          id: alert.id,
          type: 'price_alert',
          symbol: alert.symbol,
          message: message,
          alert_type: alert.alert_type,
          target_price: targetPrice,
          current_price: currentPrice,
          trigger_price: currentPrice,
          created_at: new Date().toISOString(),
          triggered_at: new Date().toISOString()
        };
        
        await notificationsController.sendNotificationToUser(alert.user_id, notification);
      }
      
      // Log the notification
      const notificationId = uuidv4();
      await db.query(`
        INSERT INTO alert_notifications (
          id, price_alert_id, user_id, symbol, notification_type,
          trigger_price, target_price, change_percent, message
        )
        VALUES ($1, $2, $3, $4, 'price_alert', $5, $6, $7, $8)
      `, [
        notificationId, alert.id, alert.user_id, alert.symbol,
        currentPrice, targetPrice, alert.change_percent, message
      ]);
      
      logger.logInfo(`Price alert triggered for user ${alert.user_id}: ${alert.symbol} at $${currentPrice}`);
      
    } catch (error) {
      logger.logError(`Error triggering alert ${alert.id}:`, error);
    }
  },

  // Send push notification to user's devices
  async sendPushNotification(userId, notificationData) {
    try {
      const pushService = require('../services/pushNotificationService');
      
      const result = await pushService.sendPriceAlert(userId, {
        symbol: notificationData.symbol,
        condition: notificationData.currentPrice > notificationData.targetPrice ? 'above' : 'below',
        currentPrice: notificationData.currentPrice,
        targetPrice: notificationData.targetPrice
      });

      if (result.success) {
        logger.logInfo(`Push notification sent to ${result.successCount}/${result.devicesTargeted} devices for user ${userId}`);
      } else {
        logger.logWarn(`Push notification failed for user ${userId}: ${result.reason || result.error}`);
      }
      
      return result;
      
    } catch (error) {
      logger.logError('Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }
};

module.exports = priceAlertsController;