const express = require('express');
const router = express.Router();
const webhookV1Controller = require('../../controllers/v1/webhook.controller');
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validation');

router.get('/', authenticate, webhookV1Controller.listWebhooks);
router.post('/', authenticate, validate(schemas.createWebhook), webhookV1Controller.createWebhook);
router.put('/:id', authenticate, validate(schemas.updateWebhook), webhookV1Controller.updateWebhook);
router.delete('/:id', authenticate, webhookV1Controller.deleteWebhook);
router.post('/:id/test', authenticate, webhookV1Controller.testWebhook);
router.get('/:id/deliveries', authenticate, webhookV1Controller.listWebhookDeliveries);

module.exports = router;
