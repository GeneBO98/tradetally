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

/**
 * Generate an unsubscribe token for a user
 * Format: base64url(userId).signature
 * @param {number} userId - The user's ID
 * @returns {string} The signed token
 */
function generateToken(userId) {
  if (!userId || typeof userId !== 'number') {
    throw new Error('Valid userId is required');
  }

  const payload = Buffer.from(String(userId)).toString('base64url');
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
 * @returns {number|null} The userId if valid, null otherwise
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

  // Decode userId from payload
  try {
    const userId = parseInt(Buffer.from(payload, 'base64url').toString(), 10);
    if (isNaN(userId) || userId <= 0) {
      return null;
    }
    return userId;
  } catch (err) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken
};
