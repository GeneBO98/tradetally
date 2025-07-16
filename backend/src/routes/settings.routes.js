const express = require('express');
const router = express.Router();
const multer = require('multer');
const settingsController = require('../controllers/settings.controller');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  }
});

router.get('/', authenticate, settingsController.getSettings);
router.put('/', authenticate, validate(schemas.updateSettings), settingsController.updateSettings);
router.get('/tags', authenticate, settingsController.getTags);
router.post('/tags', authenticate, settingsController.createTag);
router.put('/tags/:id', authenticate, settingsController.updateTag);
router.delete('/tags/:id', authenticate, settingsController.deleteTag);
router.get('/trading-profile', authenticate, settingsController.getTradingProfile);
router.put('/trading-profile', authenticate, settingsController.updateTradingProfile);
router.get('/ai-provider', authenticate, settingsController.getAIProviderSettings);
router.put('/ai-provider', authenticate, settingsController.updateAIProviderSettings);
router.get('/export', authenticate, settingsController.exportUserData);
router.post('/import', authenticate, upload.single('file'), settingsController.importUserData);

// Admin Settings Routes
router.get('/admin/ai', authenticate, settingsController.getAdminAISettings);
router.put('/admin/ai', authenticate, settingsController.updateAdminAISettings);
router.get('/admin/all', authenticate, settingsController.getAllAdminSettings);

module.exports = router;