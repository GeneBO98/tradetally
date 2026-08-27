jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/finnhub', () => ({
  getCompanyNews: jest.fn(),
  isCryptoSymbol: jest.fn().mockReturnValue(false),
  isConfigured: jest.fn().mockReturnValue(true)
}));

const db = require('../../src/config/database');
const finnhub = require('../../src/utils/finnhub');
const NewsService = require('../../src/services/newsService');

describe('NewsService widget refresh tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await NewsService.waitForBackgroundRefreshes();
  });

  test('detects a changed top story', () => {
    expect(NewsService.newsChanged(
      [{ id: 1, datetime: 100, headline: 'Old' }],
      [{ id: 2, datetime: 200, headline: 'New' }]
    )).toBe(true);
    expect(NewsService.newsChanged(
      [{ id: 1, datetime: 100, headline: 'Same' }],
      [{ id: 1, datetime: 100, headline: 'Same' }]
    )).toBe(false);
  });

  test('returns changed symbols after refreshing stale cache entries', async () => {
    const now = Math.floor(Date.now() / 1000);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ news_items: [{ id: 1, datetime: now - 100, headline: 'Old' }] }]
      })
      .mockResolvedValueOnce({ rows: [] });
    finnhub.getCompanyNews.mockResolvedValue([
      { id: 2, datetime: now, headline: 'New', source: 'Reuters' }
    ]);

    const summary = await NewsService.fetchAndCacheAll(['AAPL']);

    expect(summary).toEqual(expect.objectContaining({
      fetched: 1,
      errors: 0,
      changedSymbols: ['AAPL']
    }));
  });

  test('coalesces users tracking changed symbols across positions and watchlists', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }, { user_id: 'user-2' }] });

    const users = await NewsService.getUserIdsTrackingSymbols(['aapl', 'AAPL', ' msft ']);

    expect(users).toEqual(['user-1', 'user-2']);
    expect(db.query.mock.calls[0][1]).toEqual([['AAPL', 'MSFT']]);
  });

  test('deduplicates non-blocking stale refresh requests', async () => {
    const now = Math.floor(Date.now() / 1000);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    finnhub.getCompanyNews.mockResolvedValue([
      { id: 3, datetime: now, headline: 'Fresh', source: 'Reuters' }
    ]);

    const first = NewsService.requestBackgroundRefresh(['voo'], { reason: 'widget_snapshot_stale' });
    const second = NewsService.requestBackgroundRefresh(['VOO'], { reason: 'widget_snapshot_stale' });

    expect(first).toEqual({ enqueued: 1, deduplicated: 0 });
    expect(second).toEqual({ enqueued: 0, deduplicated: 1 });
    expect(finnhub.getCompanyNews).not.toHaveBeenCalled();

    await NewsService.waitForBackgroundRefreshes();

    expect(finnhub.getCompanyNews).toHaveBeenCalledTimes(1);
    expect(finnhub.getCompanyNews).toHaveBeenCalledWith('VOO');
  });

  test('treats VOO as a supported company-news symbol without inventing a market fallback', () => {
    expect(NewsService.isUnsupportedNewsSymbol('VOO')).toBe(false);
  });

  test('reports failed symbols for persisted scheduler diagnostics', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    finnhub.getCompanyNews.mockRejectedValue(new Error('provider unavailable'));

    const summary = await NewsService.fetchAndCacheAll(['VOO']);

    expect(summary).toEqual(expect.objectContaining({
      errors: 1,
      failedSymbols: ['VOO']
    }));
  });
});
