jest.mock('axios', () => ({
  get: jest.fn()
}));

jest.mock('../../src/utils/cache', () => ({
  get: jest.fn(async () => null),
  set: jest.fn(async () => true)
}));

const axios = require('axios');
const yahooFinance = require('../../src/utils/yahooFinance');

const DAY_MS = 24 * 60 * 60 * 1000;

function equityResponse(startSeconds, count, stepSeconds, instrumentType = 'EQUITY') {
  const timestamp = Array.from({ length: count }, (_, index) => startSeconds + index * stepSeconds);
  return {
    data: {
      chart: {
        error: null,
        result: [{
          meta: { symbol: 'MP', instrumentType, exchangeTimezoneName: 'America/New_York' },
          timestamp,
          indicators: {
            quote: [{
              open: timestamp.map(() => 60.4),
              high: timestamp.map(() => 60.7),
              low: timestamp.map(() => 60.2),
              close: timestamp.map(() => 60.5),
              volume: timestamp.map(() => 1000)
            }]
          }
        }]
      }
    }
  };
}

describe('Yahoo Finance equity charts', () => {
  let originalEnabled;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnabled = process.env.YAHOO_FINANCE_ENABLED;
    process.env.YAHOO_FINANCE_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.YAHOO_FINANCE_ENABLED;
    else process.env.YAHOO_FINANCE_ENABLED = originalEnabled;
  });

  test('serves intraday candles for a recent equity trade', async () => {
    const entry = new Date(Date.now() - 4 * DAY_MS);
    axios.get.mockResolvedValue(equityResponse(Math.floor(entry.getTime() / 1000) - 3600, 100, 300));

    const result = await yahooFinance.getStockTradeChartData('MP', entry.toISOString(), null, '5');

    expect(result.source).toBe('yahoo');
    expect(result.interval).toBe('5min');
    expect(result.type).toBe('intraday');
    expect(result.candles).toHaveLength(100);
  });

  test('does not reject equities the way the futures path does', async () => {
    const entry = new Date(Date.now() - 2 * DAY_MS);
    axios.get.mockResolvedValue(equityResponse(Math.floor(entry.getTime() / 1000), 10, 300, 'EQUITY'));

    await expect(
      yahooFinance.getStockTradeChartData('MP', entry.toISOString(), null, '5')
    ).resolves.toMatchObject({ source: 'yahoo' });
  });

  test('the futures path still requires a futures instrument', async () => {
    axios.get.mockResolvedValue(equityResponse(1_700_000_000, 10, 300, 'EQUITY'));

    await expect(
      yahooFinance.getFuturesTradeChartData('ES', {
        symbol: 'ESZ5',
        entry_time: new Date(Date.now() - DAY_MS).toISOString(),
        exit_time: null
      }, '1')
    ).rejects.toThrow(/did not resolve to a future/i);
  });

  test('degrades an old trade to daily rather than requesting absent intraday history', async () => {
    const entry = new Date(Date.now() - 400 * DAY_MS);
    axios.get.mockResolvedValue(equityResponse(Math.floor(entry.getTime() / 1000), 50, 86400));

    const result = await yahooFinance.getStockTradeChartData('MP', entry.toISOString(), null, '5');

    expect(result.interval).toBe('daily');
    expect(result.available_resolutions).toEqual(['D']);
  });

  test('coarsens the resolution when the holding period is too long for it', async () => {
    const entry = new Date(Date.now() - 25 * DAY_MS);
    const exit = new Date(Date.now() - 2 * DAY_MS);
    axios.get.mockResolvedValue(equityResponse(Math.floor(entry.getTime() / 1000), 50, 3600));

    // 23 days held is far past what a 1-minute chart can show.
    const result = await yahooFinance.getStockTradeChartData('MP', entry.toISOString(), exit.toISOString(), '1');

    expect(result.interval).not.toBe('1min');
  });

  describe('symbol translation', () => {
    test.each([
      ['KO', 'KO'],
      ['ISLN.L', 'ISLN.L'],
      ['BMW.DE', 'BMW.DE'],
      ['ZPRR.DE', 'ZPRR.DE'],
      ['BRK.B', 'BRK-B'],
      ['XSP', '^XSP'],
      ['SPX', '^SPX'],
      ['^VIX', '^VIX'],
      ['ko', 'KO']
    ])('%s resolves to %s', (input, expected) => {
      expect(yahooFinance.getYahooSymbol(input)).toBe(expected);
    });
  });

  test('requests the translated symbol, not the raw ledger one', async () => {
    const entry = new Date(Date.now() - 2 * DAY_MS);
    axios.get.mockResolvedValue(equityResponse(Math.floor(entry.getTime() / 1000), 10, 300));

    await yahooFinance.getStockTradeChartData('XSP', entry.toISOString(), null, '5');

    expect(axios.get.mock.calls[0][0]).toContain(encodeURIComponent('^XSP'));
  });

  test('a daily equity window carries months of prior context', async () => {
    const entry = new Date(Date.now() - 10 * DAY_MS);
    axios.get.mockResolvedValue(equityResponse(Math.floor(entry.getTime() / 1000), 50, 86400));

    await yahooFinance.getStockTradeChartData('MP', entry.toISOString(), null, 'D');

    const { params } = axios.get.mock.calls[0][1];
    const contextDays = (entry.getTime() / 1000 - params.period1) / (24 * 60 * 60);
    expect(contextDays).toBeGreaterThan(150);
  });
});

