const speakeasy = require('speakeasy');
const db = require('../config/database');
const User = require('../models/User');
const { TOKEN_PURPOSES, generateToken, verifyJwtToken } = require('./auth');
const { findMatchingBackupCodeIndex } = require('../utils/twoFactorBackupCodes');

function sudoTokenFromRequest(req) {
  return req.headers?.['x-sudo-token'] || req.body?.sudoToken || req.body?.sudo_token || null;
}

async function verifyPasswordAndOptional2FA(userId, password, twoFactorCode = '') {
  const result = await db.query(
    `SELECT id, email, username, role, password_hash, two_factor_enabled, two_factor_secret, two_factor_backup_codes
     FROM users
     WHERE id = $1 AND is_active = true`,
    [userId]
  );
  const user = result.rows[0];
  if (!user || !password) return { ok: false, code: 'INVALID_PASSWORD' };

  const passwordOk = await User.verifyPassword(user, password);
  if (!passwordOk) return { ok: false, code: 'INVALID_PASSWORD' };

  if (user.two_factor_enabled) {
    const normalizedCode = String(twoFactorCode || '').trim();
    if (!normalizedCode) return { ok: false, code: 'TWO_FACTOR_REQUIRED' };

    const totpOk = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token: normalizedCode,
      window: 2
    });

    const backupCodes = user.two_factor_backup_codes || [];
    const matchingBackupCodeIndex = !totpOk
      ? await findMatchingBackupCodeIndex(backupCodes, normalizedCode)
      : -1;
    if (!totpOk && matchingBackupCodeIndex < 0) return { ok: false, code: 'INVALID_TWO_FACTOR' };

    if (matchingBackupCodeIndex >= 0) {
      const updatedBackupCodes = backupCodes.filter((_, index) => index !== matchingBackupCodeIndex);
      await User.updateBackupCodes(user.id, updatedBackupCodes);
    }
  }

  return { ok: true, user };
}

function issueSudoToken(user) {
  return generateToken(user, {
    purpose: TOKEN_PURPOSES.SUDO,
    expiresIn: process.env.SUDO_TOKEN_EXPIRES_IN || '5m'
  });
}

function requireSudo(req, res, next) {
  if (process.env.REQUIRE_SUDO_FOR_SECURITY_ENROLLMENT === 'false') {
    return next();
  }

  const token = sudoTokenFromRequest(req);
  if (!token) {
    return res.status(403).json({
      error: 'Recent re-authentication is required',
      code: 'SUDO_REQUIRED'
    });
  }

  try {
    const decoded = verifyJwtToken(token, { requiredPurpose: TOKEN_PURPOSES.SUDO });
    if ((decoded.id || decoded.userId) !== req.user.id) {
      return res.status(403).json({
        error: 'Sudo token does not match authenticated user',
        code: 'SUDO_USER_MISMATCH'
      });
    }
    return next();
  } catch (error) {
    return res.status(403).json({
      error: 'Recent re-authentication is required',
      code: 'SUDO_INVALID'
    });
  }
}

function requireVerifiedEmail(req, res, next) {
  if (process.env.REQUIRE_VERIFIED_EMAIL_FOR_SENSITIVE_ENDPOINTS === 'false') {
    return next();
  }

  if (req.user?.is_verified) {
    return next();
  }

  return res.status(403).json({
    error: 'Please verify your email address before using this feature',
    code: 'EMAIL_VERIFICATION_REQUIRED'
  });
}

module.exports = {
  issueSudoToken,
  requireSudo,
  requireVerifiedEmail,
  verifyPasswordAndOptional2FA
};
