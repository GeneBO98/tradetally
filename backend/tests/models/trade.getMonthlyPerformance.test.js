// Whole-trade win rate (issue #339): getMonthlyPerformance must count
// positions instead of legs when analytics_position_grouping is enabled,
// while the per-leg SQL stays unchanged when it is off.

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/positionGrouping', () => {
  const actual = jest.requireActual('../../src/utils/positionGrouping');
  return {
    ...actual,
    isPositionGroupingEnabled: jest.fn()
  };
});
jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn().mockResolvedValue({
    breakeven_tolerance_ticks: 0,
    breakeven_tolerance_ticks_by_underlying: {}
  })
}));

const db = require('../../src/config/database');
const positionGrouping = require('../../src/utils/positionGrouping');
const User = require('../../src/models/User');
const Trade = require('../../src/models/Trade');

function monthlyRow(month) {
  return {
    month,
    total_trades: '0',
    winning_trades: '0',
    losing_trades: '0',
    breakeven_trades: '0',
    total_pnl: '0',
    avg_pnl: '0',
    avg_win: '0',
    avg_loss: '0',
    best_trade: '0',
    worst_trade: '0',
    avg_r_value: '0',
    total_r_value: '0',
    symbols_traded: '0',
    trading_days: '0',
    win_rate: '0',
    win_rate_excluding_breakeven: '0',
    month_name: 'January  '
  };
}

describe('Trade.getMonthlyPerformance position grouping', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [monthlyRow(1)] });
    positionGrouping.isPositionGroupingEnabled.mockReset();
    User.getSettings.mockReset();
    User.getSettings.mockResolvedValue({
      breakeven_tolerance_mode: 'ticks',
      breakeven_tolerance_ticks: 0,
      breakeven_tolerance_ticks_by_underlying: {}
    });
  });

  test('grouping off: aggregates per leg directly from trades', async () => {
    positionGrouping.isPositionGroupingEnabled.mockResolvedValue(false);

    await Trade.getMonthlyPerformance('user-1', 2026);

    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual(['user-1', 2026]);
    expect(sql).not.toContain('position_trades');
    expect(sql).not.toContain('COALESCE(position_group_id::text');
    expect(sql).toContain('FROM trades');
    expect(sql).toContain('r_value IS NOT NULL AND stop_loss IS NOT NULL');
  });

  test('grouping on: aggregates positions via position_trades CTE', async () => {
    positionGrouping.isPositionGroupingEnabled.mockResolvedValue(true);

    await Trade.getMonthlyPerformance('user-1', 2026, ['ACC1'], { tags: ['spread'] });

    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual(['user-1', 2026, 'ACC1', ['spread']]);
    expect(sql).toContain('position_trades AS (');
    expect(sql).toContain('GROUP BY COALESCE(position_group_id::text');
    expect(sql).toContain('FROM position_trades');
    // Grouped positions use net-P&L breakeven and the position-level r-value gate.
    expect(sql).toContain('ROUND(pnl::numeric, 2)');
    expect(sql).toContain('r_value IS NOT NULL AND has_stop');
    // Filters still apply per leg inside the positions CTE.
    expect(sql).toContain('account_identifier IN ($3)');
    expect(sql).toContain('tags && $4');
  });

  test('grouping on: dollar tolerance classifies combined gross P&L', async () => {
    positionGrouping.isPositionGroupingEnabled.mockResolvedValue(true);
    User.getSettings.mockResolvedValue({
      breakeven_tolerance_mode: 'dollars',
      breakeven_tolerance_dollars: 20
    });

    await Trade.getMonthlyPerformance('user-1', 2026);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('as gross_pnl');
    expect(sql).toContain('ABS(gross_pnl) <= (20)');
  });
});
