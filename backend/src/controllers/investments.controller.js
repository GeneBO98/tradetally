/**
 * Investments Controller
 * Handles 8 Pillars analysis, holdings management, and investment screener
 */

const EightPillarsService = require('../services/eightPillarsService');
const FundamentalDataService = require('../services/fundamentalDataService');
const HoldingsService = require('../services/holdingsService');
const db = require('../config/database');

// ========================================
// 8 PILLARS ANALYSIS
// ========================================

/**
 * Analyze a stock using 8 Pillars methodology
 * GET /api/investments/analyze/:symbol
 */
const analyzeStock = async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    console.log(`[INVESTMENTS] Analyzing ${symbol} for user ${req.user.id}`);

    const analysis = await EightPillarsService.analyzeStock(symbol);

    // Record search history
    await recordSearch(req.user.id, symbol, analysis.companyName);

    res.json(analysis);
  } catch (error) {
    console.error('[INVESTMENTS] Analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze stock' });
  }
};

/**
 * Force refresh analysis for a stock
 * POST /api/investments/analyze/:symbol/refresh
 */
const refreshAnalysis = async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    console.log(`[INVESTMENTS] Force refreshing analysis for ${symbol}`);

    const analysis = await EightPillarsService.analyzeStock(symbol, true);

    res.json(analysis);
  } catch (error) {
    console.error('[INVESTMENTS] Refresh error:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh analysis' });
  }
};

// ========================================
// FUNDAMENTAL DATA
// ========================================

/**
 * Get financial statements for a stock
 * GET /api/investments/financials/:symbol
 */
const getFinancials = async (req, res) => {
  try {
    const { symbol } = req.params;
    const years = parseInt(req.query.years) || 5;

    const financials = await FundamentalDataService.getFinancials(symbol, years);

    res.json({
      symbol: symbol.toUpperCase(),
      periods: financials.length,
      data: financials
    });
  } catch (error) {
    console.error('[INVESTMENTS] Financials error:', error);
    res.status(500).json({ error: error.message || 'Failed to get financials' });
  }
};

/**
 * Get key metrics for a stock
 * GET /api/investments/metrics/:symbol
 */
const getMetrics = async (req, res) => {
  try {
    const { symbol } = req.params;

    const metrics = await FundamentalDataService.getMetrics(symbol);

    res.json({
      symbol: symbol.toUpperCase(),
      metrics: metrics?.metric || null,
      series: metrics?.series || null
    });
  } catch (error) {
    console.error('[INVESTMENTS] Metrics error:', error);
    res.status(500).json({ error: error.message || 'Failed to get metrics' });
  }
};

/**
 * Get company profile
 * GET /api/investments/profile/:symbol
 */
const getProfile = async (req, res) => {
  try {
    const { symbol } = req.params;

    const profile = await FundamentalDataService.getProfile(symbol);

    res.json({
      symbol: symbol.toUpperCase(),
      profile
    });
  } catch (error) {
    console.error('[INVESTMENTS] Profile error:', error);
    res.status(500).json({ error: error.message || 'Failed to get profile' });
  }
};

// ========================================
// HOLDINGS
// ========================================

/**
 * Get all holdings for user
 * GET /api/investments/holdings
 */
const getHoldings = async (req, res) => {
  try {
    const holdings = await HoldingsService.getHoldings(req.user.id);

    res.json(holdings);
  } catch (error) {
    console.error('[INVESTMENTS] Get holdings error:', error);
    res.status(500).json({ error: error.message || 'Failed to get holdings' });
  }
};

/**
 * Get a single holding
 * GET /api/investments/holdings/:id
 */
const getHolding = async (req, res) => {
  try {
    const holding = await HoldingsService.getHolding(req.user.id, req.params.id);

    if (!holding) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    res.json(holding);
  } catch (error) {
    console.error('[INVESTMENTS] Get holding error:', error);
    res.status(500).json({ error: error.message || 'Failed to get holding' });
  }
};

