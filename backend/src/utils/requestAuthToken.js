function bearerToken(req) {
  const header = req.headers?.authorization || req.header?.('Authorization');
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function headerToken(req) {
  return req.headers?.['x-auth-token'] || req.header?.('X-Auth-Token') || null;
}

function cookieToken(req) {
  return req.cookies?.token || null;
}

function isQueryTokenAuthEnabled(env = process.env) {
  return env.ALLOW_QUERY_TOKEN_AUTH === 'true';
}

function queryToken(req, env = process.env) {
  if (!isQueryTokenAuthEnabled(env)) return null;
  return req.query?.token || null;
}

function hasDisabledQueryToken(req, env = process.env) {
  return Boolean(req.query?.token) && !isQueryTokenAuthEnabled(env);
}

function getRequestAuthToken(req, env = process.env) {
  return bearerToken(req) || headerToken(req) || cookieToken(req) || queryToken(req, env);
}

module.exports = {
  getRequestAuthToken,
  hasDisabledQueryToken,
  isQueryTokenAuthEnabled,
  queryToken
};
