const finnhub = require('./finnhub');

class MAEEstimator {
  /**
   * Estimate MAE and MFE for multiple trades using historical data
   * @param {Array} trades - Array of trade objects
   * @returns {Object} - { avgMAE, avgMFE, count }
   */
  static async estimateForTrades(trades) {
    let totalMAE = 0;
    let totalMFE = 0;
    let validCount = 0;
    let processedCount = 0;
    const maxProcessCount = 20; // Limit to prevent API rate limits

    console.log('--- MAE/MFE Estimation Debug ---');
    console.log(`Processing ${Math.min(trades.length, maxProcessCount)} of ${trades.length} trades for MAE/MFE...`);

    for (const trade of trades) {
      if (processedCount >= maxProcessCount) {
        console.log(`Reached maximum processing limit of ${maxProcessCount} trades`);
        break;
      }

      const isValid = this.isValidTradeForEstimation(trade);
      if (!isValid) {
        console.log(`Skipping invalid trade: ${trade.symbol} (ID: ${trade.id}) - Reason:`, this.getInvalidReason(trade));
        continue;
      }

      processedCount++;

      try {
        // Use simple estimation by default for faster loading
        const { mae, mfe } = this.calculateSimpleEstimation(trade);
        
        if (validCount < 3) {
          console.log(`MAE/MFE estimation for ${trade.symbol}: MAE=${mae}, MFE=${mfe}`);
        }
        
        totalMAE += mae;
        totalMFE += mfe;
        validCount++;
      } catch (error) {
        console.error(`Simple estimation failed for ${trade.symbol}:`, error.message);
      }
    }

    console.log(`Successfully calculated MAE/MFE for ${validCount} trades.`);
    console.log('--- End MAE/MFE Estimation Debug ---');

    return {
      avgMAE: validCount > 0 ? (totalMAE / validCount).toFixed(2) : 'N/A',
      avgMFE: validCount > 0 ? (totalMFE / validCount).toFixed(2) : 'N/A',
      count: validCount
    };
  }

  /**
   * Calculate MAE/MFE from historical candle data
   * @param {Object} trade - Trade object
   * @returns {Object} - { mae, mfe }
   */
  static async calculateFromCandleData(trade) {
    const { symbol, entry_time, exit_time, entry_price, exit_price, side, pnl, commission, fees } = trade;
    
    // Calculate quantity from P&L since stored quantity is 0
    const priceMove = side === 'long' ? 
      (parseFloat(exit_price) - parseFloat(entry_price)) :
      (parseFloat(entry_price) - parseFloat(exit_price));
    
    const netPnl = parseFloat(pnl) + parseFloat(commission || 0) + parseFloat(fees || 0);
    const quantity = Math.abs(netPnl / priceMove);
    
    console.log(`Calculated quantity for ${symbol}: ${quantity} (P&L: ${pnl}, price move: ${priceMove})`);
    
    if (!quantity || quantity <= 0 || !isFinite(quantity)) {
      throw new Error(`Invalid calculated quantity: ${quantity}`);
    }
    
    const resolution = this.getResolutionForTrade(entry_time, exit_time);
    const from = Math.floor(new Date(entry_time).getTime() / 1000);
    const to = Math.floor(new Date(exit_time).getTime() / 1000);

    const candles = await finnhub.getCandles(symbol, resolution, from, to);

    if (!candles || candles.c.length === 0) {
      throw new Error('No candle data returned from Finnhub');
    }

    let worstPrice = parseFloat(entry_price);
    let bestPrice = parseFloat(entry_price);

    for (let i = 0; i < candles.c.length; i++) {
      const high = candles.h[i];
      const low = candles.l[i];

      if (side === 'long') {
        worstPrice = Math.min(worstPrice, low);
        bestPrice = Math.max(bestPrice, high);
      } else { // short
        worstPrice = Math.max(worstPrice, high);
        bestPrice = Math.min(bestPrice, low);
      }
    }

    const mae = Math.abs((worstPrice - parseFloat(entry_price)) * quantity);
    const mfe = Math.abs((bestPrice - parseFloat(entry_price)) * quantity);

    return { mae, mfe };
  }

