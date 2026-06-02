describe('finnhub request context', () => {
  let originalApiKey;

  beforeEach(() => {
    jest.resetModules();
    originalApiKey = process.env.FINNHUB_API_KEY;
    process.env.FINNHUB_API_KEY = 'test-key';

    jest.doMock('axios', () => ({
      get: jest.fn(async (url) => {
        if (url.includes('/quote')) {
          return { data: { c: 101, pc: 100, d: 1, dp: 1, h: 102, l: 99, o: 100 } };
        }
        if (url.includes('/stock/candle')) {
          return {
            data: {
              s: 'ok',
              c: [101],
              o: [100],
              h: [102],
              l: [99],
              v: [1000],
              t: [1710000000]
            }
          };
        }
        if (url.includes('/stock/split')) {
          return { data: [] };
        }
        return { data: {} };
      })
    }));
    jest.doMock('../../src/utils/cache', () => ({
      get: jest.fn(async () => null),
      set: jest.fn(async () => true),
      getStats: jest.fn(async () => ({}))
    }));
    jest.doMock('../../src/utils/historicalPriceCache', () => ({
      upsertToday: jest.fn(async () => true)
    }));
    jest.doMock('../../src/services/apiUsageService', () => ({
      checkLimit: jest.fn(async () => ({ allowed: true, remaining: 10 })),
      trackApiCall: jest.fn(async () => true)
    }));
    jest.doMock('../../src/services/tierService', () => ({
      getUserTier: jest.fn(async () => 'pro')
    }));
    jest.doMock('../../src/utils/aiService', () => ({}));
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.FINNHUB_API_KEY;
    } else {
      process.env.FINNHUB_API_KEY = originalApiKey;
    }
    jest.dontMock('axios');
    jest.dontMock('../../src/utils/cache');
    jest.dontMock('../../src/utils/historicalPriceCache');
    jest.dontMock('../../src/services/apiUsageService');
    jest.dontMock('../../src/services/tierService');
    jest.dontMock('../../src/utils/aiService');
  });

  function loadFinnhubWithContextCapture() {
    const finnhub = require('../../src/utils/finnhub');
    const contexts = [];
    finnhub.scheduler.schedule = jest.fn(async (requestFn, context) => {
      contexts.push(context);
      return requestFn();
    });
    return { finnhub, contexts };
  }

  test('getQuote passes active quote context', async () => {
    const { finnhub, contexts } = loadFinnhubWithContextCapture();

    await finnhub.getQuote('AAPL', 'user-1');

    expect(contexts[0]).toMatchObject({
      endpoint: '/quote',
      source: 'quote',
      priority: 0,
      userId: 'user-1'
    });
  });

  test('getStockCandles passes active chart priority for authenticated requests', async () => {
    const { finnhub, contexts } = loadFinnhubWithContextCapture();

    await finnhub.getStockCandles('AAPL', 'D', 1710000000, 1710086400, 'user-1');

    expect(contexts[0]).toMatchObject({
      endpoint: '/stock/candle',
      source: 'stock_candles',
      priority: 1,
      userId: 'user-1'
    });
  });

  test('getStockSplits passes lowest-priority background context', async () => {
    const { finnhub, contexts } = loadFinnhubWithContextCapture();

    await finnhub.getStockSplits('AAPL', '2025-01-01', '2025-12-31');

    expect(contexts[0]).toMatchObject({
      endpoint: '/stock/split',
      source: 'stock_split_service',
      priority: 9,
      background: true,
      maxQueueWaitMs: 0
    });
  });

  test('getBatchQuotes preserves scheduler failures without changing quote keys', async () => {
    const finnhub = require('../../src/utils/finnhub');
    finnhub.scheduler.schedule = jest.fn(async () => {
      const error = new Error('queued too long');
      error.code = 'FINNHUB_SCHEDULER_TIMEOUT';
      throw error;
    });

    const quotes = await finnhub.getBatchQuotes(['AAPL'], {
      source: 'open_positions',
      priority: 0,
      maxQueueWaitMs: 10
    });

    expect(Object.keys(quotes)).toEqual([]);
    expect(quotes._failures.AAPL).toMatchObject({
      code: 'FINNHUB_SCHEDULER_TIMEOUT',
      symbol: 'AAPL'
    });
  });
});
