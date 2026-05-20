jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({
  calculateRiskAmount: jest.fn(() => 123.45)
}));

const db = require('../../src/config/database');
const Trade = require('../../src/models/Trade');
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
    db.query.mockReset();
    Trade.calculateRiskAmount.mockReturnValue(123.45);
    // Calendar endpoints look up the user's timezone before issuing the data
    // query, so each test starts with a UTC timezone response queued up.
    db.query.mockResolvedValueOnce({ rows: [{ timezone: 'UTC' }] });
  });

  test('returns grouped execution P&L net of commission for same-day exits', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          trade_id: 'trade-jnj',
          symbol: 'JNJ',
          side: 'long',
          pnl: 336,
          commission: 2.82,
          fees: 0,
          r_value: 1.5,
          stop_loss: 146,
          entry_price: 150,
          quantity: 100,
          instrument_type: 'stock',
          contract_size: null,
          point_value: null,
          underlying_asset: null,
          exit_time: '2026-04-03T15:10:00Z',
          executions: [
            {
              quantity: 100,
              side: 'long',
              entryPrice: 150,
              exitPrice: 153.36,
              entryTime: '2026-04-03T09:31:00Z',
              exitTime: '2026-04-03T15:10:00Z',
              commission: 2.82,
              fees: 0
            }
          ]
        }
      ]
    });

    const req = {
      query: { date: '2026-04-03' },
      user: { id: 'user-1' }
    };
    const res = createRes();
    const next = jest.fn();

    await analyticsController.getCalendarDayDetail(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);

    const payload = res.json.mock.calls[0][0];
    expect(payload.date).toBe('2026-04-03');
    expect(payload.contributions).toHaveLength(1);
    expect(payload.contributions[0]).toEqual(expect.objectContaining({
      trade_id: 'trade-jnj',
      symbol: 'JNJ',
      side: 'long',
      r_value: 1.5,
      risk_amount: 123.45,
      exit_count: 1,
      is_partial: false
    }));
    expect(payload.contributions[0].pnl).toBeCloseTo(333.18, 2);
  });

  test('keeps partial exits split by day when executions span multiple dates', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          trade_id: 'trade-nem',
          symbol: 'NEM',
          side: 'long',
          pnl: 157.8,
          commission: 2.2,
          fees: 0,
          r_value: 0.9,
          stop_loss: 9,
          entry_price: 10,
          quantity: 100,
          instrument_type: 'stock',
          contract_size: null,
          point_value: null,
          underlying_asset: null,
          exit_time: '2026-04-04T15:30:00Z',
          executions: [
            {
              action: 'buy',
              quantity: 100,
              price: 10,
              datetime: '2026-04-01T09:30:00Z',
              commission: 1.2,
              fees: 0
            },
            {
              action: 'sell',
              quantity: 60,
              price: 12,
              datetime: '2026-04-03T11:00:00Z',
              commission: 0.6,
              fees: 0
            },
            {
              action: 'sell',
              quantity: 40,
              price: 11,
              datetime: '2026-04-04T15:30:00Z',
              commission: 0.4,
              fees: 0
            }
          ]
        }
      ]
    });

    const req = {
      query: { date: '2026-04-03' },
      user: { id: 'user-1' }
    };
    const res = createRes();
    const next = jest.fn();

    await analyticsController.getCalendarDayDetail(req, res, next);

    expect(next).not.toHaveBeenCalled();

    const payload = res.json.mock.calls[0][0];
    expect(payload.contributions).toHaveLength(1);
    expect(payload.contributions[0]).toEqual(expect.objectContaining({
      trade_id: 'trade-nem',
      symbol: 'NEM',
      side: 'long',
      r_value: null,
      risk_amount: 123.45,
      exit_count: 1,
      is_partial: true
    }));
    expect(payload.contributions[0].pnl).toBeCloseTo(118.68, 2);
  });

  test('credits partial-close P&L on an open short option position when trade.pnl is null', async () => {
    db.query.mockResolvedValueOnce({
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
            { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:00', fees: -0.05204 },
            { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:00', fees: 0.64796 },
            { action: 'sell', quantity: 2, price: 0.9, datetime: '2026-01-05T10:23:00', fees: 0.59592 },
            { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:00', fees: 0.29796 },
            { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:00', fees: 0.29796 },
            { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:03', fees: 0.29796 },
            { action: 'buy',  quantity: 1, price: 0.45, datetime: '2026-01-08T10:46:38', fees: -0.04875 },
            { action: 'buy',  quantity: 1, price: 0.45, datetime: '2026-01-08T10:46:38', fees: 0.65125 }
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

    const payload = res.json.mock.calls[0][0];
    expect(payload.date).toBe('2026-01-08');
    expect(payload.contributions).toHaveLength(1);
    expect(payload.contributions[0]).toEqual(expect.objectContaining({
      trade_id: 'trade-avav-open',
      symbol: 'AVAV',
      side: 'short',
      exit_count: 2,
      // is_partial flags "exits on other days too"; here both closing legs
      // are on 2026-01-08 so it is false even though 5 contracts remain open.
      is_partial: false
    }));
    // Short option partial close: 2 contracts closed @ $0.45 vs entry $0.90,
    // contract_size 100 → gross $45 per fill. Each fill's `fees` field is
    // applied as cost; FIFO-matched entry leg's `fees` (the first two sell
    // fills here) is also subtracted. Negative fees are rebates (raise P&L).
    // Gross = 90, costs = (-0.04875) + 0.65125 + (-0.05204) + 0.64796 = 1.19842
    expect(payload.contributions[0].pnl).toBeCloseTo(90 - 1.19842, 2);
  });

  test('supports legacy executions that only stored side and type', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          trade_id: 'trade-tsla-short',
          symbol: 'TSLA',
          side: 'short',
          pnl: 998,
          commission: 2,
          fees: 0,
          r_value: 2,
          stop_loss: 105,
          entry_price: 100,
          quantity: 100,
          instrument_type: 'stock',
          contract_size: null,
          point_value: null,
          underlying_asset: null,
          exit_time: '2026-04-03T14:45:00Z',
          executions: [
            {
              side: 'short',
              type: 'entry',
              quantity: 100,
              price: 100,
              datetime: '2026-04-01T09:30:00Z',
              commission: 1,
              fees: 0
            },
            {
              side: 'long',
              type: 'exit',
              quantity: 100,
              price: 90,
              datetime: '2026-04-03T14:45:00Z',
              commission: 1,
              fees: 0
            }
          ]
        }
      ]
    });

    const req = {
      query: { date: '2026-04-03' },
      user: { id: 'user-1' }
    };
    const res = createRes();
    const next = jest.fn();

    await analyticsController.getCalendarDayDetail(req, res, next);

    expect(next).not.toHaveBeenCalled();

    const payload = res.json.mock.calls[0][0];
    expect(payload.contributions).toHaveLength(1);
    expect(payload.contributions[0]).toEqual(expect.objectContaining({
      trade_id: 'trade-tsla-short',
      symbol: 'TSLA',
      side: 'short',
      r_value: 2,
      risk_amount: 123.45,
      exit_count: 1,
      is_partial: false
    }));
    expect(payload.contributions[0].pnl).toBeCloseTo(998, 2);
  });
});

