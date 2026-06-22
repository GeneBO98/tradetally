// Regression test for issue #351: the R-Multiple Performance "Win Rate" card
// must classify break-even trades with the SAME tolerance-aware predicate the
// dashboard analytics use. A small win whose gross P&L is inside the user's
// break-even tolerance is break-even on the dashboard; it must be break-even
// here too, not a +R win. Otherwise the W/L/BE split disagrees with the
// dashboard for the same filtered trades.

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/tradeQueries', () => ({
  _buildWhereClause: jest.fn()
}));
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

// All trades are long, qty 10, stop 95 -> risk 5/share, so actual_r = (exit-100)/5.
// is_breakeven is the boolean the SQL predicate would have produced for each row.
function row(id, exitPrice, pnl, isBreakeven) {
  return {
    id,
    symbol: 'AAA',
    trade_date: '2026-01-0' + id,
    entry_price: 100,
    exit_price: exitPrice,
    stop_loss: 95,
    quantity: 10,
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
    is_breakeven: isBreakeven
  };
}

describe('tradeManagementController.getRPerformance break-even classification (issue #351)', () => {
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
    User.getSettings.mockResolvedValue({ analytics_position_grouping: false });
  });

  test('a small win inside the BE tolerance is counted as break-even, not a win', async () => {
    const rows = [
      row(1, 110, 100, false),   // clear win (actual_r +2)
      row(2, 100.5, 5, true),    // small win, but gross P&L within BE tolerance -> BE
      row(3, 90, -100, false),   // clear loss (actual_r -2)
      row(4, 100, 0, true)       // exact break-even
    ];
    db.query.mockResolvedValue({ rows });

    const req = { user: { id: 'user-1' }, query: {} };
    const res = { json: jest.fn() };

    await controller.getRPerformance(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { summary } = res.json.mock.calls[0][0];

    expect(summary.total_trades).toBe(4);
    expect(summary.winning_trades).toBe(1); // only trade 1 (trade 2's small win is BE)
    expect(summary.losing_trades).toBe(1);  // only trade 3
    expect(summary.break_even_trades).toBe(2); // trades 2 and 4
    // W + L + BE reconciles with the total.
    expect(summary.winning_trades + summary.losing_trades + summary.break_even_trades)
      .toBe(summary.total_trades);
    // Win rate is wins / total (matches the dashboard headline definition).
    expect(summary.win_rate).toBe(25);
    // Win rate excluding break-even is wins / (wins + losses) = 1 / 2 = 50%.
    expect(summary.win_rate_excluding_breakeven).toBe(50);
    // avg_win_r excludes the break-even small win (only trade 1's +2R counts).
    expect(summary.avg_win_r).toBe(2);
  });

  test('the break-even predicate is computed in SQL as is_breakeven', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const req = { user: { id: 'user-1' }, query: {} };
    const res = { json: jest.fn() };

    await controller.getRPerformance(req, res);

    const [query] = db.query.mock.calls[0];
    expect(query).toContain('AS is_breakeven');
    // Uses gross P&L (net + commissions + fees), matching the dashboard.
    expect(query).toContain('COALESCE(pnl, 0) + COALESCE(commission, 0) + COALESCE(fees, 0)');
  });

  test('actual R uses net P&L divided by risk, not price-only entry/exit movement', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          ...row(1, 99, 60, false),
          stop_loss: 90,
          quantity: 1
        }
      ]
    });

    const req = { user: { id: 'user-1' }, query: {} };
    const res = { json: jest.fn() };

    await controller.getRPerformance(req, res);

    const { chart_data, summary } = res.json.mock.calls[0][0];
    expect(chart_data[0].actual_r).toBe(6);
    expect(summary.total_actual_r).toBe(6);
    expect(summary.winning_trades).toBe(1);
  });

  test('whole-trade grouping collapses multi-leg positions before win rate and R summaries', async () => {
    User.getSettings.mockResolvedValue({ analytics_position_grouping: true });
    db.query.mockResolvedValue({
      rows: [
        {
          ...row(1, 110, 100, false),
          symbol: 'SNOW260116P00400000',
          underlying_symbol: 'SNOW',
          position_group_key: 'spread-1',
          position_symbol: 'SNOW'
        },
        {
          ...row(2, 90, -50, false),
          symbol: 'SNOW260116P00395000',
          underlying_symbol: 'SNOW',
          position_group_key: 'spread-1',
          position_symbol: 'SNOW'
        }
      ]
    });

    const req = { user: { id: 'user-1' }, query: {} };
    const res = { json: jest.fn() };

    await controller.getRPerformance(req, res);

    const { chart_data, summary } = res.json.mock.calls[0][0];

    expect(chart_data).toHaveLength(1);
    expect(chart_data[0].symbol).toBe('SNOW');
    expect(chart_data[0].position_grouped).toBe(true);
    expect(chart_data[0].leg_count).toBe(2);
    expect(chart_data[0].actual_r).toBe(1);

    expect(summary.position_grouping).toBe(true);
    expect(summary.total_trades).toBe(1);
    expect(summary.winning_trades).toBe(1);
    expect(summary.losing_trades).toBe(0);
    expect(summary.win_rate).toBe(100);
    expect(summary.total_actual_r).toBe(1);
    expect(summary.avg_win_r).toBe(1);
  });
});
