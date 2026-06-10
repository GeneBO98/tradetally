/**
 * Plaid Webhook Routes
 * Public inbound endpoint for Plaid item/transaction/holdings webhooks.
 * Requests are authenticated via the Plaid-Verification JWT header
 * (see services/plaid/plaidWebhookVerifier), not user auth.
 */

const express = require('express');
const router = express.Router();
const plaidWebhookController = require('../controllers/plaidWebhook.controller');
const { createRateLimiter } = require('../utils/rateLimit');

const plaidWebhookLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many webhook requests'
});

// Raw body required: verification hashes the exact request bytes
router.post('/', plaidWebhookLimiter, express.raw({ type: 'application/json' }), plaidWebhookController.handleWebhook);

module.exports = router;
