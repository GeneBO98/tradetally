/**
 * Stock Scanner Service
 * Scans US stocks against the 8 Pillars methodology
 * Results are cached in database and refreshed nightly at 3 AM
 */

const db = require('../config/database');
const EightPillarsService = require('./eightPillarsService');
const FundamentalDataService = require('./fundamentalDataService');

class StockScannerService {
  // Rate limiting configuration
  static BATCH_SIZE = 10;           // Process 10 stocks per batch
  static BATCH_DELAY_MS = 2000;     // 2 seconds between batches (conservative for Finnhub limits)
  static MAX_RETRIES = 2;           // Retry failed stocks twice
  static USER_ACTIVITY_PAUSE_MS = 10000;  // Pause for 10 seconds after user activity
  static USER_IDLE_THRESHOLD_MS = 30000;  // Consider user idle after 30 seconds

  // Currently running scan (for status checking)
  static currentScan = null;

  // Track last user API activity for prioritization
  static lastUserActivity = 0;

  /**
   * Record user activity - call this from user-facing API endpoints
   * This allows the scanner to pause and yield to user requests
   */
  static recordUserActivity() {
    this.lastUserActivity = Date.now();
  }

  /**
   * Check if we should pause for user activity
   * @returns {boolean} True if scanner should pause
   */
  static shouldPauseForUser() {
    const timeSinceActivity = Date.now() - this.lastUserActivity;
    return timeSinceActivity < this.USER_IDLE_THRESHOLD_MS;
  }

  /**
   * Wait for user activity to subside before continuing scan
   * @returns {Promise<void>}
   */
  static async waitForUserIdle() {
    while (this.shouldPauseForUser()) {
      console.log('[SCANNER] Pausing for user activity...');
      await this.delay(this.USER_ACTIVITY_PAUSE_MS);
    }
  }

