// Regression tests for issue #345: for users with a dollar-based default stop
// loss, R's risk unit is the fixed dollar amount, not the stored stop distance.
// Trade Management (calculateRMultiples via getRPerformance) and Management R
// must reconcile to net P&L / dollar risk, matching the dashboard aggregate.

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/tradeQueries', () => ({ _buildWhereClause: jest.fn() }));
jest.mock('../../src/utils/breakeven', () => {
  const actual = jest.requireActual('../../src/utils/breakeven');
  return { ...actual, getBreakevenToleranceConfig: jest.fn() };
});
jest.mock('../../src/models/User', () => ({ getSettings: jest.fn() }));

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');
const { getBreakevenToleranceConfig } = require('../../src/utils/breakeven');
const User = require('../../src/models/User');
const controller = require('../../src/controllers/tradeManagement.controller');
const TargetHitAnalysisService = require('../../src/services/targetHitAnalysisService');

const DOLLAR_RISK = 500;

// Long stock, qty 100. With a $500 dollar risk, actual_r = pnl / 500 regardless
// of where the stored stop sits.
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

describe('Trade Management dollar-risk R (#345)', () => {
  beforeEach(() => {
    db.query.mockReset();
    TradeQueries._buildWhereClause.mockReset();
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

  test('R-Performance cumulative Actual R reconciles to net P&L / dollar risk', async () => {
    const rows = [
      row(1, { stop_loss: 95, exit_price: 110, pnl: 1000 }),   // proper stop: +2R
      row(2, { stop_loss: 102, exit_price: 115, pnl: 1500 }),  // stop trailed ABOVE entry: +3R
      row(3, { stop_loss: 99.5, exit_price: 80, pnl: -2000 })  // tight stop: -4R
    ];
    db.query.mockResolvedValue({ rows });

    const req = { user: { id: 'user-1' }, query: {} };
    const res = { json: jest.fn() };

    await controller.getRPerformance(req, res);

    const { chart_data, summary } = res.json.mock.calls[0][0];

    // The trailed-stop winner is INCLUDED (price-based risk would have been <= 0
    // and dropped it); each trade's R is pnl / 500.
    expect(chart_data).toHaveLength(3);
    expect(chart_data[0].actual_r).toBeCloseTo(2, 2);
    expect(chart_data[1].actual_r).toBeCloseTo(3, 2);
    expect(chart_data[2].actual_r).toBeCloseTo(-4, 2);

    // Net P&L = +500, so total R = 500/500 = +1, positive.
    expect(summary.total_actual_r).toBeCloseTo(500 / DOLLAR_RISK, 2);
    expect(summary.total_actual_r).toBeGreaterThan(0);
  });

  test('Management R uses the fixed dollar risk unit, not the stored stop distance', async () => {
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

    // Dollar mode: risk unit = 500/(100*1) = $5/share. actualR = (110-100)/5 = 2,
    // plannedR = -1 (full stop out), managementR = 2 - (-1) = 3.
    const dollarManagementR = TargetHitAnalysisService.calculateManagementR(trade, { dollarRisk: DOLLAR_RISK });
    expect(dollarManagementR).toBeCloseTo(3, 2);

    // Percent mode (no options): risk = entry - stop = 2. actualR = 10/2 = 5,
    // plannedR = -1, managementR = 6. Confirms the dollar branch is what changed
    // and the default path is untouched.
    const percentManagementR = TargetHitAnalysisService.calculateManagementR(trade);
    expect(percentManagementR).toBeCloseTo(6, 2);
  });
});