describe('advertised resolutions match what can be served', () => {
  let originalEnabled;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnabled = process.env.YAHOO_FINANCE_ENABLED;
    process.env.YAHOO_FINANCE_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.YAHOO_FINANCE_ENABLED;
    else process.env.YAHOO_FINANCE_ENABLED = originalEnabled;
  });

  test('a long hold does not advertise a resolution the span rules would coarsen', () => {
    // Recent enough for 1m by age, but held far longer than a 1m chart can show.
    const entry = new Date(Date.now() - 12 * DAY_MS).toISOString();
    const exit = new Date(Date.now() - DAY_MS).toISOString();

    const advertised = yahooFinance.availableStockResolutions(entry, exit);

    expect(yahooFinance.effectiveStockResolution('1', entry, exit)).not.toBe('1');
    expect(advertised).not.toContain('1');
    expect(advertised).toContain('D');
  });

  test('every advertised resolution survives the request path unchanged', () => {
    const cases = [
      [new Date(Date.now() - 2 * DAY_MS).toISOString(), null],
      [new Date(Date.now() - 12 * DAY_MS).toISOString(), new Date(Date.now() - DAY_MS).toISOString()],
      [new Date(Date.now() - 200 * DAY_MS).toISOString(), null]
    ];

    for (const [entry, exit] of cases) {
      for (const resolution of yahooFinance.availableStockResolutions(entry, exit)) {
        expect(yahooFinance.effectiveStockResolution(resolution, entry, exit)).toBe(resolution);
      }
    }
  });

  test('a short scalp still advertises the fine resolutions', () => {
    const entry = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const exit = new Date(Date.parse(entry) + 5 * 60 * 1000).toISOString();

    expect(yahooFinance.availableStockResolutions(entry, exit)).toContain('1');
  });
});

describe('Yahoo Finance quotes', () => {
  let originalEnabled;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnabled = process.env.YAHOO_FINANCE_ENABLED;
    process.env.YAHOO_FINANCE_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.YAHOO_FINANCE_ENABLED;
    else process.env.YAHOO_FINANCE_ENABLED = originalEnabled;
  });

  function quoteResponse(meta) {
    return { data: { chart: { error: null, result: [{ meta, timestamp: [], indicators: { quote: [{}] } }] } } };
  }

  test('shapes the quote like the Finnhub one the callers already consume', async () => {
    axios.get.mockResolvedValue(quoteResponse({
      regularMarketPrice: 100,
      chartPreviousClose: 80,
      currency: 'EUR',
      regularMarketDayHigh: 110,
      regularMarketDayLow: 90
    }));

    const quote = await yahooFinance.getQuote('EXCO.DE');

    expect(quote.c).toBe(100);
    expect(quote.pc).toBe(80);
    expect(quote.d).toBeCloseTo(20, 2);
    expect(quote.dp).toBeCloseTo(25, 2);
    expect(quote.currency).toBe('EUR');
    expect(quote.source).toBe('yahoo');
  });

  test('returns null rather than a bogus quote when there is no price', async () => {
    axios.get.mockResolvedValue(quoteResponse({ currency: 'EUR' }));
    expect(await yahooFinance.getQuote('EXCO.DE')).toBeNull();
  });

  test('never throws when the request fails', async () => {
    axios.get.mockRejectedValue(new Error('network down'));
    expect(await yahooFinance.getQuote('EXCO.DE')).toBeNull();
  });

  test('translates the symbol before quoting', async () => {
    axios.get.mockResolvedValue(quoteResponse({ regularMarketPrice: 100, chartPreviousClose: 99 }));
    await yahooFinance.getQuote('SPX');
    expect(axios.get.mock.calls[0][0]).toContain(encodeURIComponent('^SPX'));
  });

  test('does not divide by a zero previous close', async () => {
    axios.get.mockResolvedValue(quoteResponse({ regularMarketPrice: 12, chartPreviousClose: 0 }));
    const quote = await yahooFinance.getQuote('NEWLISTING');
    expect(quote.dp).toBe(0);
    expect(Number.isFinite(quote.dp)).toBe(true);
  });
});
