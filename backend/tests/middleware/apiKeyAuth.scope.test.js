jest.mock('../../src/models/ApiKey', () => ({
  verifyKey: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  logError: jest.fn()
}));

jest.mock('../../src/middleware/auth', () => ({
  ...jest.requireActual('../../src/middleware/auth'),
  findActiveUserForAuth: jest.fn()
}));

const ApiKey = require('../../src/models/ApiKey');
const { findActiveUserForAuth } = require('../../src/middleware/auth');
const { apiKeyAuth, requireApiScope } = require('../../src/middleware/apiKeyAuth');

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
    json: jest.fn().mockReturnThis()
  };
}

describe('apiKey scope middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findActiveUserForAuth.mockResolvedValue({
      id: 'u1',
      username: 'demo',
      email: 'demo@example.com',
      role: 'user',
      timezone: 'America/New_York',
      is_active: true
    });
  });

  test('attaches the full owner record so timezone-aware endpoints work', async () => {
    ApiKey.verifyKey.mockResolvedValue({
      id: 'k1', name: 'k', user_id: 'u1', permissions: ['read'], scopes: [],
      is_active: true, expires_at: null
    });

    const req = createReq({ 'x-api-key': 'tt_live_read_key' });
    const res = createRes(req);
    const next = jest.fn();

    await apiKeyAuth(req, res, next);

    expect(findActiveUserForAuth).toHaveBeenCalledWith('u1');
    expect(req.user.timezone).toBe('America/New_York');
    expect(req.authMethod).toBe('api_key');
  });

  test('rejects keys whose owner account is deactivated', async () => {
    ApiKey.verifyKey.mockResolvedValue({
      id: 'k1', name: 'k', user_id: 'u1', permissions: ['write'], scopes: [],
      is_active: true, expires_at: null
    });
    // User.findById filters is_active = true, so a deactivated owner resolves to undefined.
    findActiveUserForAuth.mockResolvedValue(undefined);

    const req = createReq({ 'x-api-key': 'tt_live_write_key' });
    const res = createRes(req);
    const next = jest.fn();

    await apiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error.code).toBe('API_KEY_OWNER_INACTIVE');
    expect(req.user).toBeUndefined();
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
