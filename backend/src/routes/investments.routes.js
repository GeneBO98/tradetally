/**
 * Investment Planning Routes
 * 8 Pillars analysis, portfolio holdings, and investment screener
 * All routes require Pro tier
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requiresTier } = require('../middleware/tierAuth');
const investmentsController = require('../controllers/investments.controller');

// All investment routes require authentication and Pro tier
router.use(authenticate);
router.use(requiresTier('pro'));

// ========================================
// 8 PILLARS ANALYSIS
// ========================================

/**
 * @route GET /api/investments/analyze/:symbol
 * @desc Analyze a stock using 8 Pillars methodology
 * @access Pro
 */
router.get('/analyze/:symbol', investmentsController.analyzeStock);

/**
 * @route POST /api/investments/analyze/:symbol/refresh
 * @desc Force refresh analysis for a stock
 * @access Pro
 */
router.post('/analyze/:symbol/refresh', investmentsController.refreshAnalysis);

// ========================================
// FUNDAMENTAL DATA
// ========================================

/**
 * @route GET /api/investments/financials/:symbol
 * @desc Get financial statements for a stock
 * @access Pro
 */
router.get('/financials/:symbol', investmentsController.getFinancials);

/**
 * @route GET /api/investments/statements/:symbol/:type
 * @desc Get a specific financial statement (balance-sheet, income-statement, cash-flow)
 * @query frequency - 'annual' or 'quarterly' (default: annual)
 * @query years - Number of years of data (default: 5)
 * @access Pro
 */
router.get('/statements/:symbol/:type', investmentsController.getStatement);

/**
 * @route GET /api/investments/filings/:symbol
 * @desc Get SEC filings (10-K, 10-Q) for a stock with links to SEC EDGAR
 * @query limit - Maximum number of filings to return (default: 20)
 * @access Pro
 */
router.get('/filings/:symbol', investmentsController.getFilings);

/**
 * @route GET /api/investments/metrics/:symbol
 * @desc Get key metrics for a stock
 * @access Pro
 */
router.get('/metrics/:symbol', investmentsController.getMetrics);

/**
 * @route GET /api/investments/profile/:symbol
 * @desc Get company profile
 * @access Pro
 */
router.get('/profile/:symbol', investmentsController.getProfile);

// ========================================
// HOLDINGS
// ========================================

/**
 * @route GET /api/investments/holdings
 * @desc Get all holdings for user
 * @access Pro
 */
router.get('/holdings', investmentsController.getHoldings);

/**
 * @route POST /api/investments/holdings
 * @desc Create a new holding
 * @access Pro
 */
router.post('/holdings', investmentsController.createHolding);

/**
 * @route GET /api/investments/holdings/:id
 * @desc Get a single holding
 * @access Pro
 */
router.get('/holdings/:id', investmentsController.getHolding);

/**
 * @route PUT /api/investments/holdings/:id
 * @desc Update a holding
 * @access Pro
 */
router.put('/holdings/:id', investmentsController.updateHolding);

/**
 * @route DELETE /api/investments/holdings/:id
 * @desc Delete a holding
 * @access Pro
 */
router.delete('/holdings/:id', investmentsController.deleteHolding);

// ========================================
// LOTS
// ========================================

/**
 * @route GET /api/investments/holdings/:id/lots
 * @desc Get lots for a holding
 * @access Pro
 */
router.get('/holdings/:id/lots', investmentsController.getLots);

/**
 * @route POST /api/investments/holdings/:id/lots
 * @desc Add a lot to a holding
 * @access Pro
 */
router.post('/holdings/:id/lots', investmentsController.addLot);

/**
 * @route DELETE /api/investments/lots/:lotId
 * @desc Delete a lot
 * @access Pro
 */
router.delete('/lots/:lotId', investmentsController.deleteLot);

// ========================================
// DIVIDENDS
// ========================================

/**
 * @route GET /api/investments/holdings/:id/dividends
 * @desc Get dividend history for a holding
 * @access Pro
 */
router.get('/holdings/:id/dividends', investmentsController.getDividends);

/**
 * @route POST /api/investments/holdings/:id/dividends
 * @desc Record a dividend
 * @access Pro
 */
router.post('/holdings/:id/dividends', investmentsController.recordDividend);

// ========================================
// PORTFOLIO
// ========================================

/**
 * @route GET /api/investments/portfolio/summary
 * @desc Get portfolio summary
 * @access Pro
 */
router.get('/portfolio/summary', investmentsController.getPortfolioSummary);

/**
 * @route POST /api/investments/portfolio/refresh
 * @desc Refresh all holding prices
 * @access Pro
 */
router.post('/portfolio/refresh', investmentsController.refreshPrices);

// ========================================
// SCREENER
// ========================================

/**
 * @route GET /api/investments/screener/history
 * @desc Get search history
 * @access Pro
 */
router.get('/screener/history', investmentsController.getSearchHistory);

/**
 * @route POST /api/investments/screener/favorite
 * @desc Toggle favorite status
 * @access Pro
 */
router.post('/screener/favorite', investmentsController.toggleFavorite);

/**
 * @route POST /api/investments/compare
 * @desc Compare multiple stocks (2-3)
 * @access Pro
 */
router.post('/compare', investmentsController.compareStocks);

// ========================================
// CHART DATA
// ========================================

/**
 * @route GET /api/investments/chart/:symbol
 * @desc Get stock chart data with period selection
 * @query period - 1D, 1W, 1M, 3M, 6M, 1Y, 5Y (default: 1Y)
 * @access Pro
 */
router.get('/chart/:symbol', investmentsController.getChartData);

module.exports = router;