describe('analyticsController.getCalendarData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    Trade.calculateRiskAmount.mockReturnValue(123.45);
    // Calendar endpoints look up the user's timezone before issuing the data
    // query, so each test starts with a UTC timezone response queued up.
    db.query.mockResolvedValueOnce({ rows: [{ timezone: 'UTC' }] });
  });

  test('uses recomputed execution P&L for historical same-day exits when stored trade P&L is stale', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            trade_id: 'trade-jnj',
            symbol: 'JNJ',
            side: 'long',
            pnl: 336,
            commission: 2.82,
            fees: 0,
            r_value: 1.5,
            stop_loss: 146,
            entry_price: 150,
            quantity: 100,
            instrument_type: 'stock',
            contract_size: null,
            point_value: null,
            underlying_asset: null,
            exit_time: '2026-04-03T15:10:00Z',
            executions: [
              {
                quantity: 100,
                side: 'long',
                entryPrice: 150,
                exitPrice: 153.36,
                entryTime: '2026-04-03T09:31:00Z',
                exitTime: '2026-04-03T15:10:00Z',
                commission: 2.82,
                fees: 0
              }
            ]
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            trade_date: '2026-04-03',
            r_value: 1.5,
            entry_price: 150,
            stop_loss: 146,
            quantity: 100,
            side: 'long',
            instrument_type: 'stock',
            contract_size: null,
            point_value: null,
            symbol: 'JNJ',
            underlying_asset: null
          }
        ]
      });

    const req = {
      query: { year: '2026' },
      user: { id: 'user-1' }
    };
    const res = createRes();
    const next = jest.fn();

    await analyticsController.getCalendarData(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);

    const payload = res.json.mock.calls[0][0];
    expect(payload.calendar).toHaveLength(1);
    expect(payload.calendar[0]).toEqual(expect.objectContaining({
      trade_date: '2026-04-03',
      trades: 1,
      daily_r_value: 1.5,
      daily_risk_amount: 123.45,
      risk_trade_count: 1
    }));
    expect(payload.calendar[0].daily_pnl).toBeCloseTo(333.18, 2);
  });
});
