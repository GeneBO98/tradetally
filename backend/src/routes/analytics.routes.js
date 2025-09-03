const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Trading analytics and performance metrics
 */

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Get analytics overview
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics overview data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Analytics'
 */
router.get('/overview', authenticate, analyticsController.getOverview);

/**
 * @swagger
 * /api/analytics/maemfe:
 *   get:
 *     summary: Get MAE/MFE analysis
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MAE/MFE analysis data
 */
router.get('/maemfe', authenticate, analyticsController.getMAEMFE);

/**
 * @swagger
 * /api/analytics/performance:
 *   get:
 *     summary: Get performance metrics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance metrics
 */
router.get('/performance', authenticate, analyticsController.getPerformance);

/**
 * @swagger
 * /api/analytics/symbols:
 *   get:
 *     summary: Get symbol statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Symbol performance statistics
 */
router.get('/symbols', authenticate, analyticsController.getSymbolStats);

/**
 * @swagger
 * /api/analytics/tags:
 *   get:
 *     summary: Get tag statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tag performance statistics
 */
router.get('/tags', authenticate, analyticsController.getTagStats);
router.get('/calendar', authenticate, analyticsController.getCalendarData);
router.get('/export', authenticate, analyticsController.exportData);
router.get('/charts', authenticate, analyticsController.getChartData);
router.get('/drawdown', authenticate, analyticsController.getDrawdownAnalysis);
router.get('/recommendations', authenticate, analyticsController.getRecommendations);
router.get('/sectors', authenticate, analyticsController.getSectorPerformance);
router.get('/sectors/available', authenticate, analyticsController.getAvailableSectors);
router.get('/sectors/refresh', authenticate, analyticsController.refreshSectorPerformance);
router.post('/categorize-symbols', authenticate, analyticsController.categorizeSymbols);
router.get('/symbol-stats', authenticate, analyticsController.getSymbolCategoryStats);

module.exports = router;