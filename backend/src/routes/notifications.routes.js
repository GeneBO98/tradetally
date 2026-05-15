const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { authenticate } = require('../middleware/auth');
const { sseAuthenticate } = require('../middleware/sseAuth');
const { requiresTier } = require('../middleware/tierAuth');

// SSE endpoint for real-time notifications (uses special auth for EventSource)
router.get('/stream', sseAuthenticate, requiresTier('pro'), notificationsController.subscribeToNotifications);

// All other routes require standard authentication
router.use(authenticate);

// Basic notification routes — available to all tiers so free users can still
// see, read, and dismiss in-app notifications (achievements, comments, etc.)
router.get('/', notificationsController.getUserNotifications);
router.get('/unread-count', notificationsController.getUnreadCount);
router.post('/mark-read', notificationsController.markNotificationsAsRead);
router.post('/mark-all-read', notificationsController.markAllNotificationsAsRead);
router.delete('/', notificationsController.deleteNotifications);

// Pro-only routes (real-time SSE management and test sends)
router.get('/status', requiresTier('pro'), notificationsController.getConnectionStatus);
router.post('/test', requiresTier('pro'), notificationsController.sendTestNotification);

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