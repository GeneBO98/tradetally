const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

router.get('/', authenticate, settingsController.getSettings);
router.put('/', authenticate, validate(schemas.updateSettings), settingsController.updateSettings);
router.get('/tags', authenticate, settingsController.getTags);
router.post('/tags', authenticate, settingsController.createTag);
router.put('/tags/:id', authenticate, settingsController.updateTag);
router.delete('/tags/:id', authenticate, settingsController.deleteTag);
router.get('/trading-profile', authenticate, settingsController.getTradingProfile);
router.put('/trading-profile', authenticate, settingsController.updateTradingProfile);

module.exports = router;