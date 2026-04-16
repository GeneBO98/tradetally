const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../../controllers/auth.controller');
const authV1Controller = require('../../controllers/v1/auth.controller');
const { validate, schemas } = require('../../middleware/validation');
const { authenticate } = require('../../middleware/auth');

// Mirrors the legacy authLimiter in auth.routes.js — 10 attempts per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }
});

// Enhanced mobile authentication routes
router.post('/register', authLimiter, validate(schemas.register), authV1Controller.register);
router.post('/login', authLimiter, validate(schemas.login), authV1Controller.login);
router.post('/logout', authenticate, authV1Controller.logout);
router.post('/refresh', authV1Controller.refreshToken);

// Device-specific authentication
router.post('/login/device', authLimiter, validate(schemas.deviceLogin), authV1Controller.loginWithDevice);
router.post('/logout/device', authenticate, authV1Controller.logoutDevice);
router.post('/logout/all-devices', authenticate, authV1Controller.logoutAllDevices);

// User profile and verification (reuse existing controllers)
router.get('/me', authenticate, authController.getMe);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authLimiter, authController.resendVerification);
router.post('/test-email', authController.sendTestEmail);

// Mobile-specific endpoints
router.get('/session/status', authenticate, authV1Controller.getSessionStatus);
router.post('/session/extend', authenticate, authV1Controller.extendSession);

module.exports = router;