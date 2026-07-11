describe('FMP market data client', () => {
  let originalEnv;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    process.env.FMP_API_KEY = 'test-fmp-key';

    jest.doMock('axios', () => ({
      get: jest.fn(async (url) => {
        if (url.includes('/quote')) {
          return {
            data: [{
              symbol: 'AAPL',
              price: 200,
              previousClose: 198,
              change: 2,
              changesPercentage: 1.01,
              dayHigh: 201,
              dayLow: 197,
              open: 199,
              timestamp: 1710000000
            }]
          };
        }
        if (url.includes('/historical-chart/')) {
          return {
            data: [
              { date: '2025-01-02 09:31:00', open: 200, high: 201, low: 199, close: 200.5, volume: 1000 },
              { date: '2025-01-02 09:30:00', open: 199, high: 200, low: 198, close: 199.5, volume: 900 }
            ]
          };
        }
        if (url.includes('/search-symbol')) {
          return { data: [{ symbol: 'AAPL', name: 'Apple Inc.', exchangeShortName: 'NASDAQ' }] };
        }
        if (url.includes('/search-cusip')) {
          return { data: [{ cusip: '037833100', symbol: 'AAPL', name: 'Apple Inc.' }] };
        }
        if (url.includes('/profile')) {
          return {
            data: [{
              symbol: 'AAPL',
              companyName: 'Apple Inc.',
              sharesOutstanding: 15_500_000_000,
              mktCap: 3_100_000_000_000
            }]
          };
        }
        if (url.includes('/key-metrics')) {
          return { data: [{ weightedAverageShsOut: 15_500_000_000 }] };
        }
        if (url.includes('/income-statement')) {
          return {
            data: [{
              date: '2025-09-27',
              calendarYear: '2025',
              revenue: 400_000_000_000,
              netIncome: 100_000_000_000,
              weightedAverageShsOut: 15_500_000_000
            }]
          };
        }
        if (url.includes('/balance-sheet-statement')) {
          return {
            data: [{
              date: '2025-09-27',
              calendarYear: '2025',
              totalAssets: 350_000_000_000
            }]
          };
        }
        if (url.includes('/cash-flow-statement')) {
          return {
            data: [{
              date: '2025-09-27',
              calendarYear: '2025',
              operatingCashFlow: 120_000_000_000,
              capitalExpenditure: -10_000_000_000,
              freeCashFlow: 110_000_000_000
            }]
          };
        }
        return { data: [] };
      })
    }));
    jest.doMock('../../src/utils/cache', () => ({
      get: jest.fn(() => null),
      set: jest.fn(),
      getStats: jest.fn(async () => ({}))
    }));
    jest.doMock('../../src/utils/historicalPriceCache', () => ({
      upsertToday: jest.fn(async () => true),
      insertCandles: jest.fn(async () => true)
    }));
    jest.doMock('../../src/services/apiUsageService', () => ({
      checkLimit: jest.fn(async () => ({ allowed: true, remaining: 10 })),
      trackApiCall: jest.fn(async () => true)
    }));
    jest.doMock('../../src/services/tierService', () => ({
      getUserTier: jest.fn(async () => 'pro')
    }));
    jest.doMock('../../src/utils/finnhubClient', () => ({
      constructor: { CRYPTO_TO_COINGECKO: { BTC: 'bitcoin' } },
      isCryptoSymbol: jest.fn(() => false),
      getCryptoQuote: jest.fn(),
      getCryptoProfile: jest.fn()
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.dontMock('axios');
    jest.dontMock('../../src/utils/cache');
    jest.dontMock('../../src/utils/historicalPriceCache');
    jest.dontMock('../../src/services/apiUsageService');
    jest.dontMock('../../src/services/tierService');
    jest.dontMock('../../src/utils/finnhubClient');
  });

  test('normalizes quotes to Finnhub-compatible fields', async () => {
    const fmp = require('../../src/utils/fmpClient');

    const quote = await fmp.getQuote('aapl', 'user-1');

    expect(quote).toMatchObject({
      c: 200,
      pc: 198,
      d: 2,
      dp: 1.01,
      h: 201,
      l: 197,
      o: 199,
      t: 1710000000
    });
  });

  test('normalizes candles chronologically', async () => {
    const fmp = require('../../src/utils/fmpClient');

    const candles = await fmp.getStockCandles('AAPL', '1', 1735810200, 1735810260);

    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ open: 199, high: 200, low: 198, close: 199.5, volume: 900 });
    expect(candles[0].time).toBe(Date.parse('2025-01-02T14:30:00.000Z') / 1000);
    expect(candles[0].time).toBeLessThan(candles[1].time);
  });

  test('strips TradingView exchange prefixes from FMP candle requests', async () => {
    const fmp = require('../../src/utils/fmpClient');
    const axios = require('axios');

    await fmp.getStockCandles('NASDAQ:DEVS', '1', 1735810200, 1735810260);

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/historical-chart/1min'),
      expect.objectContaining({
        params: expect.objectContaining({ symbol: 'DEVS' })
      })
    );
  });

  test('requests the selected FMP trade chart resolution', async () => {
    const fmp = require('../../src/utils/fmpClient');
    const axios = require('axios');

    const chartData = await fmp.getTradeChartData(
      'NASDAQ:DEVS',
      '2025-01-02T15:30:00.000Z',
      '2025-01-02T16:00:00.000Z',
      null,
      '15'
    );

    expect(chartData).toMatchObject({ type: 'intraday', interval: '15min', source: 'fmp' });
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/historical-chart/15min'),
      expect.objectContaining({
        params: expect.objectContaining({ symbol: 'DEVS' })
      })
    );
  });

  test('maps search and CUSIP responses to existing contracts', async () => {
    const fmp = require('../../src/utils/fmpClient');

    await expect(fmp.symbolSearch('AAPL')).resolves.toMatchObject({
      result: [{ symbol: 'AAPL', description: 'Apple Inc.', type: 'NASDAQ' }]
    });
    await expect(fmp.lookupCusip('037833100')).resolves.toBe('AAPL');
  });

  test('normalizes profile shares to Finnhub-compatible millions', async () => {
    const fmp = require('../../src/utils/fmpClient');

    const profile = await fmp.getCompanyProfile('AAPL');

    expect(profile.shareOutstanding).toBe(15_500);
  });

  test('uses weighted average shares as standardized shares outstanding fallback', async () => {
    const fmp = require('../../src/utils/fmpClient');

    const statements = await fmp.getFinancialStatements('AAPL', 'annual');

    expect(statements.financials[0]).toMatchObject({
      fiscalYear: 2025,
      revenue: 400_000_000_000,
      sharesOutstanding: 15_500_000_000,
      sharesBasic: 15_500_000_000
    });
  });

  test('returns typed unsupported errors for missing FMP parity', async () => {
    const fmp = require('../../src/utils/fmpClient');

    await expect(fmp.getTicksAroundTime('AAPL', new Date())).rejects.toMatchObject({
      code: 'MARKET_DATA_UNSUPPORTED',
      provider: 'fmp'
    });
  });
});
