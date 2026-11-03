jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/BrokerConnection', () => ({
  markReauthRequired: jest.fn(),
  claimDueSchwabReauthReminders: jest.fn(),
  releaseSchwabReauthReminder: jest.fn()
}));
jest.mock('../../src/services/notificationService', () => ({
  sendBrokerReauthRequiredNotification: jest.fn(),
  sendBrokerReauthExpiringNotification: jest.fn()
}));
jest.mock('../../src/services/emailService', () => ({
  sendBrokerReconnectRequiredEmail: jest.fn()
}));

const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');
const NotificationService = require('../../src/services/notificationService');
const EmailService = require('../../src/services/emailService');
const BrokerReauthNotificationService = require('../../src/services/brokerSync/brokerReauthNotificationService');

describe('BrokerReauthNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('persists one in-app notification and email on the first expiration transition', async () => {
    BrokerConnection.markReauthRequired.mockResolvedValue({ id: 'connection-1' });
    db.query.mockResolvedValue({
      rows: [{
        email: 'trader@example.com',
        display_name: 'Trader',
        email_notifications: true
      }]
    });

    const notified = await BrokerReauthNotificationService.markRequired({
      id: 'connection-1',
      userId: 'user-1',
      brokerType: 'schwab'
    }, 'Charles Schwab');

    expect(notified).toBe(true);
    expect(NotificationService.sendBrokerReauthRequiredNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        broker: 'schwab',
        connection_id: 'connection-1',
        action_url: '/broker-sync'
      })
    );
    expect(EmailService.sendBrokerReconnectRequiredEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'trader@example.com',
        connectionId: 'connection-1'
      })
    );
  });

  test('passes a credential failure message and instructions through to the notification and email', async () => {
    BrokerConnection.markReauthRequired.mockResolvedValue({ id: 'connection-2' });
    db.query.mockResolvedValue({
      rows: [{ email: 'ibkr@example.com', display_name: 'Trader', email_notifications: true }]
    });

    const notified = await BrokerReauthNotificationService.markRequired({
      id: 'connection-2',
      userId: 'user-2',
      brokerType: 'ibkr'
    }, 'Interactive Brokers', {
      message: 'Flex Token has expired.',
      instructions: 'Generate a new token in IBKR.',
      reauthMode: 'credentials'
    });

    expect(notified).toBe(true);
    expect(BrokerConnection.markReauthRequired).toHaveBeenCalledWith('connection-2', 'Flex Token has expired.');
    expect(NotificationService.sendBrokerReauthRequiredNotification).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({
        broker: 'ibkr',
        broker_name: 'Interactive Brokers',
        message: 'Flex Token has expired.',
        instructions: 'Generate a new token in IBKR.',
        reauth_mode: 'credentials'
      })
    );
    expect(EmailService.sendBrokerReconnectRequiredEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        brokerName: 'Interactive Brokers',
        failureMessage: 'Flex Token has expired.',
        instructions: 'Generate a new token in IBKR.'
      })
    );
  });

  test('does not notify again while the connection is already expired', async () => {
    BrokerConnection.markReauthRequired.mockResolvedValue(null);

    const notified = await BrokerReauthNotificationService.markRequired({
      id: 'connection-1',
      userId: 'user-1',
      brokerType: 'schwab'
    }, 'Charles Schwab');

    expect(notified).toBe(false);
    expect(NotificationService.sendBrokerReauthRequiredNotification).not.toHaveBeenCalled();
    expect(EmailService.sendBrokerReconnectRequiredEmail).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('sends a proactive reminder for a claimed Schwab connection', async () => {
    const expiresAt = '2026-08-25T12:00:00.000Z';
    BrokerConnection.claimDueSchwabReauthReminders.mockResolvedValue([{
      id: 'connection-1',
      userId: 'user-1',
      brokerType: 'schwab',
      schwab_refresh_token_expires_at: expiresAt
    }]);
    db.query.mockResolvedValue({
      rows: [{
        email: 'trader@example.com',
        display_name: 'Trader',
        email_notifications: true
      }]
    });
    NotificationService.sendBrokerReauthExpiringNotification.mockResolvedValue({ id: 'notification-1' });

    const result = await BrokerReauthNotificationService.sendDueReminders();

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(NotificationService.sendBrokerReauthExpiringNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        connection_id: 'connection-1',
        expires_at: expiresAt,
        action_label: 'Reauthorize Charles Schwab'
      })
    );
    expect(EmailService.sendBrokerReconnectRequiredEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'connection-1',
        expiringSoon: true,
        expiresAt: new Date(expiresAt)
      })
    );
  });

  test('releases the reminder claim when the in-app notification cannot be persisted', async () => {
    BrokerConnection.claimDueSchwabReauthReminders.mockResolvedValue([{
      id: 'connection-1',
      userId: 'user-1',
      brokerType: 'schwab',
      schwab_refresh_token_expires_at: '2026-08-25T12:00:00.000Z'
    }]);
    NotificationService.sendBrokerReauthExpiringNotification.mockResolvedValue(null);

    const result = await BrokerReauthNotificationService.sendDueReminders();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(BrokerConnection.releaseSchwabReauthReminder).toHaveBeenCalledWith('connection-1');
    expect(EmailService.sendBrokerReconnectRequiredEmail).not.toHaveBeenCalled();
  });
});
