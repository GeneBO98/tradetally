const express = require('express');
const router = express.Router();
const deviceController = require('../../controllers/v1/device.controller');
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validation');

// Device management routes
router.get('/', authenticate, deviceController.getDevices);
router.post('/', authenticate, validate(schemas.deviceRegistration), deviceController.registerDevice);
router.get('/:id', authenticate, deviceController.getDevice);
router.put('/:id', authenticate, validate(schemas.deviceUpdate), deviceController.updateDevice);
router.delete('/:id', authenticate, deviceController.deleteDevice);

// Device trust and security
router.post('/:id/trust', authenticate, deviceController.trustDevice);
router.post('/:id/untrust', authenticate, deviceController.untrustDevice);
router.get('/:id/sessions', authenticate, deviceController.getDeviceSessions);
router.delete('/:id/sessions', authenticate, deviceController.revokeDeviceSessions);

// Current device operations
router.get('/current/info', authenticate, deviceController.getCurrentDeviceInfo);
router.put('/current/info', authenticate, deviceController.updateCurrentDeviceInfo);
router.post('/current/fingerprint', authenticate, deviceController.updateDeviceFingerprint);

// Push notifications
router.post('/current/push-token', authenticate, validate(schemas.pushToken), deviceController.updatePushToken);
router.delete('/current/push-token', authenticate, deviceController.removePushToken);

// Device activity and monitoring
router.get('/current/activity', authenticate, deviceController.getDeviceActivity);
router.post('/current/heartbeat', authenticate, deviceController.recordHeartbeat);

module.exports = router;