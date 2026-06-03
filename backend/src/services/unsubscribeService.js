const crypto = require('crypto');

/**
 * Unsubscribe Token Service
 * Generates and verifies HMAC-signed tokens for email unsubscribe links.
 * Tokens never expire - unsubscribe links should always work.
 */

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

function normalizeUserId(userId) {
  if (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) {
    return String(userId);
  }

  if (typeof userId === 'string') {
    const trimmed = userId.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  throw new Error('Valid userId is required');
}

function parseDecodedUserId(decoded) {
  if (!decoded || typeof decoded !== 'string') {
    return null;
  }

  if (/^\d+$/.test(decoded)) {
    const numericId = Number.parseInt(decoded, 10);
    return Number.isNaN(numericId) || numericId <= 0 ? null : numericId;
  }

  return decoded;
}

/**
 * Generate an unsubscribe token for a user
 * Format: base64url({"userId":"...","purpose":"unsubscribe"}).signature
 * @param {string|number} userId - The user's ID
 * @returns {string} The signed token
 */
function generateToken(userId) {
  const normalizedUserId = normalizeUserId(userId);
  const payload = Buffer.from(JSON.stringify({
    userId: normalizedUserId,
    purpose: 'unsubscribe'
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

/**
 * Verify an unsubscribe token and extract the userId
 * Uses timing-safe comparison to prevent timing attacks
 * @param {string} token - The token to verify
 * @returns {number|string|null} The userId if valid, null otherwise
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payload, providedSignature] = parts;

  // Recalculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');

  // Timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = Buffer.from(payload, 'base64url').toString();

    try {
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === 'object') {
        if (parsed.purpose !== 'unsubscribe') {
          return null;
        }

        return parseDecodedUserId(parsed.userId);
      }

      return parseDecodedUserId(String(parsed));
    } catch (_) {
      // Backward compatibility for legacy tokens that encoded only the raw user ID.
    }

    return parseDecodedUserId(decoded);
  } catch (err) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken
};
