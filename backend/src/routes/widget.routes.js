const express = require('express');
const { authenticate, authenticateWidget } = require('../middleware/auth');
const widgetController = require('../controllers/widget.controller');
const { createRateLimiter } = require('../utils/rateLimit');

const router = express.Router();

const tokenLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: req => String(req.user.id),
  message: 'Too many widget token requests. Please try again later.'
});

const snapshotLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: req => String(req.user.id),
  message: 'Too many widget snapshot requests. Please try again later.'
});

function rejectInput(req, res, next) {
  const hasQuery = Object.keys(req.query || {}).length > 0;
  const hasBody = req.body && Object.keys(req.body).length > 0;
  if (hasQuery || hasBody) {
    return res.status(400).json({
      error: 'Widget endpoints do not accept input',
      code: 'WIDGET_INPUT_NOT_ALLOWED'
    });
  }
  return next();
}

router.post('/token', authenticate, tokenLimiter, rejectInput, widgetController.issueToken);
router.get('/snapshot', authenticateWidget, snapshotLimiter, rejectInput, widgetController.getSnapshot);

module.exports = router;
