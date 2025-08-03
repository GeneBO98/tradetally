const express = require('express');
const router = express.Router();
const cusipMappingsController = require('../controllers/cusipMappings.controller');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get user's CUSIP mappings with pagination and filtering
router.get('/', cusipMappingsController.getUserCusipMappings);

// Get CUSIP mappings that need user review
router.get('/review', cusipMappingsController.getCusipMappingsForReview);

// Get unmapped CUSIPs (exist in trades but no mapping)
router.get('/unmapped', cusipMappingsController.getUnmappedCusips);

// Create or update a user-specific CUSIP mapping
router.post('/', cusipMappingsController.createOrUpdateCusipMapping);

// Verify/unverify a CUSIP mapping
router.patch('/:cusip/verify', cusipMappingsController.verifyCusipMapping);

// Delete a user-specific CUSIP mapping (revert to global)
router.delete('/:cusip', cusipMappingsController.deleteCusipMapping);

module.exports = router;