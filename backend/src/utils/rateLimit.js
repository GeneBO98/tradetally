const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const { getClientIp } = require('./clientIp');

function buildRateLimitMessage(message, windowMs) {
  return {
    error: 'Too many requests',
    message,
    retryAfter: Math.ceil(windowMs / 1000)
  };
}

function createRateLimiter({
  windowMs,
  max,
  message = 'Too many requests, please try again later.',
  skip,
  keyGenerator
}) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: keyGenerator || ((req) => ipKeyGenerator(getClientIp(req))),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    message: buildRateLimitMessage(message, windowMs),
    handler: (req, res, _next, options) => {
      const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(options.statusCode).json(buildRateLimitMessage(message, options.windowMs));
    },
    skip
  });
}

module.exports = {
  createRateLimiter
};
