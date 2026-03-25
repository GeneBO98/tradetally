/**
 * Extract client IP address from request, handling proxies
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'];
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

module.exports = { getClientIp };
