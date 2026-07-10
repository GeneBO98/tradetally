jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  logError: jest.fn()
}));

jest.mock('../../src/utils/uuid', () => ({
  uuidv4: jest.fn(() => 'token-id')
}));

jest.mock('../../src/services/pushNotificationService', () => ({
  testNotification: jest.fn()
}));

const db = require('../../src/config/database');
const pushNotificationService = require('../../src/services/pushNotificationService');
const notificationsController = require('../../src/controllers/notifications.controller');

describe('notificationsController APNs registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APNS_BUNDLE_ID = 'com.tradetally.ios';
  });

  test('stores the canonical topic and client APNs environment', async () => {
    db.query.mockResolvedValue({
      rows: [{
        id: 'token-id',
        device_token: 'device-token',
        platform: 'ios',
        environment: 'development',
        bundle_id: 'com.tradetally.ios'
      }]
    });
    const req = {
      user: { id: 'user-1' },
      body: {
        device_token: 'device-token',
        platform: 'ios',
        environment: 'development',
        bundle_id: 'com.tradetally.ios'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await notificationsController.registerDeviceToken(req, res, jest.fn());

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('bundle_id = $6'),
      ['token-id', 'user-1', 'device-token', 'ios', 'development', 'com.tradetally.ios', true]
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('rejects a token claiming a different iOS bundle', async () => {
    const req = {
      user: { id: 'user-1' },
      body: {
        device_token: 'device-token',
        platform: 'ios',
        environment: 'production',
        bundle_id: 'com.example.other'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await notificationsController.registerDeviceToken(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns success when APNs accepts the test push', async () => {
    pushNotificationService.testNotification.mockResolvedValue({
      success: true,
      successCount: 1,
      devicesTargeted: 1
    });
    const req = {
      user: { id: 'user-1' },
      body: { message: 'Test push' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await notificationsController.testPushNotification(req, res, jest.fn());

    expect(pushNotificationService.testNotification).toHaveBeenCalledWith('user-1', 'Test push');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Test notification sent to 1 of 1 devices'
    }));
  });

  test('returns an HTTP failure when APNs rejects the test push', async () => {
    pushNotificationService.testNotification.mockResolvedValue({
      success: false,
      reason: 'all_devices_failed',
      error: 'BadDeviceToken',
      successCount: 0,
      failureCount: 1,
      devicesTargeted: 1
    });
    const req = {
      user: { id: 'user-1' },
      body: { message: 'Test push' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await notificationsController.testPushNotification(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Test notification failed: all_devices_failed'
    }));
  });

  test('returns not found when the current user has no active devices', async () => {
    pushNotificationService.testNotification.mockResolvedValue({
      success: false,
      reason: 'no_active_devices',
      devicesTargeted: 0
    });
    const req = {
      user: { id: 'user-1' },
      body: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await notificationsController.testPushNotification(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
