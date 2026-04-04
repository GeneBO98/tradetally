const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/trade.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { flexibleAuth, flexibleOptionalAuth, requireApiScope } = require('../middleware/apiKeyAuth');
const { validate, schemas } = require('../middleware/validation');
const multer = require('multer');
const imageUpload = require('../middleware/upload');
const { requiresTier } = require('../middleware/tierAuth');

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
 *       - apiKeyAuth: []
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
 *       - apiKeyAuth: []
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
router.get('/', flexibleAuth, requireApiScope('trades:read'), tradeController.getUserTrades);

/**
 * @swagger
 * /api/trades/count:
 *   get:
 *     summary: Get total trade count
 *     description: Returns the total number of trades for the authenticated user, respecting any active filters.
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         description: Filter by symbol
 *       - in: query
 *         name: side
 *         schema:
 *           type: string
 *           enum: [long, short]
 *         description: Filter by trade direction
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, closed]
 *         description: Filter by trade status
 *     responses:
 *       200:
 *         description: Trade count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/count', flexibleAuth, requireApiScope('trades:read'), tradeController.getTradesCount);
router.post('/', flexibleAuth, requireApiScope('trades:write'), validate(schemas.createTrade), tradeController.createTrade);

/**
 * @swagger
 * /api/trades/shell:
 *   post:
 *     summary: Create a shell trade (no executions)
 *     description: >
 *       Creates a trade with metadata only (symbol, side, strategy, etc.) but no
 *       entry/exit executions. Use POST /api/trades/{id}/fills to add executions
 *       incrementally after creation.
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [symbol, side]
 *             properties:
 *               symbol:
 *                 type: string
 *                 maxLength: 20
 *                 example: AAPL
 *               side:
 *                 type: string
 *                 enum: [long, short]
 *               instrumentType:
 *                 type: string
 *                 enum: [stock, option, future, crypto]
 *                 default: stock
 *               broker:
 *                 type: string
 *                 maxLength: 50
 *               account_identifier:
 *                 type: string
 *                 maxLength: 50
 *               strategy:
 *                 type: string
 *                 maxLength: 100
 *               setup:
 *                 type: string
 *                 maxLength: 100
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               notes:
 *                 type: string
 *               confidence:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *               stopLoss:
 *                 type: number
 *               takeProfit:
 *                 type: number
 *     responses:
 *       201:
 *         description: Shell trade created
 *       400:
 *         description: Validation error
 */
router.post('/shell', flexibleAuth, requireApiScope('trades:write'), validate(schemas.createShellTrade), tradeController.createShellTrade);

/**
 * @swagger
 * /api/trades/export/csv:
 *   get:
 *     summary: Export trades to CSV
 *     description: Export all trades matching the filter criteria to a CSV file with generic headers
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         description: Filter by symbol
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 */
router.get('/export/csv', authenticate, tradeController.exportTradesToCSV);

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
router.post('/force-complete-enrichment', authenticate, tradeController.forceCompleteEnrichment);

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
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Trade analytics data
 */
router.get('/analytics', flexibleAuth, requireApiScope('trades:read'), tradeController.getAnalytics);

/**
 * @swagger
 * /api/trades/analytics/monthly:
 *   get:
 *     summary: Get monthly performance metrics
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Year for monthly breakdown (defaults to current year)
 *     responses:
 *       200:
 *         description: Monthly performance metrics
 */
router.get('/analytics/monthly', flexibleAuth, requireApiScope('trades:read'), tradeController.getMonthlyPerformance);
router.get('/analytics/partial-exits', flexibleAuth, requireApiScope('trades:read'), requiresTier('pro'), tradeController.getPartialExitAnalytics);

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
 * /api/trades/accounts:
 *   get:
 *     summary: Get list of account identifiers used by the user
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available account identifiers (redacted)
 */
router.get('/accounts', authenticate, tradeController.getAccountList);

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

/**
 * @swagger
 * /api/trades/import/requirements:
 *   get:
 *     summary: Check import requirements (account selection)
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Import requirements including available accounts
 */
router.get('/import/requirements', authenticate, tradeController.checkImportRequirements);

/**
 * @swagger
 * /api/trades/import/validate:
 *   post:
 *     summary: Validate import file before importing
 *     description: Pre-validates a CSV file to detect broker format mismatch and provide file analysis
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
 *                 description: CSV file to validate
 *               broker:
 *                 type: string
 *                 description: User-selected broker format
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 detectedBroker:
 *                   type: string
 *                 selectedBroker:
 *                   type: string
 *                 mismatch:
 *                   type: boolean
 *                 detectedHeaders:
 *                   type: array
 *                   items:
 *                     type: string
 *                 rowCount:
 *                   type: integer
 */
