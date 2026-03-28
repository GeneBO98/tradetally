const express = require('express');
const playbookController = require('../controllers/playbook.controller');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { requiresTier } = require('../middleware/tierAuth');

const router = express.Router();

router.use(authenticate);
router.use(requiresTier('pro'));

router.get('/analytics', playbookController.getAnalytics);
router.get('/trades/:tradeId/review', playbookController.getTradeReview);
router.put('/trades/:tradeId/review', validate(schemas.submitPlaybookReview), playbookController.upsertTradeReview);

router.get('/', playbookController.listPlaybooks);
router.post('/', validate(schemas.createPlaybook), playbookController.createPlaybook);
router.get('/:id', playbookController.getPlaybook);
router.put('/:id', validate(schemas.updatePlaybook), playbookController.updatePlaybook);
router.delete('/:id', playbookController.archivePlaybook);

module.exports = router;
