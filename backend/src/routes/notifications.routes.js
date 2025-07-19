const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { authenticate } = require('../middleware/auth');
const { sseAuthenticate } = require('../middleware/sseAuth');
const { requiresTier } = require('../middleware/tierAuth');

// SSE endpoint for real-time notifications (uses special auth for EventSource)
router.get('/stream', sseAuthenticate, requiresTier('pro'), notificationsController.subscribeToNotifications);

// Other routes use standard authentication
router.use(authenticate);
router.use(requiresTier('pro'));

// Connection status
router.get('/status', notificationsController.getConnectionStatus);

// Test notification
router.post('/test', notificationsController.sendTestNotification);

module.exports = router;