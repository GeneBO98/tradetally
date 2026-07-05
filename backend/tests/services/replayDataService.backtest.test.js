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

jest.mock('../../src/utils/databento', () => ({
  isConfigured: jest.fn(() => false),
  getContinuousSymbol: (root) => `${root.toUpperCase()}.c.0`,
  getFuturesCandles: jest.fn()
}));

const db = require('../../src/config/database');
const marketData = require('../../src/utils/finnhub');
const databento = require('../../src/utils/databento');
const {
  getBacktestSessionData,
  getTradeReplayData,
  sessionWindowForDate,
  futuresSessionWindowForDate,
  futuresSessionWindowForEntry
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

describe('futures session windows (Globex trading day)', () => {
  it('spans 18:00 ET the prior day to 17:00 ET on the date, DST-aware', () => {
    // Monday 2026-06-15 (EDT, UTC-4): Sun 18:00 ET = 22:00 UTC, Mon 17:00 ET = 21:00 UTC
    const summer = futuresSessionWindowForDate(2026, 6, 15);
    expect(summer.date).toBe('2026-06-15');
    expect(summer.fromTs).toBe(Date.UTC(2026, 5, 14, 22, 0, 0) / 1000);
    expect(summer.toTs).toBe(Date.UTC(2026, 5, 15, 21, 0, 0) / 1000);

    // Thursday 2026-01-15 (EST, UTC-5): Wed 18:00 ET = 23:00 UTC, Thu 17:00 ET = 22:00 UTC
    const winter = futuresSessionWindowForDate(2026, 1, 15);
    expect(winter.fromTs).toBe(Date.UTC(2026, 0, 14, 23, 0, 0) / 1000);
    expect(winter.toTs).toBe(Date.UTC(2026, 0, 15, 22, 0, 0) / 1000);
  });

  it('maps entries to the containing Globex trading date', () => {
    // Sunday 2026-06-14 19:00 ET (23:00 UTC) belongs to Monday's session
    const sundayEvening = futuresSessionWindowForEntry(Date.UTC(2026, 5, 14, 23, 0, 0) / 1000);
    expect(sundayEvening.date).toBe('2026-06-15');

    // Monday 2026-06-15 10:00 ET (14:00 UTC) belongs to Monday's session
    const mondayMorning = futuresSessionWindowForEntry(Date.UTC(2026, 5, 15, 14, 0, 0) / 1000);
    expect(mondayMorning.date).toBe('2026-06-15');
  });
});

describe('getBacktestSessionData futures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    databento.isConfigured.mockReturnValue(true);
  });

  it('rejects Saturdays and redirects Sundays to Monday', async () => {
    // 2026-06-13 is a Saturday, 2026-06-14 a Sunday
    await expect(getBacktestSessionData('MNQ', '2026-06-13', 'user-1', { instrument: 'future' }))
      .rejects.toMatchObject({ statusCode: 422 });
    await expect(getBacktestSessionData('MNQ', '2026-06-14', 'user-1', { instrument: 'future' }))
      .rejects.toThrow(/Monday's session/);
  });

  it('rejects futures when Databento is not configured', async () => {
    databento.isConfigured.mockReturnValue(false);
    await expect(getBacktestSessionData('MNQ', '2026-06-12', 'user-1', { instrument: 'future' }))
      .rejects.toThrow(/DATABENTO_API_KEY/);
  });

  it('serves cached continuous-contract bars without calling Databento', async () => {
    db.query.mockImplementation(async (sql, params) => {
      if (sql.includes('intraday_candle_coverage')) {
        expect(params[0]).toBe('MNQ.c.0');
        return { rows: [{ from_ts: 1, to_ts: 2, source: 'databento', candle_count: 1 }] };
      }
      if (sql.includes('FROM intraday_candles')) {
        return {
          rows: [{ ts: 1749750000, open: 21900, high: 21910, low: 21890, close: 21905, volume: 500 }]
        };
      }
      return { rows: [] };
    });

    // 2026-06-12 is a past Friday
    const payload = await getBacktestSessionData('MNQ', '2026-06-12', 'user-1', { instrument: 'future' });
    expect(databento.getFuturesCandles).not.toHaveBeenCalled();
    expect(payload.instrument_type).toBe('future');
    expect(payload.multiplier).toBe(2); // MNQ point value
    expect(payload.tick_size).toBe(0.25);
    expect(payload.futures_continuous).toBe(true);
    expect(payload.source).toBe('cache:databento');
    // Globex window: Thu 18:00 EDT -> Fri 17:00 EDT
    expect(payload.session.from_ts).toBe(Date.UTC(2026, 5, 11, 22, 0, 0) / 1000);
    expect(payload.session.to_ts).toBe(Date.UTC(2026, 5, 12, 21, 0, 0) / 1000);
  });

  it('fetches from Databento and filters bars to the window on cache miss', async () => {
    const windowFrom = Date.UTC(2026, 5, 11, 22, 0, 0) / 1000;
    const windowTo = Date.UTC(2026, 5, 12, 21, 0, 0) / 1000;
    db.query.mockResolvedValue({ rows: [] });
    databento.getFuturesCandles.mockResolvedValue([
      { time: windowFrom - 60, open: 1, high: 1, low: 1, close: 1, volume: 1 }, // outside
      { time: windowFrom + 60, open: 21900, high: 21910, low: 21890, close: 21905, volume: 500 }
    ]);

    const payload = await getBacktestSessionData('MNQ', '2026-06-12', 'user-1', { instrument: 'future' });
    expect(databento.getFuturesCandles).toHaveBeenCalledWith(
      'MNQ',
      expect.any(Date),
      expect.any(Date),
      'minute',
      { exactWindow: true }
    );
    expect(payload.candles).toHaveLength(1);
    expect(payload.source).toBe('databento');
  });
});

