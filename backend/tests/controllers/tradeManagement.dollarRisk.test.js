// Regression coverage for dollar-based default stops. A valid stored stop is
// trade-specific and must take precedence; the configured dollar amount is only
// a fallback when the current stop no longer defines positive risk.

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/tradeQueries', () => ({ _buildWhereClause: jest.fn() }));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/utils/breakeven', () => {
  const actual = jest.requireActual('../../src/utils/breakeven');
  return { ...actual, getBreakevenToleranceConfig: jest.fn() };
});
jest.mock('../../src/models/User', () => ({ getSettings: jest.fn() }));

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');
const AnalyticsCache = require('../../src/services/analyticsCache');
const { getBreakevenToleranceConfig } = require('../../src/utils/breakeven');
const User = require('../../src/models/User');
const controller = require('../../src/controllers/tradeManagement.controller');
const TargetHitAnalysisService = require('../../src/services/targetHitAnalysisService');
const calculationContracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

const DOLLAR_RISK = 500;

// Long stock, qty 100.
function row(id, { stop_loss, exit_price, pnl }) {
  return {
    id,
    symbol: 'AAA',
    trade_date: '2026-01-0' + id,
    entry_price: 100,
    exit_price,
    stop_loss,
    quantity: 100,
    side: 'long',
    pnl,
    take_profit: null,
    take_profit_targets: null,
    management_r: null,
    risk_level_history: null,
    manual_target_hit_first: null,
    executions: null,
    commission: 0,
    fees: 0,
    instrument_type: 'stock',
    contract_size: null,
    point_value: null,
    underlying_asset: null,
    is_breakeven: false
  };
}

describe('Trade Management dollar-risk defaults', () => {
  beforeEach(() => {
    db.query.mockReset();
    TradeQueries._buildWhereClause.mockReset();
    AnalyticsCache.invalidate.mockReset();
    getBreakevenToleranceConfig.mockReset();
    User.getSettings.mockReset();

    TradeQueries._buildWhereClause.mockResolvedValue({
      whereClause: 'WHERE t.user_id = $1',
      values: ['user-1'],
      paramCount: 2
    });
    getBreakevenToleranceConfig.mockResolvedValue({ default: 0, byUnderlying: {} });
    User.getSettings.mockResolvedValue({
      default_stop_loss_type: 'dollar',
      default_stop_loss_dollars: DOLLAR_RISK
    });
  });

  test('valid stops take precedence while an invalid trailed stop uses the dollar fallback', async () => {
    const rows = [
      row(1, { stop_loss: 95, exit_price: 110, pnl: 1000 }),   // proper stop: +2R
      row(2, { stop_loss: 102, exit_price: 115, pnl: 1500 }),  // stop trailed ABOVE entry: +3R
      row(3, { stop_loss: 99.5, exit_price: 80, pnl: -2000 })  // tight valid stop: -40R
    ];
    db.query.mockResolvedValue({ rows });

    const req = { user: { id: 'user-1' }, query: {} };
    const res = { json: jest.fn() };

    await controller.getRPerformance(req, res);

    const { chart_data, summary } = res.json.mock.calls[0][0];

    // The first stop calculates the same $500 risk as the default. The trailed
    // stop cannot define positive risk, so it falls back to $500. The tight,
    // valid stop is explicit and therefore defines a $50 risk amount.
    expect(chart_data).toHaveLength(3);
    expect(chart_data[0].actual_r).toBeCloseTo(2, 2);
    expect(chart_data[1].actual_r).toBeCloseTo(3, 2);
    expect(chart_data[2].actual_r).toBeCloseTo(-40, 2);

    expect(summary.total_actual_r).toBeCloseTo(-35, 2);
  });

  test('Management R uses a valid stored stop instead of the dollar default', async () => {
    // Long, entry 100, exit 110, qty 100, stop trailed to 98. SL hit first, no targets.
    const trade = {
      entry_price: 100,
      exit_price: 110,
      stop_loss: 98,
      quantity: 100,
      side: 'long',
      manual_target_hit_first: 'stop_loss',
      take_profit: null,
      take_profit_targets: null,
      executions: null,
      commission: 0,
      fees: 0,
      instrument_type: 'stock',
      contract_size: null,
      point_value: null,
      risk_level_history: null
    };

    // The valid $98 stop defines $2/share risk. actualR = 5, plannedR = -1,
    // and managementR = 6 even though a $500 default is configured.
    const dollarManagementR = TargetHitAnalysisService.calculateManagementR(trade, { dollarRisk: DOLLAR_RISK });
    expect(dollarManagementR).toBeCloseTo(6, 2);

    // The result matches the non-dollar path because both use the stored stop.
    const percentManagementR = TargetHitAnalysisService.calculateManagementR(trade);
    expect(percentManagementR).toBeCloseTo(6, 2);
  });

  test('Individual Trade Analysis calculates risk from an explicit stop', async () => {
    const fixture = calculationContracts.r_value.dollar_default_explicit_stop_example;
    User.getSettings.mockResolvedValue({
      default_stop_loss_type: 'dollar',
      default_stop_loss_dollars: fixture.default_stop_loss_dollars
    });
    const trade = {
      ...row(1, fixture.trade),
      ...fixture.trade
    };
    db.query
      .mockResolvedValueOnce({ rows: [trade] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: 'user-1' },
      params: { tradeId: trade.id },
      query: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await controller.getRMultipleAnalysis(req, res);

    expect(res.status).not.toHaveBeenCalled();
    const { analysis } = res.json.mock.calls[0][0];
    expect(analysis.risk_per_share).toBe(fixture.expected.risk_per_share);
    expect(analysis.risk_amount).toBe(fixture.expected.risk_amount);
    expect(analysis.risk_basis).toBe(fixture.expected.risk_basis);
    expect(analysis.actual_r).toBe(fixture.expected.actual_r);
    expect(analysis.target_r).toBe(fixture.expected.target_r);
  });

  test('level updates persist stop-derived R and invalidate dashboard analytics', async () => {
    const trade = row(1, { stop_loss: 95, exit_price: 110, pnl: 1000 });
    db.query
      .mockResolvedValueOnce({ rows: [trade] })
      .mockResolvedValueOnce({ rows: [{ ...trade, stop_loss: 99 }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: 'user-1' },
      params: { tradeId: trade.id },
      body: { stop_loss: 99 }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await controller.updateTradeLevels(req, res);

    const [, derivedValues] = db.query.mock.calls[2];
    expect(derivedValues).toEqual([10, null, trade.id, 'user-1']);
    expect(derivedValues[0]).not.toBe(2); // $500 default would produce 2R.
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');
    expect(res.json.mock.calls[0][0].trade.r_value).toBe(10);
  });

  test('removing a stop clears stale R fields and invalidates analytics', async () => {
    const trade = {
      ...row(1, { stop_loss: 95, exit_price: 110, pnl: 1000 }),
      r_value: 2,
      management_r: 3
    };
    db.query
      .mockResolvedValueOnce({ rows: [trade] })
      .mockResolvedValueOnce({ rows: [{ ...trade, stop_loss: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: 'user-1' },
      params: { tradeId: trade.id },
      body: { stop_loss: null }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await controller.updateTradeLevels(req, res);

    const [, derivedValues] = db.query.mock.calls[2];
    expect(derivedValues).toEqual([null, null, trade.id, 'user-1']);
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith('user-1');
    expect(res.json.mock.calls[0][0].trade).toEqual(expect.objectContaining({
      r_value: null,
      management_r: null
    }));
  });
});