  /**
   * Simple estimation fallback when API data is unavailable
   * @param {Object} trade - Trade object
   * @returns {Object} - { mae, mfe }
   */
  static calculateSimpleEstimation(trade) {
    const { entry_price, exit_price, side, pnl, commission, fees } = trade;
    
    // Calculate quantity from P&L
    const priceMove = side === 'long' ? 
      (parseFloat(exit_price) - parseFloat(entry_price)) :
      (parseFloat(entry_price) - parseFloat(exit_price));
    
    const netPnl = parseFloat(pnl) + parseFloat(commission || 0) + parseFloat(fees || 0);
    const quantity = Math.abs(netPnl / priceMove);
    
    if (!quantity || quantity <= 0 || !isFinite(quantity)) {
      throw new Error(`Invalid calculated quantity: ${quantity}`);
    }
    
    const entryPrice = parseFloat(entry_price);
    const exitPrice = parseFloat(exit_price);
    const grossPnl = parseFloat(pnl);
    
    // Simple estimation based on price movement and trade outcome
    let mae, mfe;
    
    if (side === 'long') {
      if (grossPnl >= 0) {
        // Winning long trade - estimate MAE as small retracement
        mae = Math.abs(entryPrice * 0.02 * quantity); // 2% retracement
        mfe = Math.abs((exitPrice - entryPrice) * quantity * 1.1); // 10% overshoot
      } else {
        // Losing long trade - exit was likely near the worst
        mae = Math.abs(grossPnl);
        mfe = Math.abs(entryPrice * 0.01 * quantity); // 1% favorable move
      }
    } else {
      if (grossPnl >= 0) {
        // Winning short trade
        mae = Math.abs(entryPrice * 0.02 * quantity); // 2% adverse move
        mfe = Math.abs((entryPrice - exitPrice) * quantity * 1.1); // 10% overshoot
      } else {
        // Losing short trade
        mae = Math.abs(grossPnl);
        mfe = Math.abs(entryPrice * 0.01 * quantity); // 1% favorable move
      }
    }
    
    return { mae, mfe };
  }

  /**
   * Determine appropriate candle resolution based on trade duration
   * @param {string} entryTime - ISO 8601 format
   * @param {string} exitTime - ISO 8601 format
   * @returns {string} - Finnhub resolution string (e.g., '1', '5', 'D')
   */
  static getResolutionForTrade(entryTime, exitTime) {
    const durationMinutes = (new Date(exitTime) - new Date(entryTime)) / 60000;

    if (durationMinutes < 60) return '1'; // 1-minute candles for trades under 1 hour
    if (durationMinutes < 300) return '5'; // 5-minute candles for trades under 5 hours
    if (durationMinutes < 1440) return '15'; // 15-minute candles for intraday trades
    if (durationMinutes < 10080) return '60'; // 1-hour candles for trades up to a week
    return 'D'; // Daily candles for longer trades
  }

  /**
   * Check if trade has required data for MAE/MFE estimation
   */
  static isValidTradeForEstimation(trade) {
    return (
      trade.symbol &&
      trade.entry_time &&
      trade.exit_time &&
      trade.entry_price !== null &&
      trade.exit_price !== null &&
      trade.side !== null &&
      trade.pnl !== null &&
      !isNaN(new Date(trade.entry_time)) &&
      !isNaN(new Date(trade.exit_time)) &&
      !isNaN(parseFloat(trade.entry_price)) &&
      !isNaN(parseFloat(trade.exit_price)) &&
      !isNaN(parseFloat(trade.pnl)) &&
      parseFloat(trade.entry_price) > 0 &&
      parseFloat(trade.exit_price) > 0
    );
  }

  static getInvalidReason(trade) {
    if (!trade.symbol) return 'Missing symbol';
    if (!trade.entry_time) return 'Missing entry_time';
    if (!trade.exit_time) return 'Missing exit_time';
    if (trade.entry_price === null) return 'Missing entry_price';
    if (trade.exit_price === null) return 'Missing exit_price';
    if (trade.side === null) return 'Missing side';
    if (trade.pnl === null) return 'Missing pnl';
    if (isNaN(new Date(trade.entry_time))) return 'Invalid entry_time';
    if (isNaN(new Date(trade.exit_time))) return 'Invalid exit_time';
    if (isNaN(parseFloat(trade.entry_price))) return 'Invalid entry_price';
    if (isNaN(parseFloat(trade.exit_price))) return 'Invalid exit_price';
    if (isNaN(parseFloat(trade.pnl))) return 'Invalid pnl';
    if (parseFloat(trade.entry_price) <= 0) return 'Entry price is not positive';
    if (parseFloat(trade.exit_price) <= 0) return 'Exit price is not positive';
    return 'Unknown reason';
  }
}

module.exports = MAEEstimator;