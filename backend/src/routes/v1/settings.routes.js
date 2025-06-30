const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/settings.controller');
const settingsV1Controller = require('../../controllers/v1/settings.controller');
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validation');

// Enhanced settings for mobile
router.get('/', authenticate, settingsV1Controller.getSettings);
router.put('/', authenticate, validate(schemas.settings), settingsV1Controller.updateSettings);

// Mobile-specific settings
router.get('/mobile', authenticate, settingsV1Controller.getMobileSettings);
router.put('/mobile', authenticate, settingsV1Controller.updateMobileSettings);

// Notification preferences
router.get('/notifications', authenticate, settingsV1Controller.getNotificationSettings);
router.put('/notifications', authenticate, settingsV1Controller.updateNotificationSettings);

// Theme and display preferences
router.get('/display', authenticate, settingsV1Controller.getDisplaySettings);
router.put('/display', authenticate, settingsV1Controller.updateDisplaySettings);

// Privacy and security settings
router.get('/privacy', authenticate, settingsV1Controller.getPrivacySettings);
router.put('/privacy', authenticate, settingsV1Controller.updatePrivacySettings);

// Data export/import preferences
router.get('/data', authenticate, settingsV1Controller.getDataSettings);
router.put('/data', authenticate, settingsV1Controller.updateDataSettings);

// Backup existing settings functionality
router.get('/reset', authenticate, settingsController.resetSettings);

module.exports = router;