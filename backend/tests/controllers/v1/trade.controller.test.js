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
  getCountWithFilters: jest.fn()
}));

jest.mock('../../../src/services/tradeQueries', () => ({
  findByUser: jest.fn(),
  _buildWhereClause: jest.fn()
}));

jest.mock('../../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../../src/events/domainEvents', () => ({ publish: jest.fn().mockResolvedValue({}) }));

const tradeController = require('../../../src/controllers/trade.controller');
const analyticsController = require('../../../src/controllers/analytics.controller');
const Trade = require('../../../src/models/Trade');
const TradeQueries = require('../../../src/services/tradeQueries');
const db = require('../../../src/config/database');
const { publish } = require('../../../src/events/domainEvents');
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
    jest.resetAllMocks();
    publish.mockResolvedValue({});
    TradeQueries._buildWhereClause.mockResolvedValue({
      whereClause: 'WHERE t.user_id = $1',
      values: ['u1'],
      paramCount: 2,
      needsSectorOuterJoin: false
    });
  });

  const validTrade = (overrides = {}) => ({
    symbol: 'AAPL', side: 'long', quantity: 10, entryPrice: 100, entryTime: '2026-02-01T10:00:00Z', ...overrides
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

  test('POST /api/v1/trades/bulk validates each item before creating it', async () => {
    tradeController.createTrade
      .mockImplementationOnce((req, res) => {
        res.status(201).json({ trade: { id: 't-success', symbol: 'AAPL' } });
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

    // The invalid item never reaches the create flow.
    expect(tradeController.createTrade).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.created).toBe(1);
    expect(payload.duplicates).toBe(0);
    expect(payload.failed).toBe(1);
    expect(payload.results[0]).toEqual({
      index: 0,
      status: 'created',
      trade: { id: 't-success', symbol: 'AAPL' }
    });
    expect(payload.results[1]).toMatchObject({ index: 1, status: 'failed' });
    expect(payload.results[1].error).toMatch(/symbol/);
    expect(payload.results[1].details[0].field).toBe('symbol');
    expect(next).not.toHaveBeenCalled();
  });

  test('bulk create normalizes snake_case items like the single-trade route', async () => {
    tradeController.createTrade.mockImplementation((req, res) => {
      res.status(201).json({ trade: { id: 't1' } });
    });
    const req = {
      body: { trades: [validTrade({ instrument_type: 'crypto' })] },
      user: { id: 'u1' },
      headers: {}
    };
    await tradeV1Controller.bulkCreateTrades(req, createMockRes(), jest.fn());

    const calledBody = tradeController.createTrade.mock.calls[0][0].body;
    expect(calledBody.instrumentType).toBe('crypto');
    expect(calledBody.entryTime).toBeInstanceOf(Date);
  });

  test('bulk endpoints reject oversized batches instead of truncating them', async () => {
    const trades = Array.from({ length: 501 }, () => validTrade());
    const res = createMockRes();
    await tradeV1Controller.bulkCreateTrades({ body: { trades }, user: { id: 'u1' }, headers: {} }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('BULK_LIMIT_EXCEEDED');
    expect(tradeController.createTrade).not.toHaveBeenCalled();
  });

  test('bulk delete accepts the ids alias', async () => {
    tradeController.deleteTrade.mockImplementation((req, res) => res.json({ message: 'ok' }));
    const res = createMockRes();
    await tradeV1Controller.bulkDeleteTrades({ body: { ids: ['a', 'b'] }, user: { id: 'u1' }, headers: {} }, res, jest.fn());

    expect(tradeController.deleteTrade).toHaveBeenCalledTimes(2);
    expect(res.json.mock.calls[0][0]).toMatchObject({ deleted: 2, failed: 0 });
  });

  test('bulk update validates each item', async () => {
    tradeController.updateTrade.mockImplementation((req, res) => res.json({ trade: { id: req.params.id } }));
    const res = createMockRes();
    await tradeV1Controller.bulkUpdateTrades({
      body: { trades: [{ id: 't1', quantity: -5 }, { id: 't2', notes: 'fine' }] },
      user: { id: 'u1' },
      headers: {}
    }, res, jest.fn());

    expect(tradeController.updateTrade).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.updated).toBe(1);
    expect(payload.results[0]).toMatchObject({ index: 0, tradeId: 't1', status: 'failed' });
    expect(payload.results[1]).toMatchObject({ index: 1, tradeId: 't2', status: 'updated' });
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

  test('a duplicate returns the existing trade without a creation event', async () => {
    tradeController.createTrade.mockImplementation((req, res) => {
      res.status(200).json({ trade: { id: 'existing' }, duplicate: true });
    });
    const req = { body: {}, user: { id: 'u1' }, headers: {} };
    const res = createMockRes();
    await tradeV1Controller.createTrade(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ trade: { id: 'existing' }, duplicate: true });
    expect(publish).not.toHaveBeenCalled();
  });

  test('bulk duplicates count separately from creations and failures', async () => {
    tradeController.createTrade
      .mockImplementationOnce((req, res) => res.status(200).json({ trade: { id: 'existing' }, duplicate: true }))
      .mockImplementationOnce((req, res) => res.status(201).json({ trade: { id: 'new' } }))
      .mockImplementationOnce((req, res) => res.status(400).json({ error: 'Invalid trade' }));
    const req = { body: { trades: [validTrade(), validTrade(), validTrade()] }, user: { id: 'u1' }, headers: {} };
    const res = createMockRes();
    await tradeV1Controller.bulkCreateTrades(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({
      created: 1, duplicates: 1, failed: 1,
      results: [
        { index: 0, status: 'duplicate', trade: { id: 'existing' } },
        { index: 1, status: 'created', trade: { id: 'new' } },
        { index: 2, status: 'failed', error: 'Invalid trade' }
      ]
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toBe('trade.created');
  });

  test('GET /api/v1/trades/recent applies trade-list filters and paginates', async () => {
    TradeQueries.findByUser.mockResolvedValue([
      { id: 'new', entry_time: '2026-02-05T09:00:00Z' },
      { id: 'old', entry_time: '2026-02-01T09:00:00Z' }
    ]);
    Trade.getCountWithFilters.mockResolvedValue(2);

    const req = {
      query: { limit: '10', accounts: 'ACC1,ACC2', side: 'long' },
      user: { id: 'u1' },
      headers: {},
      requestId: 'req-recent'
    };
    const res = createMockRes('req-recent');
    const next = jest.fn();

    await tradeV1Controller.getRecentTrades(req, res, next);

    expect(TradeQueries.findByUser).toHaveBeenCalledWith('u1', expect.objectContaining({
      limit: 10,
      offset: 0,
      accounts: ['ACC1', 'ACC2'],
      side: 'long'
    }));
    expect(Trade.getCountWithFilters).toHaveBeenCalledWith('u1', expect.objectContaining({
      accounts: ['ACC1', 'ACC2']
    }));
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
      query: { accounts: 'ACC1' },
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
        avgLoss: -45.75,
        // The period totals and the overview fields are merged here, so the
        // response names the one currency they are both in.
        currency: 'USD'
      }
    });
    // Counts are scoped by the same canonical WHERE clause as the overview.
    expect(TradeQueries._buildWhereClause).toHaveBeenCalledWith('u1', expect.objectContaining({ accounts: ['ACC1'] }));
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('WHERE t.user_id = $1');
    expect(sql).toContain('AT TIME ZONE $2');
    expect(params).toEqual(['u1', 'UTC']);
    expect(next).not.toHaveBeenCalled();
  });
});
