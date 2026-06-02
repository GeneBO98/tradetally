const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billing.controller');
const { authenticate } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/sensitiveAccess');
const { validate, schemas } = require('../middleware/validation');
const { createRateLimiter } = require('../utils/rateLimit');

const billingLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many billing requests. Please try again later.'
});

// Middleware for raw body on webhook endpoint
const rawBodyMiddleware = express.raw({ type: 'application/json' });

// Public routes
router.get('/status', billingController.getBillingStatus);
router.get('/pricing', billingController.getPricingPlans);

// Webhook endpoint (no auth required, raw body)
router.post('/webhooks/stripe', rawBodyMiddleware, billingController.handleWebhook);

// Protected routes (require authentication)
router.use(authenticate); // Apply auth middleware to all routes below
router.use(requireVerifiedEmail);

router.get('/subscription', billingController.getSubscription);
router.post('/checkout', billingLimiter, validate(schemas.billingCheckout), billingController.createCheckoutSession);
router.post('/trial', billingLimiter, billingController.startTrial);
router.post('/portal', billingLimiter, billingController.createPortalSession);
router.post('/cancel', billingLimiter, validate(schemas.billingCancelSubscription), billingController.cancelSubscription);
router.post('/reactivate', billingLimiter, billingController.reactivateSubscription);
router.get('/checkout/:sessionId', billingController.getCheckoutSession);

// Apple In-App Purchase routes
router.post('/apple/verify', billingLimiter, validate(schemas.billingAppleReceipt), billingController.verifyAppleReceipt);

// Debug endpoints (development only)
router.delete('/debug/reset-trial', billingController.debugResetTrial);

// Admin routes (temporarily commented out - needs admin auth middleware)
// router.get('/config', adminAuth, billingController.getBillingConfig);

module.exports = router;
