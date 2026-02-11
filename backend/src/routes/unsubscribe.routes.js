const express = require('express');
const router = express.Router();
const unsubscribeController = require('../controllers/unsubscribe.controller');

// GET /api/unsubscribe?token=xxx - Check unsubscribe status
router.get('/', unsubscribeController.getUnsubscribeStatus);

// POST /api/unsubscribe - Process unsubscribe request
router.post('/', unsubscribeController.handleUnsubscribe);

module.exports = router;
