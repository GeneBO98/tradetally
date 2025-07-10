const express = require('express');
const router = express.Router();
const twoFactorController = require('../controllers/twoFactor.controller');
const { authenticate } = require('../middleware/auth');

// All 2FA routes require authentication
router.use(authenticate);

// Get 2FA status
router.get('/status', twoFactorController.getStatus);

// Generate 2FA setup (QR code and secret)
router.post('/setup', twoFactorController.generateSetup);

// Enable 2FA with verification
router.post('/enable', twoFactorController.enableTwoFactor);

// Verify 2FA token
router.post('/verify', twoFactorController.verifyToken);

// Disable 2FA
router.post('/disable', twoFactorController.disableTwoFactor);

module.exports = router;