const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKey.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Create a new API key
router.post('/', 
  validate(schemas.createApiKey), 
  apiKeyController.createApiKey
);

// Get all API keys for the current user
router.get('/', apiKeyController.getUserApiKeys);

// Get a specific API key
router.get('/:keyId', apiKeyController.getApiKey);

// Update an API key
router.put('/:keyId', 
  validate(schemas.updateApiKey), 
  apiKeyController.updateApiKey
);

// Delete an API key
router.delete('/:keyId', apiKeyController.deleteApiKey);

// Admin routes
router.get('/admin/all', requireAdmin, apiKeyController.getAllApiKeys);

module.exports = router;