/**
 * Create a new holding
 * POST /api/investments/holdings
 */
const createHolding = async (req, res) => {
  try {
    const { symbol, shares, costPerShare, purchaseDate, notes, broker, accountIdentifier } = req.body;

    if (!symbol || !shares || !costPerShare) {
      return res.status(400).json({ error: 'Symbol, shares, and cost per share are required' });
    }

    const holding = await HoldingsService.createHolding(req.user.id, {
      symbol,
      shares: parseFloat(shares),
      costPerShare: parseFloat(costPerShare),
      purchaseDate,
      notes,
      broker,
      accountIdentifier
    });

    res.status(201).json(holding);
  } catch (error) {
    console.error('[INVESTMENTS] Create holding error:', error);
    res.status(500).json({ error: error.message || 'Failed to create holding' });
  }
};

/**
 * Update a holding
 * PUT /api/investments/holdings/:id
 */
const updateHolding = async (req, res) => {
  try {
    const { notes, targetAllocationPercent, sector } = req.body;

    const holding = await HoldingsService.updateHolding(req.user.id, req.params.id, {
      notes,
      targetAllocationPercent: targetAllocationPercent ? parseFloat(targetAllocationPercent) : null,
      sector
    });

    res.json(holding);
  } catch (error) {
    console.error('[INVESTMENTS] Update holding error:', error);
    res.status(500).json({ error: error.message || 'Failed to update holding' });
  }
};

/**
 * Delete a holding
 * DELETE /api/investments/holdings/:id
 */
const deleteHolding = async (req, res) => {
  try {
    const deleted = await HoldingsService.deleteHolding(req.user.id, req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    res.json({ success: true, message: 'Holding deleted' });
  } catch (error) {
    console.error('[INVESTMENTS] Delete holding error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete holding' });
  }
};

// ========================================
// LOTS
// ========================================

/**
 * Get lots for a holding
 * GET /api/investments/holdings/:id/lots
 */
const getLots = async (req, res) => {
  try {
    const lots = await HoldingsService.getLots(req.user.id, req.params.id);

    res.json(lots);
  } catch (error) {
    console.error('[INVESTMENTS] Get lots error:', error);
    res.status(500).json({ error: error.message || 'Failed to get lots' });
  }
};

/**
 * Add a lot to a holding
 * POST /api/investments/holdings/:id/lots
 */
const addLot = async (req, res) => {
  try {
    const { shares, costPerShare, purchaseDate, broker, accountIdentifier, notes } = req.body;

    if (!shares || !costPerShare) {
      return res.status(400).json({ error: 'Shares and cost per share are required' });
    }

    const lot = await HoldingsService.addLot(req.user.id, req.params.id, {
      shares: parseFloat(shares),
      costPerShare: parseFloat(costPerShare),
      purchaseDate,
      broker,
      accountIdentifier,
      notes
    });

    res.status(201).json(lot);
  } catch (error) {
    console.error('[INVESTMENTS] Add lot error:', error);
    res.status(500).json({ error: error.message || 'Failed to add lot' });
  }
};

/**
 * Delete a lot
 * DELETE /api/investments/lots/:lotId
 */
const deleteLot = async (req, res) => {
  try {
    const deleted = await HoldingsService.deleteLot(req.user.id, req.params.lotId);

    if (!deleted) {
      return res.status(404).json({ error: 'Lot not found' });
    }

    res.json({ success: true, message: 'Lot deleted' });
  } catch (error) {
    console.error('[INVESTMENTS] Delete lot error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete lot' });
  }
};

// ========================================
// DIVIDENDS
// ========================================

/**
 * Get dividend history for a holding
 * GET /api/investments/holdings/:id/dividends
 */
