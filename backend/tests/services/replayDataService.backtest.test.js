jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/finnhub', () => ({
  isFmp: false,
  providerName: 'finnhub',
  getStockCandles: jest.fn()
}));

jest.mock('../../src/utils/alphaVantage', () => ({
  isConfigured: () => false,
  getTradeChartData: jest.fn()
}));

const db = require('../../src/config/database');
const marketData = require('../../src/utils/finnhub');
const {
  getBacktestSessionData,
  sessionWindowForDate
} = require('../../src/services/replayDataService');

describe('sessionWindowForDate', () => {
  it('builds the 04:00-20:00 ET window in UTC epoch seconds', () => {
    // 2026-01-15 is EST (UTC-5): 04:00 ET = 09:00 UTC
    const winter = sessionWindowForDate(2026, 1, 15);
    expect(winter.date).toBe('2026-01-15');
    expect(winter.fromTs).toBe(Date.UTC(2026, 0, 15, 9, 0, 0) / 1000);
    expect(winter.toTs).toBe(Date.UTC(2026, 0, 16, 1, 0, 0) / 1000);

    // 2026-06-15 is EDT (UTC-4): 04:00 ET = 08:00 UTC
    const summer = sessionWindowForDate(2026, 6, 15);
    expect(summer.fromTs).toBe(Date.UTC(2026, 5, 15, 8, 0, 0) / 1000);
  });
});

describe('getBacktestSessionData validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects malformed dates', async () => {
    await expect(getBacktestSessionData('AAPL', '06/15/2026', 'user-1'))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(getBacktestSessionData('AAPL', '2026-13-01', 'user-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects weekend sessions', async () => {
    // 2026-06-14 is a Sunday
    await expect(getBacktestSessionData('AAPL', '2026-06-14', 'user-1'))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  it('rejects sessions that have not closed yet', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    // Walk forward to the next weekday so the weekend check does not mask it
    while ([0, 6].includes(tomorrow.getUTCDay())) {
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    }
    const dateStr = tomorrow.toISOString().split('T')[0];
    await expect(getBacktestSessionData('AAPL', dateStr, 'user-1'))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  it('serves cached bars without hitting the provider', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('intraday_candle_coverage')) {
        return { rows: [{ from_ts: 1, to_ts: 2, source: 'fmp', candle_count: 1 }] };
      }
      if (sql.includes('FROM intraday_candles')) {
        return {
          rows: [{ ts: 1749800000, open: 10, high: 11, low: 9, close: 10.5, volume: 1000 }]
        };
      }
      return { rows: [] };
    });

    // 2026-06-12 is a past Friday
    const payload = await getBacktestSessionData('AAPL', '2026-06-12', 'user-1');
    expect(marketData.getStockCandles).not.toHaveBeenCalled();
    expect(payload.symbol).toBe('AAPL');
    expect(payload.resolution).toBe('1min');
    expect(payload.source).toBe('cache:fmp');
    expect(payload.candles).toHaveLength(1);
    expect(payload.session.date).toBe('2026-06-12');
    expect(payload.session.timezone).toBe('America/New_York');
  });

  it('returns 404 when the provider has no intraday data', async () => {
    db.query.mockResolvedValue({ rows: [] });
    marketData.getStockCandles.mockRejectedValue(new Error('no data'));

    await expect(getBacktestSessionData('ZZZZ', '2026-06-12', 'user-1'))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
