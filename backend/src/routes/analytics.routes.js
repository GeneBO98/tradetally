const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth');

router.get('/overview', authenticate, analyticsController.getOverview);
router.get('/maemfe', authenticate, analyticsController.getMAEMFE);
router.get('/performance', authenticate, analyticsController.getPerformance);
router.get('/symbols', authenticate, analyticsController.getSymbolStats);
router.get('/tags', authenticate, analyticsController.getTagStats);
router.get('/calendar', authenticate, analyticsController.getCalendarData);
router.get('/export', authenticate, analyticsController.exportData);
router.get('/charts', authenticate, analyticsController.getChartData);
router.get('/drawdown', authenticate, analyticsController.getDrawdownAnalysis);
router.get('/recommendations', authenticate, analyticsController.getRecommendations);
router.get('/sectors', authenticate, analyticsController.getSectorPerformance);

module.exports = router;