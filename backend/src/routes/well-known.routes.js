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

// Apple App Site Association for Passwords autofill & Universal Links
router.get('/apple-app-site-association', (req, res) => {
    res.set('Content-Type', 'application/json');
    res.json({
        webcredentials: {
            apps: ['24Q6933PHJ.com.tradetally.ios']
        }
    });
});

// Additional discovery endpoints
router.get('/openapi.json', serverController.getOpenAPISpec);
router.get('/api-docs.json', serverController.getAPIDocumentation);

module.exports = router;