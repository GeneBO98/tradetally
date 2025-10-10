const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/trade.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { flexibleAuth } = require('../middleware/apiKeyAuth');
const { validate, schemas } = require('../middleware/validation');
const multer = require('multer');
const imageUpload = require('../middleware/upload');

/**
 * @swagger
 * tags:
 *   name: Trades
 *   description: Trading operations and management
 */

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

/**
 * @swagger
 * /api/trades:
 *   get:
 *     summary: Get user's trades
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of trades per page
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         description: Filter by symbol
 *     responses:
 *       200:
 *         description: List of trades
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trades:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Trade'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   post:
 *     summary: Create a new trade
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTrade'
 *     responses:
 *       201:
 *         description: Trade created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trade:
 *                   $ref: '#/components/schemas/Trade'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', authenticate, tradeController.getUserTrades);
router.post('/', authenticate, validate(schemas.createTrade), tradeController.createTrade);

/**
 * @swagger
 * /api/trades/round-trip:
 *   get:
 *     summary: Get round trip trades
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of round trip trades
 */
router.get('/round-trip', authenticate, tradeController.getRoundTripTrades);

/**
 * @swagger
 * /api/trades/enrichment-status:
 *   get:
 *     summary: Get trade enrichment status
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Enrichment status
 */
router.get('/enrichment-status', authenticate, tradeController.getEnrichmentStatus);

/**
 * @swagger
 * /api/trades/retry-enrichment:
 *   post:
 *     summary: Retry trade enrichment for stuck CUSIPs
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Enrichment retry initiated
 */
// TODO: Add missing retryEnrichment method
// router.post('/retry-enrichment', authenticate, tradeController.retryEnrichment);

/**
 * @swagger
 * /api/trades/sync-enrichment-status:
 *   post:
 *     summary: Sync enrichment status with completed jobs
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Enrichment status synced
 */
// TODO: Add missing syncEnrichmentStatus method
// router.post('/sync-enrichment-status', authenticate, tradeController.syncEnrichmentStatus);

/**
 * @swagger
 * /api/trades/force-complete-enrichment:
 *   post:
 *     summary: NUCLEAR OPTION - Force complete ALL enrichment jobs
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All enrichment force completed
 */
// TODO: Add missing forceCompleteEnrichment method  
// router.post('/force-complete-enrichment', authenticate, tradeController.forceCompleteEnrichment);

/**
 * @swagger
 * /api/trades/debug-symbol:
 *   get:
 *     summary: Debug symbol search
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Debug information about symbol search
 */
// TODO: Add missing debugSymbolSearch method
// router.get('/debug-symbol', authenticate, tradeController.debugSymbolSearch);

/**
 * @swagger
 * /api/trades/open-positions-quotes:
 *   get:
 *     summary: Get open positions with quotes
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Open positions with current quotes
 */
router.get('/open-positions-quotes', authenticate, tradeController.getOpenPositionsWithQuotes);

/**
 * @swagger
 * /api/trades/public:
 *   get:
 *     summary: Get public trades
 *     tags: [Trades]
 *     responses:
 *       200:
 *         description: List of public trades
 */
router.get('/public', optionalAuth, tradeController.getPublicTrades);

/**
 * @swagger
 * /api/trades/analytics:
 *   get:
 *     summary: Get trade analytics
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trade analytics data
 */
router.get('/analytics', authenticate, tradeController.getAnalytics);

/**
 * @swagger
 * /api/trades/symbols:
 *   get:
 *     summary: Get symbol list
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available symbols
 */
router.get('/symbols', authenticate, tradeController.getSymbolList);

/**
 * @swagger
 * /api/trades/strategies:
 *   get:
 *     summary: Get strategy list
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available strategies
 */
router.get('/strategies', authenticate, tradeController.getStrategyList);

/**
 * @swagger
 * /api/trades/setups:
 *   get:
 *     summary: Get list of setups used by the user
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available setups
 */
router.get('/setups', authenticate, tradeController.getSetupList);

/**
 * @swagger
 * /api/trades/brokers:
 *   get:
 *     summary: Get list of brokers used by the user
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available brokers
 */
router.get('/brokers', authenticate, tradeController.getBrokerList);

/**
 * @swagger
 * /api/trades/import:
 *   post:
 *     summary: Import trades from file
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file containing trades
 *     responses:
 *       200:
 *         description: Import started successfully
 */
