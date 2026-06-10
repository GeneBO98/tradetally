const express = require('express');
const router = express.Router();
const propFirmController = require('../controllers/propFirm.controller');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

// Apply authentication to all routes
router.use(authenticate);

// List rule profiles with live status (progress, headroom, breaches)
router.get('/profiles', propFirmController.listProfiles);

// Create a rule profile for a trading account
router.post('/profiles', validate(schemas.propFirmProfileCreate), propFirmController.createProfile);

// Partial update of a rule profile
router.put('/profiles/:id', validate(schemas.propFirmProfileUpdate), propFirmController.updateProfile);

// Delete a rule profile
router.delete('/profiles/:id', propFirmController.deleteProfile);

module.exports = router;
