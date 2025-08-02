const express = require('express');
const router = express.Router();
const newsEnrichmentController = require('../controllers/newsEnrichment.controller');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: News Enrichment
 *   description: News enrichment and backfill operations
 */

/**
 * @swagger
 * /api/news-enrichment/stats:
 *   get:
 *     summary: Get news enrichment statistics
 *     tags: [News Enrichment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: News enrichment statistics
 *       500:
 *         description: Server error
 */
router.get('/stats', authenticate, newsEnrichmentController.getStats);

/**
 * @swagger
 * /api/news-enrichment/backfill:
 *   post:
 *     summary: Start news backfill for existing trades
 *     tags: [News Enrichment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID to backfill (admin only, defaults to current user)
 *               batchSize:
 *                 type: integer
 *                 default: 50
 *                 description: Number of symbol/date combinations to process per batch
 *               maxTrades:
 *                 type: integer
 *                 description: Maximum number of trades to process (for testing)
 *     responses:
 *       200:
 *         description: Backfill job started
 *       500:
 *         description: Server error
 */
router.post('/backfill', authenticate, newsEnrichmentController.startBackfill);

/**
 * @swagger
 * /api/news-enrichment/news/{symbol}/{date}:
 *   get:
 *     summary: Get cached news for a symbol and date
 *     tags: [News Enrichment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: Stock symbol
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: News data for the symbol and date
 *       500:
 *         description: Server error
 */
router.get('/news/:symbol/:date', authenticate, newsEnrichmentController.getCachedNews);

module.exports = router;