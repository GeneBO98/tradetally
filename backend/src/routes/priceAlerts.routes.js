const express = require('express');
const router = express.Router();
const priceAlertsController = require('../controllers/priceAlerts.controller');
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

// Alert notifications and testing
router.get('/notifications', priceAlertsController.getAlertNotifications);
router.post('/:id/test', priceAlertsController.testAlert);

module.exports = router;