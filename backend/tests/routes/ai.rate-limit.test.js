jest.mock('../../src/middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    req.user = { id: 'user-1', role: 'user' };
    req.authSource = 'bearer';
    next();
  })
}));
jest.mock('../../src/controllers/ai.controller', () => ({
  createSession: jest.fn((req, res) => {
    res.status(201).json({ success: true, session_id: 'session-1' });
  }),
  getUserSessions: jest.fn(),
  getTradeAnalyses: jest.fn(),
  deleteTradeAnalysis: jest.fn(),
  deleteTradeAnalyses: jest.fn(),
  getSession: jest.fn(),
  sendFollowup: jest.fn(),
  closeSession: jest.fn(),
  getCredits: jest.fn(),
  getCreditHistory: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const aiRoutes = require('../../src/routes/ai.routes');

describe('ai route rate limiting', () => {
  test('POST /sessions returns the standardized 429 payload after the route limit is exceeded', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json());
    app.use('/', aiRoutes);

    for (let i = 0; i < 30; i += 1) {
      const response = await request(app)
        .post('/sessions')
        .send({});
      expect(response.status).toBe(201);
    }

    const limited = await request(app)
      .post('/sessions')
      .send({});

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('900');
    expect(limited.body).toEqual({
      error: 'Too many requests',
      message: 'Too many AI requests. Please slow down and try again later.',
      retryAfter: 900
    });
  });
});
