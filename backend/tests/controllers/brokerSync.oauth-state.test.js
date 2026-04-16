// Schwab OAuth flow must persist the `state` token server-side on init so the
// callback can recover the initiating userId from the DB rather than trusting
// a client-supplied state payload. This test verifies both halves of the flow.

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/models/BrokerConnection', () => ({
  create: jest.fn().mockResolvedValue({ id: 'connection-1' }),
  updateStatus: jest.fn().mockResolvedValue()
}));
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn()
}));

const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');
const axios = require('axios');
const brokerSyncController = require('../../src/controllers/brokerSync.controller');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    redirectedTo: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
    redirect(url) { this.redirectedTo = url; return this; }
  };
}

describe('Schwab OAuth state — server-side binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SCHWAB_CLIENT_ID = 'client';
    process.env.SCHWAB_CLIENT_SECRET = 'secret';
    process.env.SCHWAB_REDIRECT_URI = 'https://example.com/cb';
    process.env.FRONTEND_URL = 'https://example.com';
  });

  test('initSchwabOAuth INSERTs a random state bound to the caller userId', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { user: { id: 'user-123' } };
    const res = createRes();
    const next = jest.fn();

    await brokerSyncController.initSchwabOAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO oauth_pending_states/);
    expect(params[0]).toMatch(/^[a-f0-9]{64}$/); // 32-byte hex token
    expect(params[1]).toBe('user-123');
    expect(params[2]).toBe('schwab');
    expect(params[3]).toBeInstanceOf(Date);

    // authUrl must include the state as-is (no client-readable base64 payload)
    const stateParam = new URL(res.payload.authUrl).searchParams.get('state');
    expect(stateParam).toBe(params[0]);
  });

  test('handleSchwabCallback rejects a state that does not match any row', async () => {
    // UPDATE ... RETURNING * returns no rows -> invalid/expired/reused state
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { query: { code: 'auth-code', state: 'deadbeef' } };
    const res = createRes();
    const next = jest.fn();

    await brokerSyncController.handleSchwabCallback(req, res, next);

    expect(res.redirectedTo).toBe('https://example.com/settings/broker-sync?error=invalid_state');
    expect(BrokerConnection.create).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('handleSchwabCallback derives userId from the DB row, never from the client state', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 'real-user-from-db' }] });
    axios.post.mockResolvedValueOnce({
      data: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }
    });
    axios.get.mockResolvedValueOnce({
      data: [{ securitiesAccount: { accountNumber: '12345678' } }]
    });

    const req = {
      query: {
        code: 'auth-code',
        // Even if the attacker supplies a state that *looks* like a different
        // userId, the controller must use what the DB returned.
        state: 'any-arbitrary-token'
      }
    };
    const res = createRes();
    const next = jest.fn();

    await brokerSyncController.handleSchwabCallback(req, res, next);

    expect(BrokerConnection.create).toHaveBeenCalledTimes(1);
    const [userId] = BrokerConnection.create.mock.calls[0];
    expect(userId).toBe('real-user-from-db');
  });

  test('the state lookup UPDATE requires consumed_at IS NULL (no replay)', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const req = { query: { code: 'x', state: 'y' } };
    const res = createRes();
    const next = jest.fn();

    await brokerSyncController.handleSchwabCallback(req, res, next);

    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/consumed_at IS NULL/);
    expect(sql).toMatch(/expires_at > NOW\(\)/);
    expect(sql).toMatch(/SET consumed_at = NOW\(\)/);
  });
});
