jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const analyticsController = require('../../src/controllers/analytics.controller');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('analyticsController.getCalendarDayDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('credits partial-close P&L on an open short option position when trade.pnl is null', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ timezone: 'America/New_York' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            trade_id: 'trade-avav-open',
            symbol: 'AVAV',
            side: 'short',
            pnl: null,
            commission: null,
            fees: null,
            r_value: null,
            stop_loss: null,
            entry_price: 0.9,
            quantity: 5,
            instrument_type: 'option',
            contract_size: 100,
            point_value: null,
            underlying_asset: 'AVAV',
            exit_time: null,
            executions: [
              { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T15:23:00Z', fees: -0.05204 },
              { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T15:23:00Z', fees: 0.64796 },
              { action: 'sell', quantity: 2, price: 0.9, datetime: '2026-01-05T15:23:00Z', fees: 0.59592 },
              { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T15:23:00Z', fees: 0.29796 },
              { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T15:23:00Z', fees: 0.29796 },
              { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T15:23:03Z', fees: 0.29796 },
              { action: 'buy', quantity: 1, price: 0.45, datetime: '2026-01-08T15:46:38Z', fees: -0.04875 },
              { action: 'buy', quantity: 1, price: 0.45, datetime: '2026-01-08T15:46:38Z', fees: 0.65125 }
            ]
          }
        ]
      });

    const req = {
      query: { date: '2026-01-08' },
      user: { id: 'user-1' }
    };
    const res = createRes();
    const next = jest.fn();

    await analyticsController.getCalendarDayDetail(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);

    const payload = res.json.mock.calls[0][0];
    expect(payload.date).toBe('2026-01-08');
    expect(payload.contributions).toHaveLength(1);
    expect(payload.contributions[0]).toEqual(expect.objectContaining({
      trade_id: 'trade-avav-open',
      symbol: 'AVAV',
      side: 'short',
      exit_count: 2,
      is_partial: false
    }));
    expect(payload.contributions[0].pnl).toBeCloseTo(90 - 1.19842, 2);
  });
});
