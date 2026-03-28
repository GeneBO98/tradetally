jest.mock('../../src/models/User', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  verifyPassword: jest.fn()
}));
jest.mock('../../src/services/emailService', () => ({
  isConfigured: jest.fn(() => true)
}));
jest.mock('../../src/services/tierService', () => ({}));
jest.mock('../../src/services/yearWrappedService', () => ({
  recordLogin: jest.fn()
}));
jest.mock('../../src/services/refreshToken.service', () => ({}));
jest.mock('../../src/services/sampleDataService', () => ({}));
jest.mock('../../src/services/activityTrackingService', () => ({
  trackEvent: jest.fn()
}));

const User = require('../../src/models/User');
const authController = require('../../src/controllers/auth.controller');
const { authenticate } = require('../../src/middleware/auth');

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
    cookie: jest.fn()
  };
}

describe('auth controller 2FA flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
  });

  test('login returns a pre-2fa token for 2FA-enabled users and that token is rejected by authenticate', async () => {
    const user = {
      id: '7f4af2f4-64b0-4ffc-a834-4b2578402e3d',
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      is_active: true,
      two_factor_enabled: true,
      admin_approved: true
    };

    User.findByEmail.mockResolvedValue(user);
    User.verifyPassword.mockResolvedValue(true);

    const req = {
      body: {
        email: user.email,
        password: 'password123'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.login(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.payload.requires2FA).toBe(true);
    expect(typeof res.payload.tempToken).toBe('string');

    const authReq = {
      header: jest.fn(() => `Bearer ${res.payload.tempToken}`),
      headers: {}
    };
    const authRes = createResponse();
    const authNext = jest.fn();

    await authenticate(authReq, authRes, authNext);

    expect(authNext).not.toHaveBeenCalled();
    expect(authRes.statusCode).toBe(401);
    expect(authRes.payload).toEqual(expect.objectContaining({
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    }));
  });
});
