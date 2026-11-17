const express = require('express');
const router = express.Router();
const csvMappingController = require('../controllers/csvMapping.controller');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../utils/rateLimit');

const suggestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many AI column matches. Please try again later.'
});

// All routes require authentication
router.use(authenticate);

// Get all CSV mappings for current user
router.get('/', csvMappingController.getUserMappings);

// AI column match for an unrecognised file (registered before /:id)
router.post('/suggest', suggestLimiter, csvMappingController.suggestMapping);

// Get a specific CSV mapping
router.get('/:id', csvMappingController.getMappingById);

// Create a new CSV mapping
router.post('/', csvMappingController.createMapping);

// Update a CSV mapping
router.put('/:id', csvMappingController.updateMapping);

// Delete a CSV mapping
router.delete('/:id', csvMappingController.deleteMapping);

// Record usage of a CSV mapping
router.post('/:id/record-usage', csvMappingController.recordMappingUsage);

module.exports = router;
