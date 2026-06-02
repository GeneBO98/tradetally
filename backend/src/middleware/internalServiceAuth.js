const crypto = require('crypto');

function sendAuthError(res, status, code, message) {
  return res.status(status).json({
    error: message,
    code,
  });
}

function getConfiguredSecret() {
  return process.env.KESTRA_INTERNAL_API_SECRET || process.env.INTERNAL_AUTOMATION_SECRET || '';
}

function getProvidedSecret(req) {
  const headerSecret = req.headers['x-internal-service-secret'] || req.headers['x-kestra-secret'];
  if (headerSecret) return String(headerSecret);

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return '';
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function requireInternalServiceAuth(req, res, next) {
  const configuredSecret = getConfiguredSecret();

  if (!configuredSecret) {
    return sendAuthError(res, 503, 'INTERNAL_SERVICE_AUTH_UNAVAILABLE', 'Internal service authentication is not configured');
  }

  const providedSecret = getProvidedSecret(req);
  if (!providedSecret) {
    return sendAuthError(res, 401, 'INTERNAL_SERVICE_AUTH_REQUIRED', 'Internal service secret required');
  }

  if (!timingSafeEqual(providedSecret, configuredSecret)) {
    return sendAuthError(res, 401, 'INVALID_INTERNAL_SERVICE_SECRET', 'Invalid internal service secret');
  }

  req.internalService = {
    name: req.headers['x-internal-service-name'] || 'kestra',
  };

  next();
}

module.exports = {
  requireInternalServiceAuth,
};
