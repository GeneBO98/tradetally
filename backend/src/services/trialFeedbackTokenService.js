const crypto = require('crypto');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

function generateToken(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid userId is required');
  }

  const payload = Buffer.from(JSON.stringify({
    userId,
    purpose: 'trial_feedback'
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payload, providedSignature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (decoded?.purpose !== 'trial_feedback') {
      return null;
    }

    if (!decoded.userId || typeof decoded.userId !== 'string') {
      return null;
    }

    return decoded.userId;
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken
};
