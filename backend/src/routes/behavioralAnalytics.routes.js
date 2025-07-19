const express = require('express');
const router = express.Router();
const behavioralAnalyticsController = require('../controllers/behavioralAnalytics.controller');
const { authenticate } = require('../middleware/auth');
const { attachTierInfo } = require('../middleware/tierAuth');

// Apply authentication and tier info to all routes
router.use(authenticate);
router.use(attachTierInfo);

// Get behavioral analytics overview
router.get('/overview', behavioralAnalyticsController.getOverview);

// Get revenge trading analysis
router.get('/revenge-trading', behavioralAnalyticsController.getRevengeTradeAnalysis);

// Get user behavioral settings
router.get('/settings', behavioralAnalyticsController.getSettings);

// Update user behavioral settings
router.put('/settings', behavioralAnalyticsController.updateSettings);

// Get active alerts for user
router.get('/alerts', behavioralAnalyticsController.getActiveAlerts);

// Acknowledge an alert
router.post('/alerts/:alertId/acknowledge', behavioralAnalyticsController.acknowledgeAlert);

// Analyze a trade for behavioral patterns (internal use)
router.post('/analyze-trade', behavioralAnalyticsController.analyzeTrade);

// Check if user should be blocked from trading
router.get('/trade-block-status', behavioralAnalyticsController.getTradeBlockStatus);

// Get behavioral insights and recommendations
router.get('/insights', behavioralAnalyticsController.getInsights);

// Analyze historical trades for behavioral patterns
router.post('/analyze-historical', behavioralAnalyticsController.analyzeHistoricalTrades);

// Re-run historical analysis with new thresholds
router.post('/re-run-historical', behavioralAnalyticsController.reRunHistoricalAnalysis);

// Get tick data analysis for a revenge trade
router.get('/revenge-trades/:revengeTradeId/tick-data', behavioralAnalyticsController.getRevengeTradeTickData);

// Generate tick data analysis for a revenge trade
router.post('/revenge-trades/:revengeTradeId/analyze-tick-data', behavioralAnalyticsController.generateTickDataAnalysis);

// Get tick data for a specific symbol and time
router.get('/tick-data/:symbol/:datetime', behavioralAnalyticsController.getTickData);

// Overconfidence analytics routes
router.get('/overconfidence', behavioralAnalyticsController.getOverconfidenceAnalysis);
router.post('/overconfidence/analyze-historical', behavioralAnalyticsController.analyzeOverconfidenceHistoricalTrades);
router.get('/overconfidence/settings', behavioralAnalyticsController.getOverconfidenceSettings);
router.put('/overconfidence/settings', behavioralAnalyticsController.updateOverconfidenceSettings);
router.post('/overconfidence/detect-realtime', behavioralAnalyticsController.detectOverconfidenceInRealTime);

// Loss aversion analytics routes
router.get('/loss-aversion', behavioralAnalyticsController.getLossAversionAnalysis);
router.get('/loss-aversion/trends', behavioralAnalyticsController.getLossAversionTrends);
router.get('/loss-aversion/latest', behavioralAnalyticsController.getLatestLossAversionMetrics);

// Trading personality profiling routes
router.get('/personality', behavioralAnalyticsController.getPersonalityAnalysis);
router.get('/personality/latest', behavioralAnalyticsController.getLatestPersonalityProfile);
router.get('/personality/drift', behavioralAnalyticsController.getPersonalityDrift);

module.exports = router;