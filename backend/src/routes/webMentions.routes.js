const express = require('express');
const router = express.Router();
const webMentionsController = require('../controllers/webMentions.controller');
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');

router.use(authenticate);
router.use(requiresTier('pro'));

router.get('/rules', webMentionsController.getRules);
router.post('/rules', webMentionsController.createRule);
router.put('/rules/:id', webMentionsController.updateRule);
router.delete('/rules/:id', webMentionsController.deleteRule);
router.post('/rules/:id/test', webMentionsController.testRule);
router.get('/mentions', webMentionsController.getMentions);
router.get('/sources', webMentionsController.getSources);
router.get('/presets', webMentionsController.getPresets);
router.post('/sources/refresh', webMentionsController.refreshSources);

module.exports = router;
