const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/tradeAllocations.controller');

const router = express.Router();

router.use(authenticate, controller.requireEnabled);

router.get('/groups', controller.listGroups);
router.post('/groups', controller.createGroup);
router.put('/groups/:id', controller.updateGroup);
router.delete('/groups/:id', controller.archiveGroup);

router.get('/summary', controller.getSummary);
router.put('/trades/bulk', controller.replaceBulkTradeAllocations);
router.get('/trades/:trade_id', controller.getTradeAllocations);
router.put('/trades/:trade_id', controller.replaceTradeAllocations);
router.delete('/trades/:trade_id', controller.clearTradeAllocations);

module.exports = router;
