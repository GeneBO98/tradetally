const express = require('express');
const router = express.Router();
const serverController = require('../../controllers/v1/server.controller');

// Server discovery and configuration
router.get('/info', serverController.getServerInfo);
router.get('/config', serverController.getServerConfig);
router.get('/features', serverController.getFeatures);

// API version and capabilities
router.get('/version', serverController.getVersion);
router.get('/capabilities', serverController.getCapabilities);
router.get('/endpoints', serverController.getEndpoints);

// Instance health and status
router.get('/health', serverController.getHealth);
router.get('/status', serverController.getStatus);
router.get('/metrics', serverController.getMetrics);

// Mobile app configuration
router.get('/mobile/config', serverController.getMobileConfig);
router.get('/mobile/requirements', serverController.getMobileRequirements);

module.exports = router;