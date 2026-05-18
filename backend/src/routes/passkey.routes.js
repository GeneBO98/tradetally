const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const passkeyController = require('../controllers/passkey.controller');
const { authenticate } = require('../middleware/auth');
const { requireSudo, requireVerifiedEmail } = require('../middleware/sensitiveAccess');

// Rate limit for login endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many passkey login attempts, please try again later.' },
});

// Authenticated routes - manage passkeys
router.get('/', authenticate, requireVerifiedEmail, passkeyController.getPasskeys);
router.post('/register/options', authenticate, requireVerifiedEmail, requireSudo, passkeyController.registerOptions);
router.post('/register/verify', authenticate, requireVerifiedEmail, requireSudo, passkeyController.registerVerify);
router.delete('/:id', authenticate, requireVerifiedEmail, requireSudo, passkeyController.deletePasskey);

// Public routes - passkey login
router.post('/login/options', loginLimiter, passkeyController.loginOptions);
router.post('/login/verify', loginLimiter, passkeyController.loginVerify);

module.exports = router;
