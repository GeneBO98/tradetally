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
 * @route PATCH /api/trade-management/trades/:tradeId/levels
 * @desc Update stop_loss and take_profit for a trade
 * @body stop_loss - Stop loss price
 * @body take_profit - Take profit price
 * @access Pro
 */
router.patch('/trades/:tradeId/levels', tradeManagementController.updateTradeLevels);

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
