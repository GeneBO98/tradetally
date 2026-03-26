const express = require('express');
const router = express.Router();
const webhookV1Controller = require('../../controllers/v1/webhook.controller');
const { authenticate } = require('../../middleware/auth');
const { requiresTier } = require('../../middleware/tierAuth');
const { validate, schemas } = require('../../middleware/validation');

// Webhooks are a Pro-only integration feature.
router.use(authenticate);
router.use(requiresTier('pro'));

router.get('/', webhookV1Controller.listWebhooks);
router.post('/', validate(schemas.createWebhook), webhookV1Controller.createWebhook);
router.put('/:id', validate(schemas.updateWebhook), webhookV1Controller.updateWebhook);
router.delete('/:id', webhookV1Controller.deleteWebhook);
router.post('/:id/test', webhookV1Controller.testWebhook);
router.get('/:id/deliveries', webhookV1Controller.listWebhookDeliveries);

module.exports = router;
