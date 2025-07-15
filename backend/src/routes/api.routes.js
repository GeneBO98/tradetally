const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/trade.controller');
const analyticsController = require('../controllers/analytics.controller');
const { flexibleAuth } = require('../middleware/apiKeyAuth');
const { validate, schemas } = require('../middleware/validation');

// API-specific routes that support both JWT and API key authentication
// These are separate from the main routes to avoid conflicts

// Trade endpoints
router.get('/trades', flexibleAuth, tradeController.getUserTrades);
router.get('/trades/:id', flexibleAuth, tradeController.getTrade);
router.post('/trades', flexibleAuth, validate(schemas.createTrade), tradeController.createTrade);
router.put('/trades/:id', flexibleAuth, validate(schemas.updateTrade), tradeController.updateTrade);
router.delete('/trades/:id', flexibleAuth, tradeController.deleteTrade);

// Analytics endpoints
router.get('/analytics/overview', flexibleAuth, analyticsController.getOverview);
router.get('/analytics/performance', flexibleAuth, analyticsController.getPerformance);
router.get('/analytics/calendar', flexibleAuth, analyticsController.getCalendarData);
router.get('/analytics/symbols', flexibleAuth, analyticsController.getSymbolStats);
router.get('/analytics/charts', flexibleAuth, analyticsController.getChartData);

module.exports = router;