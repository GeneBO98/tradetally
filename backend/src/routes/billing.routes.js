const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billing.controller');
const { authenticate } = require('../middleware/auth');

// Middleware for raw body on webhook endpoint
const rawBodyMiddleware = express.raw({ type: 'application/json' });

// Public routes
router.get('/status', billingController.getBillingStatus);
router.get('/pricing', billingController.getPricingPlans);

// Webhook endpoint (no auth required, raw body)
router.post('/webhooks/stripe', rawBodyMiddleware, billingController.handleWebhook);

// Protected routes (require authentication)
router.use(authenticate); // Apply auth middleware to all routes below

router.get('/subscription', billingController.getSubscription);
router.post('/checkout', billingController.createCheckoutSession);
router.post('/portal', billingController.createPortalSession);
router.get('/checkout/:sessionId', billingController.getCheckoutSession);

// Admin routes (temporarily commented out - needs admin auth middleware)
// router.get('/config', adminAuth, billingController.getBillingConfig);

module.exports = router;