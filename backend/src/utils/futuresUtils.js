/**
 * Utilities for futures contract handling
 */

/**
 * Get point value for futures contracts based on underlying asset
 * @param {string} underlying - The underlying asset symbol (e.g., 'ES', 'MES', 'NQ')
 * @returns {number} Point value in dollars per point
 */
function getFuturesPointValue(underlying) {
  if (!underlying) return 50; // Default to $50 if unknown

  const upperUnderlying = underlying.toUpperCase();
  
  const pointValues = {
    // E-mini contracts
    'ES': 50,      // E-mini S&P 500
    'NQ': 20,      // E-mini NASDAQ-100
    'YM': 5,       // E-mini Dow
    'RTY': 50,     // E-mini Russell 2000

    // Micro E-mini contracts (1/10th of E-mini)
    'MES': 5,      // Micro E-mini S&P 500 (10 Micros = 1 E-mini)
    'MNQ': 2,      // Micro E-mini NASDAQ-100 (10 Micros = 1 E-mini)
    'MYM': 0.5,    // Micro E-mini Dow (10 Micros = 1 E-mini)
    'M2K': 5,      // Micro E-mini Russell 2000 (10 Micros = 1 E-mini)

    // Energy
    'CL': 1000,    // Crude Oil
    'MCL': 100,    // Micro WTI Crude Oil (1/10th of CL)
    'NG': 10000,   // Natural Gas
    'MNG': 1000,   // Micro Natural Gas (1/10th of NG)
    'QG': 2500,    // Mini Natural Gas

    // Metals
    'GC': 100,     // Gold
    'MGC': 10,     // Micro Gold (1/10th of GC)
    'SI': 5000,    // Silver
    'SIL': 1000,   // Micro Silver
    'HG': 12500,   // Copper

    // Treasuries
    'ZB': 1000,    // 30-Year Treasury Bond
    'ZN': 1000,    // 10-Year Treasury Note
    'ZF': 1000,    // 5-Year Treasury Note
    'ZT': 2000     // 2-Year Treasury Note
  };

  return pointValues[upperUnderlying] || 50; // Default to $50 multiplier
}

/**
 * Get minimum tick size for futures contracts based on underlying asset.
 * Returns the price increment of one tick (in points), or null if unknown.
 * Returning null (rather than a guessed default) is deliberate: tick sizes vary
 * widely across contracts, and a wrong value would distort breakeven tolerance.
 * @param {string} underlying - The underlying asset symbol (e.g., 'ES', 'MNQ')
 * @returns {number|null} Tick size in points, or null if unknown
 */
function getFuturesTickSize(underlying) {
  if (!underlying) return null;

  const upperUnderlying = underlying.toUpperCase();

  const tickSizes = {
    // E-mini equity index
    'ES': 0.25,    // E-mini S&P 500
    'NQ': 0.25,    // E-mini NASDAQ-100
    'YM': 1,       // E-mini Dow
    'RTY': 0.1,    // E-mini Russell 2000

    // Micro E-mini equity index
    'MES': 0.25,   // Micro E-mini S&P 500
    'MNQ': 0.25,   // Micro E-mini NASDAQ-100
    'MYM': 1,      // Micro E-mini Dow
    'M2K': 0.1,    // Micro E-mini Russell 2000

    // Energy
    'CL': 0.01,    // Crude Oil
    'MCL': 0.01,   // Micro WTI Crude Oil
    'NG': 0.001,   // Natural Gas
    'MNG': 0.001,  // Micro Natural Gas
    'QG': 0.005,   // Mini Natural Gas

    // Metals
    'GC': 0.1,     // Gold
    'MGC': 0.1,    // Micro Gold
    'SI': 0.005,   // Silver
    'SIL': 0.005,  // Micro Silver
    'HG': 0.0005,  // Copper

    // Treasuries (fractional ticks)
    'ZB': 0.03125,    // 30-Year T-Bond (1/32)
    'ZN': 0.015625,   // 10-Year T-Note (1/64)
    'ZF': 0.0078125,  // 5-Year T-Note (1/128)
    'ZT': 0.00390625  // 2-Year T-Note (1/256)
  };

  return tickSizes[upperUnderlying] ?? null;
}

/**
 * Extract underlying asset from a futures contract symbol
 * Handles formats like: ESM4, NQU24, MESZ5, CLZ23, etc.
 * @param {string} symbol - The futures contract symbol
 * @returns {string|null} The underlying asset symbol or null if not a futures format
 */
function extractUnderlyingFromFuturesSymbol(symbol) {
  if (!symbol) return null;

  const normalizedSymbol = symbol.toString().toUpperCase().trim();
  
  // Standard futures format: BASE + MONTH_CODE + YEAR (e.g., ESM4, NQU24, MESZ5, CLZ23)
  // Month codes: F,G,H,J,K,M,N,Q,U,V,X,Z
  const futuresMatch = normalizedSymbol.match(/^([A-Z]{1,4})([FGHJKMNQUVXZ])(\d{1,2})$/);
  if (futuresMatch) {
    return futuresMatch[1]; // Return the base symbol (underlying asset)
  }

  // TradingView format: NYMEX_MINI:QG1!
  const tvMatch = normalizedSymbol.match(/^([A-Z_]+):([A-Z]+)(\d+)/);
  if (tvMatch) {
    const underlying = tvMatch[2];
    // Extract just the letters if there are numbers mixed in
    const letterMatch = underlying.match(/^([A-Z]+)/);
    return letterMatch ? letterMatch[1] : underlying;
  }

  // If symbol doesn't match futures pattern, return null
  return null;
}

module.exports = {
  getFuturesPointValue,
  getFuturesTickSize,
  extractUnderlyingFromFuturesSymbol
};

