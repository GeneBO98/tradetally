// Pro-only fields on shared analytics endpoints: free users keep the overview
// and chart data (they power the free dashboard) but lose SQN / Kelly % /
// K-Ratio and the day-of-week series. Full AI recommendations require Pro.

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn().mockResolvedValue({})
}));
jest.mock('../../src/services/tierService', () => ({
  isProUser: jest.fn(),
  getUserTier: jest.fn(),
  isBillingEnabled: jest.fn()
}));
jest.mock('../../src/utils/aiService', () => ({
  getUserSettings: jest.fn(),
  isProviderConfigured: jest.fn()
}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const aiService = require('../../src/utils/aiService');
const analyticsController = require('../../src/controllers/analytics.controller');

function makeRes() {
  return {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    send: jest.fn()
  };
}

const overviewRow = {
  total_trades: 10,
  winning_trades: 6,
  losing_trades: 4,
  breakeven_trades: 0,
  total_pnl: 500,
  avg_pnl: 50,
  avg_win: 150,
  avg_loss: -75,
  pnl_stddev: 40,
  total_gross_wins: 900,
  total_gross_losses: 300,
  total_commissions: 0,
  total_fees: 0,
  total_volume: 1000
};

let userCounter = 0;
function freshReq(query = {}) {
  userCounter += 1;
  return { user: { id: `pro-gate-user-${userCounter}` }, query };
}

describe('analytics Pro field gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockImplementation(async (sql) => {
      if (/equity_snapshots/.test(sql)) return { rows: [] };
      return { rows: [overviewRow] };
    });
  });

  test('overview nulls SQN, Kelly %, and K-Ratio for free users', async () => {
    TierService.isProUser.mockResolvedValue(false);
    const res = makeRes();
    const next = jest.fn();

    await analyticsController.getOverview(freshReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    const { overview } = res.json.mock.calls[0][0];
    expect(overview.sqn).toBeNull();
    expect(overview.kelly_percentage).toBeNull();
    expect(overview.k_ratio).toBeNull();
    expect(overview.avg_mae).toBeNull();
    expect(overview.avg_mfe).toBeNull();
    // Free dashboard metrics are still present.
    expect(overview.profit_factor).toBeDefined();
    expect(overview.total_trades).toBe(10);
  });

  test('overview keeps advanced metrics for Pro users', async () => {
    TierService.isProUser.mockResolvedValue(true);
    const res = makeRes();

    await analyticsController.getOverview(freshReq(), res, jest.fn());

    const { overview } = res.json.mock.calls[0][0];
    expect(overview.sqn).not.toBeNull();
    expect(overview.kelly_percentage).not.toBeNull();
    expect(overview.k_ratio).not.toBeNull();
  });

  test('chart data returns an empty dayOfWeek series for free users', async () => {
    TierService.isProUser.mockResolvedValue(false);
    const res = makeRes();
    const next = jest.fn();

    await analyticsController.getChartData(freshReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.dayOfWeek).toEqual([]);
    expect(payload).toHaveProperty('dailyVolume');
  });

  test('chart data includes dayOfWeek for Pro users', async () => {
    TierService.isProUser.mockResolvedValue(true);
    const res = makeRes();

    await analyticsController.getChartData(freshReq(), res, jest.fn());

    expect(res.json.mock.calls[0][0].dayOfWeek.length).toBeGreaterThan(0);
  });

  test('full AI recommendations return the Pro 403 for free users without calling the AI provider', async () => {
    TierService.isProUser.mockResolvedValue(false);
    const res = makeRes();

    await analyticsController.getRecommendations(freshReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Pro tier required',
      message: expect.any(String),
      currentTier: 'free',
      requiredTier: 'pro'
    });
    expect(aiService.getUserSettings).not.toHaveBeenCalled();
  });

  test('dashboard insight summary returns the Pro 403 for free users', async () => {
    TierService.isProUser.mockResolvedValue(false);
    const res = makeRes();
    const summarySpy = jest.spyOn(analyticsController, 'getRecommendationSummary');

    await analyticsController.getRecommendations(freshReq({ summary: 'true' }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(summarySpy).not.toHaveBeenCalled();
    summarySpy.mockRestore();
  });

  test('full AI recommendations proceed for Pro users', async () => {
    TierService.isProUser.mockResolvedValue(true);
    aiService.getUserSettings.mockResolvedValue({});
    aiService.isProviderConfigured.mockReturnValue(false);
    const res = makeRes();

    await analyticsController.getRecommendations(freshReq(), res, jest.fn());

    expect(aiService.getUserSettings).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});
