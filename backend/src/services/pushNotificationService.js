const apn = require('@parse/node-apn');
const db = require('../config/database');
const logger = require('../utils/logger');
const NotificationPreferenceService = require('./notificationPreferenceService');

class PushNotificationService {
  constructor() {
    this.apnProvider = null;
    this.isEnabled = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';
    
    if (this.isEnabled) {
      this.initializeAPNS();
    }
  }

  initializeAPNS() {
    try {
      // Check if APNS key file exists before attempting to load it
      const keyPath = process.env.APNS_KEY_PATH;
      const keyId = process.env.APNS_KEY_ID;
      const teamId = process.env.APNS_TEAM_ID;

      // Validate required config
      if (!keyPath || !keyId || !teamId) {
        logger.logWarn('APNS configuration incomplete - push notifications disabled');
        this.isEnabled = false;
        return;
      }

      // Check if the key file exists
      const fs = require('fs');
      if (!fs.existsSync(keyPath)) {
        logger.logWarn(`APNS key file not found at ${keyPath} - push notifications disabled`);
        this.isEnabled = false;
        return;
      }

      const apnsConfig = {
        token: {
          key: keyPath,
          keyId: keyId,
          teamId: teamId
        },
        production: process.env.NODE_ENV === 'production'
      };

      this.apnProvider = new apn.Provider(apnsConfig);
      console.log(`[SUCCESS] APNS initialized for ${apnsConfig.production ? 'production' : 'development'}`);
    } catch (error) {
      logger.logError('Failed to initialize APNS:', error);
      this.isEnabled = false;
    }
  }

  async sendPushNotification(userId, notificationData) {
    if (!this.isEnabled) {
      logger.logDebug('Push notifications are disabled');
      return { success: false, reason: 'disabled' };
    }

    try {
      // Get user's iOS device tokens and notification preferences
      const devicesQuery = `
        SELECT dt.device_token, dt.platform, dt.environment, dt.bundle_id
        FROM device_tokens dt
        LEFT JOIN notification_preferences np ON dt.user_id = np.user_id
        WHERE dt.user_id = $1 
        AND dt.platform = 'ios'
        AND dt.active = true 
        AND (np.push_notifications IS NULL OR np.push_notifications = true)
      `;
      
      const devices = await db.query(devicesQuery, [userId]);
      
      if (devices.rows.length === 0) {
        logger.logDebug(`No active iOS devices with push notifications enabled for user ${userId}`);
        return { success: false, reason: 'no_devices' };
      }

      const results = [];
      
      for (const device of devices.rows) {
        try {
          const notification = new apn.Notification();
          
          // Basic notification properties
          notification.alert = {
            title: notificationData.title,
            body: notificationData.body
          };
          
          notification.badge = 1;
          notification.sound = 'default';
          
          // Custom payload data
          notification.payload = {
            symbol: notificationData.symbol,
            alertType: notificationData.alertType || 'price_alert',
            currentPrice: notificationData.currentPrice,
            targetPrice: notificationData.targetPrice,
            timestamp: new Date().toISOString()
          };
          
          // Set topic (bundle ID)
          notification.topic = device.bundle_id || 'com.tradetally.app';
          
          // Send notification
          const result = await this.apnProvider.send(notification, device.device_token);
          
          if (result.sent.length > 0) {
            logger.logInfo(`Push notification sent successfully to device ${device.device_token.substring(0, 8)}...`);
            results.push({ success: true, device: device.device_token });
          } else if (result.failed.length > 0) {
            const failure = result.failed[0];
            logger.logWarn(`Push notification failed for device ${device.device_token.substring(0, 8)}...: ${failure.error}`);
            
            // Handle invalid tokens by marking them inactive
            if (failure.status === '410' || failure.error === 'BadDeviceToken') {
              await this.markDeviceTokenInactive(device.device_token);
            }
            
            results.push({ success: false, device: device.device_token, error: failure.error });
          }
        } catch (deviceError) {
          logger.logError(`Error sending push notification to device ${device.device_token.substring(0, 8)}...:`, deviceError);
          results.push({ success: false, device: device.device_token, error: deviceError.message });
        }
      }

      return {
        success: true,
        devicesTargeted: devices.rows.length,
        results: results,
        successCount: results.filter(r => r.success).length
      };

    } catch (error) {
      logger.logError('Error in sendPushNotification:', error);
      return { success: false, error: error.message };
    }
  }

