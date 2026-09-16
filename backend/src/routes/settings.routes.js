const express = require('express');
const router = express.Router();
const multer = require('multer');
const settingsController = require('../controllers/settings.controller');
const manualFxService = require('../services/manualFxService');
const { authenticate, requireAdmin } = require('../middleware/auth');
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

router.get('/', authenticate, settingsController.getSettings);
router.put('/', authenticate, validate(schemas.updateSettings), settingsController.updateSettings);
router.get('/fx-rates', requireAdmin, async (req, res, next) => {
  try { res.json({ rates: await manualFxService.listRates() }); } catch (error) { next(error); }
});
router.put('/fx-rates/:code', requireAdmin, async (req, res, next) => {
  try {
    const rate = await manualFxService.saveRate(req.params.code, req.body?.per_usd);
    res.json({ rate });
  } catch (error) { next(error); }
});
router.delete('/fx-rates/:code', requireAdmin, async (req, res, next) => {
  try { res.json({ deleted: await manualFxService.deleteRate(req.params.code) }); } catch (error) { next(error); }
});
router.get('/tags', authenticate, settingsController.getTags);
router.post('/tags', authenticate, settingsController.createTag);
router.put('/tags/:id', authenticate, settingsController.updateTag);
router.delete('/tags/:id', authenticate, settingsController.deleteTag);
router.get('/trading-profile', authenticate, settingsController.getTradingProfile);
router.put('/trading-profile', authenticate, settingsController.updateTradingProfile);
router.get('/ai-provider', authenticate, settingsController.getAIProviderSettings);
router.put('/ai-provider', authenticate, settingsController.updateAIProviderSettings);
router.get('/cusip-ai-provider', authenticate, settingsController.getCusipAIProviderSettings);
router.put('/cusip-ai-provider', authenticate, settingsController.updateCusipAIProviderSettings);
router.get('/export', authenticate, settingsController.exportUserData);
router.post('/import', authenticate, upload.single('file'), settingsController.importUserData);

// Admin Settings Routes
router.get('/admin/ai', authenticate, settingsController.getAdminAISettings);
router.put('/admin/ai', requireAdmin, validate(schemas.adminAiSettings), settingsController.updateAdminAISettings);
router.get('/admin/cusip-ai', authenticate, settingsController.getAdminCusipAISettings);
router.put('/admin/cusip-ai', requireAdmin, settingsController.updateAdminCusipAISettings);
router.get('/admin/all', authenticate, settingsController.getAllAdminSettings);

// Broker Fee Settings Routes
router.get('/fee-profiles', authenticate, settingsController.getFeeProfiles);
router.post('/fee-profiles', authenticate, settingsController.createFeeProfile);
router.put('/fee-profiles/:id', authenticate, settingsController.updateFeeProfile);
router.delete('/fee-profiles/:id', authenticate, settingsController.deleteFeeProfile);
router.put('/fee-profiles/:id/accounts', authenticate, settingsController.setFeeProfileAccounts);
router.get('/broker-fees', authenticate, settingsController.getBrokerFeeSettings);
router.get('/broker-fees/:broker', authenticate, settingsController.getBrokerFeeSettingByBroker);
router.post('/broker-fees', authenticate, settingsController.upsertBrokerFeeSetting);
router.delete('/broker-fees/:id', authenticate, settingsController.deleteBrokerFeeSetting);

module.exports = router;