router.post('/import/validate', authenticate, upload.single('file'), tradeController.validateImportFile);

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
router.delete('/import/bulk', authenticate, tradeController.bulkDeleteImports);
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
router.post('/earnings/refresh', authenticate, tradeController.refreshUpcomingEarnings);

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
router.post('/news/refresh', authenticate, tradeController.refreshTradeNews);

// Export trades - MUST be before /:id route to avoid matching "export" as an ID
router.get('/export', authenticate, tradeController.exportTrades);

// Expired options management routes - MUST be before /:id route
router.get('/expired-options', authenticate, tradeController.getExpiredOptions);
router.post('/expired-options/auto-close', authenticate, tradeController.autoCloseExpiredOptions);

// Trade data repair route - fixes trades with inconsistent exit data
// Detects trades where exit_price is set but executions show position is still open
// Use ?dryRun=true (default) to preview, ?dryRun=false to apply fixes
router.post('/repair-inconsistent', authenticate, tradeController.repairInconsistentTrades);

// Sample data management - remove all sample trades/journal/account
router.post('/sample-data', authenticate, tradeController.createSampleData);
router.delete('/sample-data', authenticate, tradeController.deleteSampleData);

// Check if user has sample data
router.get('/sample-data/check', authenticate, tradeController.checkSampleData);

// Chart data endpoint - MUST be before /:id route
router.get('/tradingview/snapshot/:snapshotId', tradeController.proxyTradingViewSnapshot);
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
router.get('/:id', flexibleOptionalAuth, tradeController.getTrade);
router.put('/:id', flexibleAuth, requireApiScope('trades:write'), validate(schemas.updateTrade), tradeController.updateTrade);
router.delete('/:id', flexibleAuth, requireApiScope('trades:write'), tradeController.deleteTrade);
/**
 * @swagger
 * /api/trades/{id}/fills:
 *   post:
 *     summary: Add a fill (execution) to an existing trade
 *     description: >
 *       Appends a single execution to a trade. The trade's entry/exit price,
 *       quantity, P&L, and open/closed status are recalculated automatically
 *       from all fills. Use with shell trades or to add partial fills to any trade.
 *     tags: [Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Trade ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action, quantity, price, datetime]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [buy, sell]
 *                 description: Fill direction
 *               quantity:
 *                 type: number
 *                 minimum: 0
 *                 exclusiveMinimum: true
 *                 description: Number of shares/contracts
 *                 example: 50
 *               price:
 *                 type: number
 *                 minimum: 0
 *                 description: Fill price per share/contract
 *                 example: 152.30
 *               datetime:
 *                 type: string
 *                 format: date-time
 *                 description: Execution timestamp
 *                 example: "2025-01-15T14:30:00Z"
 *               commission:
 *                 type: number
 *                 default: 0
 *                 description: Commission for this fill
 *               fees:
 *                 type: number
 *                 default: 0
 *                 description: Additional fees for this fill
 *     responses:
 *       200:
 *         description: Fill added, trade recalculated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Trade not found
 */
router.post('/:id/fills', flexibleAuth, requireApiScope('trades:write'), validate(schemas.addFill), tradeController.addFill);
router.post('/:id/split', authenticate, tradeController.splitTrade);
router.post('/:id/attachments', authenticate, upload.single('file'), tradeController.uploadAttachment);
router.delete('/:id/attachments/:attachmentId', authenticate, tradeController.deleteAttachment);
// Image-specific routes
router.post('/:id/images', authenticate, imageUpload.array('images', 10), tradeController.uploadTradeImages);
router.get('/:id/images/:filename', optionalAuth, tradeController.getTradeImage);
router.delete('/:id/images/:attachmentId', authenticate, tradeController.deleteTradeImage);
// Chart management routes
router.post('/:id/charts', authenticate, tradeController.addTradeChart);
router.delete('/:id/charts/:chartId', authenticate, tradeController.deleteTradeChart);
router.post('/:id/comments', authenticate, tradeController.addComment);
router.get('/:id/comments', optionalAuth, tradeController.getComments);
router.put('/:id/comments/:commentId', authenticate, tradeController.updateComment);
router.delete('/:id/comments/:commentId', authenticate, tradeController.deleteComment);

// Trade quality grading routes
router.post('/:id/quality', authenticate, tradeController.calculateTradeQuality);
router.post('/quality/batch', authenticate, tradeController.calculateBatchQuality);
router.post('/quality/all', authenticate, tradeController.calculateAllTradesQuality);

// Health data integration routes
router.put('/:id/health', authenticate, tradeController.updateTradeHealthData);
router.put('/health/bulk', authenticate, tradeController.bulkUpdateHealthData);

module.exports = router;
