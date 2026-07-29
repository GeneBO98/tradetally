jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/alphaVantage', () => ({}));
jest.mock('../../src/utils/historicalPriceCache', () => ({}));
jest.mock('../../src/services/holdingsService', () => ({}));
jest.mock('../../src/services/notificationService', () => ({}));

const PortfolioService = require('../../src/services/portfolioService');

function yearlyCandles(startYear, endYear, annualGrowth = 0.08) {
  const candles = [];
  let close = 100;
  const current = new Date(Date.UTC(startYear, 0, 1));
  const end = new Date(Date.UTC(endYear, 11, 31));
  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      candles.push({
        time: Math.floor(current.getTime() / 1000),
        close
      });
      close *= ((1 + annualGrowth) ** (1 / 252));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return candles;
}

describe('PortfolioService retirement history', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns only lookbacks with sufficient time and value coverage', async () => {
    jest.spyOn(PortfolioService, 'getPositions').mockResolvedValue([
      { symbol: 'ABC', currentValue: 90000 }
    ]);
    jest.spyOn(PortfolioService, '_getPositionComponents').mockResolvedValue([
      {
        symbol: 'ABC',
        shares: 100,
        effectiveDate: '2021-01-01',
        valueMultiplier: 1
      }
    ]);
    jest.spyOn(PortfolioService, '_getPriceSeriesMap').mockResolvedValue(new Map([
      ['ABC', yearlyCandles(2021, 2026)]
    ]));
    jest.spyOn(PortfolioService, '_getRecordedDividendsForRange').mockResolvedValue([]);

    const scenarios = await PortfolioService.getHistoricalReturnScenarios('user-1');

    expect(scenarios.map(scenario => scenario.period_years)).toEqual([1, 5]);
    expect(scenarios[0].portfolio_value_coverage_percent).toBe(100);
  });

  test('omits scenarios when priced positions cover less than eighty percent of value', async () => {
    jest.spyOn(PortfolioService, 'getPositions').mockResolvedValue([
      { symbol: 'ABC', currentValue: 70000 },
      { symbol: 'NOHISTORY', currentValue: 30000 }
    ]);
    jest.spyOn(PortfolioService, '_getPositionComponents').mockResolvedValue([
      { symbol: 'ABC', shares: 100, effectiveDate: '2021-01-01', valueMultiplier: 1 },
      { symbol: 'NOHISTORY', shares: 100, effectiveDate: '2021-01-01', valueMultiplier: 1 }
    ]);
    jest.spyOn(PortfolioService, '_getPriceSeriesMap').mockResolvedValue(new Map([
      ['ABC', yearlyCandles(2021, 2026)],
      ['NOHISTORY', []]
    ]));
    jest.spyOn(PortfolioService, '_getRecordedDividendsForRange').mockResolvedValue([]);

    await expect(PortfolioService.getHistoricalReturnScenarios('user-1')).resolves.toEqual([]);
  });

  test('lists only account sources that can contribute to retirement projections', async () => {
    const db = require('../../src/config/database');
    db.query.mockResolvedValueOnce({
      rows: [{
        account_identifier: 'ira-1',
        account_name: 'Retirement IRA',
        broker: 'Fidelity',
        sources: ['manual_holdings', 'plaid_holdings'],
        source_record_count: '4'
      }]
    });

    const accounts = await PortfolioService.getRetirementAccountBreakdown('user-1');

    expect(db.query.mock.calls[0][0]).toContain("t.exit_price IS NULL");
    expect(db.query.mock.calls[0][0]).toContain("t.side = 'long'");
    expect(accounts).toEqual([{
      account_identifier: 'ira-1',
      account_name: 'Retirement IRA',
      broker: 'Fidelity',
      sources: ['manual_holdings', 'plaid_holdings'],
      source_record_count: 4
    }]);
  });
});
