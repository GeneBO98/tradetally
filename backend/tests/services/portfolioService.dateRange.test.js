jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/alphaVantage', () => ({}));
jest.mock('../../src/utils/historicalPriceCache', () => ({}));
jest.mock('../../src/services/holdingsService', () => ({}));
jest.mock('../../src/services/notificationService', () => ({}));
const PortfolioService = require('../../src/services/portfolioService');
afterEach(() => jest.restoreAllMocks());

test('explicit date bounds override rolling periods for benchmark and position data', async () => {
  jest.spyOn(PortfolioService, 'getPreferences').mockResolvedValue({ defaultBenchmarkSymbol: 'SPY' });
  jest.spyOn(PortfolioService, '_getPositionComponents').mockResolvedValue([]);
  const benchmark = jest.spyOn(PortfolioService, '_getDailySeries').mockResolvedValue([]);
  const positions = jest.spyOn(PortfolioService, '_getPriceSeriesMap').mockResolvedValue(new Map());
  const result = await PortfolioService._getPerformance('owner', { accounts: 'acct-1', period: '1Y', start_date: '2026-08-01', end_date: '2026-08-31' });
  expect(benchmark).toHaveBeenCalledWith('SPY', '2026-08-01', '2026-08-31', 'owner');
  expect(positions).toHaveBeenCalledWith([], '2026-08-01', '2026-08-31', 'owner');
  expect(PortfolioService._getPositionComponents).toHaveBeenCalledWith('owner', ['acct-1']);
  expect(result.startDate).toBe('2026-08-01');
  expect(result.endDate).toBe('2026-08-31');
});

test('different explicit months do not share an in-flight performance cache entry', async () => {
  const performance = jest.spyOn(PortfolioService, '_getPerformance').mockImplementation(async (_user, options) => options.start_date);
  const [august, september] = await Promise.all([
    PortfolioService.getPerformance('owner-cache', { period: 'last_month', start_date: '2026-08-01', end_date: '2026-08-31' }),
    PortfolioService.getPerformance('owner-cache', { period: 'last_month', start_date: '2026-09-01', end_date: '2026-09-30' })
  ]);
  expect(august).toBe('2026-08-01');
  expect(september).toBe('2026-09-01');
  expect(performance).toHaveBeenCalledTimes(2);
});

test('completed month totals exclude candles outside both boundaries', async () => {
  jest.spyOn(PortfolioService, 'getPreferences').mockResolvedValue({ defaultBenchmarkSymbol: 'SPY' });
  jest.spyOn(PortfolioService, '_getPositionComponents').mockResolvedValue([
    { symbol: 'AAPL', shares: 1, valueMultiplier: 1, effectiveDate: '2026-01-01' }
  ]);
  const candles = [
    ['2026-07-31', 50], ['2026-08-01', 100], ['2026-08-31', 110], ['2026-09-01', 200]
  ].map(([date, close]) => ({ time: new Date(`${date}T00:00:00Z`).getTime() / 1000, close }));
  jest.spyOn(PortfolioService, '_getDailySeries').mockResolvedValue(candles);
  jest.spyOn(PortfolioService, '_getPriceSeriesMap').mockResolvedValue(new Map([['AAPL', candles]]));
  const result = await PortfolioService._getPerformance('owner', { start_date: '2026-08-01', end_date: '2026-08-31' });
  expect(result.series.map(point => point.date)).toEqual(['2026-08-01', '2026-08-31']);
  expect(result.metrics.totalReturnPercent).toBe(10);
});
