/**
 * Screener Discover Service
 *
 * Builds the starter lists shown on the Stock Screener landing state so a
 * user who has not searched anything yet has somewhere to begin. Everything
 * is derived from data the app already maintains:
 *
 * - eight_pillars_analysis: the shared per-symbol 8 Pillars cache, populated
 *   by the nightly/quarterly Russell 2000 scan and by ad-hoc analyses.
 * - dashboard_earnings_cache: the two-week Finnhub earnings calendar cached
 *   by EarningsService.
 *
 * No external API calls are made here except the EarningsService cache-miss
 * fallback, which is already rate-limited and cached by that service.
 */

const db = require('../config/database');
const EarningsService = require('./earningsService');
const EightPillarsService = require('./eightPillarsService');
const StockScannerService = require('./stockScannerService');

const LOG_PREFIX = '[SCREENER-DISCOVER]';

// Only consider analyses newer than this. The scan runs quarterly and a daily
// catch-up re-runs it when results go stale, so anything older than roughly a
// quarter is out of date and must not be suggested.
const MAX_ANALYSIS_AGE_DAYS = 120;

// Very small caps dominate the "lowest P/E" tail with distorted ratios, so
// value picks need at least this market cap (USD).
const MIN_MARKET_CAP_FOR_VALUE = 250_000_000;

// Pillar thresholds for each list.
const STRONG_PILLARS = 6;   // "good pillars" for the value list
const ELITE_PILLARS = 7;    // "most pillars passed" list
const EARNINGS_PILLARS = 5; // quality bar for the earnings watch list

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

// Below this many current-formula symbols the lists are too thin to be a
// useful landing page (e.g. only a handful of ad-hoc analyses exist since the
// formula changed), so the UI shows the starter fallback instead.
const MIN_COVERAGE_SYMBOLS = 50;

// Latest analysis row per symbol. Reused by every list so all three agree on
// which snapshot of a symbol they describe.
//
// Only rows produced by the current CALCULATION_VERSION qualify ($2). The
// detail view recalculates with the current formula, so a row from an older
// formula would show a different pillar count than the stock's own page.
const LATEST_CTE = `
  WITH latest AS (
    SELECT DISTINCT ON (symbol)
      symbol, company_name, industry, logo,
      pillars_passed, pillar1_value, pillar1_passed, pillar8_value,
      market_cap, current_price, analysis_date
    FROM eight_pillars_analysis
    WHERE analysis_date >= NOW() - ($1 * INTERVAL '1 day')
      AND (pillar1_data->>'calculationVersion')::int = $2
    ORDER BY symbol, analysis_date DESC
  )
`;

// Shared leading params for every LATEST_CTE query.
const baseParams = () => [MAX_ANALYSIS_AGE_DAYS, EightPillarsService.CALCULATION_VERSION];

