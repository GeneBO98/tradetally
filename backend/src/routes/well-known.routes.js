const express = require('express');
const router = express.Router();
const serverController = require('../controllers/v1/server.controller');
const oauth2Controller = require('../controllers/oauth2.controller');

// Well-known endpoints for mobile app discovery
router.get('/tradetally-config.json', serverController.getWellKnownConfig);

// OpenID Connect Discovery
router.get('/openid-configuration', oauth2Controller.openidConfiguration);

// JWKS (JSON Web Key Set) for JWT verification
router.get('/jwks.json', oauth2Controller.jwks);

// Additional discovery endpoints
router.get('/openapi.json', serverController.getOpenAPISpec);
router.get('/api-docs.json', serverController.getAPIDocumentation);

module.exports = router;