const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const adminAnalyticsController = require('../controllers/adminAnalytics.controller');

// All routes require admin authentication
router.use(requireAdmin);

// Get all analytics data
// GET /api/admin/analytics?period=30d
router.get('/', adminAnalyticsController.getAnalytics);

// Get summary statistics only
// GET /api/admin/analytics/summary?period=30d
router.get('/summary', adminAnalyticsController.getSummary);

// Trend endpoints
// GET /api/admin/analytics/trends/signups?period=30d
router.get('/trends/signups', adminAnalyticsController.getSignupTrend);

// GET /api/admin/analytics/trends/logins?period=30d
router.get('/trends/logins', adminAnalyticsController.getLoginTrend);

// GET /api/admin/analytics/trends/imports?period=30d
router.get('/trends/imports', adminAnalyticsController.getImportTrend);

// GET /api/admin/analytics/trends/api-usage?period=30d
router.get('/trends/api-usage', adminAnalyticsController.getApiUsageTrend);

module.exports = router;
