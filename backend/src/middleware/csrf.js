const crypto = require('crypto');
const { AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, buildCsrfCookieOptions } = require('../utils/authCookies');

const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MOBILE_CLIENT_HEADERS = ['x-device-id', 'x-platform', 'x-app-version'];
// Pre-auth endpoints don't need CSRF protection (no session to hijack)
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/verify-2fa',
  '/api/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/v1/auth/login/device',
]);

function isReadOnlyPostExempt(req) {
  return req.method === 'POST' && /^\/api\/investments\/dcf\/[^/]+\/calculate(?:\?|$)/.test(req.originalUrl);
}

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hasBearerAuthorization(req) {
  return Boolean(req.header('Authorization')?.replace('Bearer ', '').trim());
}

function isMobileClient(req) {
  return MOBILE_CLIENT_HEADERS.some((name) => Boolean(req.headers[name]));
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

  if (CSRF_EXEMPT_PATHS.has(req.originalUrl.split('?')[0])) {
    return next();
  }

  if (isReadOnlyPostExempt(req)) {
    return next();
  }

  const hasAuthCookie = Boolean(req.cookies?.[AUTH_COOKIE_NAME]);
  if (!hasAuthCookie || hasBearerAuthorization(req) || req.headers['x-api-key'] || isMobileClient(req)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.cookie(CSRF_COOKIE_NAME, generateCsrfToken(), buildCsrfCookieOptions(req));
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
