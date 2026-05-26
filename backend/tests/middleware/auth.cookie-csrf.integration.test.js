jest.mock('../../src/models/User', () => ({
  findById: jest.fn()
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const User = require('../../src/models/User');
const { authenticate, clearAuthUserCache, generateToken } = require('../../src/middleware/auth');
const { requireCsrf, generateCsrfToken, CSRF_HEADER_NAME } = require('../../src/middleware/csrf');

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.post('/protected', requireCsrf, authenticate, (req, res) => {
    res.json({
      ok: true,
      authSource: req.authSource,
      userId: req.user.id
    });
  });
  app.get('/whoami', authenticate, (req, res) => {
    res.json({ ok: true, userId: req.user.id });
  });
  return app;
}

describe('cookie auth with csrf integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAuthUserCache();
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_USER_CACHE_TTL_MS = '30000';
    User.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      is_active: true
    });
  });

  test('allows cookie-authenticated write with matching csrf token', async () => {
    const app = buildApp();
    const token = generateToken({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user'
    });
    const csrfToken = generateCsrfToken();

    const response = await request(app)
      .post('/protected')
      .set('Cookie', [`token=${token}`, `csrf_token=${csrfToken}`])
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ action: 'update' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      authSource: 'cookie',
      userId: 'user-1'
    });
  });

  test('rejects cookie-authenticated write without csrf header', async () => {
    const app = buildApp();
    const token = generateToken({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user'
    });
    const csrfToken = generateCsrfToken();

    const response = await request(app)
      .post('/protected')
      .set('Cookie', [`token=${token}`, `csrf_token=${csrfToken}`])
      .send({ action: 'update' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Invalid CSRF token',
      code: 'INVALID_CSRF_TOKEN'
    });
  });

  test('allows bearer-authenticated write without csrf token', async () => {
    const app = buildApp();
    const token = generateToken({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user'
    });

    const response = await request(app)
      .post('/protected')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'update' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      authSource: 'bearer',
      userId: 'user-1'
    });
  });

  test('reuses active user lookup within auth cache TTL', async () => {
    const app = buildApp();
    const token = generateToken({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user'
    });

    const first = await request(app)
      .get('/whoami')
      .set('Cookie', [`token=${token}`]);
    const second = await request(app)
      .get('/whoami')
      .set('Cookie', [`token=${token}`]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(User.findById).toHaveBeenCalledTimes(1);
  });

  test('does not cache unknown users', async () => {
    User.findById.mockResolvedValue(null);
    const app = buildApp();
    const token = generateToken({ id: 'ghost', email: 'ghost@example.com', username: 'ghost', role: 'user' });

    const first = await request(app)
      .get('/whoami')
      .set('Cookie', [`token=${token}`]);
    const second = await request(app)
      .get('/whoami')
      .set('Cookie', [`token=${token}`]);

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(User.findById).toHaveBeenCalledTimes(2);
  });

  test('transient DB failure in lookup returns 503, not 401 (session preserved)', async () => {
    // A valid token but a flaky DB must NOT log the user out. The frontend only
    // clears the session + redirects to /login on a 401, so this must be 5xx.
    User.findById.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));
    const app = buildApp();
    const token = generateToken({ id: 'user-1', email: 'user@example.com', username: 'user', role: 'user' });

    const response = await request(app)
      .get('/whoami')
      .set('Cookie', [`token=${token}`]);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('AUTH_UNAVAILABLE');
  });

  test('missing token still returns 401', async () => {
    const app = buildApp();
    const response = await request(app).get('/whoami');
    expect(response.status).toBe(401);
  });

  test('unknown/inactive user still returns 401', async () => {
    User.findById.mockResolvedValueOnce(null);
    const app = buildApp();
    const token = generateToken({ id: 'ghost', email: 'ghost@example.com', username: 'ghost', role: 'user' });

    const response = await request(app)
      .get('/whoami')
      .set('Cookie', [`token=${token}`]);

    expect(response.status).toBe(401);
  });
});
