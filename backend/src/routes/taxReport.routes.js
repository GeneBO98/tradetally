const express = require('express');
const router = express.Router();
const taxReportController = require('../controllers/taxReport.controller');
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');
const { createRateLimiter } = require('../utils/rateLimit');

// Each request rebuilds tax lots from the user's whole trade history.
const taxReportLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: 'Too many tax report requests. Please try again in a few minutes.'
});

router.use(authenticate);

// The tax report is a Pro feature (billing-disabled/self-hosted installs pass through).
router.use(requiresTier('pro'));
router.use(taxReportLimiter);

// Realised gains and losses for a tax year, as Form 8949 lines plus summaries
router.get('/', taxReportController.getReport);

// The same lines as a file: Form 8949 CSV, or TXF for TurboTax Desktop
router.get('/export', taxReportController.exportReport);

module.exports = router;
