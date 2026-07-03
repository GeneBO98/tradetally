// Issue #359 follow-up: Individual Trade Analysis must honor whole-trade
// grouping. When analytics_position_grouping is enabled, selecting any leg of
// a multi-leg position returns ONE combined analysis (dollar-weighted combined
// R values, summed dollar amounts, per-leg breakdown attached), and the trade
// selector lists one row per position instead of one row per leg. Combined R
// = sum(leg R x leg risk) / total risk, so its sign always matches the
// combined P&L — summing raw leg Rs let a small-risk hedge leg flip a losing
// spread to a positive R.

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
const User = require('../../src/models/User');
const controller = require('../../src/controllers/tradeManagement.controller');

// Long option legs, qty 1, contract_size 100. actual_r derives from
// pnl / risk_amount where risk_amount = (entry - stop) * qty * 100.
function leg(id, overrides = {}) {
  return {
    id,
    user_id: 'user-1',
    symbol: 'SNOW260116P00400000',
    underlying_symbol: 'SNOW',
    position_symbol: 'SNOW',
    position_group_key: 'spread-1',
    trade_date: '2026-01-05',
    entry_time: '2026-01-05T14:30:00Z',
    exit_time: '2026-01-06T15:00:00Z',
    entry_price: 5,
    exit_price: 7,
    stop_loss: 4,
    take_profit: null,
    take_profit_targets: null,
    quantity: 1,
    side: 'long',
    pnl: 200,
    pnl_percent: 40,
    commission: 0,
    fees: 0,
    instrument_type: 'option',
    contract_size: 100,
    point_value: null,
    underlying_asset: null,
    management_r: null,
    risk_level_history: null,
    manual_target_hit_first: null,
    target_hit_analysis: null,
    executions: null,
    ...overrides
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('tradeManagementController grouped individual analysis (issue #359 follow-up)', () => {
  beforeEach(() => {
    db.query.mockReset();
    TradeQueries._buildWhereClause.mockReset();
    User.getSettings.mockReset();

    TradeQueries._buildWhereClause.mockResolvedValue({
      whereClause: 'WHERE t.user_id = $1',
      values: ['user-1'],
      paramCount: 2
    });
    User.getSettings.mockResolvedValue({ analytics_position_grouping: true });
  });

  test('getRMultipleAnalysis combines the legs of a grouped position', async () => {
    // Leg 1: risk (5-4)*1*100 = 100, pnl 200 -> actual_r 2
    // Leg 2: risk (3-2)*1*100 = 100, pnl -50 -> actual_r -0.5
    // Combined: (200 - 50) / (100 + 100) total risk = 0.75R
    const legA = leg('leg-1');
    const legB = leg('leg-2', {
      symbol: 'SNOW260116P00395000',
      entry_price: 3,
      exit_price: 2.5,
      stop_loss: 2,
      pnl: -50,
      entry_time: '2026-01-05T14:31:00Z'
    });

    db.query
      .mockResolvedValueOnce({ rows: [legA] })              // trade by id (with group key)
      .mockResolvedValueOnce({ rows: [legA, legB] })        // group legs
      .mockResolvedValueOnce({ rows: [] });                 // charts

    const req = { user: { id: 'user-1' }, params: { tradeId: 'leg-1' } };
    const res = mockRes();

    await controller.getRMultipleAnalysis(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { trade, analysis } = res.json.mock.calls[0][0];

    // Response is keyed by the representative (first analyzable) leg.
    expect(trade.id).toBe('leg-1');
    expect(analysis.position_grouped).toBe(true);
    expect(analysis.leg_count).toBe(2);
    expect(analysis.analyzed_leg_count).toBe(2);
    expect(analysis.actual_r).toBe(0.75);             // (200 - 50) / 200 total risk
    expect(analysis.actual_pl_amount).toBe(150);      // 200 + (-50)
    expect(analysis.risk_amount).toBe(200);           // 100 + 100
    expect(analysis.target_r).toBeNull();             // no leg has a target
    expect(analysis.management_score).toBeTruthy();

    expect(trade.position_grouped).toBe(true);
    expect(trade.symbol).toBe('SNOW');
    expect(trade.pnl).toBe(150);
    expect(trade.leg_count).toBe(2);
    expect(trade.legs).toHaveLength(2);
    expect(trade.legs[0].actual_r).toBe(2);
    expect(trade.legs[1].actual_r).toBe(-0.5);
    // Synthesized position must not trigger frontend per-trade recalculation.
    expect(trade.take_profit).toBeNull();
    expect(trade.take_profit_targets).toBeNull();
  });

  test('a net-losing spread reports a negative combined Actual R even when a small-risk hedge leg has a large positive leg R', async () => {
    // Regression for the CEG bull put spread report (issue #359 follow-up):
    // the panel showed "+0.30R" and an early-exit-with-profit insight next to a
    // combined net loss because per-leg Rs were summed with unequal risk
    // denominators.
    // Short put (main leg): risk (3.5-1.5)*1*100 = 200, pnl -150 -> actual_r -0.75
    // Long put (hedge): risk (0.5-0.4)*1*100 = 10, pnl +60 -> actual_r 6
    // Raw sum would be +5.25R on a -$90 position; dollar-weighted combined
    // R = (-150 + 60) / (200 + 10) = -0.43R, matching the loss.
    const legA = leg('leg-1', {
      side: 'short',
      entry_price: 1.5,
      exit_price: 3,
      stop_loss: 3.5,
      pnl: -150
    });
    const legB = leg('leg-2', {
      symbol: 'SNOW260116P00395000',
      side: 'long',
      entry_price: 0.5,
      exit_price: 1.1,
      stop_loss: 0.4,
      pnl: 60,
      entry_time: '2026-01-05T14:31:00Z'
    });

    db.query
      .mockResolvedValueOnce({ rows: [legA] })
      .mockResolvedValueOnce({ rows: [legA, legB] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { user: { id: 'user-1' }, params: { tradeId: 'leg-1' } };
    const res = mockRes();

    await controller.getRMultipleAnalysis(req, res);

    const { trade, analysis } = res.json.mock.calls[0][0];
    expect(trade.legs.find(l => l.id === 'leg-1').actual_r).toBe(-0.75);
    expect(trade.legs.find(l => l.id === 'leg-2').actual_r).toBe(6);
    expect(analysis.actual_pl_amount).toBe(-90);
    expect(analysis.risk_amount).toBe(210);
    expect(analysis.actual_r).toBe(-0.43);
    // The insight must describe a loss, not a profitable early exit.
    expect(['loss', 'significant_loss', 'stopped_out']).toContain(analysis.management_score.score);
  });

  test('legs without a stop loss are listed but excluded from the combined R math', async () => {
    const legA = leg('leg-1');
    const legB = leg('leg-2', { stop_loss: null, pnl: -50 });

    db.query
      .mockResolvedValueOnce({ rows: [legA] })
      .mockResolvedValueOnce({ rows: [legA, legB] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { user: { id: 'user-1' }, params: { tradeId: 'leg-1' } };
    const res = mockRes();

    await controller.getRMultipleAnalysis(req, res);

    const { trade, analysis } = res.json.mock.calls[0][0];
    expect(analysis.actual_r).toBe(2);                // only leg-1 analyzed
    expect(analysis.analyzed_leg_count).toBe(1);
    expect(analysis.leg_count).toBe(2);
    // Total position P&L still reflects every leg.
    expect(trade.pnl).toBe(150);
    const excluded = trade.legs.find(l => l.id === 'leg-2');
    expect(excluded.included_in_analysis).toBe(false);
    expect(excluded.excluded_reason).toBe('missing_stop_loss');
  });

  test('single-leg positions keep the existing per-trade analysis shape', async () => {
    const legA = leg('leg-1');

    db.query
      .mockResolvedValueOnce({ rows: [legA] })          // trade by id
      .mockResolvedValueOnce({ rows: [legA] })          // group resolves to one leg
      .mockResolvedValueOnce({ rows: [] });             // charts (single-trade path)

    const req = { user: { id: 'user-1' }, params: { tradeId: 'leg-1' } };
    const res = mockRes();

    await controller.getRMultipleAnalysis(req, res);

    const { trade, analysis } = res.json.mock.calls[0][0];
    expect(analysis.position_grouped).toBeUndefined();
    expect(trade.position_grouped).toBeUndefined();
    expect(trade.entry_price).toBe(5);
    expect(analysis.actual_r).toBe(2);
  });

  test('grouping disabled leaves the single-trade query untouched', async () => {
    User.getSettings.mockResolvedValue({ analytics_position_grouping: false });
    const legA = leg('leg-1');

    db.query
      .mockResolvedValueOnce({ rows: [legA] })
      .mockResolvedValueOnce({ rows: [] });             // charts

    const req = { user: { id: 'user-1' }, params: { tradeId: 'leg-1' } };
    const res = mockRes();

    await controller.getRMultipleAnalysis(req, res);

    const [tradeQuery] = db.query.mock.calls[0];
    expect(tradeQuery).not.toContain('position_group_key');
    expect(db.query).toHaveBeenCalledTimes(2);          // no legs query
    const { analysis } = res.json.mock.calls[0][0];
    expect(analysis.actual_r).toBe(2);
  });

  test('a grouped position whose legs all fail R calculation surfaces the real error, not needs_stop_loss', async () => {
    // Stop loss ABOVE entry on long legs -> calculateRMultiples errors.
    const legA = leg('leg-1', { stop_loss: 6 });
    const legB = leg('leg-2', { stop_loss: 6 });

    db.query
      .mockResolvedValueOnce({ rows: [legA] })
      .mockResolvedValueOnce({ rows: [legA, legB] });

    const req = { user: { id: 'user-1' }, params: { tradeId: 'leg-1' } };
    const res = mockRes();

    await controller.getRMultipleAnalysis(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.needs_stop_loss).toBeUndefined();
    expect(payload.error).toMatch(/Invalid stop loss position/);
    expect(payload.position_grouped).toBe(true);
  });

  test('grouped position open/close times use chronological order, not string order', async () => {
    // Date objects (what pg returns for timestamptz) whose toString() order
    // differs from chronological order: Fri Jan 09 < Mon Jan 05 as strings.
    const legA = leg('leg-1', {
      entry_time: new Date('2026-01-05T14:30:00Z'),
      exit_time: new Date('2026-01-08T15:00:00Z')
    });
    const legB = leg('leg-2', {
      entry_time: new Date('2026-01-09T14:30:00Z'),
      exit_time: new Date('2026-01-06T15:00:00Z')
    });

    db.query
      .mockResolvedValueOnce({ rows: [legA] })
      .mockResolvedValueOnce({ rows: [legA, legB] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { user: { id: 'user-1' }, params: { tradeId: 'leg-1' } };
    const res = mockRes();

    await controller.getRMultipleAnalysis(req, res);

    const { trade } = res.json.mock.calls[0][0];
    expect(new Date(trade.entry_time).toISOString()).toBe('2026-01-05T14:30:00.000Z');
    expect(new Date(trade.exit_time).toISOString()).toBe('2026-01-08T15:00:00.000Z');
  });

  test('getTradesForSelection returns one row per position when grouping is on', async () => {
    const groupedRow = {
      id: 'leg-1',
      symbol: 'SNOW',
      trade_date: '2026-01-05',
      entry_time: '2026-01-05T14:30:00Z',
      exit_time: '2026-01-06T15:00:00Z',
      entry_price: 5,
      exit_price: 7,
      quantity: 2,
      side: 'long',
      pnl: 150,
      pnl_percent: null,
      stop_loss: 4,
      take_profit: null,
      r_value: null,
      strategy: null,
      broker: 'test',
      instrument_type: 'option',
      manual_target_hit_first: null,
      target_hit_analysis: null,
      leg_count: 2,
      trade_ids: ['leg-1', 'leg-2'],
      has_any_stop_loss: true,
      has_missing_stop_loss: false,
      has_missing_take_profit: true,
      has_target_hit_data: false,
      trade_number: '1'
    };

    db.query
      .mockResolvedValueOnce({ rows: [groupedRow] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });

    const req = { user: { id: 'user-1' }, query: {} };
    const res = mockRes();

    await controller.getTradesForSelection(req, res);

    const [groupedQuery] = db.query.mock.calls[0];
    expect(groupedQuery).toContain('GROUP BY position_group_key');

    const payload = res.json.mock.calls[0][0];
    expect(payload.position_grouping).toBe(true);
    expect(payload.trades).toHaveLength(1);
    expect(payload.trades[0].position_grouped).toBe(true);
    expect(payload.trades[0].leg_count).toBe(2);
    expect(payload.trades[0].can_analyze).toBe(true);
    expect(payload.trades[0].needs_stop_loss).toBe(false);
    // A stop-loss leg without a take profit marks the whole position, since
    // the combined analysis needs a target on every analyzed leg.
    expect(payload.trades[0].needs_take_profit).toBe(true);
    expect(payload.pagination.total).toBe(1);
  });

  test('getTradesForSelection keeps the per-leg query when grouping is off', async () => {
    User.getSettings.mockResolvedValue({ analytics_position_grouping: false });

    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });

    const req = { user: { id: 'user-1' }, query: {} };
    const res = mockRes();

    await controller.getTradesForSelection(req, res);

    const [query] = db.query.mock.calls[0];
    expect(query).not.toContain('GROUP BY position_group_key');
    expect(query).toContain('numbered_trades');
    expect(res.json.mock.calls[0][0].position_grouping).toBe(false);
  });
});
