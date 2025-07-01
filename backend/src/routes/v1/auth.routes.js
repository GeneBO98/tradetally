const express = require('express');
const router = express.Router();
const authController = require('../../controllers/auth.controller');
const authV1Controller = require('../../controllers/v1/auth.controller');
const { validate, schemas } = require('../../middleware/validation');
const { authenticate } = require('../../middleware/auth');

// Enhanced mobile authentication routes
router.post('/register', validate(schemas.register), authV1Controller.register);
router.post('/login', validate(schemas.login), authV1Controller.login);
router.post('/logout', authenticate, authV1Controller.logout);
router.post('/refresh', authV1Controller.refreshToken);

// Device-specific authentication
router.post('/login/device', validate(schemas.deviceLogin), authV1Controller.loginWithDevice);
router.post('/logout/device', authenticate, authV1Controller.logoutDevice);
router.post('/logout/all-devices', authenticate, authV1Controller.logoutAllDevices);

// User profile and verification (reuse existing controllers)
router.get('/me', authenticate, authController.getMe);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);

// Mobile-specific endpoints
router.get('/session/status', authenticate, authV1Controller.getSessionStatus);
router.post('/session/extend', authenticate, authV1Controller.extendSession);

module.exports = router;