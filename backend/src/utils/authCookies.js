const AUTH_COOKIE_NAME = 'token';
const CSRF_COOKIE_NAME = 'csrf_token';
const ACCESS_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseUrl(value) {
  try {
    return value ? new URL(value) : null;
  } catch (_) {
    return null;
  }
}

function getRequestOrigin(req) {
  const protocol = req.secure ? 'https' : req.protocol || 'http';
  const host = req.get?.('host') || req.headers.host;
  return host ? parseUrl(`${protocol}://${host}`) : null;
}

function isCrossOriginRequest(req) {
  const origin = parseUrl(req.headers.origin);
  const requestOrigin = getRequestOrigin(req);

  if (!origin || !requestOrigin) {
    return false;
  }

  return origin.origin !== requestOrigin.origin;
}

function isSecureRequest(req) {
  const requestOrigin = getRequestOrigin(req);
  const hostname = requestOrigin?.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  return process.env.NODE_ENV === 'production'
    || req.secure
    || req.headers['x-forwarded-proto'] === 'https'
    || Boolean(requestOrigin && requestOrigin.protocol === 'https:')
    || isLocalhost;
}

function getCookieBaseOptions(req) {
  const crossOrigin = isCrossOriginRequest(req);

  return {
    secure: isSecureRequest(req),
    sameSite: crossOrigin ? 'none' : 'lax',
    path: '/'
  };
}

function buildAuthCookieOptions(req) {
  return {
    ...getCookieBaseOptions(req),
    httpOnly: true,
    maxAge: ACCESS_COOKIE_MAX_AGE_MS
  };
}

function buildCsrfCookieOptions(req) {
  return {
    ...getCookieBaseOptions(req),
    httpOnly: false,
    maxAge: ACCESS_COOKIE_MAX_AGE_MS
  };
}

function setAuthCookies(req, res, token, csrfToken) {
  res.cookie(AUTH_COOKIE_NAME, token, buildAuthCookieOptions(req));
  res.cookie(CSRF_COOKIE_NAME, csrfToken, buildCsrfCookieOptions(req));
}

function clearAuthCookies(req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, buildAuthCookieOptions(req));
  res.clearCookie(CSRF_COOKIE_NAME, buildCsrfCookieOptions(req));
}

module.exports = {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  ACCESS_COOKIE_MAX_AGE_MS,
  buildAuthCookieOptions,
  buildCsrfCookieOptions,
  setAuthCookies,
  clearAuthCookies
};
