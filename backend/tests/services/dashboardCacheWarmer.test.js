jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/cache', () => ({
  get: jest.fn(),
  set: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  get: jest.fn(),
  set: jest.fn()
}));

jest.mock('../../src/services/tradeQueries', () => ({
  cacheKey: jest.fn(),
  getAnalytics: jest.fn()
}));

jest.mock('../../src/controllers/analytics.controller', () => ({
  getRecommendationSummary: jest.fn()
}));

const db = require('../../src/config/database');
const cache = require('../../src/utils/cache');
const AnalyticsCache = require('../../src/services/analyticsCache');
const TradeQueries = require('../../src/services/tradeQueries');
const analyticsController = require('../../src/controllers/analytics.controller');
const dashboardCacheWarmer = require('../../src/services/dashboardCacheWarmer');

describe('dashboardCacheWarmer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('computes the current Monday-through-today range in the user timezone', () => {
    const range = dashboardCacheWarmer.currentTradingWeekRange(
      new Date('2026-08-19T15:00:00.000Z'),
      'America/Chicago'
    );

    expect(range).toEqual({ startDate: '2026-08-17', endDate: '2026-08-19' });
  });

  test('warms dashboard analytics and recommendation summaries for active users', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'user-1', timezone: 'UTC' }] });
    cache.get.mockReturnValue(null);
    AnalyticsCache.get.mockResolvedValue(null);
    AnalyticsCache.set.mockResolvedValue(undefined);
    TradeQueries.cacheKey.mockReturnValue('analytics:user_user-1:range');
    TradeQueries.getAnalytics.mockResolvedValue({ summary: { totalTrades: 3 } });
    analyticsController.getRecommendationSummary.mockImplementation((_req, res) => (
      res.json({ summaries: [], tradesAnalyzed: 3 })
    ));

    const summary = await dashboardCacheWarmer.execute();

    expect(TradeQueries.getAnalytics).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ startDate: expect.any(String), endDate: expect.any(String) })
    );
    expect(AnalyticsCache.set).toHaveBeenCalledWith(
      'user-1',
      'analytics:user_user-1:range',
      expect.any(Object),
      1440
    );
    expect(analyticsController.getRecommendationSummary).toHaveBeenCalled();
    expect(summary).toEqual({ users: 1, warmed: 1, errors: 0 });
  });
});
