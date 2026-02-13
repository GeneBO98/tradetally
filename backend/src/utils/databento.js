/**
 * Databento API Client for CME Futures Data
 *
 * Databento provides historical and real-time futures data from CME Globex
 * including ES (E-mini S&P 500), NQ (E-mini NASDAQ), MES, MNQ, etc.
 *
 * API Documentation: https://databento.com/docs/api-reference-historical
 * Free credits: $125 on signup
 */

const https = require('https');

class DatabentoClient {
  constructor() {
    this.apiKey = process.env.DATABENTO_API_KEY;
    this.baseUrl = 'hist.databento.com';
    this.dataset = 'GLBX.MDP3'; // CME Globex
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Make an authenticated request to Databento API
   */
  async makeRequest(endpoint, params = {}) {
    if (!this.apiKey) {
      throw new Error('Databento API key not configured');
    }

    const queryString = new URLSearchParams(params).toString();
    const path = `/v0/${endpoint}${queryString ? '?' + queryString : ''}`;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(this.apiKey + ':').toString('base64'),
          'Accept': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              // Databento returns newline-delimited JSON for streaming
              // Parse each line as a separate JSON object
              const lines = data.trim().split('\n').filter(line => line);
              const records = lines.map(line => {
                try {
                  return JSON.parse(line);
                } catch (e) {
                  return null;
                }
              }).filter(r => r !== null);

              resolve(records);
            } catch (e) {
              // Try parsing as single JSON
              try {
                resolve(JSON.parse(data));
              } catch (e2) {
                reject(new Error(`Failed to parse Databento response: ${e2.message}`));
              }
            }
          } else if (res.statusCode === 401) {
            reject(new Error('Databento API authentication failed. Check your API key.'));
          } else if (res.statusCode === 402) {
            reject(new Error('Databento API: Insufficient credits or payment required.'));
          } else {
            reject(new Error(`Databento API error (${res.statusCode}): ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Databento request failed: ${error.message}`));
      });

      req.end();
    });
  }

  /**
   * Map futures symbol to Databento continuous contract symbol
   * ES -> ES.c.0 (front month continuous)
   * NQ -> NQ.c.0
   */
  getContinuousSymbol(underlying) {
    const upperSymbol = underlying.toUpperCase();
    // Databento continuous contract format: SYMBOL.c.0 for front month
    return `${upperSymbol}.c.0`;
  }

  /**
   * Get OHLCV candle data for a futures symbol
   * @param {string} symbol - Futures symbol (ES, NQ, MES, MNQ, etc.)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} interval - 'minute', 'hour', or 'day'
   */
  async getFuturesCandles(symbol, startDate, endDate, interval = 'minute') {
    const upperSymbol = symbol.toUpperCase();
    const continuousSymbol = this.getContinuousSymbol(upperSymbol);

    // Map interval to Databento schema
    const schemaMap = {
      'minute': 'ohlcv-1m',
      '5minute': 'ohlcv-1m', // Databento has 1m, we'll aggregate if needed
      'hour': 'ohlcv-1h',
      'day': 'ohlcv-1d'
    };

    const schema = schemaMap[interval] || 'ohlcv-1m';

    // Format dates as ISO strings (YYYY-MM-DD)
    // Add one day to end date because Databento's end parameter is exclusive
    const start = startDate.toISOString().split('T')[0];
    const endPlusOne = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
    const end = endPlusOne.toISOString().split('T')[0];

    console.log(`[DATABENTO] Fetching ${schema} data for ${continuousSymbol} from ${start} to ${end} (inclusive)`);

    try {
      const records = await this.makeRequest('timeseries.get_range', {
        dataset: this.dataset,
        symbols: continuousSymbol,
        schema: schema,
        start: start,
        end: end,
        stype_in: 'continuous',
        encoding: 'json'
      });

      if (!records || records.length === 0) {
        throw new Error(`No data available for ${symbol}`);
      }

      // Debug: Log first record structure to understand the format
      console.log(`[DATABENTO] Raw record sample:`, JSON.stringify(records[0], null, 2));

      // Convert Databento records to standard candle format
      // Databento OHLCV structure varies - check for different field paths
      const PRICE_SCALE = 1000000000; // Prices are in nanodollars (10^-9)
      const TIME_SCALE = 1000000000;  // Timestamps are in nanoseconds
      const TIME_SCALE_MS = 1000000;  // If timestamps are in microseconds

      const candles = records.map((record, index) => {
        // Try different timestamp field paths that Databento might use
        let tsRaw = null;
        if (record.hd && record.hd.ts_event) {
          tsRaw = record.hd.ts_event;
        } else if (record.ts_event) {
          tsRaw = record.ts_event;
        } else if (record.ts_recv) {
          tsRaw = record.ts_recv;
        }

        // Parse timestamp - could be nanoseconds or already in seconds
        let timeSeconds;
        const tsNum = Number(tsRaw);

        if (tsNum > 1e18) {
          // Nanoseconds (19 digits for 2020s dates)
          timeSeconds = Math.floor(tsNum / TIME_SCALE);
        } else if (tsNum > 1e15) {
          // Microseconds (16 digits)
          timeSeconds = Math.floor(tsNum / TIME_SCALE_MS);
        } else if (tsNum > 1e12) {
          // Milliseconds (13 digits)
          timeSeconds = Math.floor(tsNum / 1000);
        } else {
          // Already in seconds
          timeSeconds = Math.floor(tsNum);
        }

        // Debug first few records
        if (index < 3) {
          console.log(`[DATABENTO] Record ${index}: ts_raw=${tsRaw}, timeSeconds=${timeSeconds}, date=${new Date(timeSeconds * 1000).toISOString()}`);
          console.log(`[DATABENTO] Record ${index}: open=${record.open}, close=${record.close}`);
        }

        return {
          time: timeSeconds,
          open: Number(record.open) / PRICE_SCALE,
          high: Number(record.high) / PRICE_SCALE,
          low: Number(record.low) / PRICE_SCALE,
          close: Number(record.close) / PRICE_SCALE,
          volume: Number(record.volume)
        };
      });

      // Log candle time range
      if (candles.length > 0) {
        const firstCandle = candles[0];
        const lastCandle = candles[candles.length - 1];
        console.log(`[DATABENTO] Candle time range: ${new Date(firstCandle.time * 1000).toISOString()} to ${new Date(lastCandle.time * 1000).toISOString()}`);
        console.log(`[DATABENTO] Price range: $${firstCandle.open.toFixed(2)} - $${lastCandle.close.toFixed(2)}`);
      }

      console.log(`[DATABENTO] Retrieved ${candles.length} candles for ${symbol}`);
      return candles;

    } catch (error) {
      console.error(`[DATABENTO] Error fetching data for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get chart data for a futures trade
   * @param {string} symbol - Futures symbol
   * @param {Date} entryDate - Trade entry date
   * @param {Date} exitDate - Trade exit date (optional)
   */
  async getTradeChartData(symbol, entryDate, exitDate = null) {
    const entryTime = new Date(entryDate);
    const exitTime = exitDate ? new Date(exitDate) : new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneHourMs = 60 * 60 * 1000;

    console.log(`[DATABENTO] getTradeChartData called with:`, {
      symbol,
      entryDate: entryTime.toISOString(),
      exitDate: exitTime.toISOString()
    });

    // Calculate trade duration
    const tradeDuration = exitTime - entryTime;
    const tradeDurationHours = tradeDuration / oneHourMs;

    // Calculate chart window based on trade duration
    // Show context before entry and after exit
    let chartFromTime, chartToTime;
    let interval = 'minute';

    if (tradeDurationHours < 4) {
      // Short trade (< 4 hours): Show 2 hours before entry and 1 hour after exit
      chartFromTime = new Date(entryTime.getTime() - 2 * oneHourMs);
      chartToTime = new Date(exitTime.getTime() + oneHourMs);
      interval = 'minute';
    } else if (tradeDurationHours < 24) {
      // Day trade: Show from start of trading session
      chartFromTime = new Date(entryTime.getTime() - 4 * oneHourMs);
      chartToTime = new Date(exitTime.getTime() + 2 * oneHourMs);
      interval = 'minute';
    } else if (tradeDurationHours < 7 * 24) {
      // Multi-day trade (< 1 week): Use hourly candles
      chartFromTime = new Date(entryTime.getTime() - oneDayMs);
      chartToTime = new Date(exitTime.getTime() + oneDayMs);
      interval = 'hour';
    } else {
      // Longer trade: Use daily candles
      chartFromTime = new Date(entryTime.getTime() - 3 * oneDayMs);
      chartToTime = new Date(exitTime.getTime() + 3 * oneDayMs);
      interval = 'day';
    }

    // Check for weekend - futures trade Sunday 6pm ET to Friday 5pm ET
    const dayOfWeek = entryTime.getUTCDay();
    const exitDayOfWeek = exitTime.getUTCDay();

    // Expand window if trade is on weekend
    if (dayOfWeek === 0 || dayOfWeek === 6 || exitDayOfWeek === 0 || exitDayOfWeek === 6) {
      console.log(`[DATABENTO] Weekend trade detected, expanding window to include both Friday and Sunday data`);

      // Find the previous Friday
      let fridayDate = new Date(entryTime);
      while (fridayDate.getUTCDay() !== 5) {
        fridayDate = new Date(fridayDate.getTime() - oneDayMs);
      }
      // Start from Friday morning
      chartFromTime = new Date(fridayDate.toISOString().split('T')[0] + 'T00:00:00.000Z');

      // Extend to include Sunday evening (market opens at 23:00 UTC)
      let sundayDate = new Date(entryTime);
      while (sundayDate.getUTCDay() !== 0) {
        sundayDate = new Date(sundayDate.getTime() + oneDayMs);
      }
      // End after Sunday's first session
      chartToTime = new Date(sundayDate.getTime() + 2 * oneDayMs);
    }

    // For very short trades, ensure we have enough context
    const chartDuration = chartToTime - chartFromTime;
    if (chartDuration < 6 * oneHourMs) {
      // Minimum 6 hours of data
      chartFromTime = new Date(entryTime.getTime() - 3 * oneHourMs);
      chartToTime = new Date(exitTime.getTime() + 3 * oneHourMs);
    }

    console.log(`[DATABENTO] Chart request for ${symbol}:`, {
      from: chartFromTime.toISOString(),
      to: chartToTime.toISOString(),
      interval,
      tradeDurationHours: tradeDurationHours.toFixed(2)
    });

    try {
      const candles = await this.getFuturesCandles(symbol, chartFromTime, chartToTime, interval);

      // Get entry/exit timestamps for comparison
      const entryTimestamp = Math.floor(entryTime.getTime() / 1000);
      const exitTimestamp = Math.floor(exitTime.getTime() / 1000);
      const isWeekendTrade = dayOfWeek === 0 || dayOfWeek === 6 || exitDayOfWeek === 0 || exitDayOfWeek === 6;

      // For weekend trades, don't filter - show all available candles to span the gap
      let filteredCandles;
      if (isWeekendTrade) {
        console.log(`[DATABENTO] Weekend trade - showing all ${candles.length} candles without filtering`);
        filteredCandles = candles;
      } else {
        // Filter candles to ensure they're within our window
        const fromTimestamp = Math.floor(chartFromTime.getTime() / 1000);
        const toTimestamp = Math.floor(chartToTime.getTime() / 1000);

        filteredCandles = candles.filter(c => {
          return c.time >= fromTimestamp && c.time <= toTimestamp;
        });
        console.log(`[DATABENTO] Filtered to ${filteredCandles.length} candles in trade window`);
      }

      // Check if trade entry/exit times are within actual candle data (not just the overall range)
      // For weekend trades, we need to check if the trade time falls in the market closure gap
      const finalCandles = filteredCandles.length > 0 ? filteredCandles : candles;
      let tradeInMarketHours = true;
      let marketHoursWarning = null;

      if (finalCandles.length > 0) {
        // Find the closest candle to the entry time
        let minEntryDiff = Infinity;
        let closestEntryCandle = finalCandles[0];
        for (const candle of finalCandles) {
          const diff = Math.abs(candle.time - entryTimestamp);
          if (diff < minEntryDiff) {
            minEntryDiff = diff;
            closestEntryCandle = candle;
          }
        }

        // If the closest candle is more than 5 minutes away, the trade is likely during market closure
        const fiveMinutes = 5 * 60;
        if (minEntryDiff > fiveMinutes) {
          tradeInMarketHours = false;
          const entryISO = entryTime.toISOString();
          const closestISO = new Date(closestEntryCandle.time * 1000).toISOString();
          const gapMinutes = Math.round(minEntryDiff / 60);
          marketHoursWarning = `Trade entry time (${entryISO}) is ${gapMinutes} minutes away from nearest market data (${closestISO}). The trade may have occurred during market closure.`;
          console.log(`[DATABENTO] WARNING: ${marketHoursWarning}`);
        }

        // Also check exit time
        let minExitDiff = Infinity;
        for (const candle of finalCandles) {
          const diff = Math.abs(candle.time - exitTimestamp);
          if (diff < minExitDiff) {
            minExitDiff = diff;
          }
        }

        if (minExitDiff > fiveMinutes && !marketHoursWarning) {
          tradeInMarketHours = false;
          const exitISO = exitTime.toISOString();
          const gapMinutes = Math.round(minExitDiff / 60);
          marketHoursWarning = `Trade exit time (${exitISO}) is ${gapMinutes} minutes away from nearest market data. The trade may have occurred during market closure.`;
          console.log(`[DATABENTO] WARNING: ${marketHoursWarning}`);
        }
      }

      return {
        type: interval === 'day' ? 'daily' : 'intraday',
        interval: interval === 'minute' ? '1min' : interval === 'hour' ? '1hour' : 'daily',
        candles: finalCandles,
        source: 'databento',
        symbol: symbol,
        isFutures: true,
        tradeInMarketHours,
        marketHoursWarning
      };
    } catch (error) {
      console.error(`[DATABENTO] Failed to get chart data for ${symbol}:`, error.message);
      throw error;
    }
  }
}

// Export singleton instance
const databento = new DatabentoClient();

module.exports = databento;
