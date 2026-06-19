jest.mock('../../src/services/plaid/plaidClient', () => ({
  getWebhookVerificationKey: jest.fn()
}));

const crypto = require('crypto');
const plaidClient = require('../../src/services/plaid/plaidClient');
const plaidWebhookVerifier = require('../../src/services/plaid/plaidWebhookVerifier');

const KID = 'test-key-1';
const BODY = Buffer.from(JSON.stringify({ webhook_type: 'ITEM', webhook_code: 'ERROR' }));

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'ES256', use: 'sig', expired_at: null };

function bodyHash(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signJwt({
  hash = bodyHash(BODY),
  alg = 'ES256',
  kid = KID,
  iat = Math.floor(Date.now() / 1000)
} = {}) {
  const header = encodeSegment({ alg, kid });
  const payload = encodeSegment({ iat, request_body_sha256: hash });
  const data = Buffer.from(`${header}.${payload}`, 'utf8');

  const signature = alg === 'HS256'
    ? crypto.createHmac('sha256', 'shared-secret').update(data).digest('base64url')
    : crypto.sign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');

  return `${header}.${payload}.${signature}`;
}

describe('plaidWebhookVerifier.verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    plaidWebhookVerifier.keyCache.clear();
    delete process.env.PLAID_WEBHOOK_VERIFY;
    plaidClient.getWebhookVerificationKey.mockResolvedValue({ key: publicJwk });
  });

  it('accepts a valid signature with a matching body hash', async () => {
    await expect(plaidWebhookVerifier.verify(BODY, signJwt())).resolves.toBe(true);
  });

  it('rejects when the body hash does not match', async () => {
    const header = signJwt({ hash: bodyHash(Buffer.from('tampered')) });
    await expect(plaidWebhookVerifier.verify(BODY, header)).resolves.toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const token = signJwt();
    const tampered = `${token.slice(0, -4)}AAAA`;
    await expect(plaidWebhookVerifier.verify(BODY, tampered)).resolves.toBe(false);
  });

  it('rejects a stale token (iat older than 5 minutes)', async () => {
    const header = signJwt({ iat: Math.floor(Date.now() / 1000) - 10 * 60 });
    await expect(plaidWebhookVerifier.verify(BODY, header)).resolves.toBe(false);
  });

  it('rejects non-ES256 algorithms without fetching keys', async () => {
    // Symmetric algs are the classic JWT downgrade vector
    const header = signJwt({ alg: 'HS256' });
    await expect(plaidWebhookVerifier.verify(BODY, header)).resolves.toBe(false);
    expect(plaidClient.getWebhookVerificationKey).not.toHaveBeenCalled();
  });

  it('rejects when the verification key is expired', async () => {
    plaidClient.getWebhookVerificationKey.mockResolvedValue({
      key: { ...publicJwk, expired_at: '2026-01-01T00:00:00Z' }
    });
    await expect(plaidWebhookVerifier.verify(BODY, signJwt())).resolves.toBe(false);
  });

  it('rejects missing body or header and malformed tokens', async () => {
    await expect(plaidWebhookVerifier.verify(null, signJwt())).resolves.toBe(false);
    await expect(plaidWebhookVerifier.verify(BODY, null)).resolves.toBe(false);
    await expect(plaidWebhookVerifier.verify(BODY, 'not-a-jwt')).resolves.toBe(false);
  });

  it('caches keys by kid', async () => {
    const header = signJwt();
    await plaidWebhookVerifier.verify(BODY, header);
    await plaidWebhookVerifier.verify(BODY, header);
    expect(plaidClient.getWebhookVerificationKey).toHaveBeenCalledTimes(1);
  });

  it('skips verification when PLAID_WEBHOOK_VERIFY=false', async () => {
    process.env.PLAID_WEBHOOK_VERIFY = 'false';
    await expect(plaidWebhookVerifier.verify(BODY, 'not-a-jwt')).resolves.toBe(true);
  });
});
