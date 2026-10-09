const mockRouteHandler = jest.fn((req, res) => res.json({ message: 'ok' }));

jest.mock('../../src/controllers/user.controller', () => new Proxy(
  { deleteOwnAccount: mockRouteHandler },
  {
    get(target, property) {
      if (!(property in target)) target[property] = mockRouteHandler;
      return target[property];
    }
  }
));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    req.user = {
      id: req.get('x-test-user-id') || 'user-1',
      email: 'user@example.com',
      role: 'user'
    };
    next();
  }),
  requireAdmin: jest.fn((_req, _res, next) => next())
}));

const express = require('express');
const request = require('supertest');
const userRoutes = require('../../src/routes/user.routes');

describe('account deletion route validation and rate limiting', () => {
  test('strictly validates password and limits deletion attempts', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json());
    app.use('/', userRoutes);

    const missing = await request(app).delete('/account').send({});
    expect(missing.status).toBe(400);

    const wrongType = await request(app).delete('/account').send({ password: 12345 });
    expect(wrongType.status).toBe(400);

    const tooLong = await request(app)
      .delete('/account')
      .send({ password: 'x'.repeat(257) });
    expect(tooLong.status).toBe(400);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const allowed = await request(app)
        .delete('/account')
        .send({ password: 'correct-password' });
      expect(allowed.status).toBe(200);
    }

    const limited = await request(app)
      .delete('/account')
      .send({ password: 'correct-password' });

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('900');
    expect(limited.body).toEqual({
      error: 'Too many requests',
      message: 'Too many account deletion attempts. Please try again later.',
      retryAfter: 900
    });

    const otherAccount = await request(app)
      .delete('/account')
      .set('x-test-user-id', 'user-2')
      .send({ password: 'correct-password' });
    expect(otherAccount.status).toBe(200);
    expect(mockRouteHandler).toHaveBeenCalledTimes(3);
  });
});
