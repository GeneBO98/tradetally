// /api/users/profile must never return the raw two_factor_secret,
// two_factor_backup_codes, or unmasked AI provider keys. An XSS or stolen
// session token reading the profile must not yield the 2FA TOTP seed or
// third-party API keys.

jest.mock('../../src/models/User', () => ({
  findById: jest.fn(),
  getSettings: jest.fn()
}));

const User = require('../../src/models/User');
const userController = require('../../src/controllers/user.controller');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

describe('userController.getProfile — sensitive field scrubbing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('response does not include two_factor_secret', async () => {
    User.findById.mockResolvedValue({
      id: 'user-1',
      email: 'u@example.com',
      username: 'u',
      two_factor_enabled: true,
      two_factor_secret: 'BASE32SECRET-MUST-NOT-LEAK',
      two_factor_backup_codes: ['AAAA1111', 'BBBB2222']
    });
    User.getSettings.mockResolvedValue({});

    const req = { user: { id: 'user-1' } };
    const res = createRes();
    await userController.getProfile(req, res, jest.fn());

    const serialized = JSON.stringify(res.payload);
    expect(serialized).not.toContain('BASE32SECRET-MUST-NOT-LEAK');
    expect(serialized).not.toContain('AAAA1111');
    expect(serialized).not.toContain('BBBB2222');
    expect(res.payload.user.two_factor_secret).toBeUndefined();
    expect(res.payload.user.two_factor_backup_codes).toBeUndefined();
    // two_factor_enabled is a non-sensitive flag and should still be present
    expect(res.payload.user.two_factor_enabled).toBe(true);
  });

  test('response masks ai_api_key and cusip_ai_api_key', async () => {
    User.findById.mockResolvedValue({ id: 'user-1', email: 'u@example.com' });
    User.getSettings.mockResolvedValue({
      ai_api_key: 'sk-openai-SUPER-SECRET',
      cusip_ai_api_key: 'sk-cusip-ALSO-SECRET',
      ai_provider: 'openai'
    });

    const req = { user: { id: 'user-1' } };
    const res = createRes();
    await userController.getProfile(req, res, jest.fn());

    const serialized = JSON.stringify(res.payload);
    expect(serialized).not.toContain('sk-openai-SUPER-SECRET');
    expect(serialized).not.toContain('sk-cusip-ALSO-SECRET');
    expect(res.payload.settings.ai_api_key).toBe('***');
    expect(res.payload.settings.cusip_ai_api_key).toBe('***');
  });

  test('returns empty string for absent AI keys rather than ***', async () => {
    User.findById.mockResolvedValue({ id: 'user-1', email: 'u@example.com' });
    User.getSettings.mockResolvedValue({
      ai_api_key: null,
      cusip_ai_api_key: '',
      ai_provider: 'gemini'
    });

    const req = { user: { id: 'user-1' } };
    const res = createRes();
    await userController.getProfile(req, res, jest.fn());

    expect(res.payload.settings.ai_api_key).toBe('');
    expect(res.payload.settings.cusip_ai_api_key).toBe('');
  });
});
