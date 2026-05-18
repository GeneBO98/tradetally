jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/tierService', () => ({
  getUserTier: jest.fn(),
  isBillingEnabled: jest.fn()
}));

jest.mock('../../src/middleware/auth', () => ({
  verifyJwtToken: jest.fn()
}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const { verifyJwtToken } = require('../../src/middleware/auth');
const { sseAuthenticate } = require('../../src/middleware/sseAuth');

function createReq({ headers = {}, cookies = {}, query = {} } = {}) {
  return { headers, cookies, query };
}

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('sseAuthenticate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ALLOW_QUERY_TOKEN_AUTH;
    verifyJwtToken.mockReturnValue({ id: 'u1' });
    db.query.mockResolvedValue({
      rows: [{ id: 'u1', email: 'demo@example.com', username: 'demo', tier: 'free' }]
    });
    TierService.getUserTier.mockResolvedValue('pro');
    TierService.isBillingEnabled.mockResolvedValue(true);
  });

  test('accepts Authorization bearer tokens', async () => {
    const req = createReq({ headers: { authorization: 'Bearer jwt-token' } });
    const res = createRes();
    const next = jest.fn();

    await sseAuthenticate(req, res, next);

    expect(verifyJwtToken).toHaveBeenCalledWith('jwt-token');
    expect(req.user).toMatchObject({ id: 'u1', tier: 'pro', billingEnabled: true });
    expect(next).toHaveBeenCalled();
  });

  test('rejects query-string tokens by default', async () => {
    const req = createReq({ query: { token: 'jwt-token' } });
    const res = createRes();
    const next = jest.fn();

    await sseAuthenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Query-string token auth is disabled',
      code: 'QUERY_TOKEN_DISABLED'
    });
    expect(verifyJwtToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('allows query-string tokens only behind explicit compatibility flag', async () => {
    process.env.ALLOW_QUERY_TOKEN_AUTH = 'true';
    const req = createReq({ query: { token: 'jwt-token' } });
    const res = createRes();
    const next = jest.fn();

    await sseAuthenticate(req, res, next);

    expect(verifyJwtToken).toHaveBeenCalledWith('jwt-token');
    expect(next).toHaveBeenCalled();
  });
});
