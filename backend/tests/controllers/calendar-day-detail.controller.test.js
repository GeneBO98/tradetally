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
    Trade.calculateRiskAmount.mockReturnValue(123.45);
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
});
