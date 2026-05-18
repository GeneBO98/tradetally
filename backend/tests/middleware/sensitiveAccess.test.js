jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/models/User', () => ({
  updateBackupCodes: jest.fn(),
  verifyPassword: jest.fn()
}));

jest.mock('../../src/utils/twoFactorBackupCodes', () => ({
  findMatchingBackupCodeIndex: jest.fn()
}));

const jwt = require('jsonwebtoken');
const db = require('../../src/config/database');
const User = require('../../src/models/User');
const { TOKEN_PURPOSES, generateToken } = require('../../src/middleware/auth');
const {
  requireSudo,
  requireVerifiedEmail,
  verifyPasswordAndOptional2FA
} = require('../../src/middleware/sensitiveAccess');

function res() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('sensitiveAccess middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'sensitive-access-secret-32-chars';
    delete process.env.REQUIRE_SUDO_FOR_SECURITY_ENROLLMENT;
    delete process.env.REQUIRE_VERIFIED_EMAIL_FOR_SENSITIVE_ENDPOINTS;
  });

  test('requires verified email by default for sensitive routes', () => {
    const req = { user: { id: 'u1', is_verified: false } };
    const response = res();
    const next = jest.fn();

    requireVerifiedEmail(req, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'EMAIL_VERIFICATION_REQUIRED'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts a matching sudo token', () => {
    const token = generateToken({ id: 'u1', email: 'u@example.com', username: 'u', role: 'user' }, {
      purpose: TOKEN_PURPOSES.SUDO,
      expiresIn: '5m'
    });
    const req = { user: { id: 'u1' }, headers: { 'x-sudo-token': token }, body: {} };
    const response = res();
    const next = jest.fn();

    requireSudo(req, response, next);

    expect(next).toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  test('rejects access tokens as sudo tokens', () => {
    const token = jwt.sign({ id: 'u1', purpose: TOKEN_PURPOSES.ACCESS }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '5m'
    });
    const req = { user: { id: 'u1' }, headers: { 'x-sudo-token': token }, body: {} };
    const response = res();
    const next = jest.fn();

    requireSudo(req, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SUDO_INVALID'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  test('validates password and requires 2FA code when enabled', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'u1',
        password_hash: 'hash',
        two_factor_enabled: true,
        two_factor_secret: 'SECRET',
        two_factor_backup_codes: []
      }]
    });
    User.verifyPassword.mockResolvedValue(true);

    const result = await verifyPasswordAndOptional2FA('u1', 'password');

    expect(result).toEqual({ ok: false, code: 'TWO_FACTOR_REQUIRED' });
  });

  test('consumes a backup code used for sudo re-authentication', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'u1',
        password_hash: 'hash',
        two_factor_enabled: true,
        two_factor_secret: 'SECRET',
        two_factor_backup_codes: ['hash-a', 'hash-b']
      }]
    });
    User.verifyPassword.mockResolvedValue(true);
    User.updateBackupCodes.mockResolvedValue({ id: 'u1' });
    require('../../src/utils/twoFactorBackupCodes').findMatchingBackupCodeIndex.mockResolvedValue(1);

    const result = await verifyPasswordAndOptional2FA('u1', 'password', 'backup-code');

    expect(result.ok).toBe(true);
    expect(User.updateBackupCodes).toHaveBeenCalledWith('u1', ['hash-a']);
  });
});
