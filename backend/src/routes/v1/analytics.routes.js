const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/analytics.controller');
const { flexibleAuth, requireApiScope } = require('../../middleware/apiKeyAuth');

/**
 * @swagger
 * /api/v1/analytics/drawdown:
 *   get:
 *     summary: Drawdown analysis (V1)
 *     description: >
 *       Returns daily P&L, cumulative P&L, running max, and drawdown values
 *       ordered by trade date. Useful for charting equity drawdown curves.
 *     tags: [V1 Analytics]
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
 *         name: accounts
 *         schema:
 *           type: string
 *         description: Comma-separated account identifiers
 *     responses:
 *       200:
 *         description: Drawdown analysis data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 drawdown:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       trade_date:
 *                         type: string
 *                         format: date
 *                       daily_pnl:
 *                         type: number
 *                       cumulative_pnl:
 *                         type: number
 *                       running_max_pnl:
 *                         type: number
 *                       drawdown:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient scope
 */
router.get('/drawdown', flexibleAuth, requireApiScope('analytics:read'), analyticsController.getDrawdownAnalysis);

module.exports = router;
