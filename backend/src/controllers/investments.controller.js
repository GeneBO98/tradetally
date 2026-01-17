/**
 * Investments Controller
 * Handles 8 Pillars analysis, holdings management, and investment screener
 */

const EightPillarsService = require('../services/eightPillarsService');
const FundamentalDataService = require('../services/fundamentalDataService');
const HoldingsService = require('../services/holdingsService');
const DCFValuationService = require('../services/dcfValuationService');
const db = require('../config/database');

// ========================================
// 8 PILLARS ANALYSIS
// ========================================

/**
 * Analyze a stock or crypto using appropriate methodology
 * GET /api/investments/analyze/:symbol
 * For stocks: Returns 8 Pillars analysis
 * For crypto: Returns crypto profile data
 */
const analyzeStock = async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    console.log(`[INVESTMENTS] Analyzing ${symbol} for user ${req.user.id}`);

    // Check if this is a crypto symbol
    const isCrypto = await FundamentalDataService.isCryptoSymbol(symbol);

    if (isCrypto) {
      // Get crypto data from CoinGecko instead of Finnhub (which requires premium)
      console.log(`[INVESTMENTS] ${symbol} detected as crypto, fetching from CoinGecko`);

      const finnhub = require('../utils/finnhub');
      const coinGeckoId = finnhub.constructor.CRYPTO_TO_COINGECKO[symbol.toUpperCase()];

      if (!coinGeckoId) {
        return res.status(404).json({ error: `Unknown crypto symbol: ${symbol}` });
      }

      try {
        // Get detailed crypto data from CoinGecko
        const axios = require('axios');
        const response = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${coinGeckoId}?localization=false&tickers=false&community_data=false&developer_data=false`,
          { timeout: 10000 }
        );

        const coin = response.data;

        const analysis = {
          symbol: symbol.toUpperCase(),
          type: 'crypto',
          analysisDate: new Date().toISOString(),
          companyName: coin.name,
          logo: coin.image?.large || coin.image?.small,
          description: coin.description?.en?.substring(0, 500) || null,
          marketCap: coin.market_data?.market_cap?.usd,
          currentPrice: coin.market_data?.current_price?.usd,
          totalSupply: coin.market_data?.total_supply,
          maxSupply: coin.market_data?.max_supply,
          circulatingSupply: coin.market_data?.circulating_supply,
          priceChange24h: coin.market_data?.price_change_24h,
          priceChangePercent24h: coin.market_data?.price_change_percentage_24h,
          ath: coin.market_data?.ath?.usd,
          athDate: coin.market_data?.ath_date?.usd,
          atl: coin.market_data?.atl?.usd,
          atlDate: coin.market_data?.atl_date?.usd,
          launchDate: coin.genesis_date,
          website: coin.links?.homepage?.[0] || null
        };

        // Record search history
        await recordSearch(req.user.id, symbol, coin.name);

        return res.json(analysis);
      } catch (error) {
        console.error(`[INVESTMENTS] CoinGecko error for ${symbol}:`, error.message);
        return res.status(500).json({ error: `Failed to fetch crypto data for ${symbol}` });
      }
    }

    // Stock analysis - use 8 Pillars
    const analysis = await EightPillarsService.analyzeStock(symbol);

    // Record search history
    await recordSearch(req.user.id, symbol, analysis.companyName);

    res.json({ ...analysis, type: 'stock' });
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
 * Get a specific financial statement (balance sheet, income statement, or cash flow)
 * GET /api/investments/statements/:symbol/:type
 * :type = 'balance-sheet' | 'income-statement' | 'cash-flow'
 */
const getStatement = async (req, res) => {
  try {
    const { symbol, type } = req.params;
    const frequency = req.query.frequency || 'annual';
    const years = parseInt(req.query.years) || 20;

    if (!['balance-sheet', 'income-statement', 'cash-flow'].includes(type)) {
      return res.status(400).json({ error: 'Invalid statement type. Use: balance-sheet, income-statement, or cash-flow' });
    }

    console.log(`[INVESTMENTS] Getting ${type} for ${symbol} (${frequency}, ${years} periods)`);

    const financials = await FundamentalDataService.getFinancials(symbol, years, false, frequency);

    if (!financials || financials.length === 0) {
      return res.status(404).json({ error: `No financial data available for ${symbol}` });
    }

    // Helper to format period label (year for annual, year + quarter for quarterly)
    const formatPeriodLabel = (period) => {
      const year = period.year || period.fiscalYear;
      if (frequency === 'quarterly') {
        // Try to get quarter from period data (already calculated)
        const quarter = period.quarter || period.fiscalQuarter;
        if (quarter) {
          return `${year} Q${quarter}`;
        }
        // Try to determine quarter from filing date
        // 10-Q filings are made AFTER the quarter ends
        const dateStr = period.filingDate || period.period || period.endDate;
        if (dateStr) {
          const filedMonth = new Date(dateStr).getMonth() + 1;
          let q;
          if (filedMonth >= 4 && filedMonth <= 6) {
            q = 1; // Q1 results filed in Apr-Jun
          } else if (filedMonth >= 7 && filedMonth <= 9) {
            q = 2; // Q2 results filed in Jul-Sep
          } else if (filedMonth >= 10 && filedMonth <= 12) {
            q = 3; // Q3 results filed in Oct-Dec
          } else {
            q = 4; // Q4 results filed in Jan-Mar
          }
          return `${year} Q${q}`;
        }
      }
      return String(year);
    };

    // Map statement type to data fields
    let statementData;
    switch (type) {
      case 'balance-sheet':
        statementData = financials.map(period => ({
          year: formatPeriodLabel(period),
          filingDate: period.filingDate,
          // Assets
          totalAssets: period.totalAssets,
          cashAndEquivalents: period.cashAndEquivalents,
          currentAssets: period.currentAssets || null,
          // Liabilities
          totalLiabilities: period.totalLiabilities,
          currentLiabilities: period.currentLiabilities || null,
          longTermDebt: period.longTermDebt,
          shortTermDebt: period.shortTermDebt,
          totalDebt: period.totalDebt,
          // Equity
          totalEquity: period.totalEquity,
          retainedEarnings: period.retainedEarnings || null,
          // Shares
          sharesOutstanding: period.sharesOutstanding
        }));
        break;

      case 'income-statement':
        statementData = financials.map(period => ({
          year: formatPeriodLabel(period),
          filingDate: period.filingDate,
          // Revenue
          revenue: period.revenue,
          costOfRevenue: period.costOfRevenue || null,
          grossProfit: period.grossProfit,
          // Operating
          operatingExpenses: period.operatingExpenses || null,
          operatingIncome: period.operatingIncome,
          // Net Income
          ebit: period.ebit,
          ebitda: period.ebitda,
          interestExpense: period.interestExpense || null,
          netIncome: period.netIncome,
          // Per Share
          eps: period.eps || (period.netIncome && period.sharesOutstanding ? period.netIncome / period.sharesOutstanding : null),
          epsBasic: period.sharesBasic ? period.netIncome / period.sharesBasic : null,
          epsDiluted: period.sharesDiluted ? period.netIncome / period.sharesDiluted : null
        }));
        break;

      case 'cash-flow':
        statementData = financials.map(period => ({
          year: formatPeriodLabel(period),
          filingDate: period.filingDate,
          // Operating Activities
          operatingCashFlow: period.operatingCashFlow,
          depreciationAmortization: period.depreciationAmortization || null,
          // Investing Activities
          capitalExpenditures: period.capitalExpenditures,
          investingCashFlow: period.investingCashFlow || null,
          // Financing Activities
          financingCashFlow: period.financingCashFlow || null,
          dividendsPaid: period.dividendsPaid,
          stockRepurchases: period.stockRepurchases || null,
          // Free Cash Flow
          freeCashFlow: period.freeCashFlow
        }));
        break;
    }

    res.json({
      symbol: symbol.toUpperCase(),
      statementType: type,
      frequency,
      periods: statementData.length,
      data: statementData
    });
  } catch (error) {
    console.error('[INVESTMENTS] Statement error:', error);
    res.status(500).json({ error: error.message || 'Failed to get statement' });
  }
};

/**
 * Get SEC filings (10-K, 10-Q) for a stock
 * GET /api/investments/filings/:symbol
 */
const getFilings = async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 40;
    const symbolUpper = symbol.toUpperCase();

    console.log(`[INVESTMENTS] Getting SEC filings for ${symbolUpper}`);

    const finnhub = require('../utils/finnhub');

    // Get both annual (10-K) and quarterly (10-Q) filings
    const [annualData, quarterlyData] = await Promise.all([
      finnhub.getFinancialsReported(symbolUpper, 'annual').catch(() => null),
      finnhub.getFinancialsReported(symbolUpper, 'quarterly').catch(() => null)
    ]);

    // SEC EDGAR accepts ticker symbols directly - no need for CIK lookup
    const secEdgar10KUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbolUpper}&type=10-K&dateb=&owner=include&count=40`;
    const secEdgar10QUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbolUpper}&type=10-Q&dateb=&owner=include&count=40`;
    const secEdgarCompanyUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbolUpper}&owner=include&count=40`;

    const filings = [];

    // Process annual filings (10-K)
    if (annualData?.data) {
      annualData.data.forEach(filing => {
        filings.push({
          formType: '10-K',
          fiscalYear: filing.year,
          fiscalPeriod: 'FY',
          filedDate: filing.filedDate,
          acceptedDate: filing.acceptedDate,
          // Key financial highlights
          highlights: {
            revenue: FundamentalDataService.extractReportedValue(filing.report?.ic, 'revenue'),
            netIncome: FundamentalDataService.extractReportedValue(filing.report?.ic, 'netincome'),
            totalAssets: FundamentalDataService.extractReportedValue(filing.report?.bs, 'assets'),
            totalEquity: FundamentalDataService.extractReportedValue(filing.report?.bs, 'equity'),
            operatingCashFlow: FundamentalDataService.extractReportedValue(filing.report?.cf, 'operatingcashflow')
          },
          // SEC EDGAR link - use ticker symbol directly
          secEdgarUrl: secEdgar10KUrl
        });
      });
    }

    // Process quarterly filings (10-Q)
    if (quarterlyData?.data) {
      quarterlyData.data.forEach(filing => {
        filings.push({
          formType: '10-Q',
          fiscalYear: filing.year,
          fiscalPeriod: filing.quarter || 'Q',
          filedDate: filing.filedDate,
          acceptedDate: filing.acceptedDate,
          highlights: {
            revenue: FundamentalDataService.extractReportedValue(filing.report?.ic, 'revenue'),
            netIncome: FundamentalDataService.extractReportedValue(filing.report?.ic, 'netincome'),
            totalAssets: FundamentalDataService.extractReportedValue(filing.report?.bs, 'assets'),
            totalEquity: FundamentalDataService.extractReportedValue(filing.report?.bs, 'equity'),
            operatingCashFlow: FundamentalDataService.extractReportedValue(filing.report?.cf, 'operatingcashflow')
          },
          secEdgarUrl: secEdgar10QUrl
        });
      });
    }

    // Sort by filing date (most recent first)
    filings.sort((a, b) => {
      const dateA = new Date(a.filedDate || 0);
      const dateB = new Date(b.filedDate || 0);
      return dateB - dateA;
    });

    res.json({
      symbol: symbolUpper,
      secEdgarCompanyUrl,
      secEdgar10KUrl,
      secEdgar10QUrl,
      filings: filings.slice(0, limit)
    });
  } catch (error) {
    console.error('[INVESTMENTS] Filings error:', error);
    res.status(500).json({ error: error.message || 'Failed to get filings' });
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
 * Automatically refreshes prices to show current values
 */
const getHoldings = async (req, res) => {
  try {
    // Automatically refresh prices to show current values
    const holdings = await HoldingsService.refreshPrices(req.user.id);

    res.json(holdings);
  } catch (error) {
    console.error('[INVESTMENTS] Get holdings error:', error);
    res.status(500).json({ error: error.message || 'Failed to get holdings' });
  }
};

/**
 * Get a single holding
 * GET /api/investments/holdings/:id
 * Automatically refreshes the price to show current value
 */
const getHolding = async (req, res) => {
  try {
    // Refresh price first to get current value
    await HoldingsService.refreshHoldingPrice(req.user.id, req.params.id);

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
    // Refresh prices first to ensure accurate portfolio values
    // Use the returned holdings (with prices populated) for the summary calculation
    const holdingsWithPrices = await HoldingsService.refreshPrices(req.user.id);

    const summary = await HoldingsService.getPortfolioSummary(req.user.id, holdingsWithPrices);

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
 * Get stock or crypto chart data
 * GET /api/investments/chart/:symbol
 */
const getChartData = async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1Y', exchange = 'binance' } = req.query; // 1D, 1W, 1M, 3M, 6M, 1Y, 5Y

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const finnhub = require('../utils/finnhub');

    // Check if this is a crypto symbol
    const isCrypto = await FundamentalDataService.isCryptoSymbol(symbol);

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

    let candles;

    if (isCrypto) {
      // Use CoinGecko for crypto charts (Finnhub crypto requires premium)
      const coinGeckoId = finnhub.constructor.CRYPTO_TO_COINGECKO[symbol.toUpperCase()];

      if (!coinGeckoId) {
        return res.status(404).json({ error: `Unknown crypto symbol: ${symbol}` });
      }

      try {
        const axios = require('axios');
        // CoinGecko market_chart endpoint - days parameter
        let days;
        switch (period.toUpperCase()) {
          case '1D': days = 1; break;
          case '1W': days = 7; break;
          case '1M': days = 30; break;
          case '3M': days = 90; break;
          case '6M': days = 180; break;
          case '1Y': days = 365; break;
          case '5Y': days = 1825; break;
          default: days = 365;
        }

        console.log(`[INVESTMENTS] Fetching crypto chart from CoinGecko for ${symbol} (${days} days)`);

        const response = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/market_chart?vs_currency=usd&days=${days}`,
          { timeout: 15000 }
        );

        // Convert CoinGecko format to candle format
        // CoinGecko returns [timestamp, price] arrays
        const prices = response.data.prices || [];

        candles = prices.map(([timestamp, price]) => ({
          time: Math.floor(timestamp / 1000), // Convert ms to seconds
          open: price,
          high: price,
          low: price,
          close: price
        }));

        console.log(`[INVESTMENTS] Got ${candles.length} crypto data points for ${symbol}`);
      } catch (error) {
        console.error(`[INVESTMENTS] CoinGecko chart error for ${symbol}:`, error.message);
        return res.status(500).json({ error: `Failed to fetch crypto chart for ${symbol}` });
      }
    } else {
      // Use stock candles endpoint
      candles = await finnhub.getStockCandles(
        symbol.toUpperCase(),
        resolution,
        from,
        now,
        req.user.id
      );
    }

    res.json({
      symbol: symbol.toUpperCase(),
      type: isCrypto ? 'crypto' : 'stock',
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
// DCF VALUATION
// ========================================

/**
 * Get historical metrics for DCF valuation
 * GET /api/investments/dcf/:symbol
 */
const getDCFMetrics = async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    console.log(`[INVESTMENTS] Getting DCF metrics for ${symbol}`);

    const metrics = await DCFValuationService.getHistoricalMetrics(symbol);

    res.json(metrics);
  } catch (error) {
    console.error('[INVESTMENTS] DCF metrics error:', error);
    res.status(500).json({ error: error.message || 'Failed to get DCF metrics' });
  }
};

/**
 * Calculate DCF fair values
 * POST /api/investments/dcf/:symbol/calculate
 */
const calculateDCF = async (req, res) => {
  try {
    const { symbol } = req.params;
    const userInputs = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    console.log(`[INVESTMENTS] Calculating DCF for ${symbol}`);

    // Fetch fresh metrics to get current financial data
    const metrics = await DCFValuationService.getHistoricalMetrics(symbol);

    // Combine fetched metrics with user inputs
    // Use calculated discount rate as base, adjust for scenarios
    const baseDiscountRate = metrics.calculated_discount_rate || 0.10; // Fallback to 10% if not calculated
    
    // For Bear/Bull scenarios, adjust the base discount rate
    // Bear = more conservative = higher discount (base + 3%)
    // Bull = less conservative = lower discount (base - 2%)
    // IMPORTANT: userInputs.desired_return_* are already in decimal form (e.g., 0.15 for 15%)
    // because the frontend divides by 100 before sending
    let bearDiscountRate = userInputs.desired_return_low !== null && userInputs.desired_return_low !== undefined 
      ? userInputs.desired_return_low 
      : (baseDiscountRate + 0.03);
    let baseDiscountRateAdjusted = userInputs.desired_return_medium !== null && userInputs.desired_return_medium !== undefined
      ? userInputs.desired_return_medium
      : baseDiscountRate;
    let bullDiscountRate = userInputs.desired_return_high !== null && userInputs.desired_return_high !== undefined
      ? userInputs.desired_return_high
      : (baseDiscountRate - 0.02);
    
    // Log the raw values to debug
    console.log(`[DCF] Raw user inputs - desired_return_low: ${userInputs.desired_return_low}, desired_return_medium: ${userInputs.desired_return_medium}, desired_return_high: ${userInputs.desired_return_high}`);
    console.log(`[DCF] Discount rates - Calculated base: ${(baseDiscountRate*100).toFixed(2)}%, Bear: ${(bearDiscountRate*100).toFixed(2)}%, Base: ${(baseDiscountRateAdjusted*100).toFixed(2)}%, Bull: ${(bullDiscountRate*100).toFixed(2)}%`);
    console.log(`[DCF] Bear discount rate raw value: ${bearDiscountRate}, as percentage: ${(bearDiscountRate*100).toFixed(2)}%`);
    
    const results = DCFValuationService.calculateDCF({
      // From fetched metrics (source of truth for financial data)
      current_fcf: metrics.current_fcf,
      current_revenue: metrics.current_revenue,
      current_net_income: metrics.current_net_income,
      shares_outstanding: metrics.shares_outstanding,
      current_price: metrics.current_price,
      calculated_discount_rate: baseDiscountRate, // Pass calculated rate for reference
      beta: metrics.beta, // Pass beta for reference
      // User inputs - growth rates
      revenue_growth_low: userInputs.revenue_growth_low,
      revenue_growth_medium: userInputs.revenue_growth_medium,
      revenue_growth_high: userInputs.revenue_growth_high,
      // User inputs - margins (optional)
      profit_margin_low: userInputs.profit_margin_low,
      profit_margin_medium: userInputs.profit_margin_medium,
      profit_margin_high: userInputs.profit_margin_high,
      fcf_margin_low: userInputs.fcf_margin_low,
      fcf_margin_medium: userInputs.fcf_margin_medium,
      fcf_margin_high: userInputs.fcf_margin_high,
      // User inputs - multiples
      pe_low: userInputs.pe_low,
      pe_medium: userInputs.pe_medium,
      pe_high: userInputs.pe_high,
      pfcf_low: userInputs.pfcf_low,
      pfcf_medium: userInputs.pfcf_medium,
      pfcf_high: userInputs.pfcf_high,
      // Discount rates - use calculated defaults if user doesn't provide
      desired_return_low: bearDiscountRate,
      desired_return_medium: baseDiscountRateAdjusted,
      desired_return_high: bullDiscountRate,
      // Projection period
      projection_years: userInputs.projection_years || 10
    });

    res.json({
      symbol: symbol.toUpperCase(),
      ...results
    });
  } catch (error) {
    console.error('[INVESTMENTS] DCF calculation error:', error);
    res.status(500).json({ error: error.message || 'Failed to calculate DCF' });
  }
};

/**
 * Save a valuation
 * POST /api/investments/valuations
 */
const saveValuation = async (req, res) => {
  try {
    const valuation = await DCFValuationService.saveValuation(req.user.id, req.body);

    res.status(201).json(valuation);
  } catch (error) {
    console.error('[INVESTMENTS] Save valuation error:', error);
    res.status(500).json({ error: error.message || 'Failed to save valuation' });
  }
};

/**
 * Get valuations for user
 * GET /api/investments/valuations
 * GET /api/investments/valuations?symbol=AAPL
 */
const getValuations = async (req, res) => {
  try {
    const { symbol } = req.query;

    const valuations = await DCFValuationService.getValuations(req.user.id, symbol);

    res.json(valuations);
  } catch (error) {
    console.error('[INVESTMENTS] Get valuations error:', error);
    res.status(500).json({ error: error.message || 'Failed to get valuations' });
  }
};

/**
 * Get a specific valuation
 * GET /api/investments/valuations/:id
 */
const getValuation = async (req, res) => {
  try {
    const valuation = await DCFValuationService.getValuation(req.user.id, req.params.id);

    if (!valuation) {
      return res.status(404).json({ error: 'Valuation not found' });
    }

    res.json(valuation);
  } catch (error) {
    console.error('[INVESTMENTS] Get valuation error:', error);
    res.status(500).json({ error: error.message || 'Failed to get valuation' });
  }
};

/**
 * Delete a valuation
 * DELETE /api/investments/valuations/:id
 */
const deleteValuation = async (req, res) => {
  try {
    const deleted = await DCFValuationService.deleteValuation(req.user.id, req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Valuation not found' });
    }

    res.json({ success: true, message: 'Valuation deleted' });
  } catch (error) {
    console.error('[INVESTMENTS] Delete valuation error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete valuation' });
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
  getStatement,
  getFilings,
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
  getChartData,

  // DCF Valuation
  getDCFMetrics,
  calculateDCF,
  saveValuation,
  getValuations,
  getValuation,
  deleteValuation
};
