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
    'NG': 10000,   // Natural Gas
    'QG': 2500,    // Mini Natural Gas

    // Metals
    'GC': 100,     // Gold
    'SI': 5000,    // Silver
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
  extractUnderlyingFromFuturesSymbol
};

