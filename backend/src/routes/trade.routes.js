const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/trade.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(), // Store in memory
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 }, // 50MB default
  fileFilter: (req, file, cb) => {
    console.log('Multer fileFilter - file:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      fieldname: file.fieldname
    });
    
    const allowedTypes = /jpeg|jpg|png|gif|csv|text\/csv|application\/csv/;
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'text/csv' || file.mimetype === 'application/csv';
    const extname = allowedTypes.test(file.originalname.toLowerCase()) || file.originalname.toLowerCase().endsWith('.csv');
    
    console.log('File validation:', { mimetype, extname, actualMimetype: file.mimetype });
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    console.log('File rejected - invalid type');
    cb(new Error('Invalid file type'));
  }
});

router.get('/', authenticate, tradeController.getUserTrades);
router.get('/open-positions-quotes', authenticate, tradeController.getOpenPositionsWithQuotes);
router.get('/news', authenticate, tradeController.getTradeNews);
router.get('/earnings', authenticate, tradeController.getUpcomingEarnings);
router.post('/', authenticate, validate(schemas.createTrade), tradeController.createTrade);
router.get('/public', optionalAuth, tradeController.getPublicTrades);
router.get('/analytics', authenticate, tradeController.getAnalytics);
router.get('/symbols', authenticate, tradeController.getSymbolList);
router.get('/strategies', authenticate, tradeController.getStrategyList);
router.post('/import', authenticate, upload.single('file'), tradeController.importTrades);
router.get('/import/status/:importId', authenticate, tradeController.getImportStatus);
router.get('/import/history', authenticate, tradeController.getImportHistory);
router.delete('/import/:importId', authenticate, tradeController.deleteImport);
router.get('/import/logs', authenticate, tradeController.getImportLogs);
router.get('/import/logs/:filename', authenticate, tradeController.getLogFile);
router.get('/cusip/resolution-status', authenticate, tradeController.getCusipResolutionStatus);
router.get('/cusip/:cusip', authenticate, tradeController.lookupCusip);
router.post('/cusip', authenticate, tradeController.addCusipMapping);
router.delete('/cusip/:cusip', authenticate, tradeController.deleteCusipMapping);
router.get('/cusip-mappings', authenticate, tradeController.getCusipMappings);
router.post('/cusip/resolve-unresolved', authenticate, tradeController.resolveUnresolvedCusips);
router.get('/:id', optionalAuth, tradeController.getTrade);
router.get('/:id/chart-data', authenticate, tradeController.getTradeChartData);
router.put('/:id', authenticate, validate(schemas.updateTrade), tradeController.updateTrade);
router.delete('/:id', authenticate, tradeController.deleteTrade);
router.post('/:id/attachments', authenticate, upload.single('file'), tradeController.uploadAttachment);
router.delete('/:id/attachments/:attachmentId', authenticate, tradeController.deleteAttachment);
router.post('/:id/comments', authenticate, tradeController.addComment);
router.get('/:id/comments', optionalAuth, tradeController.getComments);
router.put('/:id/comments/:commentId', authenticate, tradeController.updateComment);
router.delete('/:id/comments/:commentId', authenticate, tradeController.deleteComment);

module.exports = router;