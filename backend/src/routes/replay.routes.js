const express = require('express');
const router = express.Router();
const replayController = require('../controllers/replay.controller');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../utils/rateLimit');

// Replay payloads can trigger upstream market-data calls (FMP/Finnhub), so
// keep the endpoint tightly limited; cached sessions are cheap but the first
// fetch per symbol/day is not.
const replayLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many replay requests. Please try again later.'
});

router.use(authenticate);

// Free-tier quota status
router.get('/quota', replayController.getQuota);

// Single-trade replay payload (bars + normalized fills)
router.get('/trades/:tradeId', replayLimiter, replayController.getTradeReplay);

module.exports = router;
