jest.mock('../../src/utils/cache', () => ({
  get: jest.fn(async () => null),
  set: jest.fn(async () => true),
  getStats: jest.fn(async () => ({ memoryEntries: 0, databaseEntries: 0 }))
}));

jest.mock('../../src/utils/historicalPriceCache', () => ({
  hasRange: jest.fn(async () => false),
  getRange: jest.fn(async () => []),
  insertCandles: jest.fn(async () => true)
}));

const alphaVantage = require('../../src/utils/alphaVantage');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Alpha Vantage reports intraday stamps as US/Eastern wall clock, newest first.
function intradayResponse(interval, startMs, count, stepMinutes) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const series = {};
  for (let index = count - 1; index >= 0; index -= 1) {
    const stamp = formatter.format(new Date(startMs + index * stepMinutes * 60 * 1000));
    series[stamp] = {
      '1. open': '87.00',
      '2. high': '87.50',
      '3. low': '86.50',
      '4. close': '87.10',
      '5. volume': '1000'
    };
  }

  return { [`Time Series (${interval})`]: series };
}

function dailyCandles(startMs, count) {
  return Array.from({ length: count }, (_, index) => ({
    time: Math.floor((startMs + index * ONE_DAY_MS) / 1000),
    open: 86,
    high: 88,
    low: 85,
    close: 87,
    volume: 5000
  }));
}

describe('Alpha Vantage intraday trade charts', () => {
  let originalIntraday;

  beforeEach(() => {
    originalIntraday = process.env.ALPHA_VANTAGE_INTRADAY_ENABLED;
    // Intraday is premium and opt-in; these cases exercise the enabled path.
    process.env.ALPHA_VANTAGE_INTRADAY_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalIntraday === undefined) delete process.env.ALPHA_VANTAGE_INTRADAY_ENABLED;
    else process.env.ALPHA_VANTAGE_INTRADAY_ENABLED = originalIntraday;
    jest.restoreAllMocks();
  });

  test('maps Eastern wall-clock stamps to the correct instants regardless of server timezone', async () => {
    jest.spyOn(alphaVantage, 'makeRequest').mockResolvedValue({
      'Time Series (5min)': {
        '2026-08-17 15:35:00': {
          '1. open': '86.90', '2. high': '87.00', '3. low': '86.80', '4. close': '86.95', '5. volume': '1000'
        },
        '2026-08-17 15:30:00': {
          '1. open': '86.80', '2. high': '86.90', '3. low': '86.70', '4. close': '86.85', '5. volume': '900'
        }
      }
    });

    const candles = await alphaVantage.getIntradayData('KO', '5min');

    // 15:35 EDT is 19:35Z, which is how the execution is recorded.
    expect(candles.map((candle) => candle.time)).toEqual([
      Date.parse('2026-08-17T19:30:00.000Z') / 1000,
      Date.parse('2026-08-17T19:35:00.000Z') / 1000
    ]);
  });

  test('serves intraday candles when the requested resolution is intraday', async () => {
    const entryMs = Date.now() - 4 * ONE_DAY_MS;
    jest.spyOn(alphaVantage, 'makeRequest').mockResolvedValue(
      intradayResponse('5min', entryMs - 2 * 60 * 60 * 1000, 200, 5)
    );

    const result = await alphaVantage.getTradeChartData('KO', new Date(entryMs).toISOString(), null, '5');

    expect(result.interval).toBe('5min');
    expect(result.type).toBe('intraday');
    expect(result.available_resolutions).toContain('5');
    expect(result.candles.length).toBeGreaterThan(0);
    expect(result.candles[0].time).toBeLessThanOrEqual(Math.floor(entryMs / 1000));
  });

  test('advertises daily only, with a reason, once intraday history cannot reach the trade', async () => {
    const entryMs = Date.now() - 200 * ONE_DAY_MS;
    jest.spyOn(alphaVantage, 'getDailyData').mockResolvedValue(dailyCandles(entryMs - 50 * ONE_DAY_MS, 100));

    const result = await alphaVantage.getTradeChartData('KO', new Date(entryMs).toISOString(), null, '5');

    expect(result.interval).toBe('daily');
    expect(result.available_resolutions).toEqual(['D']);
    expect(result.intraday_unavailable_reason).toMatch(/intraday/i);
  });

  test('degrades to daily and keeps the provider message when the intraday call fails', async () => {
    const entryMs = Date.now() - 4 * ONE_DAY_MS;
    jest.spyOn(alphaVantage, 'makeRequest').mockResolvedValue({ Information: 'premium endpoint' });
    jest.spyOn(alphaVantage, 'getDailyData').mockResolvedValue(dailyCandles(Date.now() - 100 * ONE_DAY_MS, 100));

    const result = await alphaVantage.getTradeChartData('KO', new Date(entryMs).toISOString(), null, '5');

    expect(result.interval).toBe('daily');
    expect(result.available_resolutions).toEqual(['D']);
    expect(result.intraday_unavailable_reason).toBeTruthy();
  });

  test('daily requests are unaffected and still offer intraday for a recent trade', async () => {
    const entryMs = Date.now() - 4 * ONE_DAY_MS;
    jest.spyOn(alphaVantage, 'getDailyData').mockResolvedValue(dailyCandles(Date.now() - 100 * ONE_DAY_MS, 100));

    const result = await alphaVantage.getTradeChartData('KO', new Date(entryMs).toISOString(), null, 'D');

    expect(result.interval).toBe('daily');
    expect(result.available_resolutions).toContain('5');
    expect(result.intraday_unavailable_reason).toBeNull();
  });
});

