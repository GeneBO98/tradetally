const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const clientTelemetryController = require('../controllers/clientTelemetry.controller');

const router = express.Router();

router.post('/errors', optionalAuth, clientTelemetryController.recordError);

module.exports = router;
