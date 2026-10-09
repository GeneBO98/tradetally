jest.mock('../../src/models/User', () => ({ getSettings: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  getDailyCrossRate: jest.fn(),
  getForexRate: jest.fn(),
  getRateMap: jest.fn(),
  refreshCurrentRates: jest.fn()
}));

const User = require('../../src/models/User');
const currencyConverter = require('../../src/utils/currencyConverter');
const { convertForDisplay, scaleMoneyInPayload } = require('../../src/utils/displayCurrency');
const { tradeBaseCurrency } = require('../../src/utils/tradeFx');
const EightPillarsService = require('../../src/services/eightPillarsService');

function reqFor(userId) {
  return { user: { id: userId } };
}

describe('native-currency trade handling (issue 1)', () => {
  test('USD rate outage still resolves and labels each native row and its executions', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    currencyConverter.getDailyCrossRate.mockImplementation(async (from) => {
      if (from === 'GBP') return 1.2;
      throw new Error('FX unavailable');
    });
    const payload = { trades: ['EUR', 'USD', 'GBP', 'TRY'].map(original_currency => ({
      original_currency, entry_price: 100, executions: [{ price: 100 }]
    })) };
    const out = await convertForDisplay(reqFor('u1'), payload, { rowCurrency: true });
    expect(out.trades.map(row => row.effective_currency)).toEqual(['EUR', 'USD', 'EUR', 'TRY']);
    expect(out.trades.map(row => row.entry_price)).toEqual([100, 100, 120, 100]);
    expect(out.trades.map(row => row.executions[0].price)).toEqual([100, 100, 120, 100]);
    expect(payload.trades.every(row => row.entry_price === 100 && !row.effective_currency)).toBe(true);
  });
  test('tradeBaseCurrency distinguishes converted-USD from stored-native rows', () => {
    expect(tradeBaseCurrency({ original_currency: 'EUR', original_entry_price_currency: '92.6', pnl: 5 }))
      .toBe('USD'); // conversion rewrote the columns: marker present
    expect(tradeBaseCurrency({ original_currency: 'EUR', original_pnl_currency: '87.0', pnl: 5 }))
      .toBe('USD');
    expect(tradeBaseCurrency({ original_currency: 'EUR', exchange_rate: '1.080000', pnl: '100.00' }))
      .toBe('EUR'); // a rate beside unconverted columns does NOT mean converted
    expect(tradeBaseCurrency({ original_currency: 'EUR', exchange_rate: null, pnl: '100.00' }))
      .toBe('EUR');
    expect(tradeBaseCurrency({ original_currency: 'USD', exchange_rate: '1.000000' })).toBe('USD');
    expect(tradeBaseCurrency({})).toBe('USD');
  });

  test('convertForDisplay(rowCurrency) scales a native EUR trade by EUR->display, not USD->display', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    currencyConverter.getDailyCrossRate.mockImplementation(async (from, to) => {
      if (from === 'USD' && to === 'EUR') return 0.8;
      if (from === 'EUR' && to === 'EUR') return 1;
      throw new Error('no rate');
    });

    const payload = {
      trades: [
        { id: 'a', symbol: 'SAP', original_currency: 'EUR', exchange_rate: null, pnl: '100.000000', entry_price: '90.000000', quantity: '10.0000' },
        { id: 'b', symbol: 'AAPL', original_currency: 'USD', exchange_rate: null, pnl: '50.000000', entry_price: '200.000000', quantity: '5.0000' }
      ]
    };
    const out = await convertForDisplay(reqFor('u1'), payload, { clone: false, rowCurrency: true });

    // native EUR trade for a EUR user stays EUR: 100 -> 100 (NOT 80)
    expect(out.trades[0].pnl).toBe('100.000000');
    expect(out.trades[0].entry_price).toBe('90.000000');
    // USD trade converts: 50 -> 40
    expect(out.trades[0].quantity).toBe('10.0000');
    expect(out.trades[1].pnl).toBe('40.000000');
    expect(out.display_currency).toBe('EUR');
  });

  test('native row scales to a third currency with its own rate', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'GBP' });
    currencyConverter.getDailyCrossRate.mockImplementation(async (from) => {
      const map = { USD: 0.79, EUR: 0.86, GBP: 1 };
      return map[from] ?? (() => { throw new Error('none'); })();
    });

    const out = await convertForDisplay(reqFor('u1'), {
      trades: [{ original_currency: 'EUR', exchange_rate: null, pnl: 100 }]
    }, { clone: false, rowCurrency: true });
    expect(out.trades[0].pnl).toBeCloseTo(86);
  });

  test('row without a rate stays unconverted and keeps its currency label', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    currencyConverter.getDailyCrossRate.mockImplementation(async (from) => {
      if (from === 'USD') return 0.8;
      throw new Error('no rate');
    });
    const out = await convertForDisplay(reqFor('u1'), {
      trades: [{ original_currency: 'TRY', exchange_rate: null, currency: 'TRY', pnl: 100 }]
    }, { clone: false, rowCurrency: true });
    expect(out.trades[0].pnl).toBe(100);
    expect(out.trades[0].currency).toBe('TRY');
    // per-row effective label survives the response-level display_currency
    expect(out.trades[0].effective_currency).toBe('TRY');
    expect(out.display_currency).toBe('EUR');
  });

  test('executions nested under a row inherit the row rate (issue 1)', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'GBP' });
    currencyConverter.getDailyCrossRate.mockImplementation(async (from) => {
      if (from === 'EUR') return 0.85;
      if (from === 'USD') return 0.79;
      throw new Error('none');
    });
    const out = await convertForDisplay(reqFor('u1'), {
      trades: [{
        original_currency: 'EUR',
        exchange_rate: null,
        pnl: '100.000000',
        quantity: '10.0000',
        executions: [
          { price: '50.000000', commission: '2.000000', quantity: '5.0000' },
          { price: '40.000000', pnl: '-10.000000' }
        ]
      }]
    }, { clone: false, rowCurrency: true });
    const row = out.trades[0];
    expect(row.pnl).toBe('85.000000'); // EUR -> GBP at 0.85
    expect(row.executions[0].price).toBe('42.500000'); // same rate, not USD->GBP
    expect(row.executions[0].commission).toBe('1.700000');
    expect(row.executions[1].pnl).toBe('-8.500000');
    expect(row.executions[0].quantity).toBe('5.0000'); // counts untouched
    expect(row.effective_currency).toBe('GBP');
  });
});