describe('Alpha Vantage intraday is opt-in', () => {
  let originalIntraday;

  beforeEach(() => {
    originalIntraday = process.env.ALPHA_VANTAGE_INTRADAY_ENABLED;
    delete process.env.ALPHA_VANTAGE_INTRADAY_ENABLED;
  });

  afterEach(() => {
    if (originalIntraday === undefined) delete process.env.ALPHA_VANTAGE_INTRADAY_ENABLED;
    else process.env.ALPHA_VANTAGE_INTRADAY_ENABLED = originalIntraday;
    jest.restoreAllMocks();
  });

  test('spends no request on the premium endpoint when disabled', async () => {
    const makeRequest = jest.spyOn(alphaVantage, 'makeRequest');
    jest.spyOn(alphaVantage, 'getDailyData').mockResolvedValue(dailyCandles(Date.now() - 100 * ONE_DAY_MS, 100));

    const result = await alphaVantage.getTradeChartData(
      'KO', new Date(Date.now() - 4 * ONE_DAY_MS).toISOString(), null, '5'
    );

    // The doomed attempt is what burns the daily allowance twice over.
    expect(makeRequest).not.toHaveBeenCalled();
    expect(result.interval).toBe('daily');
  });

  test('does not advertise intraday when disabled', async () => {
    jest.spyOn(alphaVantage, 'getDailyData').mockResolvedValue(dailyCandles(Date.now() - 100 * ONE_DAY_MS, 100));

    const result = await alphaVantage.getTradeChartData(
      'KO', new Date(Date.now() - 4 * ONE_DAY_MS).toISOString(), null, 'D'
    );

    expect(result.available_resolutions).toEqual(['D']);
    // A daily request that returns daily is not a downgrade, so it needs no
    // explanation; the reason belongs only where intraday was actually asked for.
    expect(result.intraday_unavailable_reason).toBeNull();
  });

  test('explains the refusal when intraday IS requested while disabled', async () => {
    jest.spyOn(alphaVantage, 'getDailyData').mockResolvedValue(dailyCandles(Date.now() - 100 * ONE_DAY_MS, 100));

    const result = await alphaVantage.getTradeChartData(
      'KO', new Date(Date.now() - 4 * ONE_DAY_MS).toISOString(), null, '5'
    );

    expect(result.intraday_unavailable_reason).toMatch(/premium/i);
    expect(result.intraday_unavailable_reason).toMatch(/ALPHA_VANTAGE_INTRADAY_ENABLED/);
  });
});

