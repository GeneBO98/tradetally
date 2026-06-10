const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../utils/rateLimit');
const TradeVerificationService = require('../services/tradeVerificationService');

// Public lookups are unauthenticated by design (the QR/link audience); keep
// them rate limited against code enumeration.
const publicLookupLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many verification lookups. Please try again later.'
});

const issueLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many verification requests. Please try again later.'
});

// GET /api/verify/:code — public verification page data
router.get('/verify/:code', publicLookupLimiter, async (req, res, next) => {
  try {
    const verification = await TradeVerificationService.getPublicVerification(req.params.code);
    if (!verification) {
      return res.status(404).json({ error: 'Verification not found' });
    }
    res.json({ verification });
  } catch (error) {
    next(error);
  }
});

// GET /api/trades/:id/verification — owner-facing status
router.get('/trades/:id/verification', authenticate, async (req, res, next) => {
  try {
    const verification = await TradeVerificationService.getForTrade(req.params.id, req.user.id);
    if (!verification) {
      return res.status(404).json({ error: 'No verification for this trade' });
    }
    res.json({ verification });
  } catch (error) {
    next(error);
  }
});

// POST /api/trades/:id/verification — issue (or refresh) a verification
router.post('/trades/:id/verification', authenticate, issueLimiter, async (req, res, next) => {
  try {
    const verification = await TradeVerificationService.verifyTrade(req.params.id, req.user.id, {
      showAmounts: req.body?.show_amounts === true
    });
    if (!verification) {
      return res.status(422).json({
        error: 'This trade is not eligible for verification. Only closed trades imported via broker sync can be verified.'
      });
    }
    res.status(201).json({ verification });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
