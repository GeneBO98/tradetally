jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/tierService', () => ({
  getUserTier: jest.fn(async () => 'pro'),
  isBillingEnabled: jest.fn(async () => true)
}));

const db = require('../../src/config/database');
const { sseAuthenticate } = require('../../src/middleware/sseAuth');
const { generateToken, TOKEN_PURPOSES } = require('../../src/middleware/auth');

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

describe('SSE authentication', () => {
  const user = {
    id: '7f4af2f4-64b0-4ffc-a834-4b2578402e3d',
    email: 'user@example.com',
    username: 'user',
    role: 'user',
    tier: 'pro',
    is_active: true,
    session_version: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'sse-test-secret';
  });

  test('rejects pre-2FA tokens before reading notification identity', async () => {
    const token = generateToken(user, { purpose: TOKEN_PURPOSES.PRE_2FA });
    const req = { headers: { authorization: `Bearer ${token}` }, cookies: {}, query: {} };
    const res = response();
    const next = jest.fn();

    await sseAuthenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('does not accept JWTs from query parameters', async () => {
    const token = generateToken(user, { purpose: TOKEN_PURPOSES.ACCESS });
    const req = { headers: {}, cookies: {}, query: { token } };
    const res = response();

    await sseAuthenticate(req, res, jest.fn());

    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: 'No token provided' });
  });

  test('rejects access tokens from a revoked session version', async () => {
    const token = generateToken(user, { purpose: TOKEN_PURPOSES.ACCESS });
    db.query.mockResolvedValue({ rows: [{ ...user, session_version: 4 }] });
    const req = { headers: { authorization: `Bearer ${token}` }, cookies: {}, query: {} };
    const res = response();

    await sseAuthenticate(req, res, jest.fn());

    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: 'User not found' });
  });
});
