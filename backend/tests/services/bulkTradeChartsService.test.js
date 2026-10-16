jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(async callback => callback(require('../../src/config/database')))
}));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));

const db = require('../../src/config/database');
const AnalyticsCache = require('../../src/services/analyticsCache');
const charts = require('../../src/services/bulkTradeChartsService');
const ids = ['d37db745-a0f8-4634-83e2-a0b8e468e7de', 'f40a5a74-f7f7-4021-b326-d352ef48cb80'];
const url = 'https://www.tradingview.com/x/Abc123/';

describe('bulk chart links', () => {
  beforeEach(() => jest.clearAllMocks());

  test('appends charts only after checking all trades belong to the user', async () => {
    db.query.mockResolvedValueOnce({ rows: ids.map(id => ({ id })) })
      .mockResolvedValueOnce({ rows: [{ trade_id: ids[0] }] });
    const result = await charts.add('user-1', ids, ` ${url} `, ' Setup ');
    expect(result).toMatchObject({ updated_trade_count: 1, skipped_trade_count: 1 });
    expect(db.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(db.query.mock.calls[1][0]).toContain('NOT EXISTS');
    expect(db.query.mock.calls[1][1]).toEqual(['user-1', ids, url, 'Setup']);
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');
  });

  test('rejects the whole batch when any trade is unavailable', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: ids[0] }] });
    await expect(charts.add('user-1', ids, url)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(AnalyticsCache.invalidate).not.toHaveBeenCalled();
  });

  test.each(['javascript:alert(1)', 'https://tradingview.com.evil.test/x/abc/',
    'https://example.com/x/abc/', 'https://tradingview.com/', 'not a link', null])('rejects invalid chart link %s', async chart_url => {
    await expect(charts.add('user-1', ids, chart_url)).rejects.toMatchObject({ statusCode: 400 });
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  test('rejects malformed IDs and oversized batches', async () => {
    for (const invalid of [[], ['not-a-uuid'], Array(501).fill(ids[0])]) {
      await expect(charts.add('user-1', invalid, url)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(db.query).not.toHaveBeenCalled();
  });

  test('deduplicates selected IDs and reports a repeated link without invalidating caches', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: ids[0] }] }).mockResolvedValueOnce({ rows: [] });
    expect(await charts.add('user-1', [ids[0], ids[0]], url)).toMatchObject({
      updated_trade_count: 0, skipped_trade_count: 1
    });
    expect(AnalyticsCache.invalidate).not.toHaveBeenCalled();
  });
});
