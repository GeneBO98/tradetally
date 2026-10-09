jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/currencyConverter', () => ({
  getDailyCrossRate: jest.fn(),
  getForexRate: jest.fn()
}));

const FundamentalDataService = require('../../src/services/fundamentalDataService');
const currencyConverter = require('../../src/utils/currencyConverter');
const DCFValuationService = require('../../src/services/dcfValuationService');

function eurPeriod(year, revenue) {
  return {
    year,
    fiscalYear: year,
    quarter: null,
    fiscalQuarter: null,
    currency: 'EUR',
    revenue,
    netIncome: revenue * 0.2,
    operatingIncome: revenue * 0.25,
    grossProfit: revenue * 0.5,
    freeCashFlow: revenue * 0.3,
    operatingCashFlow: revenue * 0.35,
    totalAssets: revenue * 2,
    totalEquity: revenue,
    totalDebt: revenue * 0.4,
    longTermDebt: revenue * 0.3,
    cashAndEquivalents: revenue * 0.2,
    accountsPayable: revenue * 0.05,
    dividendsPaid: revenue * 0.05,
    eps: (revenue * 0.2) / 1e8,
    sharesOutstanding: 1e8
  };
}

describe('DCF getHistoricalMetrics currency normalization', () => {
  let spies = [];

  beforeEach(() => {
    currencyConverter.getDailyCrossRate.mockReset();
    spies = [
      jest.spyOn(FundamentalDataService, 'getProfile').mockResolvedValue({
        currency: 'USD', shareOutstanding: 100
      }),
      jest.spyOn(FundamentalDataService, 'getQuote').mockResolvedValue({ c: 80 }),
      jest.spyOn(FundamentalDataService, 'getMetrics').mockResolvedValue(null),
      jest.spyOn(FundamentalDataService, 'getAnalystEstimates').mockResolvedValue(null),
      jest.spyOn(FundamentalDataService, 'getFinancials').mockResolvedValue([
        eurPeriod(2025, 1e9), eurPeriod(2024, 9e8), eurPeriod(2023, 8e8)
      ]),
      jest.spyOn(FundamentalDataService, 'getYearEndPrices').mockResolvedValue({})
    ];
  });

  afterEach(() => spies.forEach(s => s.mockRestore()));

  test('scales reporting-currency financials into the trading currency before price ratios', async () => {
    currencyConverter.getDailyCrossRate.mockResolvedValue(1.1); // EUR -> USD

    const metrics = await DCFValuationService.getHistoricalMetrics('SAP');

    expect(metrics.reporting_currency).toBe('EUR');
    expect(metrics.trading_currency).toBe('USD');
    expect(metrics.fx_rate_reporting_to_trading).toBe(1.1);
    expect(metrics.current_fcf).toBeCloseTo(3e8 * 1.1, 0);
    expect(metrics.current_revenue).toBeCloseTo(1e9 * 1.1, 0);
    expect(metrics.shares_outstanding).toBe(1e8); // share counts untouched
    // P/E = price(USD) / eps(USD) => 80 / (2 * 1.1)
    expect(metrics.pe_ratio).toBeCloseTo(80 / 2.2, 2);
  });

  test('growth/margin ratios are currency-invariant', async () => {
    currencyConverter.getDailyCrossRate.mockResolvedValue(1.1);
    const metrics = await DCFValuationService.getHistoricalMetrics('SAP');

    expect(metrics.revenue_growth_1yr).toBeCloseTo((1e9 - 9e8) / 9e8, 6);
    expect(metrics.fcf_margin_1yr).toBeCloseTo(0.3, 6);
  });

  test('no conversion happens when reporting currency equals trading currency', async () => {
    spies[4].mockResolvedValue([
      { ...eurPeriod(2025, 1e9), currency: 'USD' },
      { ...eurPeriod(2024, 9e8), currency: 'USD' }
    ]);

    const metrics = await DCFValuationService.getHistoricalMetrics('AAPL');
    expect(currencyConverter.getDailyCrossRate).not.toHaveBeenCalled();
    expect(metrics.current_fcf).toBe(3e8);
  });

  test('missing FX rate leaves values unconverted but flags the metadata', async () => {
    currencyConverter.getDailyCrossRate.mockRejectedValue(new Error('FX offline'));

    const metrics = await DCFValuationService.getHistoricalMetrics('SAP');
    expect(metrics.fx_rate_reporting_to_trading).toBe(1);
    expect(metrics.current_fcf).toBe(3e8);
    expect(metrics.reporting_currency).toBe('EUR');
  });
});
