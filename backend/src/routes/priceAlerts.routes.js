const express = require('express');
const router = express.Router();
const priceAlertsController = require('../controllers/priceAlerts.controller');
const priceAlertWebhooksController = require('../controllers/priceAlertWebhooks.controller');
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');

// All price alert routes require Pro tier
router.use(authenticate);
router.use(requiresTier('pro'));

// Price alert CRUD operations
router.get('/', priceAlertsController.getUserPriceAlerts);
router.post('/', priceAlertsController.createPriceAlert);
router.put('/:id', priceAlertsController.updatePriceAlert);
router.delete('/:id', priceAlertsController.deletePriceAlert);

// Price alert webhook destinations
router.get('/webhooks', priceAlertWebhooksController.listWebhooks);
router.post('/webhooks', priceAlertWebhooksController.createWebhook);
router.put('/webhooks/:id', priceAlertWebhooksController.updateWebhook);
router.delete('/webhooks/:id', priceAlertWebhooksController.deleteWebhook);
router.post('/webhooks/:id/test', priceAlertWebhooksController.testWebhook);
router.get('/webhooks/:id/deliveries', priceAlertWebhooksController.listDeliveries);

// Alert notifications and testing
router.get('/notifications', priceAlertsController.getAlertNotifications);
router.post('/:id/test', priceAlertsController.testAlert);

module.exports = router;
