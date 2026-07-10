const mockProviders = [];

jest.mock('@parse/node-apn', () => ({
  Provider: jest.fn(config => {
    const provider = {
      send: jest.fn(),
      shutdown: jest.fn()
    };
    mockProviders.push({ config, provider });
    return provider;
  }),
  Notification: class Notification {}
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  logDebug: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn()
}));

jest.mock('../../src/services/notificationPreferenceService', () => ({
  isNotificationEnabled: jest.fn().mockResolvedValue(true)
}));

process.env.ENABLE_PUSH_NOTIFICATIONS = 'true';
process.env.APNS_KEY_PATH = '/tmp/test-apns-key.p8';
process.env.APNS_KEY_ID = 'KEY1234567';
process.env.APNS_TEAM_ID = 'TEAM123456';
process.env.APNS_BUNDLE_ID = 'com.tradetally.ios';

const fs = require('fs');
const realExistsSync = fs.existsSync.bind(fs);
jest.spyOn(fs, 'existsSync').mockImplementation(filePath => (
  filePath === '/tmp/test-apns-key.p8' || realExistsSync(filePath)
));

const db = require('../../src/config/database');
const pushNotificationService = require('../../src/services/pushNotificationService');

describe('pushNotificationService', () => {
  const developmentProvider = () => mockProviders.find(entry => entry.config.production === false).provider;
  const productionProvider = () => mockProviders.find(entry => entry.config.production === true).provider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    pushNotificationService.shutdown();
    fs.existsSync.mockRestore();
  });

  test('routes tokens to the matching APNs environment and uses the configured topic', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          device_token: 'development-token',
          platform: 'ios',
          environment: 'development',
          bundle_id: 'com.tradetally.ios'
        },
        {
          device_token: 'production-token',
          platform: 'ios',
          environment: 'production',
          bundle_id: 'com.tradetally.ios'
        }
      ]
    });
    developmentProvider().send.mockResolvedValue({ sent: [{ device: 'development-token' }], failed: [] });
    productionProvider().send.mockResolvedValue({ sent: [{ device: 'production-token' }], failed: [] });

    const result = await pushNotificationService.sendPushNotification('user-1', {
      title: 'Price Alert Triggered',
      body: 'AAPL crossed its target',
      symbol: 'AAPL',
      alert_type: 'price_alert',
      current_price: 205,
      target_price: 200
    });

    expect(developmentProvider().send).toHaveBeenCalledWith(expect.any(Object), 'development-token');
    expect(productionProvider().send).toHaveBeenCalledWith(expect.any(Object), 'production-token');

    const developmentNotification = developmentProvider().send.mock.calls[0][0];
    expect(developmentNotification.topic).toBe('com.tradetally.ios');
    expect(developmentNotification.payload).toEqual(expect.objectContaining({
      type: 'price_alert',
      symbol: 'AAPL',
      current_price: 205,
      target_price: 200
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      devicesTargeted: 2,
      successCount: 2,
      failureCount: 0
    }));
  });

  test('reports an all-device failure and deactivates a rejected token', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          device_token: 'rejected-token',
          platform: 'ios',
          environment: 'development',
          bundle_id: 'com.tradetally.ios'
        }]
      })
      .mockResolvedValueOnce({ rows: [] });
    developmentProvider().send.mockResolvedValue({
      sent: [],
      failed: [{
        device: 'rejected-token',
        status: '400',
        response: { reason: 'BadDeviceToken' }
      }]
    });

    const result = await pushNotificationService.sendPushNotification('user-1', {
      title: 'Test Notification',
      body: 'Test',
      alert_type: 'test'
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'all_devices_failed',
      successCount: 0,
      failureCount: 1
    }));
    expect(result.results[0].error).toBe('BadDeviceToken');
    expect(db.query).toHaveBeenLastCalledWith(
      'UPDATE device_tokens SET active = false WHERE device_token = $1',
      ['rejected-token']
    );
  });
});
