const crypto = require('crypto');
const plaidClient = require('./plaidClient');

const MAX_TOKEN_AGE_SECONDS = 5 * 60;

function decodeBase64UrlJson(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/**
 * Verifies Plaid webhooks per Plaid's JWT scheme: the Plaid-Verification
 * header is an ES256 JWT whose payload carries a SHA-256 of the raw request
 * body; the public key is fetched from /webhook_verification_key/get by the
 * JWT's kid. Implemented with node:crypto (jose is ESM-only).
 */
class PlaidWebhookVerifier {
  constructor() {
    // kid -> JWK. Keys rotate rarely; unknown kids trigger a refetch.
    this.keyCache = new Map();
  }

  isVerificationEnabled() {
    return process.env.PLAID_WEBHOOK_VERIFY !== 'false';
  }

  async getKey(keyId) {
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId);
    }

    const response = await plaidClient.getWebhookVerificationKey(keyId);
    const key = response?.key;
    if (!key || key.expired_at) {
      return null;
    }

    this.keyCache.set(keyId, key);
    return key;
  }

  /**
   * @param {Buffer} rawBody - exact request body bytes
   * @param {string} verificationHeader - Plaid-Verification header (a JWT)
   * @returns {Promise<boolean>}
   */
  async verify(rawBody, verificationHeader) {
    if (!this.isVerificationEnabled()) {
      return true;
    }

    if (!rawBody || !verificationHeader || typeof verificationHeader !== 'string') {
      return false;
    }

    try {
      const segments = verificationHeader.split('.');
      if (segments.length !== 3) {
        return false;
      }

      const header = decodeBase64UrlJson(segments[0]);
      if (header.alg !== 'ES256' || !header.kid) {
        return false;
      }

      const jwk = await this.getKey(header.kid);
      if (!jwk) {
        return false;
      }

      const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      const signatureValid = crypto.verify(
        'sha256',
        Buffer.from(`${segments[0]}.${segments[1]}`, 'utf8'),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(segments[2], 'base64url')
      );
      if (!signatureValid) {
        return false;
      }

      const payload = decodeBase64UrlJson(segments[1]);

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (typeof payload.iat !== 'number' || nowSeconds - payload.iat > MAX_TOKEN_AGE_SECONDS) {
        return false;
      }

      const expectedHash = payload.request_body_sha256;
      if (!expectedHash || typeof expectedHash !== 'string') {
        return false;
      }

      const actualHash = crypto.createHash('sha256').update(rawBody).digest('hex');
      const expectedBuffer = Buffer.from(expectedHash, 'utf8');
      const actualBuffer = Buffer.from(actualHash, 'utf8');
      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch (error) {
      console.error('[ERROR] [PLAID] Webhook verification failed:', error.message);
      return false;
    }
  }
}

module.exports = new PlaidWebhookVerifier();
