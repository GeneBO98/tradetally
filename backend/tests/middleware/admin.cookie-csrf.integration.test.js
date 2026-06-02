jest.mock('../../src/models/User', () => ({
  findById: jest.fn()
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const User = require('../../src/models/User');
const { requireAdmin, generateToken } = require('../../src/middleware/auth');
const { requireCsrf, generateCsrfToken, CSRF_HEADER_NAME } = require('../../src/middleware/csrf');

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.post('/admin/protected', requireCsrf, requireAdmin, (req, res) => {
    res.json({
      ok: true,
      authSource: req.authSource,
      role: req.user.role
    });
  });
  return app;
}

describe('admin cookie auth with csrf integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
    User.findById.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin',
      is_active: true
    });
  });

  test('rejects cookie-authenticated admin write without csrf header', async () => {
    const app = buildApp();
    const token = generateToken({
      id: 'admin-1',
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin'
    });
    const csrfToken = generateCsrfToken();

    const response = await request(app)
      .post('/admin/protected')
      .set('Cookie', [`token=${token}`, `csrf_token=${csrfToken}`])
      .send({ action: 'cleanup' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Invalid CSRF token',
      code: 'INVALID_CSRF_TOKEN'
    });
  });

  test('allows cookie-authenticated admin write with matching csrf header', async () => {
    const app = buildApp();
    const token = generateToken({
      id: 'admin-1',
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin'
    });
    const csrfToken = generateCsrfToken();

    const response = await request(app)
      .post('/admin/protected')
      .set('Cookie', [`token=${token}`, `csrf_token=${csrfToken}`])
      .set(CSRF_HEADER_NAME, csrfToken)
      .send({ action: 'cleanup' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      authSource: 'cookie',
      role: 'admin'
    });
  });
});
