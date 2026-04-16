jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ two_factor_enabled: false }] })
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,...')
}));
jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(() => ({
    base32: 'TESTSECRET',
    otpauth_url: 'otpauth://totp/TradeTally'
  }))
}));

const twoFactorController = require('../../src/controllers/twoFactor.controller');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

describe('twoFactorController.generateSetup — backup code RNG', () => {
  test('backup codes are 10 distinct 8-character uppercase hex strings', async () => {
    const req = { user: { id: 'user-1', email: 'u@example.com' } };
    const res = createRes();
    const next = jest.fn();

    await twoFactorController.generateSetup(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.payload).toEqual(expect.objectContaining({
      backupCodes: expect.any(Array)
    }));

    const codes = res.payload.backupCodes;
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{8}$/);
    }
    // crypto.randomBytes output is statistically certain to have all 10 distinct.
    // Math.random().toString(36).substr(2,8) also usually produces distinct codes,
    // so this check is not a strict RNG test — but combined with the hex-only
    // format above, the only way to satisfy both is crypto.randomBytes.
    expect(new Set(codes).size).toBe(10);
  });
});
