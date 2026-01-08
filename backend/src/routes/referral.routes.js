const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referral.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ReferralService = require('../services/referralService');

/**
 * Middleware to check if referral system is enabled
 * Returns 404 if billing/referrals are disabled (self-hosted instances)
 */
const checkReferralEnabled = async (req, res, next) => {
  try {
    const isEnabled = await ReferralService.isEnabled();
    if (!isEnabled) {
      return res.status(404).json({
        error: 'Referral system is not available',
        message: 'This feature is only available on tradetally.io'
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Apply middleware to all routes
router.use(checkReferralEnabled);

// =============================================================================
// PUBLIC ROUTES (no authentication required)
// =============================================================================

// Get referral info by slug (for landing page)
router.get('/r/:slug', referralController.getReferralBySlug);

// Track a referral link visit
router.post('/track-visit', referralController.trackVisit);

// =============================================================================
// ADMIN ROUTES (authentication + admin role required)
// =============================================================================

// List all referral codes
router.get('/admin', authenticate, requireAdmin, referralController.getAllCodes);

// Get overall analytics
router.get('/admin/analytics', authenticate, requireAdmin, referralController.getOverallAnalytics);

// Create a new referral code
router.post('/admin', authenticate, requireAdmin, referralController.createCode);

// Get referral code details with analytics
router.get('/admin/:id', authenticate, requireAdmin, referralController.getCodeDetails);

// Update a referral code
router.put('/admin/:id', authenticate, requireAdmin, referralController.updateCode);

// Deactivate a referral code
router.delete('/admin/:id', authenticate, requireAdmin, referralController.deactivateCode);

module.exports = router;
