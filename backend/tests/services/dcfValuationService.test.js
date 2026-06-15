const DCFValuationService = require('../../src/services/dcfValuationService');

describe('DCFValuationService calculation rules', () => {
  let logSpy;
  let warnSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const baseParams = {
    current_revenue: 1_000,
    current_net_income: 100,
    current_fcf: 120,
    shares_outstanding: 100,
    current_price: 10,
    calculated_discount_rate: 0.10,
    revenue_growth_low: 0.05,
    revenue_growth_medium: 0.05,
    revenue_growth_high: 0.05,
    profit_margin_low: null,
    profit_margin_medium: null,
    profit_margin_high: null,
    fcf_margin_low: null,
    fcf_margin_medium: null,
    fcf_margin_high: null,
    pe_low: 15,
    pe_medium: 15,
    pe_high: 15,
    pfcf_low: 15,
    pfcf_medium: 15,
    pfcf_high: 15,
    desired_return_low: 0.15,
    desired_return_medium: 0.12,
    desired_return_high: 0.10,
    projection_years: 5
  };

  test('higher discount rates lower fair value when other assumptions match', () => {
    const result = DCFValuationService.calculateDCF(baseParams);

    expect(result.fair_value_low).toBeLessThan(result.fair_value_medium);
    expect(result.fair_value_medium).toBeLessThan(result.fair_value_high);
  });

  test('current price return is an output based on projected future price', () => {
    const result = DCFValuationService.calculateDCF({
      ...baseParams,
      revenue_growth_low: 0.02,
      revenue_growth_medium: 0.05,
      revenue_growth_high: 0.10,
      pe_low: 12,
      pe_medium: 15,
      pe_high: 20,
      pfcf_low: 12,
      pfcf_medium: 15,
      pfcf_high: 20,
      desired_return_low: 0.12,
      desired_return_medium: 0.12,
      desired_return_high: 0.12
    });

    expect(result.future_price_low).toBeGreaterThan(0);
    expect(result.current_price_return_low).toBeGreaterThan(0);
    expect(result.current_price_return_medium).toBeGreaterThan(result.current_price_return_low);
    expect(result.current_price_return_high).toBeGreaterThan(result.current_price_return_medium);
  });

  test('historical ROIC uses average invested capital with accounts payable and reported tax rate', () => {
    const roic = DCFValuationService.calculateROIC([
      {
        fiscalYear: 2025,
        operatingIncome: 100,
        incomeBeforeTax: 80,
        incomeTaxExpense: 16,
        totalEquity: 50,
        totalDebt: 50,
        accountsPayable: 25
      },
      {
        fiscalYear: 2024,
        operatingIncome: 90,
        incomeBeforeTax: 70,
        incomeTaxExpense: 14,
        totalEquity: 70,
        totalDebt: 50,
        accountsPayable: 30
      }
    ], 1);

    expect(roic).toBeCloseTo(80 / 137.5, 5);
  });

  test('resolves shares outstanding from latest financials when profile shares are missing', () => {
    expect(DCFValuationService.resolveSharesOutstanding(null, {
      sharesOutstanding: 210_000_000,
      sharesBasic: 205_000_000,
      sharesDiluted: 215_000_000
    })).toBe(210_000_000);

    expect(DCFValuationService.resolveSharesOutstanding(null, {
      sharesBasic: 205_000_000,
      sharesDiluted: 215_000_000
    })).toBe(205_000_000);

    expect(DCFValuationService.resolveSharesOutstanding(220_000_000, {
      sharesOutstanding: 210_000_000
    })).toBe(220_000_000);
  });

  test('profit margin assumptions affect earnings-based fair value', () => {
    const lowMargin = DCFValuationService.calculateDCFTraditional({
      revenue: 1_000,
      netIncome: 100,
      fcf: null,
      revenueGrowth: 0.05,
      profitMargin: 0.10,
      fcfMargin: null,
      peMultiple: 15,
      pfcfMultiple: null,
      discountRate: 0.10,
      years: 5,
      shares: 100
    });

    const highMargin = DCFValuationService.calculateDCFTraditional({
      revenue: 1_000,
      netIncome: 100,
      fcf: null,
      revenueGrowth: 0.05,
      profitMargin: 0.20,
      fcfMargin: null,
      peMultiple: 15,
      pfcfMultiple: null,
      discountRate: 0.10,
      years: 5,
      shares: 100
    });

    expect(highMargin).toBeGreaterThan(lowMargin);
  });

  test('FCF margin assumptions affect FCF-based fair value', () => {
    const lowMargin = DCFValuationService.calculateDCFTraditional({
      revenue: 1_000,
      netIncome: null,
      fcf: 100,
      revenueGrowth: 0.05,
      profitMargin: null,
      fcfMargin: 0.10,
      peMultiple: null,
      pfcfMultiple: 15,
      discountRate: 0.10,
      years: 5,
      shares: 100
    });

    const highMargin = DCFValuationService.calculateDCFTraditional({
      revenue: 1_000,
      netIncome: null,
      fcf: 100,
      revenueGrowth: 0.05,
      profitMargin: null,
      fcfMargin: 0.20,
      peMultiple: null,
      pfcfMultiple: 15,
      discountRate: 0.10,
      years: 5,
      shares: 100
    });

    expect(highMargin).toBeGreaterThan(lowMargin);
  });

  test('reversed Bear and Bull operating assumptions are preserved and warned, not swapped', () => {
    const result = DCFValuationService.calculateDCF({
      ...baseParams,
      revenue_growth_low: 0.12,
      revenue_growth_high: 0.04,
      pe_low: 25,
      pe_high: 15,
      pfcf_low: 25,
      pfcf_high: 15,
      desired_return_low: 0.08,
      desired_return_high: 0.14
    });

    expect(result.inputs.revenue_growth_low).toBe(0.12);
    expect(result.inputs.revenue_growth_high).toBe(0.04);
    expect(result.inputs.pe_low).toBe(25);
    expect(result.inputs.pe_high).toBe(15);
    expect(result.inputs.pfcf_low).toBe(25);
    expect(result.inputs.pfcf_high).toBe(15);
    expect(result.inputs.desired_return_low).toBe(0.08);
    expect(result.inputs.desired_return_high).toBe(0.14);
    expect(result.inputs.inputs_were_corrected).toBe(false);
    expect(result.inputs.input_warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Growth rates appear reversed/),
        expect.stringMatching(/P\/E multiples appear reversed/),
        expect.stringMatching(/P\/FCF multiples appear reversed/)
      ])
    );
  });

  test('uses the same valid valuation method across scenarios when one scenario has negative earnings', () => {
    const result = DCFValuationService.calculateDCF({
      ...baseParams,
      revenue_growth_low: 0.20,
      revenue_growth_medium: 0.225,
      revenue_growth_high: 0.25,
      profit_margin_low: -0.05,
      profit_margin_medium: 0.05,
      profit_margin_high: 0.10,
      fcf_margin_low: 0.20,
      fcf_margin_medium: 0.30,
      fcf_margin_high: 0.40,
      pe_low: 20,
      pe_medium: 21,
      pe_high: 22,
      pfcf_low: 20,
      pfcf_medium: 21,
      pfcf_high: 22,
      desired_return_low: 0.10,
      desired_return_medium: 0.12,
      desired_return_high: 0.14
    });

    expect(result.fair_value_medium).toBeGreaterThan(result.fair_value_low);
    expect(result.fair_value_high).toBeGreaterThan(result.fair_value_medium);
    expect(result.inputs.input_warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Bear: P\/E method excluded/),
        expect.stringMatching(/same valid valuation methods/)
      ])
    );
  });

  test('one-method-only valuation works when earnings are unavailable', () => {
    const result = DCFValuationService.calculateDCFTraditional({
      revenue: 1_000,
      netIncome: null,
      fcf: 120,
      revenueGrowth: 0.05,
      profitMargin: null,
      fcfMargin: null,
      peMultiple: 15,
      pfcfMultiple: 15,
      discountRate: 0.10,
      years: 5,
      shares: 100
    });

    expect(result).toBeGreaterThan(0);
  });

  test('saved valuation mapping preserves zero and negative numeric inputs', () => {
    const valuation = DCFValuationService.rowToValuation({
      id: 'valuation-1',
      user_id: 'user-1',
      symbol: 'NOW',
      valuation_date: new Date('2026-05-13T00:00:00Z'),
      current_price: '87.0500',
      shares_outstanding: '1000000',
      profit_margin_low: '-0.0500',
      profit_margin_medium: '0.0000',
      profit_margin_high: '0.1000',
      fcf_margin_low: '0.0000',
      revenue_growth_low: '0.0000',
      desired_return_low: '0.0000',
      desired_return_medium: '0.1200',
      desired_return_high: '0.1000',
      fair_value_low: '0.0000',
      fair_value_medium: '153.3200',
      fair_value_high: '232.1100'
    });

    expect(valuation.profit_margin_low).toBe(-0.05);
    expect(valuation.profit_margin_medium).toBe(0);
    expect(valuation.fcf_margin_low).toBe(0);
    expect(valuation.revenue_growth_low).toBe(0);
    expect(valuation.desired_return_low).toBe(0);
    expect(valuation.fair_value_low).toBe(0);
  });

  test('forward EPS uses the first estimated year after the latest reported actuals', () => {
    const estimates = [
      { date: '2024-12-31', epsAvg: 6.00 }, // already reported (== latest fiscal year)
      { date: '2025-12-31', epsAvg: 7.20 }, // first forward year
      { date: '2026-12-31', epsAvg: 8.50 }
    ];

    expect(DCFValuationService.resolveForwardEps(estimates, 2024)).toBe(7.20);
  });

  test('forward EPS ignores past/zero estimates and returns null when none are forward', () => {
    const estimates = [
      { date: '2023-12-31', epsAvg: 5.00 },
      { date: '2024-12-31', epsAvg: 0 } // non-positive estimate is skipped
    ];

    expect(DCFValuationService.resolveForwardEps(estimates, 2024)).toBeNull();
    expect(DCFValuationService.resolveForwardEps(null, 2024)).toBeNull();
    expect(DCFValuationService.resolveForwardEps([], 2024)).toBeNull();
  });

  test('forward EPS growth is the CAGR from latest actual EPS to the 3-year-out estimate', () => {
    const latestFinancial = { netIncome: 1000, sharesOutstanding: 100 }; // base EPS = 10
    const estimates = [
      { date: '2024-12-31', epsAvg: 10.0 }, // reported year, ignored
      { date: '2025-12-31', epsAvg: 11.5 },
      { date: '2026-12-31', epsAvg: 12.7 },
      { date: '2027-12-31', epsAvg: 14.0 } // 3 years out: CAGR = (14/10)^(1/3)-1
    ];

    const growth = DCFValuationService.resolveForwardEpsGrowth(estimates, 2024, latestFinancial);
    expect(growth).toBeCloseTo(Math.pow(14 / 10, 1 / 3) - 1, 6);
  });

  test('forward EPS growth returns null without estimates or a positive base EPS', () => {
    const estimates = [{ date: '2027-12-31', epsAvg: 14.0 }];
    expect(DCFValuationService.resolveForwardEpsGrowth(estimates, 2024, { netIncome: -50, sharesOutstanding: 100 })).toBeNull();
    expect(DCFValuationService.resolveForwardEpsGrowth(null, 2024, { netIncome: 1000, sharesOutstanding: 100 })).toBeNull();
    expect(DCFValuationService.resolveForwardEpsGrowth(estimates, 2024, null)).toBeNull();
  });
});