const getDividends = async (req, res) => {
  try {
    const dividends = await HoldingsService.getDividendHistory(req.user.id, req.params.id);

    res.json(dividends);
  } catch (error) {
    console.error('[INVESTMENTS] Get dividends error:', error);
    res.status(500).json({ error: error.message || 'Failed to get dividends' });
  }
};

/**
 * Record a dividend
 * POST /api/investments/holdings/:id/dividends
 */
const recordDividend = async (req, res) => {
  try {
    const {
      dividendPerShare,
      sharesHeld,
      paymentDate,
      exDividendDate,
      isDrip,
      dripShares,
      dripPrice,
      notes
    } = req.body;

    if (!dividendPerShare || !sharesHeld || !paymentDate) {
      return res.status(400).json({
        error: 'Dividend per share, shares held, and payment date are required'
      });
    }

    const dividend = await HoldingsService.recordDividend(req.user.id, req.params.id, {
      dividendPerShare: parseFloat(dividendPerShare),
      sharesHeld: parseFloat(sharesHeld),
      paymentDate,
      exDividendDate,
      isDrip,
      dripShares: dripShares ? parseFloat(dripShares) : null,
      dripPrice: dripPrice ? parseFloat(dripPrice) : null,
      notes
    });

    res.status(201).json(dividend);
  } catch (error) {
    console.error('[INVESTMENTS] Record dividend error:', error);
    res.status(500).json({ error: error.message || 'Failed to record dividend' });
  }
};

// ========================================
// PORTFOLIO
// ========================================

/**
 * Get portfolio summary
 * GET /api/investments/portfolio/summary
 */
const getPortfolioSummary = async (req, res) => {
  try {
    const summary = await HoldingsService.getPortfolioSummary(req.user.id);

    res.json(summary);
  } catch (error) {
    console.error('[INVESTMENTS] Portfolio summary error:', error);
    res.status(500).json({ error: error.message || 'Failed to get portfolio summary' });
  }
};

/**
 * Refresh all holding prices
 * POST /api/investments/portfolio/refresh
 */
const refreshPrices = async (req, res) => {
  try {
    const updated = await HoldingsService.refreshPrices(req.user.id);

    res.json({
      success: true,
      message: `Refreshed ${updated} holdings`,
      updated
    });
  } catch (error) {
    console.error('[INVESTMENTS] Refresh prices error:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh prices' });
  }
};

// ========================================
// SCREENER
// ========================================

/**
 * Get search history
 * GET /api/investments/screener/history
 */
const getSearchHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const favoritesOnly = req.query.favorites === 'true';

    let query = `
      SELECT DISTINCT ON (symbol) *
      FROM screener_searches
      WHERE user_id = $1
    `;

    if (favoritesOnly) {
      query += ` AND is_favorite = true`;
    }

    query += `
      ORDER BY symbol, searched_at DESC
      LIMIT $2
    `;

    const result = await db.query(query, [req.user.id, limit]);

    res.json(result.rows.map(row => ({
      id: row.id,
      symbol: row.symbol,
      companyName: row.company_name,
      searchedAt: row.searched_at,
      isFavorite: row.is_favorite
    })));
  } catch (error) {
    console.error('[INVESTMENTS] Search history error:', error);
    res.status(500).json({ error: error.message || 'Failed to get search history' });
  }
};

/**
 * Toggle favorite status
 * POST /api/investments/screener/favorite
 */
const toggleFavorite = async (req, res) => {
  try {
    const { symbol } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Find most recent search for this symbol
    const findQuery = `
      SELECT id, is_favorite
      FROM screener_searches
      WHERE user_id = $1 AND symbol = $2
      ORDER BY searched_at DESC
      LIMIT 1
    `;

    const findResult = await db.query(findQuery, [req.user.id, symbol.toUpperCase()]);

    if (findResult.rows.length === 0) {
      return res.status(404).json({ error: 'Symbol not found in search history' });
    }

    const newFavorite = !findResult.rows[0].is_favorite;

    // Update favorite status
    const updateQuery = `
      UPDATE screener_searches
      SET is_favorite = $3
      WHERE user_id = $1 AND symbol = $2
    `;

    await db.query(updateQuery, [req.user.id, symbol.toUpperCase(), newFavorite]);

    res.json({ symbol: symbol.toUpperCase(), isFavorite: newFavorite });
  } catch (error) {
    console.error('[INVESTMENTS] Toggle favorite error:', error);
    res.status(500).json({ error: error.message || 'Failed to toggle favorite' });
  }
};

