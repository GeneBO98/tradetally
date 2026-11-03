jest.mock('../../src/models/User', () => ({ findById: jest.fn() }));

// Keep these tests at the routing boundary: permitted requests reach a harmless
// controller, while rejected requests cannot invoke application side effects.
jest.mock('../../src/controllers/auth.controller', () => new Proxy({}, {
  get: () => (req, res) => res.json({ reachedController: true })
}));
jest.mock('../../src/controllers/v1/auth.controller', () => new Proxy({}, {
  get: () => (req, res) => res.json({ reachedController: true })
}));
jest.mock('../../src/controllers/oauth2.controller', () => new Proxy({}, {
  get: () => (req, res) => res.json({ reachedController: true })
}));
jest.mock('../../src/controllers/settings.controller', () => new Proxy({}, {
  get: () => (req, res) => res.json({ reachedController: true })
}));
jest.mock('../../src/controllers/webMentions.controller', () => new Proxy({}, {
  get: () => (req, res) => res.json({ reachedController: true })
}));
jest.mock('../../src/middleware/tierAuth', () => ({
  requiresTier: () => (req, res, next) => next(),
  attachTierInfo: (req, res, next) => next()
}));

const express = require('express');
const request = require('supertest');
const User = require('../../src/models/User');
const { generateToken, clearAuthUserCache } = require('../../src/middleware/auth');

const app = express();
app.use(express.json());
app.use('/auth', require('../../src/routes/auth.routes'));
app.use('/v1/auth', require('../../src/routes/v1/auth.routes'));
app.use('/oauth', require('../../src/routes/oauth2.routes'));
app.use('/settings', require('../../src/routes/settings.routes'));
app.use('/mentions', require('../../src/routes/webMentions.routes'));

const endpoints = [
  ['post', '/auth/test-email'],
  ['post', '/v1/auth/test-email'],
  ['get', '/oauth/api/clients'],
  ['post', '/oauth/api/clients'],
  ['delete', '/oauth/api/clients/example-client'],
  ['get', '/settings/admin/ai'],
  ['get', '/settings/admin/cusip-ai'],
  ['get', '/settings/admin/all'],
  ['post', '/mentions/sources/refresh']
];

describe.each(endpoints)('%s %s administrator authorization', (method, path) => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAuthUserCache();
    process.env.JWT_SECRET = 'admin-authorization-test-secret';
    process.env.NODE_ENV = 'test';
  });

  test.each([
    [null, 401],
    ['user', 403],
    ['admin', 200],
    ['owner', 200]
  ])('role %s receives %s', async (role, status) => {
    const user = {
      id: 'authorization-user', email: 'authorization@example.com',
      username: 'authorization', role, is_active: true
    };
    User.findById.mockResolvedValue(user);
    const call = request(app)[method](path);
    if (role) call.set('Authorization', `Bearer ${generateToken(user)}`);

    const response = await call.send({});

    expect(response.status).toBe(status);
    if (status === 200) {
      expect(response.body).toEqual({ reachedController: true });
    } else {
      expect(response.body.reachedController).toBeUndefined();
    }
  });
});
