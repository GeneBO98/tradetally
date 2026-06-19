const crypto = require('crypto');
const User = require('../models/User');
const EmailService = require('./emailService');
const jobQueue = require('../utils/jobQueue');

// Account lockout protects every password-based login path (web + mobile v1)
// against brute force. It is only ENFORCED when email is configured, so a
// self-hosted instance without SMTP can never lock its only admin out with no
// way back in. The shared demo account is also exempt (logged into by many
// people, unlock mailbox unmonitored).
const PROTECTED_EMAIL = (process.env.DEMO_EMAIL || 'demo@example.com').toLowerCase();

const LOCKED_MESSAGE = 'Your account has been locked due to too many failed login attempts. Check your email for a link to unlock it, or reset your password.';

function isEnabledForUser(user) {
  if (process.env.ACCOUNT_LOCKOUT_ENABLED === 'false') return false;
  if (!EmailService.isConfigured()) return false;
  if (user?.email && user.email.toLowerCase() === PROTECTED_EMAIL) return false;
  return true;
}

function getMaxAttempts() {
  const n = parseInt(process.env.ACCOUNT_LOCKOUT_MAX_ATTEMPTS, 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

// Optional safety net: if > 0, a locked account auto-unlocks after this many
// minutes even without the email link. 0 = unlock only via email/reset.
function getAutoUnlockMs() {
  const n = parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES, 10);
  return Number.isFinite(n) && n > 0 ? n * 60 * 1000 : 0;
}

function queueLockoutEmail(email, token) {
  setImmediate(async () => {
    try {
      await jobQueue.addJob('account_lockout_email', { email, token }, 1);
    } catch (error) {
      console.warn('[WARNING] Failed to queue account lockout email:', error.message);
    }
  });
}

// Returns true if the request should be blocked because the account is locked.
// Mutates the passed user object when an auto-unlock window has elapsed so the
// caller's subsequent success-reset is a no-op.
async function isLocked(user) {
  if (!isEnabledForUser(user) || !user.account_locked_at) return false;

  const autoUnlockMs = getAutoUnlockMs();
  const lockedForMs = Date.now() - new Date(user.account_locked_at).getTime();
  if (autoUnlockMs > 0 && lockedForMs >= autoUnlockMs) {
    await User.resetFailedLoginAttempts(user.id);
    user.failed_login_attempts = 0;
    user.account_locked_at = null;
    return false;
  }
  return true;
}

// Call after a failed password check. Returns true if this failure locked the
// account (and an unlock email was queued).
async function recordFailedAttempt(user) {
  if (!isEnabledForUser(user)) return false;

  const attempts = await User.incrementFailedLoginAttempts(user.id);
  if (attempts >= getMaxAttempts()) {
    const unlockToken = crypto.randomBytes(32).toString('hex');
    const unlockExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await User.lockAccount(user.id, unlockToken, unlockExpires);
    queueLockoutEmail(user.email, unlockToken);
    return true;
  }
  return false;
}

// Call after a successful password check to clear the failed-attempt counter.
async function recordSuccess(user) {
  if (!isEnabledForUser(user)) return;
  if (user.failed_login_attempts > 0 || user.account_locked_at) {
    await User.resetFailedLoginAttempts(user.id);
  }
}

module.exports = {
  LOCKED_MESSAGE,
  isEnabledForUser,
  isLocked,
  recordFailedAttempt,
  recordSuccess
};