/**
 * Compare multiple stocks
 * POST /api/investments/compare
 */
const compareStocks = async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length < 2 || symbols.length > 3) {
      return res.status(400).json({ error: 'Provide 2-3 symbols to compare' });
    }

    const analyses = await EightPillarsService.analyzeMultiple(symbols);

    res.json(analyses);
  } catch (error) {
    console.error('[INVESTMENTS] Compare error:', error);
    res.status(500).json({ error: error.message || 'Failed to compare stocks' });
  }
};

// ========================================
// CHART DATA
// ========================================

/**
 * Get stock chart data
 * GET /api/investments/chart/:symbol
 */
const getChartData = async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1Y' } = req.query; // 1D, 1W, 1M, 3M, 6M, 1Y, 5Y

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const finnhub = require('../utils/finnhub');

    // Calculate date range based on period
    const now = Math.floor(Date.now() / 1000);
    let from;
    let resolution;

    switch (period.toUpperCase()) {
      case '1D':
        from = now - (24 * 60 * 60);
        resolution = '5'; // 5 minute candles
        break;
      case '1W':
        from = now - (7 * 24 * 60 * 60);
        resolution = '15'; // 15 minute candles
        break;
      case '1M':
        from = now - (30 * 24 * 60 * 60);
        resolution = '60'; // 1 hour candles
        break;
      case '3M':
        from = now - (90 * 24 * 60 * 60);
        resolution = 'D'; // Daily candles
        break;
      case '6M':
        from = now - (180 * 24 * 60 * 60);
        resolution = 'D';
        break;
      case '1Y':
        from = now - (365 * 24 * 60 * 60);
        resolution = 'D';
        break;
      case '5Y':
        from = now - (5 * 365 * 24 * 60 * 60);
        resolution = 'W'; // Weekly candles
        break;
      default:
        from = now - (365 * 24 * 60 * 60);
        resolution = 'D';
    }

    const candles = await finnhub.getStockCandles(
      symbol.toUpperCase(),
      resolution,
      from,
      now,
      req.user.id
    );

    res.json({
      symbol: symbol.toUpperCase(),
      period,
      resolution,
      candles
    });
  } catch (error) {
    console.error('[INVESTMENTS] Chart data error:', error);
    res.status(500).json({ error: error.message || 'Failed to get chart data' });
  }
};

// ========================================
// HELPERS
// ========================================

/**
 * Record a search in history
 */
const recordSearch = async (userId, symbol, companyName) => {
  try {
    const query = `
      INSERT INTO screener_searches (user_id, symbol, company_name)
      VALUES ($1, $2, $3)
    `;

    await db.query(query, [userId, symbol.toUpperCase(), companyName || null]);
  } catch (error) {
    // Non-critical, just log
    console.warn('[INVESTMENTS] Failed to record search:', error.message);
  }
};

module.exports = {
  // Analysis
  analyzeStock,
  refreshAnalysis,

  // Fundamental data
  getFinancials,
  getMetrics,
  getProfile,

  // Holdings
  getHoldings,
  getHolding,
  createHolding,
  updateHolding,
  deleteHolding,

  // Lots
  getLots,
  addLot,
  deleteLot,

  // Dividends
  getDividends,
  recordDividend,

  // Portfolio
  getPortfolioSummary,
  refreshPrices,

  // Screener
  getSearchHistory,
  toggleFavorite,
  compareStocks,

  // Chart
  getChartData
};