describe('payload walker extras', () => {
  test('point_value contract multipliers never scale; prices do', () => {
    const payload = {
      candles: [{ open: 10, close: 10.5, volume: 500 }],
      trade: { entry_price: '100.000000', exit_price: '150.000000', point_value: '10.0000', quantity: '2.0000' }
    };
    scaleMoneyInPayload(payload, 0.8);
    expect(payload.trade.entry_price).toBe('80.000000');
    expect(payload.trade.exit_price).toBe('120.000000');
    // a $50 move scales to 40 via the PRICES only - never via point_value too
    expect(payload.trade.point_value).toBe('10.0000');
    expect(payload.trade.quantity).toBe('2.0000');
  });

  test('primitive money arrays scale; count/R arrays do not', () => {
    const payload = {
      performance: {
        prices: [100, 110, 120],
        positionSizes: [5000, 8000],
        tradeCounts: [3, 4],
        rValues: [0.5, 1.2],
        holdDays: [1, 2]
      }
    };
    scaleMoneyInPayload(payload, 0.5);
    expect(payload.performance.prices).toEqual([50, 55, 60]);
    // positionSizes ends in 'sizes' -> not a money name -> untouched unless
    // endpoints opt in via an explicit money key; documents current behavior
    expect(payload.performance.rValues).toEqual([0.5, 1.2]);
    expect(payload.performance.tradeCounts).toEqual([3, 4]);
    expect(payload.performance.holdDays).toEqual([1, 2]);
  });

  test('chart trade relabels currency when converted (issue 6)', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    currencyConverter.getDailyCrossRate.mockResolvedValue(0.8);
    const chartData = {
      candles: [{ close: 412.6 }],
      trade: { entryPrice: '13.850000', exitPrice: null, pnl: null, currency: 'USD', original_currency: 'USD', quantity: '2.0000', point_value: null }
    };
    const out = await convertForDisplay(reqFor('u1'), chartData, { rowCurrency: true });
    expect(out.candles[0].close).toBeCloseTo(330.08);
    expect(out.trade.currency).toBe('EUR');
    expect(out.trade.entryPrice).toBe('11.080000');
  });

  test('clone mode keeps the cached source payload pristine and idempotent (issue 2)', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    currencyConverter.getDailyCrossRate.mockResolvedValue(0.8);
    const cachedMetric = { avg_win: 100, pe_ratio: 20 };

    const first = await convertForDisplay(reqFor('u1'), { metrics: cachedMetric });
    const second = await convertForDisplay(reqFor('u1'), { metrics: cachedMetric });
    const third = await convertForDisplay({ user: { id: 'u2' } }, { metrics: cachedMetric });

    expect(first.metrics.avg_win).toBe(80);
    expect(second.metrics.avg_win).toBe(80);
    expect(third.metrics.avg_win).toBe(80);
    expect(cachedMetric.avg_win).toBe(100); // never mutated
    expect(first.metrics.pe_ratio).toBe(20);
  });
});

