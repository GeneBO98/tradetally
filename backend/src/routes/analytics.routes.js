const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');

// Pro-only analytics (billing-disabled/self-hosted installs pass through).
const requirePro = requiresTier('pro');

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
router.get('/maemfe', authenticate, requirePro, analyticsController.getMAEMFE);
router.get('/maemfe/trades', authenticate, requirePro, analyticsController.getMAEMFETrades);

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
router.get('/symbols', authenticate, requirePro, analyticsController.getSymbolStats);

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

/**
 * @swagger
 * /api/analytics/strategies:
 *   get:
 *     summary: Get strategy/setup statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Strategy performance statistics
 */
router.get('/strategies', authenticate, requirePro, analyticsController.getStrategyStats);

/**
 * @swagger
 * /api/analytics/hours:
 *   get:
 *     summary: Get hour of day statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hour of day performance statistics
 */
router.get('/hours', authenticate, requirePro, analyticsController.getHourOfDayStats);

router.get('/calendar', authenticate, analyticsController.getCalendarData);
router.get('/calendar/day', authenticate, analyticsController.getCalendarDayDetail);
router.get('/export', authenticate, analyticsController.exportData);
router.get('/charts', authenticate, analyticsController.getChartData);
router.get('/drawdown', authenticate, analyticsController.getDrawdownAnalysis);
router.get('/recommendations', authenticate, analyticsController.getRecommendations);
router.get('/sectors', authenticate, requirePro, analyticsController.getSectorPerformance);
router.get('/sectors/available', authenticate, requirePro, analyticsController.getAvailableSectors);
router.get('/brokers/available', authenticate, analyticsController.getAvailableBrokers);
router.get('/sectors/refresh', authenticate, requirePro, analyticsController.refreshSectorPerformance);
router.post('/categorize-symbols', authenticate, requirePro, analyticsController.categorizeSymbols);
router.get('/symbol-stats', authenticate, requirePro, analyticsController.getSymbolCategoryStats);

module.exports = router;