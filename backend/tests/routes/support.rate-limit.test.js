jest.mock('../../src/middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    req.user = { id: 'user-1', role: 'user' };
    next();
  })
}));
jest.mock('../../src/controllers/support.controller', () => ({
  submitContactRequest: jest.fn((req, res) => {
    res.json({ success: true, message: 'queued' });
  })
}));

const express = require('express');
const request = require('supertest');
const supportRoutes = require('../../src/routes/support.routes');

describe('support route rate limiting', () => {
  test('POST /contact returns the standardized 429 payload after the route limit is exceeded', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json());
    app.use('/', supportRoutes);

    for (let i = 0; i < 5; i += 1) {
      const response = await request(app)
        .post('/contact')
        .send({ subject: 'Need help', message: 'Please check my account' });
      expect(response.status).toBe(200);
    }

    const limited = await request(app)
      .post('/contact')
      .send({ subject: 'Need help', message: 'Please check my account' });

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('900');
    expect(limited.body).toEqual({
      error: 'Too many requests',
      message: 'Too many support requests. Please try again later.',
      retryAfter: 900
    });
  });
});
