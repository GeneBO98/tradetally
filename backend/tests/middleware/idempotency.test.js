jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const crypto = require('crypto');
const db = require('../../src/config/database');
const { idempotencyMiddleware } = require('../../src/middleware/idempotency');

function hashBody(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function createReq(overrides = {}) {
  return {
    method: 'POST',
    baseUrl: '/api/v1/trades',
    route: { path: '/' },
    originalUrl: '/api/v1/trades',
    headers: {},
    body: {},
    user: { id: 'u1' },
    requestId: 'req-idem',
    ...overrides
  };
}

function createRes(req) {
  return {
    req,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn()
  };
}

describe('idempotency middleware', () => {
  const originalTtlHours = process.env.IDEMPOTENCY_TTL_HOURS;

  function restoreTtlEnv() {
    if (originalTtlHours === undefined) {
      delete process.env.IDEMPOTENCY_TTL_HOURS;
      return;
    }

    process.env.IDEMPOTENCY_TTL_HOURS = originalTtlHours;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    restoreTtlEnv();
  });

  afterAll(() => {
    restoreTtlEnv();
  });

  test('skips when Idempotency-Key header is absent', async () => {
    const req = createReq();
    const res = createRes(req);
    const next = jest.fn();
    const middleware = idempotencyMiddleware({ routeKey: '/api/v1/trades' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns 409 when key is reused with a different payload hash', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // delete expired
      .mockResolvedValueOnce({ rows: [] }) // insert reservation (conflict)
      .mockResolvedValueOnce({
        rows: [{
          id: 'existing',
          request_hash: 'different-hash',
          response_status: 201,
          response_body: { trade: { id: 't1' } }
        }]
      }); // existing row

    const req = createReq({
      headers: { 'idempotency-key': 'same-key' },
      body: { symbol: 'AAPL' }
    });
    const res = createRes(req);
    const next = jest.fn();
    const middleware = idempotencyMiddleware({ routeKey: '/api/v1/trades' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key was already used with a different request payload'
      },
      requestId: 'req-idem'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('replays cached response for same key and same payload hash', async () => {
    const body = { symbol: 'AAPL' };
    db.query
      .mockResolvedValueOnce({ rows: [] }) // delete expired
      .mockResolvedValueOnce({ rows: [] }) // insert reservation (conflict)
      .mockResolvedValueOnce({
        rows: [{
          id: 'existing',
          request_hash: hashBody(body),
          response_status: 201,
          response_body: { trade: { id: 't1' } }
        }]
      }); // existing row

    const req = createReq({
      headers: { 'idempotency-key': 'same-key' },
      body
    });
    const res = createRes(req);
    const next = jest.fn();
    const middleware = idempotencyMiddleware({ routeKey: '/api/v1/trades' });

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Idempotency-Replayed', 'true');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ trade: { id: 't1' } });
    expect(next).not.toHaveBeenCalled();
  });

  test('persists response for first-time idempotent request', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // delete expired
      .mockResolvedValueOnce({ rows: [{ id: 'reservation-1' }] }) // insert reservation
      .mockResolvedValueOnce({ rows: [] }); // update cached response

    const req = createReq({
      headers: { 'idempotency-key': 'new-key' },
      body: { symbol: 'MSFT' }
    });
    const res = createRes(req);
    const next = jest.fn();
    const middleware = idempotencyMiddleware({ routeKey: '/api/v1/trades' });

    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();

    res.status(201);
    res.json({ trade: { id: 'new-trade' } });
    await Promise.resolve();

    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[2][0]).toContain('UPDATE idempotency_keys');
    expect(db.query.mock.calls[2][1][0]).toBe(201);
  });

  test('falls back to default ttl when IDEMPOTENCY_TTL_HOURS is invalid', async () => {
    process.env.IDEMPOTENCY_TTL_HOURS = 'invalid-value';

    db.query
      .mockResolvedValueOnce({ rows: [] }) // delete expired
      .mockResolvedValueOnce({ rows: [{ id: 'reservation-1' }] }); // insert reservation

    const req = createReq({
      headers: { 'idempotency-key': 'new-key' },
      body: { symbol: 'NVDA' }
    });
    const res = createRes(req);
    const next = jest.fn();
    const middleware = idempotencyMiddleware({ routeKey: '/api/v1/trades' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    const insertValues = db.query.mock.calls[1][1];
    expect(insertValues[5]).toBeInstanceOf(Date);
    expect(Number.isNaN(insertValues[5].getTime())).toBe(false);
  });
});
