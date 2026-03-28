jest.mock('../../src/models/User', () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  verifyPassword: jest.fn(),
  updateLastLogin: jest.fn(),
  updateBackupCodes: jest.fn(),
  getSettings: jest.fn()
}));
jest.mock('../../src/services/emailService', () => ({
  isConfigured: jest.fn(() => true)
}));
jest.mock('../../src/services/tierService', () => ({
  getUserTier: jest.fn(async () => 'free'),
  isBillingEnabled: jest.fn(async () => true)
}));
jest.mock('../../src/services/yearWrappedService', () => ({
  recordLogin: jest.fn(() => Promise.resolve())
}));
jest.mock('../../src/services/refreshToken.service', () => ({}));
jest.mock('../../src/services/sampleDataService', () => ({}));
jest.mock('../../src/services/activityTrackingService', () => ({
  trackEvent: jest.fn()
}));
jest.mock('speakeasy', () => ({
  totp: {
    verify: jest.fn()
  }
}));

const User = require('../../src/models/User');
const authController = require('../../src/controllers/auth.controller');
const speakeasy = require('speakeasy');
const { authenticate, generateToken, TOKEN_PURPOSES } = require('../../src/middleware/auth');
const jwt = require('jsonwebtoken');

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

  test('verify2FA accepts a pre-2fa token and completes login', async () => {
    const user = {
      id: '7f4af2f4-64b0-4ffc-a834-4b2578402e3d',
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      full_name: 'Test User',
      avatar_url: null,
      timezone: 'UTC',
      is_active: true,
      is_verified: true,
      admin_approved: true,
      marketing_consent: false,
      two_factor_enabled: true,
      two_factor_secret: 'BASE32SECRET',
      two_factor_backup_codes: [],
      last_login_at: null
    };

    const tempToken = generateToken(user, {
      purpose: TOKEN_PURPOSES.PRE_2FA,
      expiresIn: '15m'
    });

    User.findById.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(true);

    const req = {
      body: {
        tempToken,
        twoFactorCode: '123456'
      },
      headers: {}
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.verify2FA(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith('token', expect.any(String), expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax'
    }));
    expect(res.payload).toEqual(expect.objectContaining({
      message: 'Login successful',
      token: expect.any(String)
    }));
  });

  test('verify2FA accepts a legacy temp token without a purpose claim', async () => {
    const user = {
      id: 'legacy-user-id',
      email: 'legacy@example.com',
      username: 'legacy-user',
      role: 'user',
      full_name: 'Legacy User',
      avatar_url: null,
      timezone: 'UTC',
      is_active: true,
      is_verified: true,
      admin_approved: true,
      marketing_consent: false,
      two_factor_enabled: true,
      two_factor_secret: 'BASE32SECRET',
      two_factor_backup_codes: [],
      last_login_at: null
    };

    const legacyTempToken = jwt.sign({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    }, process.env.JWT_SECRET, { expiresIn: '15m' });

    User.findById.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(true);

    const req = {
      body: {
        temp_token: legacyTempToken,
        two_factor_code: '123456'
      },
      headers: {}
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.verify2FA(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.payload.token).toEqual(expect.any(String));
  });
});
