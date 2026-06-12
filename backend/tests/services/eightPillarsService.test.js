// Pin the provider: the service tags extracted metrics with the active
// market data provider's name, and the assertions below expect 'finnhub'
// regardless of what MARKET_DATA_PROVIDER the local .env selects.
process.env.MARKET_DATA_PROVIDER = 'finnhub';

const EightPillarsService = require('../../src/services/eightPillarsService');

describe('EightPillarsService calculation rules', () => {
  test('pillar 1 averages the last five annual P/E ratios', () => {
    const result = EightPillarsService.calculatePillar1([
      { year: 2025, pe: 30 },
      { year: 2024, pe: 25 },
      { year: 2023, pe: 20 },
      { year: 2022, pe: 15 },
      { year: 2021, pe: 10 }
    ]);

    expect(result.value).toBeCloseTo(20, 2);
    expect(result.passed).toBe(true);
    expect(result.data.annualPEs).toHaveLength(5);
    expect(result.data.periodsAnalyzed).toBe(5);
  });

  test('pillar 1 fails when fewer than five valid annual P/E values are available', () => {
    const result = EightPillarsService.calculatePillar1([
      { year: 2025, pe: 20 },
      { year: 2024, pe: null },
      { year: 2023, pe: -5 },
      { year: 2022, pe: 18 }
    ]);

    expect(result.passed).toBe(false);
    expect(result.displayValue).toBe('N/A');
    expect(result.reason).toMatch(/2\/5 years available/i);
  });

  test('pillar 2 only calculates ROIC with positive invested capital', () => {
    const result = EightPillarsService.calculatePillar2({
      annualData: [
        {
          fiscalYear: 2025,
          operatingIncome: 100,
          totalEquity: -50,
          totalDebt: 0,
          cashAndEquivalents: 0
        },
        {
          fiscalYear: 2024,
          operatingIncome: 100,
          totalEquity: -50,
          totalDebt: 0,
          cashAndEquivalents: 0
        }
      ]
    });

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/positive average invested capital/i);
    expect(result.data.annualROICs).toEqual([]);
  });

  test('pillar 2 does not use Finnhub ROIC values for the displayed calculation', () => {
    const result = EightPillarsService.calculatePillar2(
      {
        annualData: [
          {
            fiscalYear: 2025,
            operatingIncome: 100,
            totalEquity: 50,
            totalDebt: 50
          },
          {
            fiscalYear: 2024,
            operatingIncome: 90,
            totalEquity: 50,
            totalDebt: 50
          }
        ]
      },
      null,
      [
        { year: 2025, roic: 32, source: 'finnhub', metric_key: 'roic' },
        { year: 2024, roic: 31, source: 'finnhub', metric_key: 'roic' },
        { year: 2023, roic: 30, source: 'finnhub', metric_key: 'roic' },
        { year: 2022, roic: 29, source: 'finnhub', metric_key: 'roic' },
        { year: 2021, roic: 28, source: 'finnhub', metric_key: 'roic' }
      ]
    );

    expect(result.value).toBeCloseTo(79, 2);
    expect(result.data.roic_source).toBe('calculated');
    expect(result.data.annualROICs).toHaveLength(1);
    expect(result.data.annualROICs[0]).toHaveProperty('operatingIncome');
  });

  test('extractAnnualROICsFromMetrics reads Finnhub annual roic series', () => {
    const roics = EightPillarsService.extractAnnualROICsFromMetrics({
      series: {
        annual: {
          roic: [
            { period: '2023-09-30', v: 0.3 },
            { period: '2025-09-30', v: 32 },
            { period: '2024-09-30', v: 0.31 }
          ]
        }
      }
    });

    expect(roics.map(r => r.year)).toEqual([2025, 2024, 2023]);
    expect(roics.map(r => r.roic)).toEqual([32, 31, 30]);
    expect(roics[0].source).toBe('finnhub');
    expect(roics[0].metric_key).toBe('roic');
  });

  test('pillar 2 uses equity plus debt plus accounts payable without subtracting cash', () => {
    const result = EightPillarsService.calculatePillar2({
      annualData: [
        {
          fiscalYear: 2025,
          operatingIncome: 100,
          totalEquity: 50,
          totalDebt: 50,
          accountsPayable: 25,
          cashAndEquivalents: 90
        },
        {
          fiscalYear: 2024,
          operatingIncome: 90,
          totalEquity: 50,
          totalDebt: 50,
          accountsPayable: 25,
          cashAndEquivalents: 90
        }
      ]
    });

    expect(result.value).toBeCloseTo(63.2, 2);
    expect(result.data.annualROICs[0].investedCapital).toBe(125);
    expect(result.data.annualROICs[0].avgInvestedCapital).toBe(125);
  });

  test('pillar 2 fallback uses average invested capital and reported tax rate', () => {
    const result = EightPillarsService.calculatePillar2({
      annualData: [
        {
          fiscalYear: 2025,
          operatingIncome: 100,
          incomeBeforeTax: 80,
          incomeTaxExpense: 16,
          totalEquity: 80,
          totalDebt: 20,
          accountsPayable: 20
        },
        {
          fiscalYear: 2024,
          operatingIncome: 90,
          incomeBeforeTax: 70,
          incomeTaxExpense: 14,
          totalEquity: 120,
          totalDebt: 40,
          accountsPayable: 40
        }
      ]
    });

    expect(result.value).toBeCloseTo(50, 2);
    expect(result.data.annualROICs[0].nopat).toBeCloseTo(80, 2);
    expect(result.data.annualROICs[0].avgInvestedCapital).toBe(160);
    expect(result.data.annualROICs[0].effectiveTaxRate).toBe(20);
  });

  test('pillar 3 does not pass when prior shares are missing', () => {
    const result = EightPillarsService.calculatePillar3(100_000_000, null);

    expect(result.passed).toBe(false);
    expect(result.displayValue).toBe('N/A');
    expect(result.reason).toMatch(/prior/i);
  });

  test('pillars 4 through 6 fail instead of coercing missing data to zero', () => {
    expect(EightPillarsService.calculatePillar4(100, null)).toMatchObject({
      passed: false,
      value: null,
      displayValue: 'N/A'
    });
    expect(EightPillarsService.calculatePillar5(100, null)).toMatchObject({
      passed: false,
      value: null,
      displayValue: 'N/A'
    });
    expect(EightPillarsService.calculatePillar6(100, null)).toMatchObject({
      passed: false,
      value: null,
      displayValue: 'N/A'
    });
  });

  test('pillar 7 only treats explicit zero debt as no debt', () => {
    expect(EightPillarsService.calculatePillar7(0, null)).toMatchObject({
      passed: true,
      displayValue: '0x (No debt)'
    });

    const missingDebt = EightPillarsService.calculatePillar7(null, 100);
    expect(missingDebt.passed).toBe(false);
    expect(missingDebt.displayValue).toBe('N/A');
    expect(missingDebt.reason).toMatch(/debt data/i);
  });

  test('pillar 8 uses actual valid FCF period count', () => {
    const marketCap = 1_000;
    const result = EightPillarsService.calculatePillar8(marketCap, [100, 200, 300]);

    expect(result.value).toBeCloseTo(5, 2);
    expect(result.data.avgAnnualFCF).toBeCloseTo(200, 5);
    expect(result.data.periodsAnalyzed).toBe(3);
  });

  test('pillar 8 fails when there are fewer than two valid FCF periods', () => {
    const result = EightPillarsService.calculatePillar8(1_000, [100]);

    expect(result.passed).toBe(false);
    expect(result.displayValue).toBe('N/A');
    expect(result.reason).toMatch(/insufficient fcf periods/i);
  });
});

