const express = require('express');
const router = express.Router();
const backtestController = require('../controllers/backtest.controller');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../utils/rateLimit');

// Session-data loads can trigger upstream market-data calls (FMP/Finnhub) for
// symbol/days nobody has replayed or backtested before, so keep the endpoint
// tightly limited; cache-served sessions are cheap but first fetches are not.
const backtestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many backtest requests. Please try again later.'
});

router.use(authenticate);

// Free-tier quota status
router.get('/quota', backtestController.getQuota);

// Candle payload for a symbol + past session date
router.get('/session-data', backtestLimiter, backtestController.getSessionData);

// Saved sessions
router.get('/sessions', backtestController.listSessions);
router.post('/sessions', backtestController.saveSession);
router.get('/sessions/:id', backtestLimiter, backtestController.getSession);
router.delete('/sessions/:id', backtestController.deleteSession);

module.exports = router;
