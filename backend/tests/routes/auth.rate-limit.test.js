jest.mock('../../src/controllers/auth.controller', () => ({
  login: jest.fn((req, res) => res.status(401).json({ error: 'Invalid credentials' })),
  getRegistrationConfig: jest.fn(),
  register: jest.fn(),
  verify2FA: jest.fn(),
  logout: jest.fn(),
  getMe: jest.fn(),
  refreshToken: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  sendTestEmail: jest.fn(),
  createSudoToken: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const authRoutes = require('../../src/routes/auth.routes');

describe('auth route rate limiting', () => {
  test('POST /login returns the standardized 429 payload after the route limit is exceeded', async () => {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json());
    app.use('/', authRoutes);

    for (let i = 0; i < 10; i += 1) {
      const response = await request(app)
        .post('/login')
        .send({ email: 'user@example.com', password: 'password123' });
      expect(response.status).toBe(401);
    }

    const limited = await request(app)
      .post('/login')
      .send({ email: 'user@example.com', password: 'password123' });

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('900');
    expect(limited.body).toEqual({
      error: 'Too many requests',
      message: 'Too many attempts. Please try again later.',
      retryAfter: 900
    });
  });
});
