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

// Get user notifications (remove pro tier requirement for basic functionality)
router.get('/', authenticate, notificationsController.getUserNotifications);

// Get unread notification count
router.get('/unread-count', authenticate, notificationsController.getUnreadCount);

// Mark notifications as read
router.post('/mark-read', authenticate, notificationsController.markNotificationsAsRead);

// Delete notifications
router.delete('/', authenticate, notificationsController.deleteNotifications);

// Mobile push notification routes (remove pro tier requirement for basic functionality)
const mobileRouter = express.Router();
mobileRouter.use(authenticate);

// Device token management
mobileRouter.post('/device-token', notificationsController.registerDeviceToken);

// Notification preferences
mobileRouter.get('/preferences', notificationsController.getNotificationPreferences);
mobileRouter.put('/preferences', notificationsController.updateNotificationPreferences);

// Test push notification
mobileRouter.post('/test-push', notificationsController.testPushNotification);

// Mount mobile routes
router.use('/', mobileRouter);

module.exports = router;