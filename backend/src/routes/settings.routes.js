const express = require('express');
const router = express.Router();
const multer = require('multer');
const settingsController = require('../controllers/settings.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/sensitiveAccess');
const { validate, schemas } = require('../middleware/validation');

function isJsonUpload(file) {
  const filename = file?.originalname?.toLowerCase?.() || '';
  return file?.mimetype === 'application/json' || filename.endsWith('.json');
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (isJsonUpload(file)) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  }
});

router.use(authenticate);
router.use(requireVerifiedEmail);

router.get('/', settingsController.getSettings);
router.put('/', validate(schemas.updateSettings), settingsController.updateSettings);
router.get('/tags', settingsController.getTags);
router.post('/tags', settingsController.createTag);
router.put('/tags/:id', settingsController.updateTag);
router.delete('/tags/:id', settingsController.deleteTag);
router.get('/trading-profile', settingsController.getTradingProfile);
router.put('/trading-profile', settingsController.updateTradingProfile);
router.get('/ai-provider', settingsController.getAIProviderSettings);
router.put('/ai-provider', settingsController.updateAIProviderSettings);
router.get('/cusip-ai-provider', settingsController.getCusipAIProviderSettings);
router.put('/cusip-ai-provider', settingsController.updateCusipAIProviderSettings);
router.get('/export', settingsController.exportUserData);
router.post('/import', upload.single('file'), settingsController.importUserData);

// Admin Settings Routes
router.get('/admin/ai', settingsController.getAdminAISettings);
router.put('/admin/ai', requireAdmin, validate(schemas.adminAiSettings), settingsController.updateAdminAISettings);
router.get('/admin/cusip-ai', settingsController.getAdminCusipAISettings);
router.put('/admin/cusip-ai', requireAdmin, settingsController.updateAdminCusipAISettings);
router.get('/admin/all', settingsController.getAllAdminSettings);

// Broker Fee Settings Routes
router.get('/broker-fees', settingsController.getBrokerFeeSettings);
router.get('/broker-fees/:broker', settingsController.getBrokerFeeSettingByBroker);
router.post('/broker-fees', settingsController.upsertBrokerFeeSetting);
router.delete('/broker-fees/:id', settingsController.deleteBrokerFeeSetting);

module.exports = router;
