const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');

// All notification routes require Pro tier
router.use(authenticate);
router.use(requiresTier('pro'));

// SSE endpoint for real-time notifications
router.get('/stream', notificationsController.subscribeToNotifications);

// Connection status
router.get('/status', notificationsController.getConnectionStatus);

// Test notification
router.post('/test', notificationsController.sendTestNotification);

module.exports = router;