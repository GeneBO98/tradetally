const logger = require('../utils/logger');
const db = require('../config/database');

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
        'X-Accel-Buffering': 'no' // Disable proxy buffering
      });

      // Send initial connection event
      res.write(`data: ${JSON.stringify({
        type: 'connected',
        message: 'Connected to notifications stream',
        timestamp: new Date().toISOString()
      })}\n\n`);

      // Store connection
      sseConnections.set(userId, res);
      
      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (sseConnections.has(userId)) {
          try {
            res.write(`data: ${JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            })}\n\n`);
          } catch (error) {
            clearInterval(heartbeatInterval);
            sseConnections.delete(userId);
          }
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 30000);
      
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
      
      if (connection) {
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
  }
};

module.exports = notificationsController;