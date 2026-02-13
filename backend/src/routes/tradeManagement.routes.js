/**
 * Trade Management Routes
 * R-Multiple analysis for individual trades
 * All routes require Pro tier
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');
const tradeManagementController = require('../controllers/tradeManagement.controller');

// All trade management routes require authentication and Pro tier
router.use(authenticate);
router.use(requiresTier('pro'));

/**
 * @route GET /api/trade-management/trades
 * @desc Get trades for selection with filters
 * @query startDate - Start date for filtering
 * @query endDate - End date for filtering
 * @query symbol - Symbol to filter by
 * @access Pro
 */
router.get('/trades', tradeManagementController.getTradesForSelection);

/**
 * @route GET /api/trade-management/analysis/:tradeId
 * @desc Get R-Multiple analysis for a specific trade
 * @access Pro
 */
router.get('/analysis/:tradeId', tradeManagementController.getRMultipleAnalysis);

/**
 * @route GET /api/trade-management/analysis/:tradeId/target-hit-first
 * @desc Analyze which target (stop loss or take profit) was hit first
 * @desc Uses OHLCV data to determine the order of target crossings
 * @access Pro
 */
router.get('/analysis/:tradeId/target-hit-first', tradeManagementController.analyzeTargetHitFirst);

/**
 * @route PATCH /api/trade-management/trades/:tradeId/levels
 * @desc Update stop_loss and take_profit for a trade
 * @body stop_loss - Stop loss price
 * @body take_profit - Take profit price
 * @body manual_target_hit_first - Manual target hit override (optional)
 * @access Pro
 */
router.patch('/trades/:tradeId/levels', tradeManagementController.updateTradeLevels);

/**
 * @route PATCH /api/trade-management/trades/:tradeId/manual-target-hit
 * @desc Set manual target hit first value for a trade
 * @desc Allows users without Alpha Vantage API to manually specify which target was hit first
 * @body manual_target_hit_first - Value: 'take_profit', 'stop_loss', 'neither', or null
 * @access Pro
 */
router.patch('/trades/:tradeId/manual-target-hit', tradeManagementController.setManualTargetHitFirst);

/**
 * @route GET /api/trade-management/r-performance
 * @desc Get cumulative R-Multiple performance data for charting
 * @query startDate - Start date for filtering
 * @query endDate - End date for filtering
 * @query symbol - Symbol to filter by
 * @query limit - Max trades to include (default 100)
 * @access Pro
 */
router.get('/r-performance', tradeManagementController.getRPerformance);

module.exports = router;
