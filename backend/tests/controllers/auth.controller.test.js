jest.mock('../../src/models/User', () => ({
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findById: jest.fn(),
  verifyPassword: jest.fn(),
  updateLastLogin: jest.fn(),
  updateBackupCodes: jest.fn(),
  getSettings: jest.fn(),
  getUserCount: jest.fn(),
  create: jest.fn(),
  createSettings: jest.fn(),
  updateResetToken: jest.fn()
}));
jest.mock('../../src/services/emailService', () => ({
  isConfigured: jest.fn(() => true)
}));
jest.mock('../../src/services/tierService', () => ({
  getUserTier: jest.fn(async () => 'free'),
  isBillingEnabled: jest.fn(async () => true),
  getUserTierWithBillingStatus: jest.fn(async () => ({ tier: 'free', billingEnabled: true }))
}));
jest.mock('../../src/services/yearWrappedService', () => ({
  recordLogin: jest.fn(() => Promise.resolve())
}));
jest.mock('../../src/services/refreshToken.service', () => ({}));
jest.mock('../../src/services/sampleDataService', () => ({
  createForUser: jest.fn()
}));
jest.mock('../../src/services/activityTrackingService', () => ({
  trackEvent: jest.fn()
}));
jest.mock('../../src/utils/jobQueue', () => ({
  addJob: jest.fn()
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
const jobQueue = require('../../src/utils/jobQueue');

function flushImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

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
    cookie: jest.fn(),
    clearCookie: jest.fn()
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
      headers: { 'x-biometric-enrollment': 'true' }
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.verify2FA(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith('token', expect.any(String), expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax'
    }));
    expect(res.cookie).toHaveBeenCalledWith('csrf_token', expect.any(String), expect.objectContaining({
      httpOnly: false,
      sameSite: 'lax'
    }));
    expect(res.payload).toEqual(expect.objectContaining({
      message: 'Login successful',
      token: expect.any(String),
      biometric_token: expect.any(String)
    }));
  });

  test('biometric login exchanges a previously enrolled grant without another 2FA code', async () => {
    const user = {
      id: '7f4af2f4-64b0-4ffc-a834-4b2578402e3d',
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      full_name: 'Test User',
      avatar_url: null,
      is_active: true,
      is_verified: true,
      admin_approved: true,
      marketing_consent: false,
      two_factor_enabled: true,
      two_factor_enabled_at: new Date('2026-07-01T12:00:00.000Z'),
      session_version: 4,
      last_login_at: new Date('2026-07-01T12:05:00.000Z'),
      created_at: new Date('2025-01-01T00:00:00.000Z')
    };
    const biometricToken = generateToken(user, {
      purpose: TOKEN_PURPOSES.BIOMETRIC_LOGIN,
      expiresIn: '90d'
    });

    User.findById.mockResolvedValue(user);
    User.getSettings.mockResolvedValue({ onboarding_step: 0, pro_onboarding_step: 0 });

    const req = {
      body: { biometric_token: biometricToken },
      headers: { host: 'localhost:3030', 'user-agent': 'TradeTally-iOS/1.0' }
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.biometricLogin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(User.updateLastLogin).toHaveBeenCalledWith(user.id);
    expect(res.payload).toEqual(expect.objectContaining({
      message: 'Login successful',
      token: expect.any(String),
      biometric_token: expect.any(String),
      user: expect.objectContaining({ id: user.id })
    }));
    expect(jwt.verify(res.payload.token, process.env.JWT_SECRET).purpose).toBe(TOKEN_PURPOSES.ACCESS);
    expect(jwt.verify(res.payload.biometric_token, process.env.JWT_SECRET).purpose)
      .toBe(TOKEN_PURPOSES.BIOMETRIC_LOGIN);
  });

  test('biometric login rejects a grant after the 2FA enrollment changes', async () => {
    const enrolledUser = {
      id: '7f4af2f4-64b0-4ffc-a834-4b2578402e3d',
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      is_active: true,
      two_factor_enabled: true,
      two_factor_enabled_at: new Date('2026-07-01T12:00:00.000Z'),
      session_version: 4
    };
    const biometricToken = generateToken(enrolledUser, {
      purpose: TOKEN_PURPOSES.BIOMETRIC_LOGIN,
      expiresIn: '90d'
    });

    User.findById.mockResolvedValue({
      ...enrolledUser,
      two_factor_enabled_at: new Date('2026-07-20T12:00:00.000Z')
    });

    const req = {
      body: { biometric_token: biometricToken },
      headers: {}
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.biometricLogin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: 'Invalid or expired biometric login' });
    expect(User.updateLastLogin).not.toHaveBeenCalled();
  });

  test('verify2FA rejects a legacy temp token without a purpose claim', async () => {
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
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: 'Invalid or expired temporary token' });
    expect(User.findById).not.toHaveBeenCalled();
  });

  test('register queues verification email for non-first users', async () => {
    User.findByEmail.mockResolvedValue(null);
    User.findByUsername.mockResolvedValue(null);
    User.getUserCount.mockResolvedValue(1);
    User.create.mockResolvedValue({
      id: 'user-2',
      email: 'new@example.com',
      username: 'newuser',
      full_name: 'New User',
      avatar_url: null,
      role: 'user',
      is_verified: false,
      admin_approved: true,
      created_at: new Date().toISOString()
    });
    User.createSettings.mockResolvedValue({});
    User.getSettings.mockResolvedValue({ onboarding_step: 0, pro_onboarding_step: 0 });

    const req = {
      body: {
        email: 'new@example.com',
        username: 'newuser',
        password: 'password123',
        fullName: 'New User'
      },
      headers: {
        host: 'localhost:3030'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.register(req, res, next);
    await flushImmediate();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(jobQueue.addJob).toHaveBeenCalledWith(
      'verification_email',
      expect.objectContaining({
        email: 'new@example.com',
        token: expect.any(String)
      }),
      2
    );
  });

  test('forgotPassword queues reset email after persisting token', async () => {
    User.findByEmail.mockResolvedValue({
      id: 'user-3',
      email: 'reset@example.com'
    });
    User.updateResetToken.mockResolvedValue(undefined);

    const req = {
      body: {
        email: 'reset@example.com'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.forgotPassword(req, res, next);
    await flushImmediate();

    expect(next).not.toHaveBeenCalled();
    expect(User.updateResetToken).toHaveBeenCalledWith(
      'user-3',
      expect.any(String),
      expect.any(Date)
    );
    expect(jobQueue.addJob).toHaveBeenCalledWith(
      'password_reset_email',
      expect.objectContaining({
        email: 'reset@example.com',
        token: expect.any(String)
      }),
      2
    );
    expect(res.payload).toEqual({
      message: 'If the email exists, a reset link has been sent'
    });
  });
});
