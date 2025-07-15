const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth');
const { flexibleAuth } = require('../middleware/apiKeyAuth');

router.get('/overview', flexibleAuth, analyticsController.getOverview);
router.get('/maemfe', flexibleAuth, analyticsController.getMAEMFE);
router.get('/performance', flexibleAuth, analyticsController.getPerformance);
router.get('/symbols', flexibleAuth, analyticsController.getSymbolStats);
router.get('/tags', flexibleAuth, analyticsController.getTagStats);
router.get('/calendar', flexibleAuth, analyticsController.getCalendarData);
router.get('/export', flexibleAuth, analyticsController.exportData);
router.get('/charts', flexibleAuth, analyticsController.getChartData);
router.get('/drawdown', flexibleAuth, analyticsController.getDrawdownAnalysis);
router.get('/recommendations', flexibleAuth, analyticsController.getRecommendations);
router.get('/sectors', flexibleAuth, analyticsController.getSectorPerformance);
router.get('/sectors/available', flexibleAuth, analyticsController.getAvailableSectors);
router.get('/sectors/refresh', flexibleAuth, analyticsController.refreshSectorPerformance);
router.post('/categorize-symbols', flexibleAuth, analyticsController.categorizeSymbols);
router.get('/symbol-stats', flexibleAuth, analyticsController.getSymbolCategoryStats);

module.exports = router;