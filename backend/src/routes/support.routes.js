const express = require('express');
const router = express.Router();
const supportController = require('../controllers/support.controller');
const { authenticate } = require('../middleware/auth');

// All support routes require authentication
router.use(authenticate);

router.post('/contact', supportController.submitContactRequest);

module.exports = router;
