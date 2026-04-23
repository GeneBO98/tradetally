jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/priceFallbackManager', () => ({}));
jest.mock('../../src/utils/historicalPriceCache', () => ({}));
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn() }))
}));
jest.mock('../../src/services/tierService', () => ({}));
jest.mock('../../src/services/notificationPreferenceService', () => ({
  isNotificationEnabled: jest.fn()
}));
jest.mock('../../src/events/domainEvents', () => ({
  publish: jest.fn()
}));

const db = require('../../src/config/database');
const NotificationPreferenceService = require('../../src/services/notificationPreferenceService');
const { publish } = require('../../src/events/domainEvents');
const priceMonitoringService = require('../../src/services/priceMonitoringService');

describe('priceMonitoringService price alert webhook publication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NotificationPreferenceService.isNotificationEnabled.mockResolvedValue(true);
    db.query.mockResolvedValue({ rows: [] });
    priceMonitoringService.emailTransporter = null;
  });

  test('publishes price_alert.triggered from the live trigger path after state update', async () => {
    await priceMonitoringService.triggerAlert({
      id: 'alert-1',
      user_id: 'user-1',
      symbol: 'AAPL',
      alert_type: 'above',
      target_price: '200',
      change_percent: null,
      percent_change: '3.42',
      current_price: '205.15',
      email_enabled: false,
      browser_enabled: false,
      repeat_enabled: false,
      email: 'trader@example.com',
      user_email_enabled: false
    });

    expect(db.query).toHaveBeenCalledWith(
      'UPDATE price_alerts SET is_active = false, triggered_at = CURRENT_TIMESTAMP WHERE id = $1',
      ['alert-1']
    );
    expect(publish).toHaveBeenCalledWith(
      'price_alert.triggered',
      expect.objectContaining({
        alertId: 'alert-1',
        userId: 'user-1',
        symbol: 'AAPL',
        alertType: 'above',
        currentPrice: 205.15,
        targetPrice: 200,
        message: expect.stringContaining('above your target'),
        repeatEnabled: false
      }),
      { source: 'priceMonitoringService.triggerAlert' }
    );
  });
});