class ScreenerDiscoverService {
  static clampLimit(limit) {
    const parsed = parseInt(limit, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
    return Math.min(parsed, MAX_LIMIT);
  }

  static formatRow(row) {
    const pe = row.pillar1_value === null || row.pillar1_value === undefined
      ? null
      : parseFloat(row.pillar1_value);
    return {
      symbol: row.symbol,
      companyName: row.company_name || null,
      industry: row.industry || null,
      logo: row.logo || null,
      pillarsPassed: row.pillars_passed ?? 0,
      // 999.99 is the service's sentinel for "no P/E available"
      fiveYearPe: pe !== null && pe < 999 ? pe : null,
      priceToFcf: row.pillar8_value !== null && row.pillar8_value !== undefined
        ? parseFloat(row.pillar8_value)
        : null,
      marketCap: row.market_cap !== null && row.market_cap !== undefined
        ? parseFloat(row.market_cap)
        : null,
      currentPrice: row.current_price !== null && row.current_price !== undefined
        ? parseFloat(row.current_price)
        : null,
      analysisDate: row.analysis_date
    };
  }

  /**
   * Stocks passing at least STRONG_PILLARS pillars, cheapest 5-year P/E first.
   */
  static async getLowestPeValuePicks(limit) {
    const result = await db.query(`
      ${LATEST_CTE}
      SELECT * FROM latest
      WHERE pillars_passed >= $3
        AND pillar1_passed = true
        AND pillar1_value > 0
        AND market_cap >= $4
        -- A loss year contributes a negative annual P/E, which drags the
        -- 5-year average toward zero and makes the stock look cheap. Only
        -- rank companies that were profitable in every year of the window.
        AND NOT EXISTS (
          SELECT 1
          FROM eight_pillars_analysis e,
               jsonb_array_elements(COALESCE(e.pillar1_data->'annualPEs', '[]'::jsonb)) AS yr
          WHERE e.symbol = latest.symbol
            AND e.analysis_date = latest.analysis_date
            AND COALESCE((yr->>'pe')::numeric, 0) <= 0
        )
      ORDER BY pillar1_value ASC, pillars_passed DESC, symbol ASC
      LIMIT $5
    `, [...baseParams(), STRONG_PILLARS, MIN_MARKET_CAP_FOR_VALUE, limit]);
    return result.rows.map(this.formatRow);
  }

  /**
   * Stocks passing the most pillars. Ties break toward larger companies so
   * the list leads with recognizable names rather than micro caps.
   */
  static async getMostPillarsPassed(limit) {
    const result = await db.query(`
      ${LATEST_CTE}
      SELECT * FROM latest
      WHERE pillars_passed >= $3
      ORDER BY pillars_passed DESC, market_cap DESC NULLS LAST, symbol ASC
      LIMIT $4
    `, [...baseParams(), ELITE_PILLARS, limit]);
    return result.rows.map(this.formatRow);
  }

  /**
   * Quality stocks (EARNINGS_PILLARS+) reporting within the cached two-week
   * earnings window, soonest first.
   */
  static async getUpcomingEarnings(limit) {
    const candidates = await db.query(`
      ${LATEST_CTE}
      SELECT * FROM latest
      WHERE pillars_passed >= $3
        AND market_cap >= $4
    `, [...baseParams(), EARNINGS_PILLARS, MIN_MARKET_CAP_FOR_VALUE]);

    if (candidates.rows.length === 0) return [];

    const bySymbol = new Map(candidates.rows.map(row => [row.symbol.toUpperCase(), row]));

    let earnings = [];
    try {
      earnings = await EarningsService.getEarningsForSymbols([...bySymbol.keys()]);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Earnings lookup failed: ${error.message}`);
      return [];
    }

    // One entry per symbol, keeping the earliest date. getEarningsForSymbols
    // already sorts by date ascending.
    const seen = new Set();
    const picks = [];
    for (const entry of earnings) {
      const symbol = (entry.symbol || '').toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      // Finnhub fills epsActual once a company has reported; skip those so
      // today's morning reporters drop off the "upcoming" list by afternoon.
      if (entry.epsActual !== null && entry.epsActual !== undefined) continue;
      const row = bySymbol.get(symbol);
      if (!row) continue;
      seen.add(symbol);
      picks.push({
        ...this.formatRow(row),
        earningsDate: entry.date,
        earningsHour: entry.hour || null,
        epsEstimate: entry.epsEstimate ?? null,
        revenueEstimate: entry.revenueEstimate ?? null
      });
    }

    // Soonest first; within a day lead with the strongest, largest names so
    // a busy reporting day does not read as an alphabetical dump.
    picks.sort((a, b) =>
      String(a.earningsDate).localeCompare(String(b.earningsDate)) ||
      (b.pillarsPassed - a.pillarsPassed) ||
      ((b.marketCap || 0) - (a.marketCap || 0)) ||
      a.symbol.localeCompare(b.symbol)
    );
    return picks.slice(0, limit);
  }

  static async getCoverage() {
    const result = await db.query(`
      SELECT COUNT(DISTINCT symbol) AS symbols, MAX(analysis_date) AS latest
      FROM eight_pillars_analysis
      WHERE analysis_date >= NOW() - ($1 * INTERVAL '1 day')
        AND (pillar1_data->>'calculationVersion')::int = $2
    `, baseParams());
    const row = result.rows[0] || {};
    return {
      analyzedSymbols: parseInt(row.symbols, 10) || 0,
      latestAnalysisDate: row.latest || null,
      calculationVersion: EightPillarsService.CALCULATION_VERSION,
      maxAgeDays: MAX_ANALYSIS_AGE_DAYS
    };
  }

  /**
   * All starter lists in one call.
   * @param {Object} options
   * @param {number} options.limit - rows per list (1-25, default 8)
   */
  static async getDiscoverLists(options = {}) {
    const limit = this.clampLimit(options.limit);
    const { from, to } = EarningsService.getDateRange();

    const [lowestPe, mostPillars, upcomingEarnings, coverage, rescan] = await Promise.all([
      this.getLowestPeValuePicks(limit),
      this.getMostPillarsPassed(limit),
      this.getUpcomingEarnings(limit),
      this.getCoverage(),
      StockScannerService.needsRescan().catch(error => {
        console.warn(`${LOG_PREFIX} Could not check scan freshness: ${error.message}`);
        return { needed: false, reason: null };
      })
    ]);

    return {
      lowestPe,
      mostPillars,
      upcomingEarnings,
      meta: {
        ...coverage,
        hasScanData: coverage.analyzedSymbols >= MIN_COVERAGE_SYMBOLS,
        minCoverageSymbols: MIN_COVERAGE_SYMBOLS,
        // True when the scanner's latest results are missing, too old, or from
        // an older formula; a catch-up scan is scheduled daily in that case.
        rescanPending: Boolean(rescan.needed),
        rescanReason: rescan.needed ? rescan.reason : null,
        earningsWindow: { from, to },
        thresholds: {
          lowestPeMinPillars: STRONG_PILLARS,
          mostPillarsMin: ELITE_PILLARS,
          earningsMinPillars: EARNINGS_PILLARS,
          minMarketCap: MIN_MARKET_CAP_FOR_VALUE
        }
      }
    };
  }
}

module.exports = ScreenerDiscoverService;
