const express = require('express');
const router = express.Router();
const yearWrappedController = require('../controllers/yearWrapped.controller');
const { authenticate } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticate);

// Banner status (should be lightweight, called on dashboard load)
router.get('/banner-status', yearWrappedController.getBannerStatus);

// Get Year Wrapped data for a specific year
router.get('/:year', yearWrappedController.getYearWrapped);

// Dismiss banner for a specific year
router.post('/:year/dismiss', yearWrappedController.dismissBanner);

// Mark Year Wrapped as viewed
router.post('/:year/viewed', yearWrappedController.markAsViewed);

// Force regenerate (useful for testing or when user wants fresh data)
router.post('/:year/regenerate', yearWrappedController.regenerate);

module.exports = router;
