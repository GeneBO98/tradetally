const express = require('express');
const router = express.Router();
const edgeReportController = require('../controllers/edgeReport.controller');
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');
const { createRateLimiter } = require('../utils/rateLimit');

// On-demand generation hits analytics queries and (optionally) the user's AI
// provider, so keep it tightly limited.
const generateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many edge report generation requests. Please try again later.'
});

// Apply authentication to all routes
router.use(authenticate);

// Weekly Edge Reports are a Pro feature (list, latest, and generation)
router.use(requiresTier('pro'));

// List recent edge reports (latest first, max 12)
router.get('/', edgeReportController.listReports);

// Latest edge report
router.get('/latest', edgeReportController.getLatestReport);

// Generate a report on demand for the current report week
router.post('/generate', generateLimiter, edgeReportController.generateReport);

module.exports = router;
