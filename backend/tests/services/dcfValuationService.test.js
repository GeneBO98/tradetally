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

  test('reversed Bear and Bull inputs are preserved and warned, not swapped', () => {
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
        expect.stringMatching(/P\/FCF multiples appear reversed/),
        expect.stringMatching(/Discount rates appear reversed/)
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
});
