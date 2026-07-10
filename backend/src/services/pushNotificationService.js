const apn = require('@parse/node-apn');
const db = require('../config/database');
const logger = require('../utils/logger');
const NotificationPreferenceService = require('./notificationPreferenceService');

class PushNotificationService {
  constructor() {
    this.apnProviders = new Map();
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

      for (const environment of ['development', 'production']) {
        const apnsConfig = {
          token: {
            key: keyPath,
            keyId: keyId,
            teamId: teamId
          },
          production: environment === 'production'
        };

        this.apnProviders.set(environment, new apn.Provider(apnsConfig));
        console.log(`[SUCCESS] APNS initialized for ${environment}`);
      }
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
      const configuredBundleId = process.env.APNS_BUNDLE_ID || 'com.tradetally.ios';
      
      for (const device of devices.rows) {
        try {
          const environment = device.environment === 'development' ? 'development' : 'production';
          const provider = this.apnProviders.get(environment);
          if (!provider) {
            results.push({
              success: false,
              device: device.device_token,
              environment,
              error: 'provider_unavailable'
            });
            continue;
          }

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
            type: notificationData.type || notificationData.alert_type || notificationData.alertType || 'price_alert',
            symbol: notificationData.symbol,
            current_price: notificationData.current_price ?? notificationData.currentPrice,
            target_price: notificationData.target_price ?? notificationData.targetPrice,
            timestamp: new Date().toISOString()
          };
          
          // Set topic (bundle ID)
          notification.topic = device.bundle_id || configuredBundleId;
          
          // Send notification
          const result = await provider.send(notification, device.device_token);
          
          if (result.sent.length > 0) {
            logger.info(`Push notification sent successfully to device ${device.device_token.substring(0, 8)}...`);
            results.push({ success: true, device: device.device_token, environment });
          } else if (result.failed.length > 0) {
            const failure = result.failed[0];
            const failureReason = failure.response?.reason || failure.error?.message || failure.error || 'unknown_error';
            logger.logWarn(`Push notification failed for device ${device.device_token.substring(0, 8)}...: ${failureReason}`);
            
            // Handle invalid tokens by marking them inactive
            if (failure.status === '410' || ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(failureReason)) {
              await this.markDeviceTokenInactive(device.device_token);
            }
            
            results.push({
              success: false,
              device: device.device_token,
              environment,
              status: failure.status,
              error: failureReason
            });
          } else {
            results.push({
              success: false,
              device: device.device_token,
              environment,
              error: 'empty_apns_response'
            });
          }
        } catch (deviceError) {
          logger.logError(`Error sending push notification to device ${device.device_token.substring(0, 8)}...:`, deviceError);
          results.push({ success: false, device: device.device_token, error: deviceError.message });
        }
      }

      const successCount = results.filter(result => result.success).length;
      const failureCount = results.length - successCount;

      return {
        success: successCount > 0,
        reason: successCount > 0 ? undefined : 'all_devices_failed',
        devicesTargeted: devices.rows.length,
        results: results,
        successCount,
        failureCount
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
      logger.info(`Marked device token as inactive: ${deviceToken.substring(0, 8)}...`);
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

    // Prefer a caller-supplied message (handles change_percent alerts, which
    // have no target price). Fall back to a generated body for direct callers.
    const fallbackBody = `${alertData.symbol} ${alertData.condition} $${alertData.targetPrice}`;

    const notificationData = {
      title: 'Price Alert Triggered',
      body: alertData.body || fallbackBody,
      symbol: alertData.symbol,
      alert_type: 'price_alert',
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
      alert_type: 'trade_execution',
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
      alert_type: 'news_alert',
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
      alert_type: 'earnings_announcement',
      date: earningsData.date
    };

    return await this.sendPushNotification(userId, notificationData);
  }


  async testNotification(userId, testMessage = 'Test notification from TradeTally') {
    const notificationData = {
      title: 'Test Notification',
      body: testMessage,
      symbol: 'TEST',
      alert_type: 'test'
    };

    return await this.sendPushNotification(userId, notificationData);
  }

  // Gracefully shutdown the APNS provider
  shutdown() {
    for (const provider of this.apnProviders.values()) {
      provider.shutdown();
    }
    this.apnProviders.clear();
    console.log('APNS providers shut down');
  }
}

module.exports = new PushNotificationService();
