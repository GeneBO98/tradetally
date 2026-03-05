jest.mock('../../../src/controllers/trade.controller', () => ({
  getUserTrades: jest.fn(),
  createTrade: jest.fn(),
  getTrade: jest.fn(),
  updateTrade: jest.fn(),
  deleteTrade: jest.fn()
}));

jest.mock('../../../src/controllers/analytics.controller', () => ({
  getOverview: jest.fn()
}));

jest.mock('../../../src/models/Trade', () => ({
  findByUser: jest.fn(),
  getCountWithFilters: jest.fn()
}));

jest.mock('../../../src/config/database', () => ({
  query: jest.fn()
}));

const tradeController = require('../../../src/controllers/trade.controller');
const analyticsController = require('../../../src/controllers/analytics.controller');
const Trade = require('../../../src/models/Trade');
const db = require('../../../src/config/database');
const tradeV1Controller = require('../../../src/controllers/v1/trade.controller');

function createMockRes(requestId = 'req-trade') {
  return {
    req: { requestId, headers: {} },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('v1 trade controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/v1/trades returns real rows with pagination envelope', async () => {
    tradeController.getUserTrades.mockImplementation((req, res) => {
      res.json({
        trades: [{ id: 't1', symbol: 'AAPL' }, { id: 't2', symbol: 'MSFT' }],
        total: 7
      });
    });

    const req = {
      query: {
        limit: '2',
        offset: '1',
        symbol: 'AAPL',
        startDate: '2026-02-01',
        endDate: '2026-02-27'
      },
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-trades'
    };
    const res = createMockRes('req-trades');
    const next = jest.fn();

    await tradeV1Controller.getTrades(req, res, next);

    const calledReq = tradeController.getUserTrades.mock.calls[0][0];
    expect(calledReq.query.symbol).toBe('AAPL');
    expect(calledReq.query.startDate).toBe('2026-02-01');
    expect(calledReq.query.endDate).toBe('2026-02-27');
    expect(calledReq.query.limit).toBe(2);
    expect(calledReq.query.offset).toBe(1);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [{ id: 't1', symbol: 'AAPL' }, { id: 't2', symbol: 'MSFT' }],
      pagination: {
        limit: 2,
        offset: 1,
        total: 7,
        hasMore: true
      }
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('POST /api/v1/trades/bulk reports partial failures', async () => {
    tradeController.createTrade
      .mockImplementationOnce((req, res) => {
        res.status(201).json({ trade: { id: 't-success', symbol: 'AAPL' } });
      })
      .mockImplementationOnce((req, res) => {
        res.status(400).json({ message: 'Invalid trade payload' });
      });

    const req = {
      body: {
        trades: [
          { symbol: 'AAPL', side: 'long', quantity: 10, entryPrice: 100, entryTime: '2026-02-01T10:00:00Z' },
          { symbol: '', side: 'long', quantity: 10, entryPrice: 100, entryTime: '2026-02-01T10:00:00Z' }
        ]
      },
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-bulk'
    };
    const res = createMockRes('req-bulk');
    const next = jest.fn();

    await tradeV1Controller.bulkCreateTrades(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      created: 1,
      failed: 1,
      results: [
        {
          index: 0,
          status: 'created',
          trade: { id: 't-success', symbol: 'AAPL' }
        },
        {
          index: 1,
          status: 'failed',
          error: 'Invalid trade payload'
        }
      ]
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('POST /api/v1/trades delegates to existing create flow', async () => {
    tradeController.createTrade.mockImplementation((req, res) => {
      res.status(201).json({ trade: { id: 't-created', symbol: 'NVDA' } });
    });

    const req = {
      body: { symbol: 'NVDA', side: 'long', quantity: 5, entryPrice: 600, entryTime: '2026-02-10T10:00:00Z' },
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-create'
    };
    const res = createMockRes('req-create');
    const next = jest.fn();

    await tradeV1Controller.createTrade(req, res, next);

    expect(tradeController.createTrade).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      trade: { id: 't-created', symbol: 'NVDA' }
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('GET /api/v1/trades/recent sorts by descending entry_time and paginates', async () => {
    Trade.findByUser.mockResolvedValue([
      { id: 'old', entry_time: '2026-02-01T09:00:00Z' },
      { id: 'new', entry_time: '2026-02-05T09:00:00Z' }
    ]);
    Trade.getCountWithFilters.mockResolvedValue(2);

    const req = {
      query: { limit: '10' },
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-recent'
    };
    const res = createMockRes('req-recent');
    const next = jest.fn();

    await tradeV1Controller.getRecentTrades(req, res, next);

    expect(Trade.findByUser).toHaveBeenCalledWith('u1', {
      limit: 10,
      offset: 0,
      symbol: undefined,
      startDate: undefined,
      endDate: undefined
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [
        { id: 'new', entry_time: '2026-02-05T09:00:00Z' },
        { id: 'old', entry_time: '2026-02-01T09:00:00Z' }
      ],
      pagination: {
        limit: 10,
        offset: 0,
        total: 2,
        hasMore: false
      }
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('GET /api/v1/trades/summary/quick returns required summary fields', async () => {
    analyticsController.getOverview.mockImplementation((req, res) => {
      res.json({
        overview: {
          win_rate: 60,
          avg_win: 120.5,
          avg_loss: -45.75
        }
      });
    });
    db.query.mockResolvedValue({
      rows: [
        {
          total_trades: 12,
          open_trades: 3,
          today_pnl: 110.25,
          week_pnl: 540.5,
          month_pnl: 1180.75
        }
      ]
    });

    const req = {
      user: { id: 'u1', timezone: 'UTC' },
      headers: {},
      requestId: 'req-summary'
    };
    const res = createMockRes('req-summary');
    const next = jest.fn();

    await tradeV1Controller.getQuickSummary(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      summary: {
        totalTrades: 12,
        openTrades: 3,
        todayPnL: 110.25,
        weekPnL: 540.5,
        monthPnL: 1180.75,
        winRate: 60,
        avgWin: 120.5,
        avgLoss: -45.75
      }
    });
    expect(next).not.toHaveBeenCalled();
  });
});
