const express = require('express');
const router = express.Router();
const featuresController = require('../controllers/features.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Public routes
router.get('/check/:featureKey', authenticate, featuresController.checkFeatureAccess);

// Admin routes
router.get('/', requireAdmin, featuresController.getAllFeatures);
router.post('/', requireAdmin, featuresController.createFeature);
router.put('/:featureKey', requireAdmin, featuresController.updateFeature);
router.post('/:featureKey/toggle', requireAdmin, featuresController.toggleFeature);

module.exports = router;