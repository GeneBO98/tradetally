const express = require('express');
const router = express.Router();
const supportController = require('../controllers/support.controller');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { createRateLimiter } = require('../utils/rateLimit');

const supportLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many support requests. Please try again later.'
});

// All support routes require authentication
router.use(authenticate);

router.post('/contact', supportLimiter, validate(schemas.supportContact), supportController.submitContactRequest);

module.exports = router;
