// DEPRECATED: V2 routes are redundant with legacy /api/* routes and will be removed in a future version.
// New integrations should use /api/trades/* and /api/analytics/* directly.

const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/trade.controller');
const analyticsController = require('../controllers/analytics.controller');
const { flexibleAuth, requireApiScope } = require('../middleware/apiKeyAuth');
const { validate, schemas } = require('../middleware/validation');

/**
 * @swagger
 * /api/v2/trades:
 *   get:
 *     summary: List trades (V2)
 *     description: Returns paginated trades for the authenticated user. Deprecated - use GET /api/trades instead.
 *     tags: [V2 Trades (Deprecated)]
 *     deprecated: true
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
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
 *     responses:
 *       200:
 *         description: Paginated list of trades
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient scope
 *   post:
 *     summary: Create a trade (V2)
 *     description: Creates a new trade. Deprecated - use POST /api/trades instead.
 *     tags: [V2 Trades (Deprecated)]
 *     deprecated: true
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
 *         description: Trade created
 *       400:
 *         description: Validation error
 *       403:
 *         description: Insufficient scope
 */
router.get('/trades', flexibleAuth, requireApiScope('trades:read'), tradeController.getUserTrades);
router.post('/trades', flexibleAuth, requireApiScope('trades:write'), validate(schemas.createTrade), tradeController.createTrade);

/**
 * @swagger
 * /api/v2/trades/{id}:
 *   get:
 *     summary: Get trade by ID (V2)
 *     description: Returns a single trade. Deprecated - use GET /api/trades/{id} instead.
 *     tags: [V2 Trades (Deprecated)]
 *     deprecated: true
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
 *       400:
 *         description: Trade not found
 *       403:
 *         description: Insufficient scope
 *   put:
 *     summary: Update trade (V2)
 *     description: Updates an existing trade. Deprecated - use PUT /api/trades/{id} instead.
 *     tags: [V2 Trades (Deprecated)]
 *     deprecated: true
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
 *       403:
 *         description: Insufficient scope
 *   delete:
 *     summary: Delete trade (V2)
 *     description: Deletes a trade. Deprecated - use DELETE /api/trades/{id} instead.
 *     tags: [V2 Trades (Deprecated)]
 *     deprecated: true
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
router.get('/trades/:id', flexibleAuth, requireApiScope('trades:read'), tradeController.getTrade);
router.put('/trades/:id', flexibleAuth, requireApiScope('trades:write'), validate(schemas.updateTrade), tradeController.updateTrade);
router.delete('/trades/:id', flexibleAuth, requireApiScope('trades:write'), tradeController.deleteTrade);

/**
 * @swagger
 * /api/v2/analytics/overview:
 *   get:
 *     summary: Analytics overview (V2)
 *     description: >
 *       Returns comprehensive trading analytics including total P&L, win rate, profit factor,
 *       average win/loss, best/worst trades, and streak data. Supports all trade filters.
 *     tags: [V2 Analytics (Deprecated)]
 *     deprecated: true
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
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
 *         name: symbol
 *         schema:
 *           type: string
 *       - in: query
 *         name: accounts
 *         schema:
 *           type: string
 *         description: Comma-separated account identifiers
 *     responses:
 *       200:
 *         description: Analytics overview data
 *       403:
 *         description: Insufficient scope
 */
router.get('/analytics/overview', flexibleAuth, requireApiScope('analytics:read'), analyticsController.getOverview);

/**
 * @swagger
 * /api/v2/analytics/performance:
 *   get:
 *     summary: Performance over time (V2)
 *     description: Returns P&L performance grouped by daily, weekly, or monthly periods.
 *     tags: [V2 Analytics (Deprecated)]
 *     deprecated: true
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
 *     responses:
 *       200:
 *         description: Performance data over time
 *       403:
 *         description: Insufficient scope
 */
router.get('/analytics/performance', flexibleAuth, requireApiScope('analytics:read'), analyticsController.getPerformance);

/**
 * @swagger
 * /api/v2/analytics/calendar:
 *   get:
 *     summary: Calendar heatmap data (V2)
 *     description: Returns daily P&L data for a calendar year heatmap visualization. Requires year parameter.
 *     tags: [V2 Analytics (Deprecated)]
 *     deprecated: true
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year to fetch calendar data for
 *     responses:
 *       200:
 *         description: Daily P&L data for calendar heatmap
 *       400:
 *         description: Year parameter required
 *       403:
 *         description: Insufficient scope
 */
router.get('/analytics/calendar', flexibleAuth, requireApiScope('analytics:read'), analyticsController.getCalendarData);

/**
 * @swagger
 * /api/v2/analytics/symbols:
 *   get:
 *     summary: Symbol statistics (V2)
 *     description: Returns per-symbol trading statistics including P&L, trade count, and win rate.
 *     tags: [V2 Analytics (Deprecated)]
 *     deprecated: true
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Max number of symbols to return
 *     responses:
 *       200:
 *         description: Per-symbol statistics
 *       403:
 *         description: Insufficient scope
 */
router.get('/analytics/symbols', flexibleAuth, requireApiScope('analytics:read'), analyticsController.getSymbolStats);

/**
 * @swagger
 * /api/v2/analytics/charts:
 *   get:
 *     summary: Chart data (V2)
 *     description: Returns formatted data for equity curve, P&L distribution, and other chart visualizations.
 *     tags: [V2 Analytics (Deprecated)]
 *     deprecated: true
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Chart visualization data
 *       403:
 *         description: Insufficient scope
 */
router.get('/analytics/charts', flexibleAuth, requireApiScope('analytics:read'), analyticsController.getChartData);

module.exports = router;
