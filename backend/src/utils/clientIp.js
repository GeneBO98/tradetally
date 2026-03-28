/**
 * Extract client IP address from request, handling proxies
 */
function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

module.exports = { getClientIp };
