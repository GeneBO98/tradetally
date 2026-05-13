const express = require('express');
const router = express.Router();
const passkeyController = require('../controllers/passkey.controller');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../utils/rateLimit');

// Rate limit for login endpoints
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many passkey login attempts, please try again later.'
});

// Authenticated routes - manage passkeys
router.get('/', authenticate, passkeyController.getPasskeys);
router.post('/register/options', authenticate, passkeyController.registerOptions);
router.post('/register/verify', authenticate, passkeyController.registerVerify);
router.delete('/:id', authenticate, passkeyController.deletePasskey);

// Public routes - passkey login
router.post('/login/options', loginLimiter, passkeyController.loginOptions);
router.post('/login/verify', loginLimiter, passkeyController.loginVerify);

module.exports = router;
