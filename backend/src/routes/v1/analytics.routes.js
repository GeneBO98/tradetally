const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/analytics.controller');
const analyticsV1Controller = require('../../controllers/v1/analytics.controller');
const { authenticate } = require('../../middleware/auth');

// Enhanced analytics for mobile
router.get('/dashboard', authenticate, analyticsV1Controller.getDashboardData);
router.get('/performance', authenticate, analyticsV1Controller.getPerformanceMetrics);
router.get('/profit-loss', authenticate, analyticsController.getProfitLoss);
router.get('/win-rate', authenticate, analyticsController.getWinRate);
router.get('/monthly-summary', authenticate, analyticsController.getMonthlySummary);

// Mobile-optimized analytics
router.get('/mobile/summary', authenticate, analyticsV1Controller.getMobileSummary);
router.get('/mobile/charts', authenticate, analyticsV1Controller.getMobileCharts);
router.get('/mobile/streaks', authenticate, analyticsV1Controller.getStreaks);

// Time-based analytics
router.get('/daily', authenticate, analyticsController.getDailyAnalytics);
router.get('/weekly', authenticate, analyticsController.getWeeklyAnalytics);
router.get('/monthly', authenticate, analyticsController.getMonthlyAnalytics);
router.get('/yearly', authenticate, analyticsController.getYearlyAnalytics);

// Advanced analytics
router.get('/drawdown', authenticate, analyticsController.getDrawdownAnalysis);
router.get('/risk-metrics', authenticate, analyticsController.getRiskMetrics);
router.get('/trade-distribution', authenticate, analyticsController.getTradeDistribution);

module.exports = router;