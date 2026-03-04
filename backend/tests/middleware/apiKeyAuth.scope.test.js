jest.mock('../../src/models/ApiKey', () => ({
  verifyKey: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  logError: jest.fn()
}));

const ApiKey = require('../../src/models/ApiKey');
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
