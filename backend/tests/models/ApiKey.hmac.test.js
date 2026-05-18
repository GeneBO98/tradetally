jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

const db = require('../../src/config/database');
const bcrypt = require('bcrypt');
const ApiKey = require('../../src/models/ApiKey');

describe('ApiKey HMAC lookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.API_KEY_LOOKUP_SECRET = 'b'.repeat(32);
  });

  afterEach(() => {
    delete process.env.API_KEY_LOOKUP_SECRET;
    delete process.env.API_KEY_LOOKUP_PREVIOUS_SECRETS;
  });

  test('stores a keyed HMAC lookup digest when creating keys', async () => {
    jest.spyOn(ApiKey, 'generateApiKey').mockReturnValue('tt_live_fixed_key_for_hmac');
    bcrypt.hash.mockResolvedValue('bcrypt-hash');
    db.query.mockResolvedValue({
      rows: [{
        id: 'k1',
        name: 'demo',
        key_prefix: 'tt_live_',
        permissions: '["read"]',
        scopes: '["trades:read"]',
        expires_at: null,
        is_active: true,
        created_at: new Date()
      }]
    });

    const created = await ApiKey.create({ userId: 'u1', name: 'demo' });

    expect(created.key).toBe('tt_live_fixed_key_for_hmac');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('key_hmac'),
      expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)])
    );
    ApiKey.generateApiKey.mockRestore();
  });

  test('uses the HMAC index without bcrypt on migrated keys', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'k1',
          user_id: 'u1',
          name: 'demo',
          username: 'demo',
          email: 'demo@example.com',
          role: 'user',
          permissions: '["read"]',
          scopes: '["trades:read"]',
          is_active: true,
          expires_at: null
        }]
      })
      .mockResolvedValue({ rows: [] });

    const result = await ApiKey.verifyKey('tt_live_existing_key');

    expect(result.id).toBe('k1');
    expect(db.query.mock.calls[0][0]).toContain('ak.key_hmac = ANY($1::text[])');
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('accepts previous HMAC secret and rotates the row to the current secret on use', async () => {
    process.env.API_KEY_LOOKUP_PREVIOUS_SECRETS = 'previous-secret-with-enough-length';
    const previousHmac = ApiKey.computeLookupHmacWithSecret('tt_live_rotated_key', 'previous-secret-with-enough-length');
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'k-rotated',
          user_id: 'u1',
          name: 'rotated',
          key_hmac: previousHmac,
          username: 'demo',
          email: 'demo@example.com',
          role: 'user',
          permissions: '["read"]',
          scopes: '[]',
          is_active: true,
          expires_at: null
        }]
      })
      .mockResolvedValue({ rows: [] });

    const result = await ApiKey.verifyKey('tt_live_rotated_key');

    expect(result.id).toBe('k-rotated');
    expect(db.query.mock.calls[1][0]).toContain('UPDATE api_keys SET key_hmac = $1');
  });

  test('falls back to prefix and bcrypt for legacy rows, then backfills key_hmac', async () => {
    bcrypt.compare.mockResolvedValue(true);
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'legacy1',
          user_id: 'u1',
          name: 'legacy',
          key_hash: 'bcrypt-hash',
          username: 'demo',
          email: 'demo@example.com',
          role: 'user',
          permissions: '["read"]',
          scopes: '[]',
          is_active: true,
          expires_at: null
        }]
      })
      .mockResolvedValue({ rows: [] });

    const result = await ApiKey.verifyKey('tt_live_legacy_key');

    expect(result.id).toBe('legacy1');
    expect(bcrypt.compare).toHaveBeenCalledWith('tt_live_legacy_key', 'bcrypt-hash');
    expect(db.query.mock.calls[2][0]).toContain('UPDATE api_keys SET key_hmac = $1');
  });

  test('reports HMAC lookup health and rotation mode', async () => {
    process.env.API_KEY_LOOKUP_PREVIOUS_SECRETS = 'previous-secret-with-enough-length';
    db.query.mockResolvedValueOnce({
      rows: [{ total: 4, hmac_indexed: 3, legacy_bcrypt_only: 1 }]
    });

    const preview = await ApiKey.getLookupRotationPreview();

    expect(preview).toMatchObject({
      total: 4,
      hmac_indexed: 3,
      legacy_bcrypt_only: 1,
      previousSecretCount: 1,
      rotationMode: 'dual-read-rotate-on-use'
    });
  });
});
