jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));

jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({
  syncDefaultStopLossToExistingTrades: jest.fn(),
  applyDefaultTakeProfitToExistingTrades: jest.fn()
}));

jest.mock('../../src/services/adminSettings', () => ({}));
jest.mock('../../src/utils/urlSecurity', () => ({ validateAiProviderUrl: jest.fn() }));
jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  isEncrypted: jest.fn(() => false),
  encrypt: jest.fn(value => value)
}));
jest.mock('../../src/services/pnlEngine', () => ({ computeTradePnl: jest.fn() }));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/services/settingsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/services/optionStrategyGroupingService', () => ({}));

const User = require('../../src/models/User');
const Trade = require('../../src/models/Trade');
const AnalyticsCache = require('../../src/services/analyticsCache');
const settingsController = require('../../src/controllers/settings.controller');

describe('settings take-profit propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.getSettings.mockResolvedValue({ default_take_profit_type: 'percent' });
    User.updateSettings.mockResolvedValue({
      default_take_profit_type: 'risk_reward',
      default_take_profit_r_multiple: 2
    });
    Trade.applyDefaultTakeProfitToExistingTrades.mockResolvedValue(3);
    AnalyticsCache.invalidate.mockResolvedValue();
  });

  test('awaits take-profit backfill after saving a take-profit setting', async () => {
    const req = {
      user: { id: 'user-1' },
      body: {
        defaultTakeProfitType: 'risk_reward',
        defaultTakeProfitRMultiple: 2
      }
    };
    const res = { json: jest.fn() };
    const next = jest.fn();

    await settingsController.updateSettings(req, res, next);

    expect(User.updateSettings).toHaveBeenCalledWith('user-1', req.body);
    expect(Trade.applyDefaultTakeProfitToExistingTrades).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ default_take_profit_type: 'risk_reward' })
    );
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');
    expect(res.json).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        defaultTakeProfitType: 'risk_reward',
        defaultTakeProfitRMultiple: 2
      })
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('does not backfill trades for an unrelated partial settings update', async () => {
    const req = {
      user: { id: 'user-1' },
      body: { uiPreferences: { dashboardRMode: true } }
    };

    await settingsController.updateSettings(req, { json: jest.fn() }, jest.fn());

    expect(Trade.applyDefaultTakeProfitToExistingTrades).not.toHaveBeenCalled();
  });
});
