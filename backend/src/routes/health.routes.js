const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');


/**
 * @swagger
 * components:
 *   schemas:
 *     HealthDataPoint:
 *       type: object
 *       required:
 *         - date
 *         - type
 *         - value
 *       properties:
 *         date:
 *           type: string
 *           format: date
 *           description: Date of the health data
 *         type:
 *           type: string
 *           enum: [sleep, heart_rate]
 *           description: Type of health data
 *         value:
 *           type: number
 *           description: Numeric value (hours for sleep, BPM for heart rate)
 *         metadata:
 *           type: object
 *           description: Additional metadata (sleep quality, HRV, etc.)
 *     
 *     HealthCorrelation:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           format: date
 *         sleep_hours:
 *           type: number
 *         sleep_quality:
 *           type: number
 *         avg_heart_rate:
 *           type: number
 *         heart_rate_variability:
 *           type: number
 *         total_pnl:
 *           type: number
 *         win_rate:
 *           type: number
 *         total_trades:
 *           type: integer
 *     
 *     HealthInsight:
 *       type: object
 *       properties:
 *         insight_type:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         confidence:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         is_actionable:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/health/data:
 *   post:
 *     summary: Submit health data from mobile app
 *     description: Uploads health data (sleep and heart rate) from HealthKit integration
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               healthData:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/HealthDataPoint'
 *     responses:
 *       200:
 *         description: Health data submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     inserted:
 *                       type: integer
 *                     updated:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Requires Pro subscription
 */
router.post('/data', authenticate, requiresTier('pro'), healthController.submitHealthData);

/**
 * @swagger
 * /api/health/data:
 *   get:
 *     summary: Get user's health data
 *     description: Retrieves stored health data for the authenticated user
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for data range
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for data range
 *       - in: query
 *         name: dataType
 *         schema:
 *           type: string
 *           enum: [sleep, heart_rate]
 *         description: Filter by data type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of records to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip
 *     responses:
 *       200:
 *         description: Health data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HealthDataPoint'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Requires Pro subscription
 */
router.get('/data', authenticate, requiresTier('pro'), healthController.getHealthData);

/**
 * @swagger
 * /api/health/analyze:
 *   post:
 *     summary: Perform health-trading correlation analysis
 *     description: Analyzes correlations between health metrics and trading performance
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Analysis start date (defaults to 30 days ago)
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: Analysis end date (defaults to today)
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     correlations:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/HealthCorrelation'
 *                     insights:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/HealthInsight'
 *                     summary:
 *                       type: object
 *                       properties:
 *                         dateRange:
 *                           type: object
 *                         healthDataPoints:
 *                           type: integer
 *                         tradingDays:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Requires Pro subscription
 */
router.post('/analyze', authenticate, requiresTier('pro'), healthController.analyzeCorrelations);

/**
 * @swagger
 * /api/health/insights:
 *   get:
 *     summary: Get health insights for user
 *     description: Retrieves AI-generated insights about health-trading correlations
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of insights to return
 *     responses:
 *       200:
 *         description: Insights retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 insights:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HealthInsight'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Requires Pro subscription
 */
router.get('/insights', authenticate, requiresTier('pro'), healthController.getInsights);

module.exports = router;