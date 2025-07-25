const logger = require('../utils/logger');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Store active SSE connections
const sseConnections = new Map();

const notificationsController = {
  // SSE endpoint for real-time notifications
  async subscribeToNotifications(req, res, next) {
    try {
      const userId = req.user.id;
      const userTier = req.user.tier;
      
      // Only allow Pro users
      if (userTier !== 'pro') {
        return res.status(403).json({
          success: false,
          error: 'Real-time notifications require Pro tier'
        });
      }

      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'Access-Control-Allow-Credentials': 'true',
        'X-Accel-Buffering': 'no', // Disable proxy buffering
        'Transfer-Encoding': 'chunked'
      });

      // Send initial connection event
      res.write(`data: ${JSON.stringify({
        type: 'connected',
        message: 'Connected to notifications stream',
        timestamp: new Date().toISOString()
      })}\n\n`);

      // Store connection
      sseConnections.set(userId, res);
      
      // Send heartbeat every 45 seconds to keep connection alive (longer interval)
      const heartbeatInterval = setInterval(() => {
        if (sseConnections.has(userId) && !res.destroyed && !res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            })}\n\n`);
          } catch (error) {
            logger.logDebug(`Heartbeat error for user ${userId}:`, error);
            clearInterval(heartbeatInterval);
            sseConnections.delete(userId);
          }
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 45000);
      
      console.log(`User ${userId} connected to notifications stream`);

      // Send recent unread notifications
      try {
        const recentNotifications = await db.query(`
          SELECT 
            an.id,
            an.symbol,
            an.notification_type,
            an.trigger_price,
            an.target_price,
            an.change_percent,
            an.message,
            an.sent_at,
            pa.alert_type
          FROM alert_notifications an
          LEFT JOIN price_alerts pa ON an.price_alert_id = pa.id
          WHERE an.user_id = $1 
          AND an.sent_at > NOW() - INTERVAL '1 hour'
          ORDER BY an.sent_at DESC
          LIMIT 5
        `, [userId]);

        if (recentNotifications.rows.length > 0) {
          res.write(`data: ${JSON.stringify({
            type: 'recent_notifications',
            data: recentNotifications.rows,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      } catch (error) {
        logger.logError('Error fetching recent notifications:', error);
      }

      // Handle client disconnect
      req.on('close', () => {
        clearInterval(heartbeatInterval);
        sseConnections.delete(userId);
        console.log(`User ${userId} disconnected from notifications stream`);
      });

      req.on('error', (error) => {
        logger.logError(`SSE connection error for user ${userId}:`, error);
        clearInterval(heartbeatInterval);
        sseConnections.delete(userId);
      });

      res.on('close', () => {
        clearInterval(heartbeatInterval);
        sseConnections.delete(userId);
        console.log(`User ${userId} response stream closed`);
      });

      res.on('error', (error) => {
        logger.logError(`SSE response error for user ${userId}:`, error);
        clearInterval(heartbeatInterval);
        sseConnections.delete(userId);
      });

    } catch (error) {
      logger.logError('Error setting up SSE connection:', error);
      next(error);
    }
  },

  // Test notification endpoint
  async sendTestNotification(req, res, next) {
    try {
      const userId = req.user.id;
      const userTier = req.user.tier;
      
      // Only allow Pro users
      if (userTier !== 'pro') {
        return res.status(403).json({
          success: false,
          error: 'Real-time notifications require Pro tier'
        });
      }

      const testNotification = {
        id: 'test-' + Date.now(),
        symbol: 'TEST',
        message: 'This is a test notification to check if browser notifications are working',
        alert_type: 'above',
        target_price: 100.00,
        current_price: 101.00,
        triggered_at: new Date().toISOString()
      };

      const sent = await notificationsController.sendNotificationToUser(userId, testNotification);
      
      res.json({
        success: true,
        message: 'Test notification sent',
        notificationSent: sent
      });
    } catch (error) {
      next(error);
    }
  },

  // Send notification to specific user
  async sendNotificationToUser(userId, notification) {
    try {
      const connection = sseConnections.get(userId);
      
      if (connection && !connection.destroyed && !connection.writableEnded) {
        const eventData = {
          type: 'price_alert',
          data: notification,
          timestamp: new Date().toISOString()
        };

        connection.write(`data: ${JSON.stringify(eventData)}\n\n`);
        logger.logDebug(`Sent real-time notification to user ${userId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.logError(`Error sending notification to user ${userId}:`, error);
      // Remove broken connection
      sseConnections.delete(userId);
      return false;
    }
  },

  // Send enrichment status update to specific user
  async sendEnrichmentUpdateToUser(userId, enrichmentData) {
    try {
      const connection = sseConnections.get(userId);
      
      if (connection) {
        const eventData = {
          type: 'enrichment_update',
          data: enrichmentData,
          timestamp: new Date().toISOString()
        };

        connection.write(`data: ${JSON.stringify(eventData)}\n\n`);
        logger.logDebug(`Sent enrichment update to user ${userId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.logError(`Error sending enrichment update to user ${userId}:`, error);
      // Remove broken connection
      sseConnections.delete(userId);
      return false;
    }
  },

  // Broadcast notification to all connected users (for system announcements)
  async broadcastNotification(notification) {
    try {
      const eventData = {
        type: 'system_announcement',
        data: notification,
        timestamp: new Date().toISOString()
      };

      let sentCount = 0;
      const brokenConnections = [];

      for (const [userId, connection] of sseConnections.entries()) {
        try {
          connection.write(`data: ${JSON.stringify(eventData)}\n\n`);
          sentCount++;
        } catch (error) {
          logger.logError(`Error broadcasting to user ${userId}:`, error);
          brokenConnections.push(userId);
        }
      }

      // Clean up broken connections
      brokenConnections.forEach(userId => {
        sseConnections.delete(userId);
      });

      console.log(`Broadcast notification sent to ${sentCount} users`);
      return sentCount;
    } catch (error) {
      logger.logError('Error broadcasting notification:', error);
      return 0;
    }
  },

  // Get connection status
  async getConnectionStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const isConnected = sseConnections.has(userId);
      
      res.json({
        success: true,
        data: {
          connected: isConnected,
          total_connections: sseConnections.size,
          user_id: userId
        }
      });
    } catch (error) {
      logger.logError('Error getting connection status:', error);
      next(error);
    }
  },

  // Send test notification
  async sendTestNotification(req, res, next) {
    try {
      const userId = req.user.id;
      
      const testNotification = {
        id: 'test',
        symbol: 'TEST',
        message: 'This is a test notification from TradeTally Pro',
        trigger_price: 100.00,
        alert_type: 'test'
      };

      const sent = await notificationsController.sendNotificationToUser(userId, testNotification);
      
      res.json({
        success: true,
        data: {
          notification_sent: sent,
          connected: sseConnections.has(userId)
        }
      });
    } catch (error) {
      logger.logError('Error sending test notification:', error);
      next(error);
    }
  },

  // MARK: - Mobile Push Notifications

  // Register device token for push notifications
  async registerDeviceToken(req, res, next) {
    try {
      const userId = req.user.id;
      const { device_token, platform, environment } = req.body;
      
      if (!device_token || !platform) {
        return res.status(400).json({
          success: false,
          error: 'Device token and platform are required'
        });
      }
      
      // Validate platform
      if (!['ios', 'android'].includes(platform.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: 'Platform must be ios or android'
        });
      }
      
      // Validate environment for iOS
      if (platform.toLowerCase() === 'ios' && environment && !['development', 'production'].includes(environment.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: 'Environment must be development or production for iOS'
        });
      }
      
      const query = `
        INSERT INTO device_tokens (id, user_id, device_token, platform, environment, active)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, device_token) DO UPDATE SET
          platform = $4,
          environment = $5,
          active = $6,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, device_token, platform, environment, created_at
      `;
      
      const tokenId = uuidv4();
      const result = await db.query(query, [
        tokenId, userId, device_token, platform.toLowerCase(), 
        environment?.toLowerCase() || 'production', true
      ]);
      
      console.log(`Device token registered for user ${userId}: ${platform} (${environment || 'production'})`);
      
      res.json({
        success: true,
        message: 'Device token registered successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.logError('Error registering device token:', error);
      next(error);
    }
  },

  // Get user's notification preferences
  async getNotificationPreferences(req, res, next) {
    try {
      const userId = req.user.id;
      
      const query = `
        SELECT 
          price_alerts_enabled,
          earnings_enabled,
          news_enabled,
          email_notifications,
          push_notifications,
          created_at,
          updated_at
        FROM notification_preferences 
        WHERE user_id = $1
      `;
      
      const result = await db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        // Create default preferences if none exist
        const defaultQuery = `
          INSERT INTO notification_preferences (
            id, user_id, price_alerts_enabled, earnings_enabled, 
            news_enabled, email_notifications, push_notifications
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING price_alerts_enabled, earnings_enabled, news_enabled,
                   email_notifications, push_notifications, created_at, updated_at
        `;
        
        const defaultResult = await db.query(defaultQuery, [
          uuidv4(), userId, true, true, false, true, true
        ]);
        
        res.json({
          success: true,
          preferences: defaultResult.rows[0]
        });
      } else {
        res.json({
          success: true,
          preferences: result.rows[0]
        });
      }
    } catch (error) {
      logger.logError('Error fetching notification preferences:', error);
      next(error);
    }
  },

  // Update user's notification preferences
  async updateNotificationPreferences(req, res, next) {
    try {
      const userId = req.user.id;
      const { 
        price_alerts_enabled, 
        earnings_enabled, 
        news_enabled,
        email_notifications,
        push_notifications
      } = req.body;
      
      // Check if preferences exist
      const existsQuery = 'SELECT id FROM notification_preferences WHERE user_id = $1';
      const existsResult = await db.query(existsQuery, [userId]);
      
      let query, values;
      
      if (existsResult.rows.length === 0) {
        // Create new preferences
        query = `
          INSERT INTO notification_preferences (
            id, user_id, price_alerts_enabled, earnings_enabled, 
            news_enabled, email_notifications, push_notifications
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING price_alerts_enabled, earnings_enabled, news_enabled,
                   email_notifications, push_notifications, updated_at
        `;
        values = [
          uuidv4(), userId, 
          price_alerts_enabled ?? true,
          earnings_enabled ?? true,
          news_enabled ?? false,
          email_notifications ?? true,
          push_notifications ?? true
        ];
      } else {
        // Update existing preferences
        const updates = [];
        values = [];
        let paramIndex = 1;
        
        if (price_alerts_enabled !== undefined) {
          updates.push(`price_alerts_enabled = $${paramIndex++}`);
          values.push(price_alerts_enabled);
        }
        if (earnings_enabled !== undefined) {
          updates.push(`earnings_enabled = $${paramIndex++}`);
          values.push(earnings_enabled);
        }
        if (news_enabled !== undefined) {
          updates.push(`news_enabled = $${paramIndex++}`);
          values.push(news_enabled);
        }
        if (email_notifications !== undefined) {
          updates.push(`email_notifications = $${paramIndex++}`);
          values.push(email_notifications);
        }
        if (push_notifications !== undefined) {
          updates.push(`push_notifications = $${paramIndex++}`);
          values.push(push_notifications);
        }
        
        if (updates.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No valid fields to update'
          });
        }
        
        values.push(userId);
        
        query = `
          UPDATE notification_preferences 
          SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $${paramIndex}
          RETURNING price_alerts_enabled, earnings_enabled, news_enabled,
                   email_notifications, push_notifications, updated_at
        `;
      }
      
      const result = await db.query(query, values);
      
      res.json({
        success: true,
        message: 'Notification preferences updated successfully',
        preferences: result.rows[0]
      });
    } catch (error) {
      logger.logError('Error updating notification preferences:', error);
      next(error);
    }
  },

  // Test push notification
  async testPushNotification(req, res, next) {
    try {
      const userId = req.user.id;
      const { message } = req.body;
      
      const pushService = require('../services/pushNotificationService');
      
      const result = await pushService.testNotification(userId, message);
      
      if (result.success) {
        res.json({
          success: true,
          message: `Test notification sent to ${result.successCount} of ${result.devicesTargeted} devices`,
          details: result
        });
      } else {
        res.json({
          success: false,
          message: `Test notification failed: ${result.reason || result.error}`,
          details: result
        });
      }
    } catch (error) {
      logger.logError('Error sending test push notification:', error);
      next(error);
    }
  }
};

module.exports = notificationsController;