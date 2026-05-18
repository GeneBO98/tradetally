jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/models/User', () => ({
  create: jest.fn(),
  createSettings: jest.fn(),
  findByUsername: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  getSettings: jest.fn(),
  getUserCount: jest.fn(),
  verifyPassword: jest.fn(),
  updateLastLogin: jest.fn(),
  updateBackupCodes: jest.fn()
}));
jest.mock('../../src/services/emailService', () => ({
  isConfigured: jest.fn(() => true),
  sendVerificationEmail: jest.fn(() => Promise.resolve())
}));
jest.mock('../../src/services/tierService', () => ({
  getUserTierWithBillingStatus: jest.fn(async () => ({ tier: 'free', billingEnabled: false })),
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
const EmailService = require('../../src/services/emailService');
const { authenticate, generateToken, TOKEN_PURPOSES } = require('../../src/middleware/auth');
const jwt = require('jsonwebtoken');
const { hashBackupCode } = require('../../src/utils/twoFactorBackupCodes');

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
    delete process.env.DETAILED_AUTH_ERRORS;
    EmailService.isConfigured.mockReturnValue(true);
  });

  test('login keeps credential errors generic when SMTP is unconfigured unless explicitly opted in', async () => {
    EmailService.isConfigured.mockReturnValue(false);
    User.findByEmail.mockResolvedValue(null);

    const req = {
      body: {
        email: 'missing@example.com',
        password: 'password123'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.login(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: 'Invalid credentials' });
  });

  test('login returns detailed credential errors only when DETAILED_AUTH_ERRORS is true outside production', async () => {
    process.env.DETAILED_AUTH_ERRORS = 'true';
    EmailService.isConfigured.mockReturnValue(false);
    User.findByEmail.mockResolvedValue(null);

    const req = {
      body: {
        email: 'missing@example.com',
        password: 'password123'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.login(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: 'No account found with this email address' });
  });

  test('login rejects unverified users when email verification is configured', async () => {
    const user = {
      id: 'unverified-user-id',
      email: 'unverified@example.com',
      username: 'unverified',
      role: 'user',
      is_active: true,
      is_verified: false,
      admin_approved: true,
      two_factor_enabled: false
    };
    User.findByEmail.mockResolvedValue(user);
    User.verifyPassword.mockResolvedValue(true);

    const req = {
      body: {
        email: user.email,
        password: 'password123'
      },
      headers: {}
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.login(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual(expect.objectContaining({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      requiresVerification: true
    }));
    expect(User.updateLastLogin).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('register does not issue a session to non-first unverified users', async () => {
    const user = {
      id: 'registered-user-id',
      email: 'registered@example.com',
      username: 'registered',
      full_name: 'Registered User',
      avatar_url: null,
      role: 'user',
      is_verified: false,
      admin_approved: true,
      created_at: new Date().toISOString()
    };
    User.findByEmail.mockResolvedValue(null);
    User.findByUsername.mockResolvedValue(null);
    User.getUserCount.mockResolvedValue(1);
    User.create.mockResolvedValue(user);
    User.createSettings.mockResolvedValue({});

    const req = {
      body: {
        email: user.email,
        username: user.username,
        password: 'password123',
        fullName: 'Registered User'
      },
      headers: {}
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.register(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.payload).toEqual(expect.objectContaining({
      requiresVerification: true,
      requiresApproval: false
    }));
    expect(res.payload.token).toBeUndefined();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(User.updateLastLogin).not.toHaveBeenCalled();
  });

  test('login returns a pre-2fa token for 2FA-enabled users and that token is rejected by authenticate', async () => {
    const user = {
      id: '7f4af2f4-64b0-4ffc-a834-4b2578402e3d',
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      is_active: true,
      is_verified: true,
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

  test('verify2FA accepts a hashed backup code and removes only the used hash', async () => {
    const usedHash = await hashBackupCode('ABCDEF1234567890');
    const unusedHash = await hashBackupCode('0011223344556677');
    const user = {
      id: 'backup-code-user-id',
      email: 'backup@example.com',
      username: 'backup-user',
      role: 'user',
      full_name: 'Backup User',
      avatar_url: null,
      timezone: 'UTC',
      is_active: true,
      is_verified: true,
      admin_approved: true,
      marketing_consent: false,
      two_factor_enabled: true,
      two_factor_secret: 'BASE32SECRET',
      two_factor_backup_codes: [usedHash, unusedHash],
      last_login_at: null
    };

    const tempToken = generateToken(user, {
      purpose: TOKEN_PURPOSES.PRE_2FA,
      expiresIn: '15m'
    });

    User.findById.mockResolvedValue(user);
    speakeasy.totp.verify.mockReturnValue(false);

    const req = {
      body: {
        tempToken,
        twoFactorCode: 'abcd-ef12 3456 7890'
      },
      headers: {}
    };
    const res = createResponse();
    const next = jest.fn();

    await authController.verify2FA(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(User.updateBackupCodes).toHaveBeenCalledWith(user.id, [unusedHash]);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({
      message: 'Login successful',
      token: expect.any(String)
    }));
  });
});
