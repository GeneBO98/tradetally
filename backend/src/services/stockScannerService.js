/**
 * Stock Scanner Service
 * Scans stocks against the 8 Pillars methodology
 * Can scan Russell 2000 only or comprehensive US stock universe
 * Results are cached in database and refreshed quarterly at 3 AM
 */

const db = require('../config/database');
const EightPillarsService = require('./eightPillarsService');
const FundamentalDataService = require('./fundamentalDataService');
const path = require('path');
const fs = require('fs');

class StockScannerService {
  // Rate limiting configuration
  static BATCH_SIZE = 10;           // Process 10 stocks per batch
  static BATCH_DELAY_MS = 2000;     // 2 seconds between batches (conservative for Finnhub limits)
  static MAX_RETRIES = 2;           // Retry failed stocks twice

  // Currently running scan (for status checking)
  static currentScan = null;

  /**
   * Get index constituents from Finnhub
   * @param {string} symbol - Index symbol (e.g., ^GSPC for S&P 500)
   * @returns {Promise<Array<string>>} Array of stock symbols
   */
  static async getIndexConstituents(symbol) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY not configured');
    }

    const url = `https://finnhub.io/api/v1/index/constituents?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    console.log(`[SCANNER] Fetching index constituents for ${symbol}...`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SCANNER] Failed to fetch ${symbol}: HTTP ${response.status}`);
        console.error(`[SCANNER] Response: ${errorText}`);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (!data.constituents || !Array.isArray(data.constituents)) {
        console.error(`[SCANNER] Invalid response for ${symbol}:`, JSON.stringify(data));
        throw new Error(`No constituents array in response for ${symbol}`);
      }

      console.log(`[SCANNER] ✓ Successfully fetched ${data.constituents.length} stocks from ${symbol}`);
      return data.constituents;
    } catch (error) {
      console.error(`[SCANNER] ✗ Error fetching ${symbol}:`, error.message);
      console.error(`[SCANNER] Error stack:`, error.stack);
      throw error; // Re-throw instead of returning empty array
    }
  }

  /**
   * Fetch Russell 2000 constituents from iShares IWM ETF holdings CSV
   * This is the primary data source for quarterly scans
   * @returns {Promise<Array<string>>} Array of stock symbols
   */
  static async fetchRussell2000FromIShares() {
    const url = 'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/1467271812596.ajax?fileType=csv&fileName=IWM_holdings&dataType=fund';

    console.log('[SCANNER] Fetching Russell 2000 from iShares IWM ETF...');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`iShares fetch failed: HTTP ${response.status}`);
    }

    const csvText = await response.text();

    // Parse CSV - iShares format has metadata rows, then headers, then data
    // Ticker is in first column after the header rows
    const lines = csvText.split('\n');
    const symbols = [];

    for (const line of lines) {
      const cols = line.split(',');
      // Ticker is first column, skip non-stock rows
      // Valid tickers are 1-5 uppercase letters (some have dots like BRK.B)
      const ticker = cols[0]?.trim().replace(/"/g, '');
      if (ticker && /^[A-Z]{1,5}(\.[A-Z])?$/.test(ticker)) {
        symbols.push(ticker);
      }
    }

    console.log(`[SCANNER] Parsed ${symbols.length} symbols from iShares CSV`);

    // Cache to local file for fallback
    const cacheData = { lastUpdated: new Date().toISOString(), symbols };
    const cachePath = path.join(__dirname, '../data/russell2000.json');
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
    console.log(`[SCANNER] Cached ${symbols.length} symbols to ${cachePath}`);

    return symbols;
  }

  /**
   * Get Russell 2000 stock list
   * Uses iShares IWM ETF holdings as primary source, with cache and Finnhub API fallbacks
   * @returns {Promise<Array<string>>} Array of stock symbols
   */
  static async getRussell2000Stocks() {
    console.log('[SCANNER] ========================================');
    console.log('[SCANNER] Getting Russell 2000 stock list...');

    // Try to fetch fresh data from iShares
    try {
      const symbols = await this.fetchRussell2000FromIShares();
      if (symbols.length >= 1000) {  // IWM holds ~1300-1900 stocks
        console.log(`[SCANNER] Successfully fetched ${symbols.length} stocks from iShares`);
        console.log('[SCANNER] ========================================');
        return symbols.sort(() => Math.random() - 0.5);  // Shuffle
      }
      console.warn(`[SCANNER] iShares returned only ${symbols.length} stocks, trying cache...`);
    } catch (err) {
      console.warn(`[SCANNER] iShares fetch failed: ${err.message}`);
    }

    // Try local cache
    try {
      const cachePath = path.join(__dirname, '../data/russell2000.json');
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cacheData.symbols?.length >= 1000) {
        const daysSinceUpdate = (Date.now() - new Date(cacheData.lastUpdated)) / (1000 * 60 * 60 * 24);
        console.log(`[SCANNER] Loaded ${cacheData.symbols.length} stocks from cache (${Math.round(daysSinceUpdate)} days old)`);
        console.log('[SCANNER] ========================================');
        return cacheData.symbols.sort(() => Math.random() - 0.5);
      }
    } catch (cacheErr) {
      console.warn('[SCANNER] Cache not available or invalid');
    }

    // Fallback to Finnhub API
    console.log('[SCANNER] Falling back to Finnhub API...');
    try {
      const finnhubStocks = await this.getIndexConstituents('^RUT');
      if (finnhubStocks.length > 0) {
        console.log(`[SCANNER] Got ${finnhubStocks.length} stocks from Finnhub API`);
        console.log('[SCANNER] ========================================');
        return finnhubStocks.sort(() => Math.random() - 0.5);
      }
    } catch (finnhubErr) {
      console.error('[SCANNER] Finnhub API also failed:', finnhubErr.message);
    }

    throw new Error('Failed to fetch Russell 2000 stocks from any source');
  }

  /**
   * Get comprehensive US stock list by combining multiple indices
   * Combines S&P 500, S&P 400 (mid-cap), S&P 600 (small-cap), and Russell 2000
   * @returns {Promise<Array<string>>} Array of unique stock symbols
   */
  static async getUSStockUniverse() {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY not configured');
    }

    console.log('[SCANNER] Fetching US stock universe from multiple indices...');

    // Fetch from multiple indices in parallel
    const [sp500, sp400, sp600, russell2000] = await Promise.all([
      this.getIndexConstituents('^GSPC'),   // S&P 500 (large-cap)
      this.getIndexConstituents('^SP400'),  // S&P 400 (mid-cap)
      this.getIndexConstituents('^SP600'),  // S&P 600 (small-cap)
      this.getIndexConstituents('^RUT')     // Russell 2000 (small-cap)
    ]);

    // Combine and deduplicate
    const allStocks = new Set([...sp500, ...sp400, ...sp600, ...russell2000]);
    const uniqueStocks = Array.from(allStocks);

    console.log(`[SCANNER] Combined stock universe: ${uniqueStocks.length} unique stocks`);
    console.log(`[SCANNER]   - S&P 500: ${sp500.length}, S&P 400: ${sp400.length}, S&P 600: ${sp600.length}, Russell 2000: ${russell2000.length}`);

    // Shuffle to vary scan order
    const shuffled = uniqueStocks.sort(() => Math.random() - 0.5);

    return shuffled;
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
   * Run the scan of stocks
   * Can scan Russell 2000 only, or comprehensive US stock universe
   * This is designed to be called by cron job or admin trigger
   * @param {Object} options - Scan options
   * @param {boolean} options.useCuratedList - Use curated list instead of full universe (default: false)
   * @param {boolean} options.russell2000Only - Scan only Russell 2000 (default: false)
   * @returns {Promise<Object>} Scan summary
   */
  static async runNightlyScan(options = {}) {
    console.log('[SCANNER] ========================================');
    console.log('[SCANNER] runNightlyScan called with options:', JSON.stringify(options));
    const { useCuratedList = false, russell2000Only = false } = options;

    // Check for stuck scans in database first
    const stuckScans = await db.query(`
      SELECT id, created_at, status
      FROM stock_scans
      WHERE status = 'running'
        AND created_at < NOW() - INTERVAL '24 hours'
    `);
    
    if (stuckScans.rows.length > 0) {
      console.log(`[SCANNER] Found ${stuckScans.rows.length} stuck scan(s), marking as failed...`);
      for (const stuckScan of stuckScans.rows) {
        await db.query(`
          UPDATE stock_scans
          SET status = 'failed',
              error_message = 'Scan was stuck (no progress for 24+ hours)',
              completed_at = NOW()
          WHERE id = $1
        `, [stuckScan.id]);
      }
    }

    // Prevent multiple concurrent scans
    if (this.currentScan && this.currentScan.status === 'running') {
      console.log('[SCANNER] Scan already in progress (in-memory)');
      return { error: 'Scan already in progress', scanId: this.currentScan.id };
    }

    // Also check database for running scans
    const runningScans = await db.query(`
      SELECT id FROM stock_scans WHERE status = 'running' LIMIT 1
    `);
    
    if (runningScans.rows.length > 0 && !stuckScans.rows.find(s => s.id === runningScans.rows[0].id)) {
      console.log('[SCANNER] Scan already in progress (in database)');
      return { error: 'Scan already in progress', scanId: runningScans.rows[0].id };
    }

    const startTime = Date.now();
    let scanId = null;

    try {
      console.log('[SCANNER] Creating new scan record in database...');
      // Create scan record
      const scanResult = await db.query(`
        INSERT INTO stock_scans (scan_date, status, created_at)
        VALUES (CURRENT_DATE, 'running', NOW())
        RETURNING id
      `);
      scanId = scanResult.rows[0].id;
      console.log(`[SCANNER] Created scan record with ID: ${scanId}`);

      // Get stocks to scan
      let stocks;
      if (useCuratedList) {
        stocks = this.getCuratedStockList();
        console.log(`[SCANNER] Using curated list of ${stocks.length} quality stocks`);
      } else if (russell2000Only) {
        try {
          stocks = await this.getRussell2000Stocks();
          // If we got too few stocks, this is a problem - don't silently fall back
          if (stocks.length < 100) {
            console.error(`[SCANNER] ERROR: Only got ${stocks.length} stocks from Russell 2000 API (expected ~2000)`);
            console.error('[SCANNER] This likely indicates an API issue. Check FINNHUB_API_KEY and API limits.');
            // Still use what we got rather than failing completely, but log the issue
            if (stocks.length === 0) {
              throw new Error('Russell 2000 API returned 0 stocks. Check API key and limits.');
            }
          } else {
            console.log(`[SCANNER] Successfully fetched ${stocks.length} stocks from Russell 2000`);
          }
        } catch (apiError) {
          console.error('[SCANNER] ERROR: Failed to fetch Russell 2000 stocks:', apiError.message);
          console.error('[SCANNER] Stack trace:', apiError.stack);
          // Don't fall back to curated list - fail the scan instead
          throw new Error(`Failed to fetch Russell 2000 stocks: ${apiError.message}`);
        }
      } else {
        try {
          stocks = await this.getUSStockUniverse();
          // If we got too few stocks, fall back to curated list
          if (stocks.length < 100) {
            console.log('[SCANNER] Too few stocks from API, falling back to curated list');
            stocks = this.getCuratedStockList();
          }
        } catch (apiError) {
          console.log('[SCANNER] API failed, falling back to curated list:', apiError.message);
          stocks = this.getCuratedStockList();
        }
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

      console.log(`[SCANNER] ====== Starting scan ${scanId} ======`);
      console.log(`[SCANNER] Scan type: ${russell2000Only ? 'Russell 2000 only' : 'Full US universe'}`);
      console.log(`[SCANNER] Total stocks to scan: ${stocks.length}`);
      console.log(`[SCANNER] First 10 stocks: ${stocks.slice(0, 10).join(', ')}`);
      console.log(`[SCANNER] Batch size: ${this.BATCH_SIZE}, Delay: ${this.BATCH_DELAY_MS}ms`);
      console.log(`[SCANNER] ======================================`);

      // Process stocks in batches with rate limiting
      let stocksAnalyzed = 0;
      let stocksFailed = 0;
      const failedStocks = [];

      console.log(`[SCANNER] Starting to process ${stocks.length} stocks in batches of ${this.BATCH_SIZE}...`);

      for (let i = 0; i < stocks.length; i += this.BATCH_SIZE) {
        const batch = stocks.slice(i, i + this.BATCH_SIZE);
        console.log(`[SCANNER] Processing batch ${Math.floor(i / this.BATCH_SIZE) + 1}: ${batch.join(', ')}`);

        // Process batch (sequential to respect rate limits)
        for (const symbol of batch) {
          console.log(`[SCANNER] Analyzing stock: ${symbol}`);
          try {
            await this.analyzeAndStoreStock(scanId, symbol);
            stocksAnalyzed++;
            this.currentScan.stocksAnalyzed = stocksAnalyzed;
            console.log(`[SCANNER] ✓ Successfully analyzed ${symbol} (${stocksAnalyzed}/${stocks.length})`);

            // Update progress in database every 10 stocks (more frequent updates)
            if (stocksAnalyzed % 10 === 0) {
              console.log(`[SCANNER] Progress: ${stocksAnalyzed}/${stocks.length} stocks analyzed`);
              // Update progress in database
              await db.query(`
                UPDATE stock_scans SET stocks_analyzed = $1 WHERE id = $2
              `, [stocksAnalyzed, scanId]);
            } else if (stocksAnalyzed % 50 === 0) {
              // Also log every 50 for less verbose output
              console.log(`[SCANNER] Progress: ${stocksAnalyzed}/${stocks.length} stocks analyzed`);
            }
          } catch (error) {
            console.error(`[SCANNER] ✗ Failed to analyze ${symbol}:`, error.message);
            console.error(`[SCANNER] Error stack:`, error.stack);
            stocksFailed++;
            failedStocks.push({ symbol, error: error.message });
            // Still update count even on failure
            this.currentScan.stocksAnalyzed = stocksAnalyzed;
          }
        }
        
        // Update database after each batch completes to ensure progress is saved
        // This ensures progress is visible even if we're between 10-stock update intervals
        if (stocksAnalyzed > 0) {
          await db.query(`
            UPDATE stock_scans SET stocks_analyzed = $1 WHERE id = $2
          `, [stocksAnalyzed, scanId]);
          console.log(`[SCANNER] Updated database: ${stocksAnalyzed}/${stocks.length} stocks analyzed`);
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

      // Note: Market cap filter removed - Russell 2000 is already a curated index
      // Small-cap stocks in Russell 2000 can legitimately be under $500M

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

    // Get latest COMPLETED scan only - don't show running scan results
    // This prevents clearing results while a new scan is in progress
    const latestScan = await db.query(`
      SELECT id, scan_date, total_stocks, stocks_analyzed, status, completed_at, created_at
      FROM stock_scans
      WHERE status = 'completed'
      ORDER BY created_at DESC
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

    // Check if there's a scan currently running (separate from displayed results)
    const runningCheck = await db.query(`
      SELECT id, stocks_analyzed, total_stocks FROM stock_scans WHERE status = 'running' LIMIT 1
    `);
    const runningScan = runningCheck.rows[0] || null;

    const scanInfo = {
      scanId,
      scanDate: scan.scan_date,
      totalStocks: scan.total_stocks,
      stocksAnalyzed: scan.stocks_analyzed,
      status: scan.status,
      completedAt: scan.completed_at,
      isRunning: false,  // Displayed scan is always completed
      // Include running scan progress if one exists
      runningScanProgress: runningScan ? {
        scanId: runningScan.id,
        stocksAnalyzed: runningScan.stocks_analyzed,
        totalStocks: runningScan.total_stocks,
        progress: runningScan.total_stocks > 0
          ? Math.round((runningScan.stocks_analyzed / runningScan.total_stocks) * 100)
          : 0
      } : null
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
   * Clean up stuck scans (scans that are running but haven't made progress)
   * This should be called on server startup
   */
  static async cleanupStuckScans() {
    try {
      // Find scans that are stuck (running for more than 1 hour with no progress, or older than 6 hours)
      const stuckScans = await db.query(`
        SELECT id, created_at, total_stocks, stocks_analyzed, status
        FROM stock_scans
        WHERE status = 'running'
          AND (
            (created_at < NOW() - INTERVAL '6 hours')
            OR (created_at < NOW() - INTERVAL '1 hour' AND stocks_analyzed = 0)
          )
      `);
      
      if (stuckScans.rows.length > 0) {
        console.log(`[SCANNER] Found ${stuckScans.rows.length} stuck scan(s), cleaning up...`);
        for (const stuckScan of stuckScans.rows) {
          const scanAge = Date.now() - new Date(stuckScan.created_at).getTime();
          const hoursOld = scanAge / (1000 * 60 * 60);
          
          console.warn(`[SCANNER] Marking stuck scan ${stuckScan.id} as failed (${hoursOld.toFixed(1)} hours old, ${stuckScan.stocks_analyzed}/${stuckScan.total_stocks} analyzed)`);
          
          await db.query(`
            UPDATE stock_scans
            SET status = 'failed',
                error_message = $1,
                completed_at = NOW()
            WHERE id = $2
          `, [
            `Scan was stuck (${hoursOld.toFixed(1)} hours old, ${stuckScan.stocks_analyzed}/${stuckScan.total_stocks} stocks analyzed)`,
            stuckScan.id
          ]);
        }
        console.log(`[SCANNER] Cleaned up ${stuckScans.rows.length} stuck scan(s)`);
      }
      
      return stuckScans.rows.length;
    } catch (error) {
      console.error('[SCANNER] Error cleaning up stuck scans:', error);
      return 0;
    }
  }

  /**
   * Get current scan status or latest completed scan info
   * @returns {Promise<Object>} Status info
   */
  static async getScanStatus() {
    // Check for running scan in database first (handles server restarts)
    const runningScanResult = await db.query(`
      SELECT id, scan_date, total_stocks, stocks_analyzed, status, created_at
      FROM stock_scans
      WHERE status = 'running'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    // If we have a running scan in DB, check if it's actually running or stuck
    if (runningScanResult.rows.length > 0) {
      const dbScan = runningScanResult.rows[0];
      
      // If we also have it in memory, use the in-memory version (more up-to-date)
      if (this.currentScan && this.currentScan.id === dbScan.id) {
        return {
          status: 'running',
          scanId: this.currentScan.id,
          totalStocks: this.currentScan.totalStocks,
          stocksAnalyzed: this.currentScan.stocksAnalyzed,
          progress: Math.round((this.currentScan.stocksAnalyzed / this.currentScan.totalStocks) * 100),
          startedAt: new Date(this.currentScan.startTime).toISOString()
        };
      }
      
      // Check if scan is stuck (older than 1 hour with no progress, or older than 6 hours)
      const scanAge = Date.now() - new Date(dbScan.created_at).getTime();
      const hoursOld = scanAge / (1000 * 60 * 60);
      const isStuck = hoursOld > 6 || (hoursOld > 1 && dbScan.stocks_analyzed === 0);
      
      if (isStuck) {
        // Mark stuck scan as failed
        console.warn(`[SCANNER] Detected stuck scan ${dbScan.id} (${hoursOld.toFixed(1)} hours old, ${dbScan.stocks_analyzed}/${dbScan.total_stocks} analyzed), marking as failed`);
        await db.query(`
          UPDATE stock_scans
          SET status = 'failed',
              error_message = $1,
              completed_at = NOW()
          WHERE id = $2
        `, [
          `Scan was stuck (${hoursOld.toFixed(1)} hours old, ${dbScan.stocks_analyzed}/${dbScan.total_stocks} stocks analyzed)`,
          dbScan.id
        ]);
        
        // Continue to get latest scan below
      } else {
        // Return the running scan from database
        return {
          status: 'running',
          scanId: dbScan.id,
          totalStocks: dbScan.total_stocks || 0,
          stocksAnalyzed: dbScan.stocks_analyzed || 0,
          progress: dbScan.total_stocks > 0 
            ? Math.round((dbScan.stocks_analyzed / dbScan.total_stocks) * 100)
            : 0,
          startedAt: dbScan.created_at
        };
      }
    }
    
    // Check in-memory scan (if no DB running scan or it was stuck)
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
      WHERE status IN ('completed', 'failed')
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
