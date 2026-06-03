const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const toolsController = require('../controllers/tools.controller');
const { getClientIp } = require('../utils/clientIp');

// Tighter per-IP limiter on top of the global limiter to protect the
// public, unauthenticated endpoint from abuse.
const publicToolLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: getClientIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'rate_limited',
    message: 'Too many requests. Please slow down.'
  },
  skip: () => process.env.RATE_LIMIT_ENABLED === 'false'
});

// Symbol search has its own (slightly looser) limiter because autocomplete fires
// multiple requests per session.
const publicSymbolSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: getClientIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'rate_limited',
    message: 'Too many requests. Please slow down.'
  },
  skip: () => process.env.RATE_LIMIT_ENABLED === 'false'
});

router.get('/symbol-search', publicSymbolSearchLimiter, toolsController.symbolSearch);
router.get('/what-if-invested', publicToolLimiter, toolsController.whatIfInvested);

module.exports = router;
