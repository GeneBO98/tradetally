jest.mock('../../../src/models/User', () => ({
  findByEmail: jest.fn(),
  verifyPassword: jest.fn(),
  getUserCount: jest.fn(),
  findByUsername: jest.fn(),
  create: jest.fn(),
  createSettings: jest.fn()
}));
jest.mock('../../../src/services/refreshToken.service', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  getAccessTokenSeconds: jest.fn(() => 900)
}));
jest.mock('../../../src/services/device.service', () => ({}));
jest.mock('../../../src/services/accountLockoutService', () => ({
  isLocked: jest.fn(async () => false),
  recordFailedAttempt: jest.fn(async () => false),
  recordSuccess: jest.fn(async () => undefined),
  LOCKED_MESSAGE: 'locked'
}));

const User = require('../../../src/models/User');
const refreshTokenService = require('../../../src/services/refreshToken.service');
const controller = require('../../../src/controllers/v1/auth.controller');

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

describe('v1 auth security policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'v1-auth-test-secret';
    process.env.REGISTRATION_MODE = 'open';
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
  });

  afterAll(() => {
    delete process.env.REGISTRATION_MODE;
  });

  test('does not issue access or refresh tokens before 2FA', async () => {
    User.findByEmail.mockResolvedValue({
      id: 'user-1', email: 'user@example.com', username: 'user', role: 'user',
      is_active: true, admin_approved: true, two_factor_enabled: true,
      session_version: 0
    });
    User.verifyPassword.mockResolvedValue(true);
    const res = response();

    await controller.login({ body: { email: 'user@example.com', password: 'password123' } }, res, jest.fn());

    expect(res.payload.requires2FA).toBe(true);
    expect(res.payload.tempToken).toEqual(expect.any(String));
    expect(refreshTokenService.generateAccessToken).not.toHaveBeenCalled();
    expect(refreshTokenService.generateRefreshToken).not.toHaveBeenCalled();
  });

  test('enforces approval mode on v1 login', async () => {
    process.env.REGISTRATION_MODE = 'approval';
    User.findByEmail.mockResolvedValue({
      id: 'user-1', email: 'user@example.com', username: 'user', role: 'user',
      is_active: true, admin_approved: false, two_factor_enabled: false
    });
    User.verifyPassword.mockResolvedValue(true);
    const res = response();

    await controller.login({ body: { email: 'user@example.com', password: 'password123' } }, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.payload.requiresApproval).toBe(true);
    expect(refreshTokenService.generateAccessToken).not.toHaveBeenCalled();
  });

  test('enforces disabled registration mode on v1 registration', async () => {
    process.env.REGISTRATION_MODE = 'disabled';
    const res = response();

    await controller.register({ body: { email: 'new@example.com', password: 'password123' } }, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.payload.registrationMode).toBe('disabled');
    expect(User.findByEmail).not.toHaveBeenCalled();
  });
});
