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

const historicalPriceCache = require('../../src/utils/historicalPriceCache');
const alphaVantage = require('../../src/utils/alphaVantage');

function dailyCandles(startDate, count) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const time = Math.floor((start.getTime() + index * 24 * 60 * 60 * 1000) / 1000);
    const price = 100 + index;
    return {
      time,
      open: price,
      high: price + 2,
      low: price - 2,
      close: price + 1,
      volume: 1000 + index
    };
  });
}

describe('Alpha Vantage trade chart windows', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns broad daily context instead of only seven days around a recent trade', async () => {
    const candles = dailyCandles('2026-03-01', 100);
    jest.spyOn(alphaVantage, 'getDailyData').mockResolvedValue(candles);

    const result = await alphaVantage.getTradeChartData(
      'WDC',
      '2026-05-15T14:30:00.000Z',
      '2026-05-20T19:00:00.000Z'
    );

    expect(result.candles).toHaveLength(100);
    expect(result.candles[0].time).toBe(candles[0].time);
    expect(result.candles.at(-1).time).toBe(candles.at(-1).time);
  });

  test('does not substitute recent compact candles for an older trade', async () => {
    jest.spyOn(alphaVantage, 'getDailyData').mockResolvedValue(
      dailyCandles('2026-03-01', 100)
    );

    await expect(
      alphaVantage.getTradeChartData(
        'WDC',
        '2024-05-15T14:30:00.000Z',
        '2024-05-20T19:00:00.000Z'
      )
    ).rejects.toThrow('does not include the trade dates');
  });

  test('uses cached context only when it covers the trade date', async () => {
    historicalPriceCache.hasRange.mockResolvedValueOnce(true);
    historicalPriceCache.getRange.mockResolvedValueOnce(dailyCandles('2026-03-01', 40));
    const apiCandles = dailyCandles('2026-05-01', 60);
    jest.spyOn(alphaVantage, 'getDailyData').mockResolvedValue(apiCandles);

    const result = await alphaVantage.getTradeChartData(
      'WDC',
      '2026-05-15T14:30:00.000Z',
      '2026-05-20T19:00:00.000Z'
    );

    expect(alphaVantage.getDailyData).toHaveBeenCalledWith('WDC', 'compact');
    expect(result.source).toBe('alphavantage');
    expect(result.candles).toHaveLength(50);
  });
});