describe('chart money arrays (issue 5)', () => {
  test('moneyArrayKeys scales dollar series while count/R arrays stay', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    currencyConverter.getDailyCrossRate.mockResolvedValue(0.8);
    const payload = {
      performanceByVolume: [100, -50],       // dollar P&L under a 'volume' name
      performanceByVolumeCounts: [4, 2],      // trade counts
      performanceByVolumeR: [1.5, -0.5],      // R multiples
      performanceByPrice: [80, 20]            // money-named: matches heuristics too
    };
    const out = await convertForDisplay(reqFor('u1'), payload, {
      moneyArrayKeys: new Set(['performanceByVolume', 'performanceByPrice'])
    });
    expect(out.performanceByVolume).toEqual([80, -40]);
    expect(out.performanceByVolumeCounts).toEqual([4, 2]);
    expect(out.performanceByVolumeR).toEqual([1.5, -0.5]);
    expect(out.performanceByPrice).toEqual([64, 16]);
  });
});

describe('cached eight-pillars analysis currency round trip (issue 3)', () => {
  test('rowToAnalysis restores reporting/trading currency', () => {
    const row = {
      symbol: 'SAP', analysis_date: new Date(), market_cap: '1e10', current_price: '100',
      shares_outstanding: 1e9, pillars_passed: 5,
      company_name: 'SAP SE', industry: 'Software', logo: null,
      reporting_currency: 'EUR', trading_currency: 'USD',
      pillar1_value: 20, pillar1_threshold: 22.5, pillar1_passed: true, pillar1_data: { calculationVersion: EightPillarsService.CALCULATION_VERSION, annualPEs: [], periodsAnalyzed: 0 },
      pillar2_value: 10, pillar2_passed: true, pillar2_data: { calculationVersion: EightPillarsService.CALCULATION_VERSION },
      pillar3_current_shares: 1, pillar3_prior_shares: 1, pillar3_change_percent: 0, pillar3_passed: true, pillar3_data: {},
      pillar4_fcf_current: 1, pillar4_fcf_prior: 1, pillar4_passed: true, pillar4_data: {},
      pillar5_income_current: 1, pillar5_income_prior: 1, pillar5_passed: true, pillar5_data: {},
      pillar6_revenue_current: 1, pillar6_revenue_prior: 1, pillar6_growth_percent: 0, pillar6_passed: true, pillar6_data: {},
      pillar7_lt_liabilities: 1, pillar7_avg_fcf: 1, pillar7_ratio: 1, pillar7_threshold: 5, pillar7_passed: true, pillar7_data: {},
      pillar8_value: 10, pillar8_threshold: 22.5, pillar8_passed: true, pillar8_data: { calculationVersion: EightPillarsService.CALCULATION_VERSION }
    };

    const analysis = EightPillarsService.rowToAnalysis(row);
    expect(analysis.reportingCurrency).toBe('EUR');
    expect(analysis.tradingCurrency).toBe('USD');
  });

  test('cached analyses carry the currency fields convertAnalysisForDisplay reads', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    currencyConverter.getDailyCrossRate.mockImplementation(async (from) => {
      if (from === 'USD') return 0.8;
      if (from === 'EUR') return 1;
      throw new Error('none');
    });
    const analysis = await EightPillarsService.rowToAnalysis({
      symbol: 'SAP', market_cap: '100', current_price: null, shares_outstanding: 1, pillars_passed: 0,
      company_name: null, industry: null, logo: null,
      reporting_currency: 'EUR', trading_currency: 'USD',
      pillar1_value: 10, pillar1_threshold: 22.5, pillar1_passed: true, pillar1_data: { annualPEs: [{ year: 2025, pe: 10, price: 100, eps: 10 }], calculationVersion: 8 },
      pillar2_value: 1, pillar2_passed: true, pillar2_data: { annualROICs: [{ operatingIncome: 1000, investedCapital: 5000 }] },
      pillar3_change_percent: 0, pillar3_passed: true, pillar3_data: {},
      pillar4_fcf_current: 100, pillar4_fcf_prior: 90, pillar4_passed: true, pillar4_data: { currentFCF: 100, priorFCF: 90 },
      pillar5_income_current: 1, pillar5_income_prior: 1, pillar5_passed: true, pillar5_data: {},
      pillar6_revenue_current: 2000, pillar6_revenue_prior: 1800, pillar6_growth_percent: 11, pillar6_passed: true, pillar6_data: { currentRevenue: 2000, priorRevenue: 1800 },
      pillar7_lt_liabilities: 100, pillar7_avg_fcf: 50, pillar7_ratio: 2, pillar7_threshold: 5, pillar7_passed: true, pillar7_data: { longTermDebt: 100, avgFCF: 50 },
      pillar8_value: 10, pillar8_threshold: 22.5, pillar8_passed: true, pillar8_data: { marketCap: 100, fiveYearFCF: 50, avgAnnualFCF: 10 }
    });

    // Fresh and cached analyses both expose the fields the display converter uses
    expect(analysis.reportingCurrency).toBe('EUR');
    expect(analysis.tradingCurrency).toBe('USD');
  });
});
