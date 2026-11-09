describe('finnhub client persistent caches', () => {
  let originalApiKey;
  let axios;
  let store;
  let memory;

  beforeEach(() => {
    jest.resetModules();
    originalApiKey = process.env.FINNHUB_API_KEY;
    process.env.FINNHUB_API_KEY = 'test-key';

    memory = new Map();
    jest.doMock('../../src/utils/cache', () => ({
      get: jest.fn(async (namespace, key) => memory.get(`${namespace}:${key}`) ?? null),
      set: jest.fn(async (namespace, key, value) => { memory.set(`${namespace}:${key}`, value); return true; }),
      getStats: jest.fn(async () => ({}))
    }));
    jest.doMock('../../src/utils/finnhubCandleStore', () => ({
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
      getResponse: jest.fn(async () => null),
      setResponse: jest.fn(async () => undefined)
    }));
    jest.doMock('../../src/services/finnhubUsageMetricsService', () => ({
      recordMinuteMetric: jest.fn(async () => undefined)
    }));
    jest.doMock('axios', () => ({ get: jest.fn() }));
    jest.doMock('../../src/services/apiUsageService', () => ({
      checkLimit: jest.fn(async () => ({ allowed: true, remaining: 10 })),
      trackApiCall: jest.fn(async () => true)
    }));
    jest.doMock('../../src/services/tierService', () => ({ getUserTier: jest.fn(async () => 'pro') }));
    jest.doMock('../../src/utils/aiService', () => ({}));
    jest.doMock('../../src/utils/historicalPriceCache', () => ({}));

    axios = require('axios');
    store = require('../../src/utils/finnhubCandleStore');
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.FINNHUB_API_KEY;
    else process.env.FINNHUB_API_KEY = originalApiKey;
    jest.dontMock('../../src/utils/cache');
    jest.dontMock('../../src/utils/finnhubCandleStore');
    jest.dontMock('../../src/services/finnhubUsageMetricsService');
    jest.dontMock('axios');
    jest.dontMock('../../src/services/apiUsageService');
    jest.dontMock('../../src/services/tierService');
    jest.dontMock('../../src/utils/aiService');
    jest.dontMock('../../src/utils/historicalPriceCache');
  });

  function loadClient() {
    return require('../../src/utils/finnhubClient');
  }

  test('serves a company profile from the persistent cache without calling Finnhub', async () => {
    store.getResponse.mockResolvedValueOnce({ name: 'Apple Inc', ticker: 'AAPL' });
    const client = loadClient();

    const profile = await client.getCompanyProfile('aapl');

    expect(profile).toEqual({ name: 'Apple Inc', ticker: 'AAPL' });
    expect(store.getResponse).toHaveBeenCalledWith('company_profile', 'AAPL');
    expect(axios.get).not.toHaveBeenCalled();
    // Rehydrated into memory so the next read skips the database
    expect(memory.get('company_profile:AAPL')).toEqual({ name: 'Apple Inc', ticker: 'AAPL' });
  });

  test('persists a fetched company profile for seven days, including empty unknown-symbol payloads', async () => {
    axios.get.mockResolvedValueOnce({ data: {} });
    const client = loadClient();

    await expect(client.getCompanyProfile('ZZZZ')).resolves.toEqual({});
    expect(store.setResponse).toHaveBeenCalledWith('company_profile', 'ZZZZ', {}, 7 * 24 * 60 * 60 * 1000);

    // Second read is a memory hit even though the payload is empty
    await client.getCompanyProfile('ZZZZ');
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test('persists dividends, financials and metrics with their TTLs', async () => {
    axios.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { metric: { peTTM: 30 } } })
      .mockResolvedValueOnce({ data: { financials: [{ year: 2025 }] } });
    const client = loadClient();

    await client.getDividends('AAPL', '2024-01-01', '2026-01-01');
    await client.getBasicFinancials('AAPL');
    await client.getFinancialStatements('AAPL', 'annual');

    const ttls = Object.fromEntries(store.setResponse.mock.calls.map(([namespace, , , ttl]) => [namespace, ttl]));
    expect(ttls).toEqual({
      dividends: 24 * 60 * 60 * 1000,
      basic_financials: 24 * 60 * 60 * 1000,
      financial_statements: 7 * 24 * 60 * 60 * 1000
    });
  });

  test('serves closed candle windows from the candle store and stores fresh fetches', async () => {
    const payload = { s: 'ok', c: [101], o: [100], h: [102], l: [99], v: [1000], t: [1710000000] };
    store.get.mockResolvedValueOnce(payload);
    const client = loadClient();

    const candles = await client.getStockCandles('AAPL', 'D', 1700000000, 1710000000, 'user-1');

    expect(candles).toEqual([{ time: 1710000000, open: 100, high: 102, low: 99, close: 101, volume: 1000 }]);
    expect(axios.get).not.toHaveBeenCalled();

    axios.get.mockResolvedValueOnce({ data: payload });
    await client.getStockCandles('MSFT', 'D', 1700000000, 1710000000, 'user-1');
    expect(store.set).toHaveBeenCalledWith('MSFT', 'D', 1700000000, 1710000000, payload);
  });

  test('wires the usage metrics recorder into the request scheduler', async () => {
    const metrics = require('../../src/services/finnhubUsageMetricsService');
    axios.get.mockResolvedValueOnce({ data: { name: 'Apple' } });
    const client = loadClient();

    await client.getCompanyProfile('AAPL');
    await new Promise(resolve => setImmediate(resolve));

    expect(metrics.recordMinuteMetric).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: '/stock/profile2',
      requestCount: 1,
      successCount: 1
    }));
  });
});
