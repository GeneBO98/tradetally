// Single-flight coalescing for the expensive cached analytics endpoints
// (overview, chart data, dashboard insight summary). After a cache
// invalidation, N concurrent identical requests must share ONE in-flight
// compute (heavy SQL runs once) instead of each re-running it. A failed
// compute must reject every waiter and clear the in-flight entry so the next
// request recomputes (no negative caching).

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn().mockResolvedValue({})
}));

const db = require('../../src/config/database');
const analyticsController = require('../../src/controllers/analytics.controller');

function makeRes() {
  return {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    send: jest.fn()
  };
}

// Slow query mock: keeps the compute in flight long enough for all concurrent
// requests to arrive at the cache-miss path before the first one finishes.
function slowEmptyQuery(delayMs = 30) {
  return jest.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { rows: [] };
  });
}

async function measureQueryCount(handler, req) {
  db.query.mockImplementation(slowEmptyQuery());
  const res = makeRes();
  const next = jest.fn();
  await handler(req, res, next);
  expect(next).not.toHaveBeenCalled();
  const count = db.query.mock.calls.length;
  expect(count).toBeGreaterThanOrEqual(1);
  return count;
}

// The real in-memory cache module is shared across tests in this file, so
// every test uses a distinct user id to guarantee a cold cache key.
describe('analytics single-flight coalescing', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  const cases = [
    ['getOverview', analyticsController.getOverview],
    ['getChartData', analyticsController.getChartData],
    ['getRecommendationSummary', analyticsController.getRecommendationSummary]
  ];

  test.each(cases)(
    '%s: 5 concurrent cache misses run the heavy compute once',
    async (name, handler) => {
      // Baseline: how many queries does ONE compute pass issue?
      const serialCount = await measureQueryCount(
        handler.bind(analyticsController),
        { user: { id: `sf-serial-${name}` }, query: {} }
      );

      // 5 concurrent requests with an identical cache key must coalesce into
      // a single compute: total queries == one pass, not 5x.
      db.query.mockReset();
      db.query.mockImplementation(slowEmptyQuery());
      const req = { user: { id: `sf-concurrent-${name}` }, query: {} };
      const responses = [makeRes(), makeRes(), makeRes(), makeRes(), makeRes()];
      const next = jest.fn();

      await Promise.all(
        responses.map((res) => handler.call(analyticsController, req, res, next))
      );

      expect(next).not.toHaveBeenCalled();
      expect(db.query.mock.calls.length).toBe(serialCount);

      // Every waiter still gets the shared payload.
      const payload = responses[0].json.mock.calls[0][0];
      for (const res of responses) {
        expect(res.json).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith(payload);
      }
    }
  );

  test('getOverview: failed compute rejects all waiters and is not negatively cached', async () => {
    const boom = new Error('db exploded');
    db.query.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      throw boom;
    });

    const req = { user: { id: 'sf-error-user' }, query: {} };
    const responses = [makeRes(), makeRes(), makeRes(), makeRes(), makeRes()];
    const next = jest.fn();

    await Promise.all(
      responses.map((res) => analyticsController.getOverview(req, res, next))
    );

    // One shared compute failed; every request's error handler fired.
    expect(db.query.mock.calls.length).toBe(1);
    expect(next).toHaveBeenCalledTimes(5);
    for (const call of next.mock.calls) {
      expect(call[0]).toBe(boom);
    }
    for (const res of responses) {
      expect(res.json).not.toHaveBeenCalled();
    }

    // In-flight entry was cleared: the next request recomputes (and succeeds).
    db.query.mockReset();
    db.query.mockImplementation(slowEmptyQuery());
    const res = makeRes();
    const retryNext = jest.fn();
    await analyticsController.getOverview(req, res, retryNext);
    expect(retryNext).not.toHaveBeenCalled();
    expect(db.query.mock.calls.length).toBe(1);
    expect(res.json).toHaveBeenCalledTimes(1);
  });
});
