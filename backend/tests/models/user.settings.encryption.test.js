// User-supplied AI provider keys are stored AES-256-GCM encrypted at rest and
// transparently decrypted on read. Legacy plaintext rows must still decode
// cleanly (fallback). These tests exercise the read/write paths.

const mockEncryptionService = {
  _isEncrypted: false,
  isEncrypted: jest.fn(function (v) { return this._isEncrypted && !!v; }),
  encrypt: jest.fn(v => `ENC[${v}]`),
  decrypt: jest.fn(v => String(v).replace(/^ENC\[|\]$/g, ''))
};

jest.mock('../../src/services/brokerSync/encryptionService', () => mockEncryptionService);

jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));

const db = require('../../src/config/database');
const User = require('../../src/models/User');

describe('User.updateSettings — AI key encryption on write', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncryptionService._isEncrypted = false;
    // The UPDATE ... RETURNING * call returns the encrypted blob; getSettings
    // normalization decrypts it. For this write-side test we only check what
    // went into the INSERT/UPDATE parameters.
    db.query.mockResolvedValue({
      rows: [{ ai_api_key: 'ENC[sk-real-key]', cusip_ai_api_key: 'ENC[sk-cusip]' }]
    });
  });

  test('encrypts ai_api_key before persisting', async () => {
    await User.updateSettings('user-1', { ai_api_key: 'sk-real-key' });

    const params = db.query.mock.calls[0][1];
    // The first param is the encrypted key value (index 0), userId is last.
    expect(params[0]).toBe('ENC[sk-real-key]');
    expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('sk-real-key');
  });

  test('encrypts cusip_ai_api_key before persisting', async () => {
    await User.updateSettings('user-1', { cusip_ai_api_key: 'sk-cusip-key' });

    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe('ENC[sk-cusip-key]');
  });

  test('does not double-encrypt values that are already encrypted', async () => {
    mockEncryptionService._isEncrypted = true;
    await User.updateSettings('user-1', { ai_api_key: 'ENC[already-encrypted]' });

    expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();
    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe('ENC[already-encrypted]');
  });

  test('does not encrypt non-sensitive fields', async () => {
    await User.updateSettings('user-1', { ai_provider: 'openai', ai_api_url: 'https://api.example' });

    expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();
  });
});

describe('User.getSettings — AI key decryption on read', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncryptionService._isEncrypted = true;
  });

  test('returns decrypted ai_api_key and cusip_ai_api_key', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        ai_api_key: 'ENC[sk-real-key]',
        cusip_ai_api_key: 'ENC[sk-cusip]',
        ai_provider: 'openai',
        statistics_calculation: 'average'
      }]
    });

    const settings = await User.getSettings('user-1');

    expect(settings.ai_api_key).toBe('sk-real-key');
    expect(settings.cusip_ai_api_key).toBe('sk-cusip');
  });

  test('falls back to raw value when decrypt throws (legacy plaintext)', async () => {
    mockEncryptionService._isEncrypted = true;
    mockEncryptionService.decrypt.mockImplementationOnce(() => { throw new Error('bad'); });
    db.query.mockResolvedValueOnce({
      rows: [{
        ai_api_key: 'legacy-plaintext-key',
        cusip_ai_api_key: null,
        ai_provider: 'openai',
        statistics_calculation: 'average'
      }]
    });

    const settings = await User.getSettings('user-1');
    expect(settings.ai_api_key).toBe('legacy-plaintext-key');
  });

  test('passes through null keys unchanged', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        ai_api_key: null,
        cusip_ai_api_key: null,
        ai_provider: 'gemini',
        statistics_calculation: 'average'
      }]
    });

    const settings = await User.getSettings('user-1');
    expect(settings.ai_api_key).toBeNull();
    expect(settings.cusip_ai_api_key).toBeNull();
  });
});
