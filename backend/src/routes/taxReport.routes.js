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
router.use(taxReportLimiter);

// Realised gains and losses for a tax year, as Form 8949 lines plus summaries.
// Open to every plan: seeing the year's numbers is the reason to want the files.
router.get('/', taxReportController.getReport);

// The same lines as a file: Form 8949 CSV, or TXF for TurboTax Desktop.
// Pro only (billing-disabled/self-hosted installs pass through).
router.get('/export', requiresTier('pro'), taxReportController.exportReport);

module.exports = router;
