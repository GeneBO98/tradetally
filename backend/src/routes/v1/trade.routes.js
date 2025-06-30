const express = require('express');
const router = express.Router();
const tradeController = require('../../controllers/trade.controller');
const tradeV1Controller = require('../../controllers/v1/trade.controller');
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validation');

// Enhanced trade management for mobile
router.get('/', authenticate, tradeV1Controller.getTrades);
router.get('/sync', authenticate, tradeV1Controller.getTradesForSync);
router.post('/', authenticate, validate(schemas.trade), tradeV1Controller.createTrade);
router.get('/:id', authenticate, tradeV1Controller.getTradeById);
router.put('/:id', authenticate, validate(schemas.trade), tradeV1Controller.updateTrade);
router.delete('/:id', authenticate, tradeV1Controller.deleteTrade);

// Bulk operations for mobile sync
router.post('/bulk', authenticate, tradeV1Controller.bulkCreateTrades);
router.put('/bulk', authenticate, tradeV1Controller.bulkUpdateTrades);
router.delete('/bulk', authenticate, tradeV1Controller.bulkDeleteTrades);

// Trade journal entries
router.get('/:id/journal', authenticate, tradeController.getTradeJournalEntries);
router.post('/:id/journal', authenticate, validate(schemas.journalEntry), tradeController.createJournalEntry);
router.put('/:id/journal/:entryId', authenticate, validate(schemas.journalEntry), tradeController.updateJournalEntry);
router.delete('/:id/journal/:entryId', authenticate, tradeController.deleteJournalEntry);

// Import/Export (reuse existing)
router.post('/import', authenticate, tradeController.importTrades);
router.get('/export', authenticate, tradeController.exportTrades);

// Mobile-specific endpoints
router.get('/summary/quick', authenticate, tradeV1Controller.getQuickSummary);
router.get('/recent', authenticate, tradeV1Controller.getRecentTrades);

module.exports = router;