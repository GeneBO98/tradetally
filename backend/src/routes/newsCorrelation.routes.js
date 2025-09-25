const express = require('express');
const router = express.Router();
const newsCorrelationController = require('../controllers/newsCorrelation.controller');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: News Correlation
 *   description: News sentiment correlation analytics
 */

/**
 * @swagger
 * /api/news-correlation/analytics:
 *   get:
 *     summary: Get comprehensive news sentiment correlation analytics
 *     tags: [News Correlation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis (YYYY-MM-DD)
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         description: Filter by specific symbol
 *       - in: query
 *         name: sector
 *         schema:
 *           type: string
 *         description: Filter by sector
 *     responses:
 *       200:
 *         description: News sentiment correlation analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overall_performance:
 *                   type: object
 *                   description: Performance metrics by sentiment and side
 *                 timing_analysis:
 *                   type: object
 *                   description: Timing patterns relative to news events
 *                 direction_bias:
 *                   type: object
 *                   description: Long/short bias based on news sentiment
 *                 sentiment_accuracy:
 *                   type: object
 *                   description: How well sentiment predictions align with outcomes
 *                 top_performers:
 *                   type: array
 *                   description: Best performing sentiment/symbol combinations
 *                 insights:
 *                   type: array
 *                   description: Generated insights and recommendations
 *                 metadata:
 *                   type: object
 *                   description: Analysis metadata and filters
 *       403:
 *         description: Feature not available for user tier
 *       500:
 *         description: Server error
 */
router.get('/analytics', authenticate, newsCorrelationController.getCorrelationAnalytics);

/**
 * @swagger
 * /api/news-correlation/summary:
 *   get:
 *     summary: Get news correlation summary for dashboard
 *     tags: [News Correlation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: News correlation summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   description: Whether the feature is enabled
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_trades_with_news:
 *                       type: integer
 *                     overall_win_rate:
 *                       type: number
 *                     avg_pnl:
 *                       type: number
 *                     sentiment_breakdown:
 *                       type: object
 *                     performance_by_sentiment:
 *                       type: object
 *       500:
 *         description: Server error
 */
router.get('/summary', authenticate, newsCorrelationController.getCorrelationSummary);

/**
 * @swagger
 * /api/news-correlation/enabled:
 *   get:
 *     summary: Check if news correlation analytics is enabled
 *     tags: [News Correlation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feature availability status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *       500:
 *         description: Server error
 */
router.get('/enabled', authenticate, newsCorrelationController.checkEnabled);

/**
 * @swagger
 * /api/news-correlation/performer-details:
 *   get:
 *     summary: Get detailed trades and news for a specific performer combination
 *     tags: [News Correlation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: Stock symbol
 *       - in: query
 *         name: sentiment
 *         required: true
 *         schema:
 *           type: string
 *           enum: [positive, negative, neutral]
 *         description: News sentiment
 *       - in: query
 *         name: side
 *         required: true
 *         schema:
 *           type: string
 *           enum: [long, short]
 *         description: Trade side
 *     responses:
 *       200:
 *         description: Detailed trades and news data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   symbol:
 *                     type: string
 *                   trade_date:
 *                     type: string
 *                     format: date
 *                   entry_price:
 *                     type: number
 *                   exit_price:
 *                     type: number
 *                   quantity:
 *                     type: number
 *                   pnl:
 *                     type: number
 *                   news_headlines:
 *                     type: array
 *                     items:
 *                       type: string
 *       400:
 *         description: Missing required parameters
 *       403:
 *         description: Feature not available for user tier
 *       500:
 *         description: Server error
 */
router.get('/performer-details', authenticate, newsCorrelationController.getPerformerDetails);

module.exports = router;