const finnhub = require('./finnhub');
const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('./futuresUtils');
const databento = require('./databento');

class MAEEstimator {
  /**
   * Resolve per-unit dollar multiplier for a trade.
   * Futures: point_value (looked up by underlying if missing).
   * Options: contract_size (default 100).
   * Stocks: 1.
   */
  static resolveMultiplier(trade) {
    const instrumentType = trade.instrument_type || 'stock';

    if (instrumentType === 'future') {
      const stored = parseFloat(trade.point_value);
      if (isFinite(stored) && stored > 0) return stored;
      const underlying = trade.underlying_asset || extractUnderlyingFromFuturesSymbol(trade.symbol);
      return getFuturesPointValue(underlying);
    }

    if (instrumentType === 'option') {
      const size = parseFloat(trade.contract_size);
      return isFinite(size) && size > 0 ? size : 100;
    }

    return 1;
  }
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

    const multiplier = this.resolveMultiplier(trade);

    // Calculate quantity from P&L since stored quantity may be 0.
    // P&L = priceMove * quantity * multiplier, so quantity = netPnl / (priceMove * multiplier).
    const priceMove = side === 'long' ?
      (parseFloat(exit_price) - parseFloat(entry_price)) :
      (parseFloat(entry_price) - parseFloat(exit_price));

    const netPnl = parseFloat(pnl) + parseFloat(commission || 0) + parseFloat(fees || 0);
    const storedQuantity = parseFloat(trade.quantity);
    const quantity = isFinite(storedQuantity) && storedQuantity > 0
      ? storedQuantity
      : Math.abs(netPnl / (priceMove * multiplier));

    console.log(`Calculated quantity for ${symbol}: ${quantity} (P&L: ${pnl}, price move: ${priceMove}, multiplier: ${multiplier})`);

    if (!quantity || quantity <= 0 || !isFinite(quantity)) {
      throw new Error(`Invalid calculated quantity: ${quantity}`);
    }

    // Providers return different shapes (Finnhub: {c,h,l} arrays; FMP: array
    // of bar objects) — normalize before use
    const candles = this.normalizeCandles(await this.getCandlesForExcursion(trade, entry_time, exit_time));

    if (!candles || candles.c.length === 0) {
      throw new Error('No candle data returned for MAE/MFE calculation');
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

    const mae = Math.abs((worstPrice - parseFloat(entry_price)) * quantity * multiplier);
    const mfe = Math.abs((bestPrice - parseFloat(entry_price)) * quantity * multiplier);

    return { mae, mfe };
  }

  static resolveQuantity(trade) {
    const { entry_price, exit_price, side, pnl, commission, fees } = trade;
    const multiplier = this.resolveMultiplier(trade);
    const priceMove = side === 'long' ?
      (parseFloat(exit_price) - parseFloat(entry_price)) :
      (parseFloat(entry_price) - parseFloat(exit_price));

    const netPnl = parseFloat(pnl) + parseFloat(commission || 0) + parseFloat(fees || 0);
    const storedQuantity = parseFloat(trade.quantity);
    const quantity = isFinite(storedQuantity) && storedQuantity > 0
      ? storedQuantity
      : Math.abs(netPnl / (priceMove * multiplier));

    if (!quantity || quantity <= 0 || !isFinite(quantity)) {
      throw new Error(`Invalid calculated quantity: ${quantity}`);
    }

    return { quantity, multiplier };
  }

  static calculateExcursionsFromCandles(trade, candles) {
    const { entry_price, side } = trade;
    const { quantity, multiplier } = this.resolveQuantity(trade);
    const normalizedCandles = this.normalizeCandles(candles);

    let worstPrice = parseFloat(entry_price);
    let bestPrice = parseFloat(entry_price);

    for (let i = 0; i < normalizedCandles.c.length; i++) {
      const high = normalizedCandles.h[i];
      const low = normalizedCandles.l[i];

      if (side === 'long') {
        worstPrice = Math.min(worstPrice, low);
        bestPrice = Math.max(bestPrice, high);
      } else {
        worstPrice = Math.max(worstPrice, high);
        bestPrice = Math.min(bestPrice, low);
      }
    }

    return {
      mae: Math.abs((worstPrice - parseFloat(entry_price)) * quantity * multiplier),
      mfe: Math.abs((bestPrice - parseFloat(entry_price)) * quantity * multiplier)
    };
  }

  static async calculatePostExitFromCandleData(trade, windowEnd) {
    if (!windowEnd || isNaN(new Date(windowEnd))) {
      throw new Error('Invalid post-exit window end');
    }

    if (new Date(windowEnd).getTime() <= new Date(trade.entry_time).getTime()) {
      throw new Error('Post-exit window must end after entry time');
    }

    const candles = this.normalizeCandles(await this.getCandlesForExcursion(trade, trade.entry_time, windowEnd));

    if (!candles || candles.c.length === 0) {
      throw new Error('No candle data returned for post-exit MAE/MFE calculation');
    }

    const { mae, mfe } = this.calculateExcursionsFromCandles(trade, candles);
    return { post_exit_mae: mae, post_exit_mfe: mfe };
  }