describe('getTradeReplayData futures', () => {
  const futuresTrade = {
    id: 'trade-1',
    symbol: 'MNQM6',
    instrument_type: 'future',
    underlying_asset: null, // forces root extraction from the contract symbol
    side: 'long',
    quantity: 2,
    entry_price: 21900,
    exit_price: 21910,
    point_value: null, // forces point-value fallback from the root
    tick_size: null,
    // Monday 2026-06-15 10:00 ET
    entry_time: '2026-06-15T14:00:00Z',
    exit_time: '2026-06-15T15:00:00Z',
    executions: []
  };

  beforeEach(() => {
    jest.clearAllMocks();
    databento.isConfigured.mockReturnValue(true);
  });

  it('rejects futures replay when Databento is not configured', async () => {
    databento.isConfigured.mockReturnValue(false);
    await expect(getTradeReplayData(futuresTrade, 'user-1'))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  it('replays a futures trade on continuous bars without split rescaling', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('intraday_candle_coverage')) {
        return { rows: [{ from_ts: 1, to_ts: 2, source: 'databento', candle_count: 2 }] };
      }
      if (sql.includes('FROM intraday_candles')) {
        return {
          rows: [
            // Closes sit ~2x above the fills; the stock split heuristic would
            // rescale these, futures must not.
            { ts: Date.UTC(2026, 5, 15, 14, 0, 0) / 1000, open: 43800, high: 43820, low: 43780, close: 43800, volume: 100 },
            { ts: Date.UTC(2026, 5, 15, 15, 0, 0) / 1000, open: 43820, high: 43840, low: 43800, close: 43820, volume: 100 }
          ]
        };
      }
      return { rows: [] };
    });

    const payload = await getTradeReplayData(futuresTrade, 'user-1');
    expect(payload.chart_symbol).toBe('MNQ.c.0');
    expect(payload.futures_continuous).toBe(true);
    expect(payload.price_scale).toBe(1);
    expect(payload.candles[0].close).toBe(43800); // unscaled
    expect(payload.trade.multiplier).toBe(2); // MNQ point value fallback
    expect(payload.trade.tick_size).toBe(0.25);
    expect(payload.session.date).toBe('2026-06-15');
    expect(payload.session.from_ts).toBe(Date.UTC(2026, 5, 14, 22, 0, 0) / 1000);
  });
});
