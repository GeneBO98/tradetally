const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validate, schemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { attachTierInfo } = require('../middleware/tierAuth');

router.get('/config', authController.getRegistrationConfig);
router.post('/register', validate(schemas.register), authController.register);
router.post('/login', validate(schemas.login), authController.login);
router.post('/verify-2fa', authController.verify2FA);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, attachTierInfo, authController.getMe);
router.post('/refresh', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);
router.post('/test-email', authController.sendTestEmail);

module.exports = router;