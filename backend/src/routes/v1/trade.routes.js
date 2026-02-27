const express = require('express');
const router = express.Router();
const tradeController = require('../../controllers/trade.controller');
const tradeV1Controller = require('../../controllers/v1/trade.controller');
const { authenticate } = require('../../middleware/auth');
const { flexibleAuth, requireApiScope } = require('../../middleware/apiKeyAuth');
const { idempotencyMiddleware } = require('../../middleware/idempotency');
const { validate, schemas } = require('../../middleware/validation');

/**
 * @swagger
 * /api/v1/trades:
 *   get:
 *     summary: List trades (V1)
 *     description: >
 *       Returns paginated trades with full filtering support. Supports limit/offset
 *       pagination and all standard trade filters (symbol, side, status, date range, etc.).
 *     tags: [V1 Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Max trades to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of trades to skip
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *       - in: query
 *         name: side
 *         schema:
 *           type: string
 *           enum: [long, short]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, closed]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: accounts
 *         schema:
 *           type: string
 *         description: Comma-separated account identifiers
 *     responses:
 *       200:
 *         description: Paginated trade list with metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Trade'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient scope
 *   post:
 *     summary: Create a trade (V1)
 *     description: >
 *       Creates a new trade. Supports idempotency via the Idempotency-Key header
 *       to safely retry requests without creating duplicates.
 *     tags: [V1 Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema:
 *           type: string
 *         description: Unique key to prevent duplicate creation on retries (1-255 chars)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTrade'
 *     responses:
 *       201:
 *         description: Trade created
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient scope
 */
router.get('/', flexibleAuth, requireApiScope('trades:read'), tradeV1Controller.getTrades);
router.get('/sync', authenticate, tradeV1Controller.getTradesForSync);
router.post(
  '/',
  flexibleAuth,
  requireApiScope('trades:write'),
  validate(schemas.trade),
  idempotencyMiddleware({ routeKey: '/api/v1/trades' }),
  tradeV1Controller.createTrade
);

/**
 * @swagger
 * /api/v1/trades/bulk:
 *   post:
 *     summary: Bulk create trades (V1)
 *     description: >
 *       Creates multiple trades in a single request. Returns per-item results
 *       with partial failure support. Supports idempotency via header.
 *     tags: [V1 Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema:
 *           type: string
 *         description: Unique key to prevent duplicate creation on retries
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [trades]
 *             properties:
 *               trades:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/CreateTrade'
 *     responses:
 *       200:
 *         description: Bulk creation results with per-item status
 *       403:
 *         description: Insufficient scope
 *   put:
 *     summary: Bulk update trades (V1)
 *     description: Updates multiple trades in a single request. Each item must include the trade ID.
 *     tags: [V1 Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [trades]
 *             properties:
 *               trades:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id]
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *     responses:
 *       200:
 *         description: Bulk update results
 *       403:
 *         description: Insufficient scope
 *   delete:
 *     summary: Bulk delete trades (V1)
 *     description: Deletes multiple trades by ID in a single request.
 *     tags: [V1 Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Bulk delete results
 *       403:
 *         description: Insufficient scope
 */
router.post(
  '/bulk',
  flexibleAuth,
  requireApiScope('trades:write'),
  idempotencyMiddleware({ routeKey: '/api/v1/trades/bulk' }),
  tradeV1Controller.bulkCreateTrades
);
router.put('/bulk', flexibleAuth, requireApiScope('trades:write'), tradeV1Controller.bulkUpdateTrades);
router.delete('/bulk', flexibleAuth, requireApiScope('trades:write'), tradeV1Controller.bulkDeleteTrades);

// Import/Export (JWT only - internal app use)
router.post('/import', authenticate, tradeController.importTrades);
router.get('/export', authenticate, tradeController.exportTrades);

/**
 * @swagger
 * /api/v1/trades/summary/quick:
 *   get:
 *     summary: Quick trading summary (V1)
 *     description: >
 *       Returns a compact summary of the user's trading activity including
 *       total trades, open trades, total P&L, win rate, and recent activity.
 *     tags: [V1 Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Quick summary data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalTrades:
 *                   type: integer
 *                 openTrades:
 *                   type: integer
 *                 totalPnl:
 *                   type: number
 *                 winRate:
 *                   type: number
 *       403:
 *         description: Insufficient scope
 */
router.get('/summary/quick', flexibleAuth, requireApiScope('trades:read'), tradeV1Controller.getQuickSummary);

/**
 * @swagger
 * /api/v1/trades/recent:
 *   get:
 *     summary: Recent trades (V1)
 *     description: Returns the most recent trades ordered by entry time descending.
 *     tags: [V1 Trades]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of recent trades to return
 *     responses:
 *       200:
 *         description: List of recent trades
 *       403:
 *         description: Insufficient scope
 */
router.get('/recent', flexibleAuth, requireApiScope('trades:read'), tradeV1Controller.getRecentTrades);

// Trade journal entries (JWT only - internal app use)
router.get('/:id/journal', authenticate, tradeController.getTradeJournalEntries);
router.post('/:id/journal', authenticate, validate(schemas.journalEntry), tradeController.createJournalEntry);
router.put('/:id/journal/:entryId', authenticate, validate(schemas.journalEntry), tradeController.updateJournalEntry);
router.delete('/:id/journal/:entryId', authenticate, tradeController.deleteJournalEntry);

/**
 * @swagger
 * /api/v1/trades/{id}:
 *   get:
 *     summary: Get trade by ID (V1)
 *     description: Returns a single trade with all fields including executions and metadata.
 *     tags: [V1 Trades]
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
 *     responses:
 *       200:
 *         description: Trade details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Trade'
 *       404:
 *         description: Trade not found
 *       403:
 *         description: Insufficient scope
 *   put:
 *     summary: Update trade (V1)
 *     description: Updates an existing trade. Only provided fields are updated.
 *     tags: [V1 Trades]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTrade'
 *     responses:
 *       200:
 *         description: Trade updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Trade not found
 *       403:
 *         description: Insufficient scope
 *   delete:
 *     summary: Delete trade (V1)
 *     description: Permanently deletes a trade and all associated data.
 *     tags: [V1 Trades]
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
 *     responses:
 *       200:
 *         description: Trade deleted
 *       404:
 *         description: Trade not found
 *       403:
 *         description: Insufficient scope
 */
router.get('/:id', flexibleAuth, requireApiScope('trades:read'), tradeV1Controller.getTradeById);
router.put('/:id', flexibleAuth, requireApiScope('trades:write'), validate(schemas.trade), tradeV1Controller.updateTrade);
router.delete('/:id', flexibleAuth, requireApiScope('trades:write'), tradeV1Controller.deleteTrade);

module.exports = router;