  /**
   * Simple estimation fallback when API data is unavailable
   * @param {Object} trade - Trade object
   * @returns {Object} - { mae, mfe }
   */
  static calculateSimpleEstimation(trade) {
    const { entry_price, exit_price, side, pnl, commission, fees } = trade;

    const multiplier = this.resolveMultiplier(trade);

    // P&L = priceMove * quantity * multiplier, so quantity = netPnl / (priceMove * multiplier).
    const priceMove = side === 'long' ?
      (parseFloat(exit_price) - parseFloat(entry_price)) :
      (parseFloat(entry_price) - parseFloat(exit_price));

    const netPnl = parseFloat(pnl) + parseFloat(commission || 0) + parseFloat(fees || 0);
    const storedQuantity = parseFloat(trade.quantity);
    const quantity = isFinite(storedQuantity) && storedQuantity > 0
      ? storedQuantity
      : Math.abs(netPnl / (priceMove * multiplier));

    if (!quantity || quantity <= 0 || !isFinite(quantity)) {
      throw new Error(`Invalid calculated quantity: ${quantity}`);
    }

    const entryPrice = parseFloat(entry_price);
    const exitPrice = parseFloat(exit_price);
    const grossPnl = parseFloat(pnl);

    // Simple estimation based on price movement and trade outcome.
    // All "price * quantity" terms are multiplied by `multiplier` so dollar
    // amounts are correct for futures (point_value) and options (contract_size).
    let mae, mfe;

    if (side === 'long') {
      if (grossPnl >= 0) {
        // Winning long trade - estimate MAE as small retracement
        mae = Math.abs(entryPrice * 0.02 * quantity * multiplier); // 2% retracement
        mfe = Math.abs((exitPrice - entryPrice) * quantity * multiplier * 1.1); // 10% overshoot
      } else {
        // Losing long trade - exit was likely near the worst
        mae = Math.abs(grossPnl);
        mfe = Math.abs(entryPrice * 0.01 * quantity * multiplier); // 1% favorable move
      }
    } else {
      if (grossPnl >= 0) {
        // Winning short trade
        mae = Math.abs(entryPrice * 0.02 * quantity * multiplier); // 2% adverse move
        mfe = Math.abs((entryPrice - exitPrice) * quantity * multiplier * 1.1); // 10% overshoot
      } else {
        // Losing short trade
        mae = Math.abs(grossPnl);
        mfe = Math.abs(entryPrice * 0.01 * quantity * multiplier); // 1% favorable move
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

  static getDatabentoInterval(entryTime, exitTime) {
    const durationMinutes = (new Date(exitTime) - new Date(entryTime)) / 60000;
    if (durationMinutes < 1440) return 'minute';
    if (durationMinutes < 10080) return 'hour';
    return 'day';
  }

  static normalizeCandles(candles) {
    if (!candles) return { h: [], l: [], c: [] };
    if (Array.isArray(candles)) {
      return {
        h: candles.map(candle => Number(candle.high)),
        l: candles.map(candle => Number(candle.low)),
        c: candles.map(candle => Number(candle.close))
      };
    }
    return candles;
  }

  static async getCandlesForExcursion(trade, startTime, endTime) {
    const instrumentType = trade.instrument_type || trade.instrumentType || 'stock';

    if (instrumentType === 'future') {
      if (!databento.isConfigured()) {
        throw new Error('Databento API key not configured for futures MAE/MFE calculation');
      }

      const underlying = trade.underlying_asset || trade.underlyingAsset || extractUnderlyingFromFuturesSymbol(trade.symbol);
      if (!underlying) {
        throw new Error(`Cannot resolve futures underlying for ${trade.symbol}`);
      }

      const fromDate = new Date(startTime);
      const toDate = new Date(endTime);
      const fromSeconds = Math.floor(fromDate.getTime() / 1000);
      const toSeconds = Math.floor(toDate.getTime() / 1000);
      const candles = await databento.getFuturesCandles(underlying, fromDate, toDate, this.getDatabentoInterval(startTime, endTime));
      const filteredCandles = candles.filter(candle => candle.time >= fromSeconds && candle.time <= toSeconds);
      const finalCandles = filteredCandles.length > 0 ? filteredCandles : candles;

      return this.normalizeCandles(finalCandles);
    }

    const resolution = this.getResolutionForTrade(startTime, endTime);
    const from = Math.floor(new Date(startTime).getTime() / 1000);
    const to = Math.floor(new Date(endTime).getTime() / 1000);
    return finnhub.getCandles(trade.symbol, resolution, from, to);
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
