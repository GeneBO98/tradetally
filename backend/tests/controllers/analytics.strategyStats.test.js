jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/positionGrouping', () => {
  const actual = jest.requireActual('../../src/utils/positionGrouping');
  return {
    ...actual,
    isPositionGroupingEnabled: jest.fn()
  };
});

const db = require('../../src/config/database');
const positionGrouping = require('../../src/utils/positionGrouping');
const analyticsController = require('../../src/controllers/analytics.controller');

describe('analyticsController.getStrategyStats', () => {
  beforeEach(() => {
    db.query.mockReset();
    positionGrouping.isPositionGroupingEnabled.mockReset();
  });

  test('uses detected position-group strategy when grouped analytics are enabled', async () => {
    positionGrouping.isPositionGroupingEnabled.mockResolvedValue(true);
    const rows = [
      {
        strategy: 'bull_put_spread',
        total_trades: '1',
        winning_trades: '1',
        losing_trades: '0',
        breakeven_trades: '0',
        total_pnl: '125.00'
      }
    ];
    db.query.mockResolvedValue({ rows });

    const req = { user: { id: 'user-1' }, query: {} };
    const res = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getStrategyStats(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ strategies: rows });
    expect(db.query).toHaveBeenCalledTimes(1);

    const [query, params] = db.query.mock.calls[0];
    expect(params).toEqual(['user-1']);
    expect(query).toContain('LEFT JOIN trade_position_groups tpg ON tpg.id = grouped_legs.position_group_id');
    expect(query).toContain('COALESCE(tpg.detected_strategy, grouped_legs.leg_strategy) as strategy');
    expect(query).toContain('GROUP BY position_group_id');
  });
});

describe('analyticsController.getPerformance', () => {
  beforeEach(() => {
    db.query.mockReset();
    positionGrouping.isPositionGroupingEnabled.mockReset();
  });

  test('counts legs when grouping is disabled', async () => {
    positionGrouping.isPositionGroupingEnabled.mockResolvedValue(false);
    db.query.mockResolvedValue({ rows: [] });

    const req = { user: { id: 'user-1' }, query: { period: 'monthly' } };
    const res = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getPerformance(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const [query] = db.query.mock.calls[0];
    expect(query).toContain('FROM trades');
    expect(query).not.toContain('WITH positions');
    expect(query).toContain("DATE_TRUNC('month', trade_date)");
  });

  test('counts positions when grouping is enabled', async () => {
    positionGrouping.isPositionGroupingEnabled.mockResolvedValue(true);
    db.query.mockResolvedValue({ rows: [] });

    const req = { user: { id: 'user-1' }, query: { period: 'weekly' } };
    const res = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getPerformance(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const [query] = db.query.mock.calls[0];
    expect(query).toContain('WITH positions');
    expect(query).toContain('GROUP BY COALESCE(position_group_id::text');
    expect(query).toContain('FROM positions');
    expect(query).toContain("DATE_TRUNC('week', trade_date)");
  });
});