  async markDeviceTokenInactive(deviceToken) {
    try {
      await db.query(
        'UPDATE device_tokens SET active = false WHERE device_token = $1',
        [deviceToken]
      );
      logger.logInfo(`Marked device token as inactive: ${deviceToken.substring(0, 8)}...`);
    } catch (error) {
      logger.logError('Error marking device token inactive:', error);
    }
  }

  async sendPriceAlert(userId, alertData) {
    // Check if user has price alerts enabled
    const isEnabled = await NotificationPreferenceService.isNotificationEnabled(userId, 'notify_price_alerts');
    if (!isEnabled) {
      logger.logDebug(`Push notification for price alert skipped for user ${userId} - preference disabled`);
      return { success: false, reason: 'preference_disabled' };
    }

    const notificationData = {
      title: 'Price Alert Triggered',
      body: `${alertData.symbol} ${alertData.condition} $${alertData.targetPrice}`,
      symbol: alertData.symbol,
      alertType: 'price_alert',
      currentPrice: alertData.currentPrice,
      targetPrice: alertData.targetPrice
    };

    return await this.sendPushNotification(userId, notificationData);
  }

  async sendTradeAlert(userId, tradeData) {
    // Check if user has trade reminders enabled
    const isEnabled = await NotificationPreferenceService.isNotificationEnabled(userId, 'notify_trade_reminders');
    if (!isEnabled) {
      logger.logDebug(`Push notification for trade alert skipped for user ${userId} - preference disabled`);
      return { success: false, reason: 'preference_disabled' };
    }

    const notificationData = {
      title: 'Trade Executed',
      body: `${tradeData.side.toUpperCase()} ${tradeData.quantity} ${tradeData.symbol} at $${tradeData.price}`,
      symbol: tradeData.symbol,
      alertType: 'trade_execution',
      currentPrice: tradeData.price,
      side: tradeData.side,
      quantity: tradeData.quantity
    };

    return await this.sendPushNotification(userId, notificationData);
  }

  async sendNewsAlert(userId, newsData) {
    // Check if user has news notifications enabled
    const isEnabled = await NotificationPreferenceService.isNotificationEnabled(userId, 'notify_news_open_positions');
    if (!isEnabled) {
      logger.logDebug(`Push notification for news alert skipped for user ${userId} - preference disabled`);
      return { success: false, reason: 'preference_disabled' };
    }

    const notificationData = {
      title: `News Alert: ${newsData.symbol}`,
      body: newsData.headline,
      symbol: newsData.symbol,
      alertType: 'news_alert',
      sentiment: newsData.sentiment
    };

    return await this.sendPushNotification(userId, notificationData);
  }

  async sendEarningsAlert(userId, earningsData) {
    // Check if user has earnings notifications enabled
    const isEnabled = await NotificationPreferenceService.isNotificationEnabled(userId, 'notify_earnings_announcements');
    if (!isEnabled) {
      logger.logDebug(`Push notification for earnings alert skipped for user ${userId} - preference disabled`);
      return { success: false, reason: 'preference_disabled' };
    }

    const notificationData = {
      title: `Earnings: ${earningsData.symbol}`,
      body: `${earningsData.company} earnings announcement upcoming`,
      symbol: earningsData.symbol,
      alertType: 'earnings_announcement',
      date: earningsData.date
    };

    return await this.sendPushNotification(userId, notificationData);
  }


  async testNotification(userId, testMessage = 'Test notification from TradeTally') {
    const notificationData = {
      title: 'Test Notification',
      body: testMessage,
      symbol: 'TEST',
      alertType: 'test'
    };

    return await this.sendPushNotification(userId, notificationData);
  }

  // Gracefully shutdown the APNS provider
  shutdown() {
    if (this.apnProvider) {
      this.apnProvider.shutdown();
      console.log('APNS provider shutdown');
    }
  }
}

module.exports = new PushNotificationService();