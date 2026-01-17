/**
 * IBKR Flex Web Service Integration
 * Fetches trade data from Interactive Brokers using the Flex Query API
 *
 * API Documentation: https://www.interactivebrokers.com/en/software/am/am/reports/flex_web_service_version_3.htm
 */

const axios = require('axios');
const { parseCSV } = require('../../utils/csvParser');
const Trade = require('../../models/Trade');
const BrokerConnection = require('../../models/BrokerConnection');
const db = require('../../config/database');

const FLEX_BASE_URL = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService';
const REPORT_REQUEST_TIMEOUT = 120000; // 2 minutes to request report
const REPORT_POLL_INTERVAL = 5000; // Poll every 5 seconds
const REPORT_MAX_WAIT = 300000; // Max 5 minutes to wait for report

class IBKRService {
  /**
   * Validate IBKR credentials by requesting a test report
   * @param {string} flexToken - IBKR Flex Token
   * @param {string} queryId - Flex Query ID
   * @returns {Promise<{valid: boolean, message: string}>}
   */
  async validateCredentials(flexToken, queryId) {
    console.log('[IBKR] Validating credentials...');

    try {
      // Request a report to validate credentials
      const response = await this.requestFlexReport(flexToken, queryId);

      if (response.referenceCode) {
        console.log('[IBKR] Credentials validated successfully');
        return { valid: true, message: 'Credentials validated successfully' };
      }

      return { valid: false, message: response.error || 'Unknown validation error' };
    } catch (error) {
      console.error('[IBKR] Credential validation failed:', error.message);
      return { valid: false, message: error.message };
    }
  }

