jest.mock('../../src/models/ApiKey', () => ({
  verifyKey: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  logError: jest.fn()
}));

jest.mock('../../src/services/redisClient', () => ({
  getRedisClient: jest.fn(),
  getRedisNamespace: jest.fn(() => 'test'),
  isRedisConfigured: jest.fn(() => false)
}));

const ApiKey = require('../../src/models/ApiKey');
const redisClient = require('../../src/services/redisClient');
const { apiKeyAuth, requireApiScope, resetApiKeyRateLimitBuckets } = require('../../src/middleware/apiKeyAuth');

function createReq(headers = {}) {
  return {
    headers,
    originalUrl: '/api/v1/trades',
    requestId: 'req-scope'
  };
}

function createRes(req) {
  return {
    req,
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    json: jest.fn().mockReturnThis()
  };
}

describe('apiKey scope middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetApiKeyRateLimitBuckets();
    delete process.env.API_KEY_RATE_LIMIT_MAX;
    delete process.env.API_KEY_RATE_LIMIT_WINDOW_MS;
    delete process.env.API_KEY_RATE_LIMIT_ENABLED;
    delete process.env.API_KEY_RATE_LIMIT_STORE;
  });

  test('legacy read permission maps to read scopes', async () => {
    ApiKey.verifyKey.mockResolvedValue({
      id: 'k1',
      name: 'legacy-read',
      user_id: 'u1',
      username: 'demo',
      email: 'demo@example.com',
      role: 'user',
      permissions: ['read'],
      scopes: [],
      is_active: true,
      expires_at: null
    });

    const req = createReq({ 'x-api-key': 'tt_live_read_key' });
    const res = createRes(req);
    const next = jest.fn();

    await apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.apiKey.effectiveScopes).toContain('trades:read');
    expect(req.apiKey.effectiveScopes).not.toContain('trades:write');
  });

  test('rate limits by API key id, not only caller IP', async () => {
    process.env.API_KEY_RATE_LIMIT_MAX = '1';
    process.env.API_KEY_RATE_LIMIT_WINDOW_MS = '60000';
    ApiKey.verifyKey.mockResolvedValue({
      id: 'k-rate',
      name: 'limited',
      user_id: 'u1',
      username: 'demo',
      email: 'demo@example.com',
      role: 'user',
      permissions: ['read'],
      scopes: [],
      is_active: true,
      expires_at: null
    });

    const firstReq = createReq({ 'x-api-key': 'tt_live_limited_key' });
    const firstRes = createRes(firstReq);
    await apiKeyAuth(firstReq, firstRes, jest.fn());

    const secondReq = createReq({ 'x-api-key': 'tt_live_limited_key' });
    const secondRes = createRes(secondReq);
    const secondNext = jest.fn();
    await apiKeyAuth(secondReq, secondRes, secondNext);

    expect(secondRes.status).toHaveBeenCalledWith(429);
    expect(secondRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: {
        code: 'API_KEY_RATE_LIMITED',
        message: 'API key rate limit exceeded'
      },
      requestId: 'req-scope'
    }));
    expect(secondNext).not.toHaveBeenCalled();
  });

  test('uses Redis-backed API key rate limit buckets when configured', async () => {
    process.env.API_KEY_RATE_LIMIT_STORE = 'redis';
    process.env.API_KEY_RATE_LIMIT_MAX = '1';
    process.env.API_KEY_RATE_LIMIT_WINDOW_MS = '60000';
    const redis = {
      isReady: true,
      incr: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
      pExpire: jest.fn().mockResolvedValue(),
      pTTL: jest.fn().mockResolvedValue(60000)
    };
    redisClient.getRedisClient.mockResolvedValue(redis);
    ApiKey.verifyKey.mockResolvedValue({
      id: 'k-redis',
      name: 'redis-limited',
      user_id: 'u1',
      username: 'demo',
      email: 'demo@example.com',
      role: 'user',
      permissions: ['read'],
      scopes: [],
      is_active: true,
      expires_at: null
    });

    const firstRes = createRes(createReq({ 'x-api-key': 'tt_live_redis_key' }));
    await apiKeyAuth(firstRes.req, firstRes, jest.fn());
    const secondRes = createRes(createReq({ 'x-api-key': 'tt_live_redis_key' }));
    await apiKeyAuth(secondRes.req, secondRes, jest.fn());

    expect(redis.incr).toHaveBeenCalledWith('test:api-key-rate:k-redis');
    expect(firstRes.setHeader).toHaveBeenCalledWith('X-Rate-Limit-Store', 'redis');
    expect(secondRes.status).toHaveBeenCalledWith(429);
  });

  test('requireApiScope denies missing scope for API-key requests', () => {
    const req = createReq();
    req.apiKey = {
      id: 'k1',
      permissions: ['read'],
      effectiveScopes: ['trades:read']
    };
    const res = createRes(req);
    const next = jest.fn();

    requireApiScope('trades:write')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INSUFFICIENT_SCOPE',
        message: 'Missing required scope: trades:write'
      },
      requestId: 'req-scope'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('requireApiScope bypasses JWT-authenticated requests', () => {
    const req = createReq();
    req.user = { id: 'u1' }; // Authenticated via JWT, no req.apiKey present.
    const res = createRes(req);
    const next = jest.fn();

    requireApiScope('trades:write')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