  /**
   * Get US stocks from Finnhub (free tier)
   * Filters to common stocks only, excludes ETFs, ADRs, etc.
   * @param {number} limit - Maximum number of stocks to scan (0 = no limit)
   * @returns {Promise<Array<string>>} Array of stock symbols
   */
  static async getUSStocks(limit = 0) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY not configured');
    }

    try {
      // Get all US stock symbols (free endpoint)
      const response = await fetch(
        `https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Finnhub API error: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response from Finnhub stock symbols API');
      }

      // Filter to common stocks only (type = "Common Stock")
      // Exclude ETFs, ADRs, warrants, etc.
      const commonStocks = data
        .filter(stock =>
          stock.type === 'Common Stock' &&
          stock.symbol &&
          !stock.symbol.includes('.') &&  // Exclude class shares like BRK.A
          !stock.symbol.includes('-') &&  // Exclude preferred shares
          stock.symbol.length <= 5        // Standard ticker length
        )
        .map(stock => stock.symbol);

      // Shuffle stocks to vary scan order (helps with rate limiting recovery)
      const shuffled = commonStocks.sort(() => Math.random() - 0.5);

      // Apply limit if specified, otherwise return all
      const selected = limit > 0 ? shuffled.slice(0, limit) : shuffled;

      console.log(`[SCANNER] Selected ${selected.length} US stocks from ${commonStocks.length} available (limit: ${limit || 'none'})`);
      return selected;
    } catch (error) {
      console.error('[SCANNER] Failed to get US stocks:', error.message);
      throw error;
    }
  }

  /**
   * Get a curated list of popular large/mid-cap stocks for scanning
   * This is a fallback if the API fails
   * @returns {Array<string>} Array of stock symbols
   */
  static getCuratedStockList() {
    // Popular large and mid-cap stocks commonly analyzed for value investing
    return [
      // Tech
      'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NVDA', 'AMD', 'INTC', 'CRM', 'ORCL',
      'ADBE', 'CSCO', 'IBM', 'TXN', 'QCOM', 'AVGO', 'MU', 'AMAT', 'LRCX', 'KLAC',
      // Finance
      'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'PNC', 'TFC', 'SCHW',
      'BLK', 'SPGI', 'CME', 'ICE', 'AON', 'MMC', 'AXP', 'V', 'MA', 'PYPL',
      // Healthcare
      'JNJ', 'UNH', 'PFE', 'MRK', 'ABBV', 'LLY', 'TMO', 'ABT', 'DHR', 'BMY',
      'AMGN', 'GILD', 'ISRG', 'MDT', 'SYK', 'BDX', 'ZTS', 'REGN', 'VRTX', 'BIIB',
      // Consumer
      'WMT', 'PG', 'KO', 'PEP', 'COST', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT',
      'LOW', 'TJX', 'ROST', 'DG', 'DLTR', 'YUM', 'CMG', 'DPZ', 'EL', 'CL',
      // Industrial
      'CAT', 'DE', 'BA', 'HON', 'UPS', 'UNP', 'RTX', 'LMT', 'GD', 'NOC',
      'GE', 'MMM', 'EMR', 'ETN', 'PH', 'ROK', 'CMI', 'PCAR', 'ITW', 'SWK',
      // Energy
      'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'MPC', 'VLO', 'PSX', 'OXY',
      // Utilities & REITS
      'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'PEG', 'ED', 'XEL',
      // Communications
      'DIS', 'CMCSA', 'NFLX', 'T', 'VZ', 'TMUS', 'CHTR', 'WBD', 'PARA', 'FOX',
      // Materials
      'LIN', 'APD', 'SHW', 'ECL', 'DD', 'NEM', 'FCX', 'NUE', 'STLD', 'CF'
    ];
  }

  /**
   * Run the nightly scan of US stocks
   * This is designed to be called by cron job or admin trigger
   * @param {number} stockLimit - Maximum number of stocks to scan (0 = no limit, scans all)
   * @returns {Promise<Object>} Scan summary
   */
  static async runNightlyScan(stockLimit = 0) {
    // Prevent multiple concurrent scans
    if (this.currentScan && this.currentScan.status === 'running') {
      console.log('[SCANNER] Scan already in progress');
      return { error: 'Scan already in progress', scanId: this.currentScan.id };
    }

    const startTime = Date.now();
    let scanId = null;

    try {
      // Create scan record
      const scanResult = await db.query(`
        INSERT INTO stock_scans (scan_date, status, created_at)
        VALUES (CURRENT_DATE, 'running', NOW())
        RETURNING id
      `);
      scanId = scanResult.rows[0].id;

      // Get stocks to scan - try API first, fall back to curated list
      let stocks;
      try {
        stocks = await this.getUSStocks(stockLimit);
      } catch (apiError) {
        console.log('[SCANNER] API failed, using curated stock list');
        stocks = this.getCuratedStockList();
      }

      // Update total stocks count
      await db.query(`
        UPDATE stock_scans SET total_stocks = $1 WHERE id = $2
      `, [stocks.length, scanId]);

      // Track current scan
      this.currentScan = {
        id: scanId,
        status: 'running',
        totalStocks: stocks.length,
        stocksAnalyzed: 0,
        startTime
      };

      console.log(`[SCANNER] Starting scan ${scanId} for ${stocks.length} stocks`);

      // Process stocks in batches with rate limiting
      let stocksAnalyzed = 0;
      let stocksFailed = 0;
      const failedStocks = [];

      for (let i = 0; i < stocks.length; i += this.BATCH_SIZE) {
        const batch = stocks.slice(i, i + this.BATCH_SIZE);

        // Pause if users are active - prioritize their API calls
        await this.waitForUserIdle();

        // Process batch (sequential to respect rate limits)
        for (const symbol of batch) {
          try {
            await this.analyzeAndStoreStock(scanId, symbol);
            stocksAnalyzed++;
            this.currentScan.stocksAnalyzed = stocksAnalyzed;

            // Log progress every 50 stocks
            if (stocksAnalyzed % 50 === 0) {
              console.log(`[SCANNER] Progress: ${stocksAnalyzed}/${stocks.length} stocks analyzed`);
              // Update progress in database
              await db.query(`
                UPDATE stock_scans SET stocks_analyzed = $1 WHERE id = $2
              `, [stocksAnalyzed, scanId]);
            }
          } catch (error) {
            console.error(`[SCANNER] Failed to analyze ${symbol}:`, error.message);
            stocksFailed++;
            failedStocks.push({ symbol, error: error.message });
          }
        }

        // Delay between batches to respect rate limits
        if (i + this.BATCH_SIZE < stocks.length) {
          await this.delay(this.BATCH_DELAY_MS);
        }
      }

      // Retry failed stocks once
      if (failedStocks.length > 0 && this.MAX_RETRIES > 0) {
        console.log(`[SCANNER] Retrying ${failedStocks.length} failed stocks...`);
        await this.delay(5000); // Extra delay before retries

        for (const { symbol } of failedStocks) {
          try {
            await this.analyzeAndStoreStock(scanId, symbol);
            stocksAnalyzed++;
            stocksFailed--;
          } catch (error) {
            console.error(`[SCANNER] Retry failed for ${symbol}:`, error.message);
          }
        }
      }

      // Mark scan as completed
      const duration = Math.round((Date.now() - startTime) / 1000);
      await db.query(`
        UPDATE stock_scans
        SET status = 'completed',
            stocks_analyzed = $1,
            scan_duration_seconds = $2,
            completed_at = NOW()
        WHERE id = $3
      `, [stocksAnalyzed, duration, scanId]);

      this.currentScan = null;

      const summary = {
        scanId,
        status: 'completed',
        totalStocks: stocks.length,
        stocksAnalyzed,
        stocksFailed,
        durationSeconds: duration
      };

      console.log(`[SCANNER] Scan ${scanId} completed:`, summary);
      return summary;

    } catch (error) {
      console.error('[SCANNER] Scan failed:', error.message);

      // Mark scan as failed
      if (scanId) {
        await db.query(`
          UPDATE stock_scans
          SET status = 'failed',
              error_message = $1,
              completed_at = NOW()
          WHERE id = $2
        `, [error.message, scanId]);
      }

      this.currentScan = null;
      throw error;
    }
  }

  /**
   * Analyze a single stock and store results
   * @param {number} scanId - Scan ID
   * @param {string} symbol - Stock symbol
   */
  static async analyzeAndStoreStock(scanId, symbol) {
    try {
      // Force refresh to get latest data
      const analysis = await EightPillarsService.analyzeStock(symbol, true);

      // Extract pillar pass/fail and scores
      const p = analysis.pillars;

      await db.query(`
        INSERT INTO stock_pillar_results (
          scan_id, symbol, company_name,
          pillar_1_pass, pillar_2_pass, pillar_3_pass, pillar_4_pass,
          pillar_5_pass, pillar_6_pass, pillar_7_pass, pillar_8_pass,
          pillar_1_score, pillar_2_score, pillar_3_score, pillar_4_score,
          pillar_5_score, pillar_6_score, pillar_7_score, pillar_8_score,
          pillars_passed, total_score,
          current_price, market_cap, sector
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        ON CONFLICT (scan_id, symbol) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          pillar_1_pass = EXCLUDED.pillar_1_pass,
          pillar_2_pass = EXCLUDED.pillar_2_pass,
          pillar_3_pass = EXCLUDED.pillar_3_pass,
          pillar_4_pass = EXCLUDED.pillar_4_pass,
          pillar_5_pass = EXCLUDED.pillar_5_pass,
          pillar_6_pass = EXCLUDED.pillar_6_pass,
          pillar_7_pass = EXCLUDED.pillar_7_pass,
          pillar_8_pass = EXCLUDED.pillar_8_pass,
          pillar_1_score = EXCLUDED.pillar_1_score,
          pillar_2_score = EXCLUDED.pillar_2_score,
          pillar_3_score = EXCLUDED.pillar_3_score,
          pillar_4_score = EXCLUDED.pillar_4_score,
          pillar_5_score = EXCLUDED.pillar_5_score,
          pillar_6_score = EXCLUDED.pillar_6_score,
          pillar_7_score = EXCLUDED.pillar_7_score,
          pillar_8_score = EXCLUDED.pillar_8_score,
          pillars_passed = EXCLUDED.pillars_passed,
          total_score = EXCLUDED.total_score,
          current_price = EXCLUDED.current_price,
          market_cap = EXCLUDED.market_cap,
          sector = EXCLUDED.sector,
          created_at = NOW()
      `, [
        scanId,
        symbol,
        analysis.companyName || null,
        p.pillar1.passed,
        p.pillar2.passed,
        p.pillar3.passed,
        p.pillar4.passed,
        p.pillar5.passed,
        p.pillar6.passed,
        p.pillar7.passed,
        p.pillar8.passed,
        this.valueToScore(p.pillar1),
        this.valueToScore(p.pillar2),
        this.valueToScore(p.pillar3),
        this.valueToScore(p.pillar4),
        this.valueToScore(p.pillar5),
        this.valueToScore(p.pillar6),
        this.valueToScore(p.pillar7),
        this.valueToScore(p.pillar8),
        analysis.pillarsPassed,
        this.calculateTotalScore(analysis),
        analysis.currentPrice,
        analysis.marketCap,
        analysis.industry || null
      ]);

    } catch (error) {
      console.error(`[SCANNER] Error storing ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Convert pillar analysis to a 1-5 score
   * @param {Object} pillar - Pillar analysis object
   * @returns {number|null} Score 1-5 or null
   */
  static valueToScore(pillar) {
    if (!pillar || pillar.value === null || pillar.value === undefined) {
      return null;
    }

    // Simplified scoring: passed = 5, not passed = 1-4 based on how close
    // This can be enhanced later with more granular scoring
    return pillar.passed ? 5 : 2;
  }

  /**
   * Calculate total score from all pillars
   * @param {Object} analysis - Full analysis object
   * @returns {number} Total score
   */
  static calculateTotalScore(analysis) {
    let score = 0;
    for (let i = 1; i <= 8; i++) {
      const pillar = analysis.pillars[`pillar${i}`];
      if (pillar && pillar.passed) {
        score += 5;
      }
    }
    return score;
  }

  /**
   * Get scan results with optional pillar filters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated results
   */
  static async getScanResults(options = {}) {
    const {
      pillars = [],        // Array of pillar numbers that must pass (1-8)
      page = 1,
      limit = 50,
      sortBy = 'pillars_passed',
      sortOrder = 'DESC'
    } = options;

    // Get latest scan (running or completed) to show live results
    const latestScan = await db.query(`
      SELECT id, scan_date, total_stocks, stocks_analyzed, status, completed_at, created_at
      FROM stock_scans
      WHERE status IN ('completed', 'running')
      ORDER BY
        CASE WHEN status = 'running' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    `);

    if (latestScan.rows.length === 0) {
      return {
        scanInfo: null,
        results: [],
        total: 0,
        page,
        limit
      };
    }

    const scan = latestScan.rows[0];
    const scanId = scan.id;
    const scanInfo = {
      scanId,
      scanDate: scan.scan_date,
      totalStocks: scan.total_stocks,
      stocksAnalyzed: scan.stocks_analyzed,
      status: scan.status,
      completedAt: scan.completed_at,
      isRunning: scan.status === 'running'
    };

    // Build WHERE clause for pillar filters
    let whereClause = 'WHERE scan_id = $1';
    const params = [scanId];
    let paramCount = 2;

    // Add pillar filters - all selected pillars must pass
    if (pillars.length > 0) {
      const pillarConditions = pillars.map(p => {
        return `pillar_${p}_pass = true`;
      });
      whereClause += ` AND (${pillarConditions.join(' AND ')})`;
    }

    // Validate sort column
    const validSortColumns = ['symbol', 'company_name', 'pillars_passed', 'current_price', 'market_cap'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'pillars_passed';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as count
      FROM stock_pillar_results
      ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    const offset = (page - 1) * limit;
    const resultsQuery = `
      SELECT
        symbol,
        company_name,
        pillar_1_pass, pillar_2_pass, pillar_3_pass, pillar_4_pass,
        pillar_5_pass, pillar_6_pass, pillar_7_pass, pillar_8_pass,
        pillar_1_score, pillar_2_score, pillar_3_score, pillar_4_score,
        pillar_5_score, pillar_6_score, pillar_7_score, pillar_8_score,
        pillars_passed,
        current_price,
        market_cap,
        sector
      FROM stock_pillar_results
      ${whereClause}
      ORDER BY ${sortColumn} ${order}, symbol ASC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const results = await db.query(resultsQuery, [...params, limit, offset]);

    return {
      scanInfo,
      results: results.rows.map(this.formatResultRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Format a result row for API response
   * @param {Object} row - Database row
   * @returns {Object} Formatted result
   */
  static formatResultRow(row) {
    return {
      symbol: row.symbol,
      companyName: row.company_name,
      pillars: {
        1: { pass: row.pillar_1_pass, score: row.pillar_1_score },
        2: { pass: row.pillar_2_pass, score: row.pillar_2_score },
        3: { pass: row.pillar_3_pass, score: row.pillar_3_score },
        4: { pass: row.pillar_4_pass, score: row.pillar_4_score },
        5: { pass: row.pillar_5_pass, score: row.pillar_5_score },
        6: { pass: row.pillar_6_pass, score: row.pillar_6_score },
        7: { pass: row.pillar_7_pass, score: row.pillar_7_score },
        8: { pass: row.pillar_8_pass, score: row.pillar_8_score }
      },
      pillarsPassed: row.pillars_passed,
      currentPrice: parseFloat(row.current_price) || null,
      marketCap: parseInt(row.market_cap) || null,
      sector: row.sector
    };
  }

  /**
   * Get current scan status or latest completed scan info
   * @returns {Promise<Object>} Status info
   */
  static async getScanStatus() {
    // Check for running scan first
    if (this.currentScan) {
      return {
        status: 'running',
        scanId: this.currentScan.id,
        totalStocks: this.currentScan.totalStocks,
        stocksAnalyzed: this.currentScan.stocksAnalyzed,
        progress: Math.round((this.currentScan.stocksAnalyzed / this.currentScan.totalStocks) * 100),
        startedAt: new Date(this.currentScan.startTime).toISOString()
      };
    }

    // Get latest scan (completed or failed)
    const result = await db.query(`
      SELECT id, scan_date, total_stocks, stocks_analyzed, status,
             scan_duration_seconds, error_message, completed_at, created_at
      FROM stock_scans
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return {
        status: 'no_scans',
        message: 'No scans have been run yet'
      };
    }

    const scan = result.rows[0];
    return {
      status: scan.status,
      scanId: scan.id,
      scanDate: scan.scan_date,
      totalStocks: scan.total_stocks,
      stocksAnalyzed: scan.stocks_analyzed,
      durationSeconds: scan.scan_duration_seconds,
      errorMessage: scan.error_message,
      completedAt: scan.completed_at,
      createdAt: scan.created_at
    };
  }

  /**
   * Utility delay function
   * @param {number} ms - Milliseconds to delay
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = StockScannerService;