  /**
   * Request a Flex report generation
   * @param {string} flexToken - IBKR Flex Token
   * @param {string} queryId - Flex Query ID
   * @returns {Promise<{referenceCode: string} | {error: string}>}
   */
  async requestFlexReport(flexToken, queryId) {
    console.log('[IBKR] Requesting Flex report...');

    const url = `${FLEX_BASE_URL}.SendRequest`;
    const params = {
      t: flexToken,
      q: queryId,
      v: '3' // API version
    };

    try {
      const response = await axios.get(url, {
        params,
        timeout: REPORT_REQUEST_TIMEOUT
      });

      // Parse XML response
      const data = response.data;
      console.log('[IBKR] Request response:', data.substring(0, 500));

      // Check for errors in response
      if (data.includes('<ErrorCode>')) {
        const errorCodeMatch = data.match(/<ErrorCode>(\d+)<\/ErrorCode>/);
        const errorMsgMatch = data.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
        const errorCode = errorCodeMatch ? errorCodeMatch[1] : 'Unknown';
        const errorMsg = errorMsgMatch ? errorMsgMatch[1] : 'Unknown error';

        throw new Error(this.getErrorMessage(errorCode, errorMsg));
      }

      // Extract reference code
      const refCodeMatch = data.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/);
      if (!refCodeMatch) {
        throw new Error('Failed to get reference code from IBKR response');
      }

      const referenceCode = refCodeMatch[1];
      console.log('[IBKR] Got reference code:', referenceCode);

      return { referenceCode };
    } catch (error) {
      if (error.response) {
        console.error('[IBKR] API error response:', error.response.data);
        throw new Error(`IBKR API error: ${error.response.status}`);
      }
      throw error;
    }
  }

  /**
   * Fetch the generated Flex report
   * @param {string} referenceCode - Report reference code
   * @param {string} flexToken - IBKR Flex Token
   * @returns {Promise<string>} - CSV data
   */
  async fetchFlexReport(referenceCode, flexToken) {
    console.log('[IBKR] Fetching Flex report...');

    const url = `${FLEX_BASE_URL}.GetStatement`;
    const params = {
      t: flexToken,
      q: referenceCode,
      v: '3'
    };

    const startTime = Date.now();

    while (Date.now() - startTime < REPORT_MAX_WAIT) {
      try {
        const response = await axios.get(url, {
          params,
          timeout: 60000
        });

        const data = response.data;

        // Check if report is still being generated
        if (data.includes('<ErrorCode>1019</ErrorCode>')) {
          console.log('[IBKR] Report still generating, waiting...');
          await this.sleep(REPORT_POLL_INTERVAL);
          continue;
        }

        // Check for other errors
        if (data.includes('<ErrorCode>')) {
          const errorCodeMatch = data.match(/<ErrorCode>(\d+)<\/ErrorCode>/);
          const errorMsgMatch = data.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
          const errorCode = errorCodeMatch ? errorCodeMatch[1] : 'Unknown';
          const errorMsg = errorMsgMatch ? errorMsgMatch[1] : 'Unknown error';

          throw new Error(this.getErrorMessage(errorCode, errorMsg));
        }

        // If we got CSV data, return it
        if (!data.includes('<?xml') && data.includes(',')) {
          console.log('[IBKR] Got CSV report, length:', data.length);
          return data;
        }

        // Handle unexpected response format
        console.warn('[IBKR] Unexpected response format:', data.substring(0, 200));
        await this.sleep(REPORT_POLL_INTERVAL);
      } catch (error) {
        if (error.code === 'ECONNABORTED') {
          console.warn('[IBKR] Request timeout, retrying...');
          await this.sleep(REPORT_POLL_INTERVAL);
          continue;
        }
        throw error;
      }
    }

    throw new Error('Timeout waiting for IBKR report generation');
  }

  /**
   * Sync trades from IBKR
   * @param {object} connection - BrokerConnection object with credentials
   * @param {object} options - Sync options
   * @returns {Promise<{imported: number, skipped: number, failed: number, duplicates: number}>}
   */
  async syncTrades(connection, options = {}) {
    const { startDate, endDate, syncLogId } = options;

    console.log(`[IBKR] Starting sync for connection ${connection.id}`);
    console.log(`[IBKR] Date range: ${startDate || 'default'} to ${endDate || 'default'}`);

    // Update sync log status
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'fetching');
    }

    // Request and fetch report
    const reportResponse = await this.requestFlexReport(
      connection.ibkrFlexToken,
      connection.ibkrFlexQueryId
    );

    if (!reportResponse.referenceCode) {
      throw new Error('Failed to request IBKR report');
    }

    const csvData = await this.fetchFlexReport(
      reportResponse.referenceCode,
      connection.ibkrFlexToken
    );

    // Update sync log status
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'parsing');
    }

    // Detect broker format (Activity Statement vs Trade Confirmation)
    const brokerFormat = this.detectIBKRFormat(csvData);
    console.log(`[IBKR] Detected format: ${brokerFormat}`);

    // Fetch existing positions and trades for duplicate detection
    const existingContext = await this.getExistingContext(connection.userId);

    // Parse CSV using existing parser
    const parseResult = await parseCSV(
      Buffer.from(csvData, 'utf8'),
      brokerFormat,
      existingContext
    );

    let trades = Array.isArray(parseResult) ? parseResult : parseResult.trades;
    console.log(`[IBKR] Parsed ${trades.length} trades`);

    // Update sync log with fetched count
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'importing', {
        tradesFetched: trades.length
      });
    }

    // Filter by date range if specified
    if (startDate || endDate) {
      trades = this.filterByDateRange(trades, startDate, endDate);
      console.log(`[IBKR] After date filter: ${trades.length} trades`);
    }

    // Import trades
    const result = await this.importTrades(connection.userId, trades, existingContext);

    console.log(`[IBKR] Sync complete: ${result.imported} imported, ${result.skipped} skipped, ${result.duplicates} duplicates, ${result.failed} failed`);

    return result;
  }

  /**
   * Import parsed trades into the database
   */
  async importTrades(userId, trades, existingContext) {
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let duplicates = 0;

    const existingTrades = await this.getExistingTradesForDuplicateCheck(userId);

    for (const tradeData of trades) {
      try {
        // Check for duplicates
        const isDuplicate = this.isDuplicateTrade(tradeData, existingTrades, existingContext);

        if (isDuplicate) {
          duplicates++;
          continue;
        }

        // Prepare trade data
        const preparedTrade = this.prepareTrade(tradeData);

        // Create trade
        await Trade.create(userId, preparedTrade, {
          skipAchievements: true,
          skipApiCalls: true
        });

        imported++;
      } catch (error) {
        console.error(`[IBKR] Failed to import trade:`, error.message);
        failed++;
      }
    }

    return { imported, skipped, failed, duplicates };
  }

  /**
   * Detect which IBKR CSV format we're dealing with
   */
  detectIBKRFormat(csvData) {
    const headerLine = csvData.split('\n')[0].toLowerCase();

    if (headerLine.includes('underlyingsymbol') && headerLine.includes('strike') &&
        headerLine.includes('expiry') && headerLine.includes('put/call')) {
      return 'ibkr_trade_confirmation';
    }

    return 'ibkr';
  }

  /**
   * Get existing positions and executions for context-aware parsing
   */
  async getExistingContext(userId) {
    // Helper function to build composite key for options
    // For options: symbol_strike_expiration_type (e.g., "GIS_66_2024-02-23_call")
    // For stocks: just symbol
    const buildPositionKey = (row) => {
      if (row.instrument_type === 'option' && row.strike_price && row.expiration_date && row.option_type) {
        // Format expiration date consistently (YYYY-MM-DD)
        const expDate = row.expiration_date instanceof Date
          ? row.expiration_date.toISOString().split('T')[0]
          : String(row.expiration_date).split('T')[0];
        // Normalize strike price to remove trailing zeros (66.0000 -> 66)
        const normalizedStrike = parseFloat(row.strike_price);
        return `${row.symbol}_${normalizedStrike}_${expDate}_${row.option_type}`;
      }
      return row.symbol;
    };

    // Fetch open positions with option fields and conid
    const openPositionsQuery = `
      SELECT id, symbol, side, quantity, entry_price, entry_time, trade_date, commission, broker, executions,
             instrument_type, strike_price, expiration_date, option_type, conid
      FROM trades
      WHERE user_id = $1
      AND exit_price IS NULL
      AND exit_time IS NULL
      ORDER BY symbol, entry_time
    `;
    const openPositionsResult = await db.query(openPositionsQuery, [userId]);

    // Fetch completed trades for duplicate detection with option fields and conid
    const completedTradesQuery = `
      SELECT id, symbol, executions, instrument_type, strike_price, expiration_date, option_type, conid
      FROM trades
      WHERE user_id = $1
      AND exit_price IS NOT NULL
      AND executions IS NOT NULL
      ORDER BY symbol, entry_time
    `;
    const completedTradesResult = await db.query(completedTradesQuery, [userId]);

    // Build existing positions map with composite keys for options
    const existingPositions = {};
    openPositionsResult.rows.forEach(row => {
      let parsedExecutions = [];
      if (row.executions) {
        try {
          parsedExecutions = typeof row.executions === 'string'
            ? JSON.parse(row.executions)
            : row.executions;
        } catch (e) {
          parsedExecutions = [];
        }
      }

      // Build composite key for options to keep different contracts separate
      const positionKey = buildPositionKey(row);

      const positionData = {
        id: row.id,
        symbol: row.symbol,
        side: row.side,
        quantity: parseInt(row.quantity),
        entryPrice: parseFloat(row.entry_price),
        entryTime: row.entry_time,
        tradeDate: row.trade_date,
        commission: parseFloat(row.commission) || 0,
        broker: row.broker,
        executions: parsedExecutions,
        // Include option metadata for matching
        instrumentType: row.instrument_type,
        strikePrice: row.strike_price ? parseFloat(row.strike_price) : null,
        expirationDate: row.expiration_date,
        optionType: row.option_type,
        conid: row.conid
      };

      // Store by composite key (primary)
      existingPositions[positionKey] = positionData;

      // Also store by conid key if available (for IBKR reliable matching)
      if (row.conid) {
        existingPositions[`conid_${row.conid}`] = positionData;
      }
    });

    // Build existing executions map with composite keys for options
    const existingExecutions = {};
    completedTradesResult.rows.forEach(row => {
      let parsedExecutions = [];
      if (row.executions) {
        try {
          parsedExecutions = typeof row.executions === 'string'
            ? JSON.parse(row.executions)
            : row.executions;
        } catch (e) {
          parsedExecutions = [];
        }
      }

      // Use composite key for options
      const executionKey = buildPositionKey(row);
      if (!existingExecutions[executionKey]) {
        existingExecutions[executionKey] = [];
      }
      existingExecutions[executionKey].push(...parsedExecutions);

      // Also store by conid key if available (for IBKR reliable matching)
      if (row.conid) {
        const conidKey = `conid_${row.conid}`;
        if (!existingExecutions[conidKey]) {
          existingExecutions[conidKey] = [];
        }
        existingExecutions[conidKey].push(...parsedExecutions);
      }
    });

    // Add open position executions (using the same keys as existingPositions)
    Object.entries(existingPositions).forEach(([key, pos]) => {
      if (!existingExecutions[key]) {
        existingExecutions[key] = [];
      }
      existingExecutions[key].push(...pos.executions);
    });

    return { existingPositions, existingExecutions, userId };
  }

  /**
   * Get existing trades for duplicate checking
   */
  async getExistingTradesForDuplicateCheck(userId) {
    const query = `
      SELECT symbol, side, quantity, entry_price, exit_price, entry_time, exit_time,
             pnl, executions, trade_date
      FROM trades
      WHERE user_id = $1
      ORDER BY entry_time DESC
      LIMIT 1000
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Check if trade is a duplicate
   */
  isDuplicateTrade(newTrade, existingTrades, context) {
    const symbol = newTrade.symbol?.toUpperCase();

    for (const existing of existingTrades) {
      if (existing.symbol?.toUpperCase() !== symbol) continue;

      // Check execution data match
      if (newTrade.executionData && existing.executions) {
        let existingExecs = existing.executions;
        if (typeof existingExecs === 'string') {
          try {
            existingExecs = JSON.parse(existingExecs);
          } catch {
            existingExecs = [];
          }
        }

        const newExecTimes = new Set(
          newTrade.executionData
            .map(e => new Date(e.entryTime || e.datetime).getTime())
            .filter(t => !isNaN(t))
        );

        const hasMatch = existingExecs.some(exec => {
          const execTime = new Date(exec.entryTime || exec.datetime).getTime();
          return !isNaN(execTime) && newExecTimes.has(execTime);
        });

        if (hasMatch) return true;
      }

      // Fallback: compare entry time, price, and quantity
      const entryTimeMatch = Math.abs(
        new Date(existing.entry_time).getTime() -
        new Date(newTrade.entryTime).getTime()
      ) < 1000;

      const entryPriceMatch = Math.abs(
        parseFloat(existing.entry_price) -
        parseFloat(newTrade.entryPrice)
      ) < 0.01;

      const quantityMatch = parseInt(existing.quantity) === parseInt(newTrade.quantity);

      if (entryTimeMatch && entryPriceMatch && quantityMatch) {
        return true;
      }
    }

    return false;
  }

  /**
   * Prepare trade data for insertion
   */
  prepareTrade(tradeData) {
    return {
      ...tradeData,
      broker: tradeData.broker || 'ibkr',
      // Ensure required fields have defaults
      commission: tradeData.commission || 0,
      fees: tradeData.fees || 0
    };
  }

  /**
   * Filter trades by date range
   */
  filterByDateRange(trades, startDate, endDate) {
    return trades.filter(trade => {
      const tradeDate = new Date(trade.tradeDate || trade.entryTime);

      if (startDate && tradeDate < new Date(startDate)) {
        return false;
      }

      if (endDate && tradeDate > new Date(endDate)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get human-readable error message for IBKR error codes
   */
  getErrorMessage(errorCode, defaultMessage) {
    // IBKR Flex Web Service error codes
    // Reference: https://www.interactivebrokers.com/en/software/am/am/reports/flex_web_service_version_3.htm
    const errorMessages = {
      '1003': 'Statement not available. This usually means your Flex Query has no data for the configured period, or the query was just created. Try running the query manually in IBKR first, or check that your query includes recent trades.',
      '1004': 'Invalid Flex Token. Please verify your token in IBKR: Performance & Reports > Flex Queries > gear icon > Flex Web Service.',
      '1005': 'Invalid Flex Query ID. Please verify the Query ID matches your Activity Flex Query in IBKR.',
      '1006': 'Too many requests. IBKR limits API calls. Please wait a few minutes and try again.',
      '1007': 'Flex Token has expired. Please generate a new token in IBKR: Performance & Reports > Flex Queries > gear icon > Flex Web Service.',
      '1010': 'Maximum daily request limit reached. IBKR limits requests per day. Try again tomorrow.',
      '1011': 'Query is currently running. Please wait a moment and try again.',
      '1012': 'Query format error. Your Flex Query may have an invalid configuration.',
      '1013': 'Account not authorized for Flex queries. Please enable Flex Web Service in your IBKR account settings.',
      '1018': 'IBKR service temporarily unavailable. Please try again later.',
      '1019': 'Statement is being generated. Please wait and try again in a few seconds.',
      '1020': 'No data available for the requested period. Your query returned no trades.'
    };

    return errorMessages[errorCode] || defaultMessage || `IBKR Error ${errorCode}: ${defaultMessage}`;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new IBKRService();
