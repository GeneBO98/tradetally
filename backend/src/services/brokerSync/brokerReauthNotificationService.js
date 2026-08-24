const db = require('../../config/database');
const BrokerConnection = require('../../models/BrokerConnection');
const NotificationService = require('../notificationService');
const EmailService = require('../emailService');

class BrokerReauthNotificationService {
  /**
   * Claim and notify connections in the final 24 hours of their Schwab OAuth
   * window. Reauthorization is still interactive, but doing it now prevents an
   * interruption instead of waiting for the next token refresh to fail.
   */
  static async sendDueReminders() {
    const connections = await BrokerConnection.claimDueSchwabReauthReminders();
    const results = await Promise.allSettled(connections.map(async connection => {
      try {
        return await this.sendExpiringSoon(connection, 'Charles Schwab');
      } catch (error) {
        // Release the atomic claim if the persisted in-app notification could
        // not be created so the next scheduler pass can retry it.
        await BrokerConnection.releaseSchwabReauthReminder(connection.id);
        throw error;
      }
    }));

    const failures = results.filter(result => result.status === 'rejected');
    failures.forEach(result => {
      console.error('[BROKER-SYNC] Failed to send pre-expiration reminder:', result.reason?.message || result.reason);
    });

    return {
      claimed: connections.length,
      sent: results.length - failures.length,
      failed: failures.length
    };
  }

  static async sendExpiringSoon(connection, brokerName = 'Broker') {
    if (!connection?.id || !connection?.userId || !connection?.schwab_refresh_token_expires_at) {
      return false;
    }

    const expiresAt = new Date(connection.schwab_refresh_token_expires_at);
    const message = `${brokerName} authorization expires within 24 hours. Reconnect now to prevent trade syncing from stopping.`;
    const notificationData = {
      broker: connection.brokerType || 'schwab',
      broker_name: brokerName,
      connection_id: connection.id,
      expires_at: expiresAt.toISOString(),
      message,
      action_url: '/broker-sync',
      action_label: `Reauthorize ${brokerName}`,
      timestamp: new Date().toISOString()
    };

    const saved = await NotificationService.sendBrokerReauthExpiringNotification(
      connection.userId,
      notificationData
    );
    if (!saved) {
      throw new Error('Could not persist Schwab reauthorization reminder');
    }

    await this.sendEmailIfEnabled(connection, brokerName, {
      expiringSoon: true,
      expiresAt
    });

    return true;
  }

  /**
   * Atomically expire a broker connection and notify the owner once.
   */
  static async markRequired(connection, brokerName = 'Broker') {
    if (!connection?.id || !connection?.userId) return false;

    const message = `${brokerName} authentication expired. Reconnect to resume automatic trade syncing.`;
    const transitioned = await BrokerConnection.markReauthRequired(connection.id, message);

    // Another request already handled this expiration event.
    if (!transitioned) return false;

    const notificationData = {
      broker: connection.brokerType || 'schwab',
      broker_name: brokerName,
      connection_id: connection.id,
      message,
      action_url: '/broker-sync',
      action_label: `Reconnect ${brokerName}`,
      timestamp: new Date().toISOString()
    };

    await NotificationService.sendBrokerReauthRequiredNotification(
      connection.userId,
      notificationData
    );

    await this.sendEmailIfEnabled(connection, brokerName);

    return true;
  }

  static async sendEmailIfEnabled(connection, brokerName, options = {}) {
    // Email is a best-effort secondary channel. In-app notification and the
    // persistent warning remain available when SMTP is not configured.
    try {
      const userResult = await db.query(
        `SELECT u.email,
                COALESCE(NULLIF(u.full_name, ''), NULLIF(u.username, ''), 'Trader') AS display_name,
                COALESCE(us.email_notifications, true) AS email_notifications
           FROM users u
           LEFT JOIN user_settings us ON us.user_id = u.id
          WHERE u.id = $1`,
        [connection.userId]
      );
      const user = userResult.rows[0];
      if (user?.email && user.email_notifications !== false) {
        await EmailService.sendBrokerReconnectRequiredEmail({
          email: user.email,
          displayName: user.display_name,
          brokerName,
          userId: connection.userId,
          connectionId: connection.id,
          expiringSoon: options.expiringSoon === true,
          expiresAt: options.expiresAt || null
        });
      }
    } catch (error) {
      console.error('[BROKER-SYNC] Failed to send reconnect email:', error.message);
    }

  }
}

module.exports = BrokerReauthNotificationService;
