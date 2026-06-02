jest.mock('../../src/middleware/auth', () => ({
  authenticate: jest.fn((req, _res, next) => {
    req.user = { id: 'user-1', role: 'user' };
    next();
  })
}));
jest.mock('../../src/controllers/brokerSync.controller', () => ({
  getConnections: jest.fn(),
  getAllSyncLogs: jest.fn(),
  getConnection: jest.fn(),
  getSyncLogs: jest.fn(),
  addIBKRConnection: jest.fn(),
  initSchwabOAuth: jest.fn((req, res) => {
    res.json({ success: true, auth_url: 'https://example.com/oauth' });
  }),
  handleSchwabCallback: jest.fn(),
  initBrokerOAuth: jest.fn(),
  handleBrokerOAuthCallback: jest.fn(),
  updateConnection: jest.fn(),
  deleteConnection: jest.fn(),
  triggerSync: jest.fn(),
  testConnection: jest.fn(),
  deleteBrokerTrades: jest.fn(),
  getSyncStatus: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const brokerSyncRoutes = require('../../src/routes/brokerSync.routes');

describe('broker sync route rate limiting', () => {
  test('POST /connections/schwab/init returns the standardized 429 payload after the route limit is exceeded', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json());
    app.use('/', brokerSyncRoutes);

    for (let i = 0; i < 20; i += 1) {
      const response = await request(app)
        .post('/connections/schwab/init')
        .send({});
      expect(response.status).toBe(200);
    }

    const limited = await request(app)
      .post('/connections/schwab/init')
      .send({});

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('900');
    expect(limited.body).toEqual({
      error: 'Too many requests',
      message: 'Too many broker sync requests. Please try again later.',
      retryAfter: 900
    });
  });
});
