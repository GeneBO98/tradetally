const crypto = require('crypto');
const { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, buildCsrfCookieOptions } = require('../utils/authCookies');

const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hasBearerAuthorization(req) {
  return Boolean(req.header('Authorization')?.replace('Bearer ', '').trim());
}

function ensureCsrfCookie(req, res, next) {
  const hasAuthCookie = Boolean(req.cookies?.[AUTH_COOKIE_NAME]);
  const csrfToken = req.cookies?.[CSRF_COOKIE_NAME];

  if (hasAuthCookie && !csrfToken) {
    res.cookie(CSRF_COOKIE_NAME, generateCsrfToken(), buildCsrfCookieOptions(req));
  }

  next();
}

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (req.originalUrl === '/api/billing/webhooks/stripe') {
    return next();
  }

  const hasAuthCookie = Boolean(req.cookies?.[AUTH_COOKIE_NAME]);
  if (!hasAuthCookie || hasBearerAuthorization(req) || req.headers['x-api-key']) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      error: 'Invalid CSRF token',
      code: 'INVALID_CSRF_TOKEN'
    });
  }

  next();
}

module.exports = {
  CSRF_HEADER_NAME,
  ensureCsrfCookie,
  generateCsrfToken,
  requireCsrf
};
