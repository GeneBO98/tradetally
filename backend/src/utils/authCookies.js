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

function getForwardedProto(req) {
  const value = req.headers?.['x-forwarded-proto'];
  const firstValue = Array.isArray(value) ? value[0] : value;

  return typeof firstValue === 'string'
    ? firstValue.split(',')[0].trim().toLowerCase()
    : null;
}

function getRequestOrigin(req) {
  const forwardedProto = getForwardedProto(req);
  const protocol = req.secure ? 'https' : forwardedProto || req.protocol || 'http';
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
  // The browser's Origin header proves the user-facing connection is https
  // even when an intermediate proxy rewrote X-Forwarded-Proto to http
  // (e.g. the bundled nginx behind an outer TLS-terminating proxy). Marking
  // the cookie Secure based on it is fail-closed: worst case the cookie is
  // simply not sent over a later plain-http request.
  const browserOrigin = parseUrl(req.headers?.origin);
  return req.secure
    || getForwardedProto(req) === 'https'
    || Boolean(requestOrigin && requestOrigin.protocol === 'https:')
    || browserOrigin?.protocol === 'https:'
    || isLocalhost;
}

function getCookieBaseOptions(req) {
  const crossOrigin = isCrossOriginRequest(req);
  const secure = isSecureRequest(req);

  return {
    secure,
    // SameSite=None requires Secure — browsers reject None on insecure
    // cookies outright, so an insecure cross-origin request falls back to
    // lax (a lax cookie at least persists; a rejected one never exists).
    // This also covers proxies that strip the port from the Host header,
    // which makes same-origin requests look cross-origin (issue #347).
    sameSite: crossOrigin && secure ? 'none' : 'lax',
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
  // Strip maxAge — when both Max-Age and Expires are present in a Set-Cookie
  // header, RFC 6265 says Max-Age wins, which would keep the empty cookie alive
  // for ACCESS_COOKIE_MAX_AGE_MS instead of deleting it. Pass only path/domain/
  // sameSite/secure so res.clearCookie's Expires=epoch actually takes effect.
  const baseOpts = getCookieBaseOptions(req);
  res.clearCookie(AUTH_COOKIE_NAME, { ...baseOpts, httpOnly: true });
  res.clearCookie(CSRF_COOKIE_NAME, { ...baseOpts, httpOnly: false });
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
