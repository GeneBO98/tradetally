jest.mock('../../src/models/User', () => ({
  findById: jest.fn()
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const User = require('../../src/models/User');
const { authenticate, generateToken } = require('../../src/middleware/auth');
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
  return app;
}

describe('cookie auth with csrf integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
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
});