describe('EightPillarsService AAPL fixture comparison', () => {
  const aaplFixture = {
    // Values normalized from Apple annual filing data and cross-checked against
    // StockAnalysis' AAPL financials page. Dollar figures are in millions.
    current_price: 298.87,
    shares_outstanding: 14_668,
    annual: [
      { year: 2025, revenue: 416_161, netIncome: 112_010, freeCashFlow: 98_767 },
      { year: 2024, revenue: 391_035, netIncome: 93_736, freeCashFlow: 108_807 },
      { year: 2023, revenue: 383_285, netIncome: 96_995, freeCashFlow: 99_584 },
      { year: 2022, revenue: 394_328, netIncome: 99_803, freeCashFlow: 111_443 },
      { year: 2021, revenue: 365_817, netIncome: 94_680, freeCashFlow: 92_953 }
    ]
  };

  test('AAPL 5-year P/E and Price/FCF are calculated from the fixture fields', () => {
    const marketCap = aaplFixture.current_price * aaplFixture.shares_outstanding;
    const annualPEs = [
      { year: 2025, pe: 34.3 },
      { year: 2024, pe: 37.8 },
      { year: 2023, pe: 30.7 },
      { year: 2022, pe: 21.3 },
      { year: 2021, pe: 30.1 }
    ];
    const fcfPeriods = aaplFixture.annual.map(({ freeCashFlow }) => freeCashFlow);
    const avgFCF = fcfPeriods.reduce((sum, fcf) => sum + fcf, 0) / fcfPeriods.length;

    const pillar1 = EightPillarsService.calculatePillar1(annualPEs);
    const pillar8 = EightPillarsService.calculatePillar8(marketCap, fcfPeriods);

    expect(pillar1.value).toBeCloseTo(30.84, 2);
    expect(pillar1.data.annualPEs).toHaveLength(5);
    expect(pillar8.value).toBeCloseTo(marketCap / avgFCF, 2);
    expect(pillar8.data.periodsAnalyzed).toBe(5);
  });
});
