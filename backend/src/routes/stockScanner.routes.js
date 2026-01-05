/**
 * Stock Scanner Routes
 * Russell 2000 8 Pillars scan results
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');
const stockScannerController = require('../controllers/stockScanner.controller');

// All scanner routes require authentication
router.use(authenticate);

/**
 * @route GET /api/scanner/results
 * @desc Get latest scan results with optional pillar filters
 * @query pillars - Comma-separated pillar numbers that must pass (e.g., "1,3,5")
 * @query page - Page number (default: 1)
 * @query limit - Results per page (default: 50, max: 100)
 * @query sortBy - Column to sort by (default: pillars_passed)
 * @query sortOrder - ASC or DESC (default: DESC)
 * @access Pro tier
 */
router.get('/results', requiresTier('pro'), stockScannerController.getScanResults);

/**
 * @route GET /api/scanner/status
 * @desc Get current scan status or latest scan info
 * @access Authenticated
 */
router.get('/status', stockScannerController.getScanStatus);

/**
 * @route POST /api/scanner/trigger
 * @desc Manually trigger a Russell 2000 scan
 * @access Admin only
 */
router.post('/trigger', requireAdmin, stockScannerController.triggerScan);

/**
 * @route POST /api/scanner/cleanup
 * @desc Clean up stuck scans
 * @access Admin only
 */
router.post('/cleanup', requireAdmin, stockScannerController.cleanupStuckScans);

module.exports = router;