router.post('/import', authenticate, upload.single('file'), tradeController.importTrades);

/**
 * @swagger
 * /api/trades/import/status/{importId}:
 *   get:
 *     summary: Get import status
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: importId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Import status
 */
router.get('/import/status/:importId', authenticate, tradeController.getImportStatus);

/**
 * @swagger
 * /api/trades/import/history:
 *   get:
 *     summary: Get import history
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of previous imports
 */
router.get('/import/history', authenticate, tradeController.getImportHistory);

/**
 * @swagger
 * /api/trades/import/{importId}:
 *   delete:
 *     summary: Delete import
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: importId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Import deleted successfully
 */
router.delete('/import/:importId', authenticate, tradeController.deleteImport);
router.get('/import/logs', authenticate, tradeController.getImportLogs);
router.get('/import/logs/:filename', authenticate, tradeController.getLogFile);
router.get('/cusip/resolution-status', authenticate, tradeController.getCusipResolutionStatus);
router.get('/cusip/:cusip', authenticate, tradeController.lookupCusip);
router.post('/cusip', authenticate, tradeController.addCusipMapping);
router.delete('/cusip/:cusip', authenticate, tradeController.deleteCusipMapping);
router.get('/cusip-mappings', authenticate, tradeController.getCusipMappings);
router.post('/cusip/resolve-unresolved', authenticate, tradeController.resolveUnresolvedCusips);

/**
 * @swagger
 * /api/trades/bulk:
 *   delete:
 *     summary: Bulk delete trades
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tradeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of trade IDs to delete
 *     responses:
 *       200:
 *         description: Bulk delete completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deletedCount:
 *                   type: integer
 *                 totalRequested:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tradeId:
 *                         type: string
 *                       error:
 *                         type: string
 */
router.delete('/bulk', authenticate, tradeController.bulkDeleteTrades);

/**
 * @swagger
 * /api/trades/bulk/tags:
 *   post:
 *     summary: Bulk add tags to trades
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tradeIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of trade IDs to add tags to
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of tag names to add
 *     responses:
 *       200:
 *         description: Bulk tag update completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 updatedCount:
 *                   type: integer
 *                 totalRequested:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tradeId:
 *                         type: string
 *                       error:
 *                         type: string
 */
router.post('/bulk/tags', authenticate, tradeController.bulkAddTags);

/**
 * @swagger
 * /api/trades/earnings:
 *   get:
 *     summary: Get upcoming earnings
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of upcoming earnings
 */
router.get('/earnings', authenticate, tradeController.getUpcomingEarnings);

/**
 * @swagger
 * /api/trades/news:
 *   get:
 *     summary: Get trade-related news
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of trade-related news
 */
router.get('/news', authenticate, tradeController.getTradeNews);

// Export trades - MUST be before /:id route to avoid matching "export" as an ID
router.get('/export', authenticate, tradeController.exportTrades);

// Chart data endpoint - MUST be before /:id route
router.get('/:id/chart-data', authenticate, tradeController.getTradeChartData);

/**
 * @swagger
 * /api/trades/{id}:
 *   get:
 *     summary: Get trade by ID
 *     tags: [Trades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Trade details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Trade'
 *   put:
 *     summary: Update trade
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTrade'
 *     responses:
 *       200:
 *         description: Trade updated successfully
 *   delete:
 *     summary: Delete trade
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Trade deleted successfully
 */
router.get('/:id', optionalAuth, tradeController.getTrade);
router.put('/:id', authenticate, validate(schemas.updateTrade), tradeController.updateTrade);
router.delete('/:id', authenticate, tradeController.deleteTrade);
router.post('/:id/attachments', authenticate, upload.single('file'), tradeController.uploadAttachment);
router.delete('/:id/attachments/:attachmentId', authenticate, tradeController.deleteAttachment);
// Image-specific routes
router.post('/:id/images', authenticate, imageUpload.array('images', 10), tradeController.uploadTradeImages);
router.get('/:id/images/:filename', optionalAuth, tradeController.getTradeImage);
router.delete('/:id/images/:attachmentId', authenticate, tradeController.deleteTradeImage);
router.post('/:id/comments', authenticate, tradeController.addComment);
router.get('/:id/comments', optionalAuth, tradeController.getComments);
router.put('/:id/comments/:commentId', authenticate, tradeController.updateComment);
router.delete('/:id/comments/:commentId', authenticate, tradeController.deleteComment);

module.exports = router;