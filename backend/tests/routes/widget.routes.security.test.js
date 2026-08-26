jest.mock('../../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../../src/services/widgetSnapshotService', () => ({ getSnapshot: jest.fn() }));

const express = require('express');
const request = require('supertest');
const User = require('../../src/models/User');
const widgetSnapshotService = require('../../src/services/widgetSnapshotService');
const widgetRoutes = require('../../src/routes/widget.routes');
const {
  authenticate,
  clearAuthUserCache,
  generateToken
} = require('../../src/middleware/auth');

function buildApp() {
  const app = express();
  app.set('trust proxy', false);
  app.use(express.json());
  app.use('/api/widgets', widgetRoutes);
  app.get('/api/normal', authenticate, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('widget routes security', () => {
  let app;
  let user;
  let accessToken;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAuthUserCache();
    process.env.JWT_SECRET = 'widget-route-test-secret';
    process.env.AUTH_USER_CACHE_TTL_MS = '30000';
    user = {
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      is_active: true,
      session_version: 4,
      timezone: 'UTC'
    };
    User.findById.mockResolvedValue(user);
    accessToken = generateToken(user);
    widgetSnapshotService.getSnapshot.mockResolvedValue({
      weekPnL: 1,
      winRate: 2,
      weekTrades: 3,
      openUnrealizedPnL: 4,
      openPositionsCount: 5,
      todayPnL: 6,
      winningOpenPositions: 7,
      topNews: null,
      topInsight: null,
      updatedAt: '2026-08-26T19:00:00.000Z'
    });
    app = buildApp();
  });

  test('issues a 30-day widget-purpose token only from standard authentication', async () => {
    const issued = await request(app)
      .post('/api/widgets/token')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(issued.status).toBe(200);
    expect(issued.body).toEqual({
      token: expect.any(String),
      expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    });
    expect(issued.headers['cache-control']).toBe('private, no-store');
    const lifetime = new Date(issued.body.expiresAt).getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(lifetime).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 1000);

    const widgetResponse = await request(app)
      .get('/api/widgets/snapshot')
      .set('Authorization', `Bearer ${issued.body.token}`);
    expect(widgetResponse.status).toBe(200);
    expect(widgetResponse.headers['cache-control']).toBe('private, no-store');

    const normalResponse = await request(app)
      .get('/api/normal')
      .set('Authorization', `Bearer ${issued.body.token}`);
    expect(normalResponse.status).toBe(401);
  });

  test('rejects an access token on the snapshot endpoint and rejects all endpoint input', async () => {
    const wrongPurpose = await request(app)
      .get('/api/widgets/snapshot')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(wrongPurpose.status).toBe(401);
    expect(wrongPurpose.body.code).toBe('INVALID_WIDGET_TOKEN');

    const input = await request(app)
      .post('/api/widgets/token?expiresIn=10y')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ scope: 'admin' });
    expect(input.status).toBe(400);
    expect(input.body.code).toBe('WIDGET_INPUT_NOT_ALLOWED');

    const issued = await request(app)
      .post('/api/widgets/token')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    const snapshotInput = await request(app)
      .get('/api/widgets/snapshot?symbol=AAPL')
      .set('Authorization', `Bearer ${issued.body.token}`);
    expect(snapshotInput.status).toBe(400);
    expect(snapshotInput.body.code).toBe('WIDGET_INPUT_NOT_ALLOWED');
  });

  test('revokes a widget token when the user session version changes', async () => {
    const issued = await request(app)
      .post('/api/widgets/token')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    clearAuthUserCache();
    User.findById.mockResolvedValue({ ...user, session_version: 5 });

    const response = await request(app)
      .get('/api/widgets/snapshot')
      .set('Authorization', `Bearer ${issued.body.token}`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('WIDGET_UNAUTHORIZED');
  });

  test('rate limits token issuance per authenticated user', async () => {
    const limitedUser = { ...user, id: 'rate-limited-user' };
    const limitedAccessToken = generateToken(limitedUser);
    User.findById.mockResolvedValue(limitedUser);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const allowed = await request(app)
        .post('/api/widgets/token')
        .set('Authorization', `Bearer ${limitedAccessToken}`)
        .send({});
      expect(allowed.status).toBe(200);
    }

    const limited = await request(app)
      .post('/api/widgets/token')
      .set('Authorization', `Bearer ${limitedAccessToken}`)
      .send({});
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('900');
  });

  test('rate limits snapshot reads per widget user', async () => {
    const snapshotUser = { ...user, id: 'snapshot-rate-user' };
    const snapshotAccessToken = generateToken(snapshotUser);
    User.findById.mockResolvedValue(snapshotUser);
    const issued = await request(app)
      .post('/api/widgets/token')
      .set('Authorization', `Bearer ${snapshotAccessToken}`)
      .send({});

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const allowed = await request(app)
        .get('/api/widgets/snapshot')
        .set('Authorization', `Bearer ${issued.body.token}`);
      expect(allowed.status).toBe(200);
    }

    const limited = await request(app)
      .get('/api/widgets/snapshot')
      .set('Authorization', `Bearer ${issued.body.token}`);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('900');
  });
});
