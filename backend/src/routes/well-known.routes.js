const express = require('express');
const router = express.Router();
const serverController = require('../controllers/v1/server.controller');

// Well-known endpoints for mobile app discovery
router.get('/tradetally-config.json', serverController.getWellKnownConfig);

// Additional discovery endpoints
router.get('/openapi.json', serverController.getOpenAPISpec);
router.get('/api-docs.json', serverController.getAPIDocumentation);

module.exports = router;