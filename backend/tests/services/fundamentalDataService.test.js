const FundamentalDataService = require('../../src/services/fundamentalDataService');

describe('FundamentalDataService aggregates', () => {
  let originalGetFinancials;

  beforeEach(() => {
    originalGetFinancials = FundamentalDataService.getFinancials;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    FundamentalDataService.getFinancials = originalGetFinancials;
    console.log.mockRestore();
    console.warn.mockRestore();
  });

  test('annualData keeps revenue and freeCashFlow for downstream 8 Pillars calculations', async () => {
    FundamentalDataService.getFinancials = jest.fn().mockResolvedValue([
      {
        fiscalYear: 2025,
        revenue: 200,
        netIncome: 50,
        freeCashFlow: 40,
        operatingIncome: 60,
        totalEquity: 100,
        totalDebt: 20,
        cashAndEquivalents: 10,
        sharesOutstanding: 10
      },
      {
        fiscalYear: 2024,
        revenue: 100,
        netIncome: 25,
        freeCashFlow: 20,
        operatingIncome: 30,
        totalEquity: 90,
        totalDebt: 20,
        cashAndEquivalents: 10,
        sharesOutstanding: 10
      }
    ]);

    const aggregates = await FundamentalDataService.getFiveYearAggregates('AAPL');

    expect(aggregates.annualData[0]).toMatchObject({
      fiscalYear: 2025,
      revenue: 200,
      netIncome: 50,
      freeCashFlow: 40
    });
    expect(aggregates.annualData[1]).toMatchObject({
      fiscalYear: 2024,
      revenue: 100,
      netIncome: 25,
      freeCashFlow: 20
    });
  });
});
