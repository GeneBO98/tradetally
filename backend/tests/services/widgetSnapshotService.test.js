jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn(), set: jest.fn() }));
jest.mock('../../src/services/analyticsCache', () => ({ get: jest.fn(), set: jest.fn() }));
jest.mock('../../src/services/tradeQueries', () => ({ cacheKey: jest.fn(), getAnalytics: jest.fn() }));
jest.mock('../../src/models/Trade', () => ({ findOpenPositionsByUser: jest.fn() }));
jest.mock('../../src/services/newsService', () => ({ getCachedNews: jest.fn() }));
jest.mock('../../src/utils/timezone', () => ({
  getDateInTimezone: jest.fn(() => '2026-08-26'),
  getDayOfWeekInTimezone: jest.fn(() => 3)
}));

const db = require('../../src/config/database');
const cache = require('../../src/utils/cache');
const AnalyticsCache = require('../../src/services/analyticsCache');
const TradeQueries = require('../../src/services/tradeQueries');
const Trade = require('../../src/models/Trade');
const NewsService = require('../../src/services/newsService');
const service = require('../../src/services/widgetSnapshotService');

describe('widgetSnapshotService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TradeQueries.cacheKey.mockReturnValue('analytics:user_user-1:week');
    cache.get.mockReturnValue({ summary: { totalPnL: 425.5, winRate: 60, totalTrades: 5 } });
    AnalyticsCache.get.mockResolvedValue(null);
    Trade.findOpenPositionsByUser.mockResolvedValue([{
      id: 'trade-1',
      symbol: 'AAPL',
      side: 'long',
      quantity: 2,
      entry_price: 100,
      executions: [],
      instrument_type: 'stock'
    }]);
    db.query.mockImplementation(query => {
      if (query.includes('price_monitoring')) {
        return Promise.resolve({ rows: [{ symbol: 'AAPL', current_price: '110', price_change: '2' }] });
      }
      if (query.includes('analytics_cache')) {
        return Promise.resolve({ rows: [{ data: {
          summaries: [{ headline: 'Stay selective', body: 'Your best setups are working.', tone: 'positive' }]
        } }] });
      }
      throw new Error(`Unexpected query: ${query}`);
    });
    NewsService.getCachedNews.mockResolvedValue([
      { symbol: 'AAPL', news_items: [{ headline: 'Older', source: 'Wire', datetime: 1787600000 }] },
      { symbol: 'AAPL', news_items: [{ headline: 'Newest', source: 'Reuters', datetime: 1787700000 }] }
    ]);
  });

  test('composes the exact widget snapshot from cached analytics, quotes, insights, and globally newest news', async () => {
    const snapshot = await service.getSnapshot({ id: 'user-1', timezone: 'America/Chicago' });

    expect(snapshot).toEqual({
      weekPnL: 425.5,
      winRate: 60,
      weekTrades: 5,
      openUnrealizedPnL: 20,
      openPositionsCount: 1,
      todayPnL: 4,
      winningOpenPositions: 1,
      topNews: {
        headline: 'Newest',
        source: 'Reuters',
        symbol: 'AAPL',
        publishedAt: new Date(1787700000 * 1000).toISOString()
      },
      topInsight: {
        headline: 'Stay selective',
        body: 'Your best setups are working.',
        tone: 'positive'
      },
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    });
    expect(TradeQueries.getAnalytics).not.toHaveBeenCalled();
    expect(NewsService.getCachedNews).toHaveBeenCalledWith(['AAPL']);
  });

  test('warms and persists the canonical weekly analytics cache on a first-read miss', async () => {
    cache.get.mockReturnValue(null);
    AnalyticsCache.get.mockResolvedValue(null);
    TradeQueries.getAnalytics.mockResolvedValue({ summary: { totalPnL: 10, winRate: 50, totalTrades: 2 } });

    await service.getSnapshot({ id: 'user-1', timezone: 'UTC' });

    expect(TradeQueries.getAnalytics).toHaveBeenCalledWith('user-1', {
      startDate: '2026-08-24',
      endDate: '2026-08-26'
    });
    expect(AnalyticsCache.set).toHaveBeenCalledWith(
      'user-1',
      'analytics:user_user-1:week',
      expect.any(Object),
      1440
    );
  });

  test('never mistakes an underlying equity cache row for an option contract quote', async () => {
    Trade.findOpenPositionsByUser.mockResolvedValue([{
      id: 'option-1',
      symbol: 'AAPL',
      side: 'long',
      quantity: 1,
      entry_price: 2,
      executions: [],
      instrument_type: 'option',
      contract_size: 100
    }]);

    const snapshot = await service.getSnapshot({ id: 'user-1', timezone: 'UTC' });

    expect(snapshot.openPositionsCount).toBe(1);
    expect(snapshot.openUnrealizedPnL).toBe(0);
    expect(snapshot.todayPnL).toBe(0);
    expect(snapshot.winningOpenPositions).toBe(0);
    expect(db.query.mock.calls.some(([query]) => query.includes('price_monitoring'))).toBe(false);
  });
});
