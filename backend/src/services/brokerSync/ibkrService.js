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
const MAX_FLEX_OVERRIDE_DAYS = 365;
const DEFAULT_MANUAL_LOOKBACK_DAYS = 365;

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
  async requestFlexReport(flexToken, queryId, options = {}) {
    console.log('[IBKR] Requesting Flex report...');

    const url = `${FLEX_BASE_URL}.SendRequest`;
    const params = this.buildReportRequestParams(flexToken, queryId, options);

    try {
      const response = await axios.get(url, {
        params,
        timeout: REPORT_REQUEST_TIMEOUT
      });

      // Parse XML response
      const data = response.data;
      console.log(`[IBKR] Request response received (${data.length} chars)`);

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
        console.error('[IBKR] API error status:', error.response.status);
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
        console.warn('[IBKR] Unexpected response format from IBKR; retrying');
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
    const { startDate, endDate, syncLogId, syncType = 'manual' } = options;

    console.log(`[IBKR] Starting sync for connection ${connection.id}`);
    console.log(`[IBKR] Date range: ${startDate || 'default'} to ${endDate || 'default'}`);

    // Update sync log status
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'fetching');
    }

    // Request and fetch report
    const reportResponse = await this.requestFlexReport(
      connection.ibkrFlexToken,
      connection.ibkrFlexQueryId,
      { startDate, endDate, syncType }
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

    console.log(`[IBKR] Sync complete: ${result.imported} imported, ${result.updated || 0} updated, ${result.skipped} skipped, ${result.duplicates} duplicates, ${result.failed} failed`);

    return result;
  }

  /**
   * Import parsed trades into the database
   */
  async importTrades(userId, trades, existingContext) {
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let duplicates = 0;

    const existingTrades = await this.getExistingTradesForDuplicateCheck(userId, trades);

    for (const tradeData of trades) {
      try {
        // Check for duplicates (may set isUpdate flag if trade has more executions)
        const isDuplicate = this.isDuplicateTrade(tradeData, existingTrades, existingContext);

        if (isDuplicate) {
          duplicates++;
          continue;
        }

        // Prepare trade data
        const preparedTrade = this.prepareTrade(tradeData);

        // Handle updates vs new trades
        if (tradeData.isUpdate && tradeData.existingTradeId) {
          // This trade has more executions than existing - update it
          console.log(`[IBKR] Updating existing trade ${tradeData.existingTradeId} with additional executions for ${tradeData.symbol}`);

          // Direct SQL UPDATE - avoids Trade.update() complex side effects that can silently fail
          const executions = preparedTrade.executions || preparedTrade.executionData;
          const updateQuery = `
            UPDATE trades
            SET executions = $1::jsonb,
                exit_time = $2,
                exit_price = $3,
                pnl = $4,
                pnl_percent = $5,
                quantity = $6,
                commission = $7,
                updated_at = NOW()
            WHERE id = $8 AND user_id = $9
          `;
          await db.query(updateQuery, [
            JSON.stringify(executions),
            preparedTrade.exitTime || null,
            preparedTrade.exitPrice != null ? preparedTrade.exitPrice : null,
            preparedTrade.pnl != null ? preparedTrade.pnl : null,
            preparedTrade.pnlPercent != null ? preparedTrade.pnlPercent : null,
            preparedTrade.quantity,
            preparedTrade.commission || 0,
            tradeData.existingTradeId,
            userId
          ]);

          const existingTrade = existingTrades.find(trade => trade.id === tradeData.existingTradeId);
          if (existingTrade) {
            existingTrade.executions = executions;
            existingTrade.exit_time = preparedTrade.exitTime || null;
            existingTrade.exit_price = preparedTrade.exitPrice != null ? preparedTrade.exitPrice : null;
            existingTrade.pnl = preparedTrade.pnl != null ? preparedTrade.pnl : null;
            existingTrade.quantity = preparedTrade.quantity;
          }

          updated++;
        } else {
          // Create new trade
          await Trade.create(userId, preparedTrade, {
            skipAchievements: true,
            skipApiCalls: true
          });

          imported++;

          // Track newly-created trades so duplicate detection also works within the same sync batch.
          existingTrades.push({
            id: preparedTrade.id,
            symbol: preparedTrade.symbol,
            side: preparedTrade.side,
            quantity: preparedTrade.quantity,
            entry_price: preparedTrade.entryPrice,
            exit_price: preparedTrade.exitPrice,
            entry_time: preparedTrade.entryTime,
            exit_time: preparedTrade.exitTime,
            pnl: preparedTrade.pnl,
            executions: preparedTrade.executions || preparedTrade.executionData || [],
            trade_date: preparedTrade.tradeDate,
            instrument_type: preparedTrade.instrumentType || 'stock',
            strike_price: preparedTrade.strikePrice || null,
            expiration_date: preparedTrade.expirationDate || null,
            option_type: preparedTrade.optionType || null,
            conid: preparedTrade.conid || null,
            account_identifier: preparedTrade.accountIdentifier || preparedTrade.account_identifier || null
          });
        }
      } catch (error) {
        console.error(`[IBKR] Failed to import trade:`, error.message);
        failed++;
      }
    }

    return { imported, updated, skipped, failed, duplicates };
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
  async getExistingTradesForDuplicateCheck(userId, incomingTrades = []) {
    if (!Array.isArray(incomingTrades) || incomingTrades.length === 0) {
      return [];
    }

    const { minDate, maxDate } = this.getTradeDateRange(incomingTrades);
    const params = [userId];

    let query = `
      SELECT id, symbol, side, quantity, entry_price, exit_price, entry_time, exit_time,
             pnl, executions, trade_date, instrument_type, strike_price,
             expiration_date, option_type, conid, account_identifier
      FROM trades
      WHERE user_id = $1
    `;

    if (minDate && maxDate) {
      params.push(minDate, maxDate);
      query += `
        AND trade_date >= $2
        AND trade_date <= $3
      `;
    }

    query += `
      ORDER BY trade_date DESC, entry_time DESC
    `;

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Check if trade is a duplicate
   */
  isDuplicateTrade(newTrade, existingTrades, context) {
    if (!newTrade || !Array.isArray(existingTrades)) {
      return false;
    }

    const symbol = newTrade.symbol?.toUpperCase();
    const newInstrumentType = newTrade.instrumentType || newTrade.instrument_type || 'stock';
    const newConid = newTrade.conid ? String(newTrade.conid) : null;
    const newAccountIdentifier = newTrade.accountIdentifier || newTrade.account_identifier || null;

    for (const existing of existingTrades) {
      const existingSymbol = existing.symbol?.toUpperCase();
      const existingInstrumentType = existing.instrument_type || 'stock';
      const existingConid = existing.conid ? String(existing.conid) : null;
      const existingAccountIdentifier = existing.account_identifier || null;

      if (newAccountIdentifier && existingAccountIdentifier && newAccountIdentifier !== existingAccountIdentifier) {
        continue;
      }

      const conidMatch = newConid && existingConid && newConid === existingConid;
      const symbolMatch = existingSymbol === symbol;

      if (!conidMatch && !symbolMatch) continue;
      if (!conidMatch && existingInstrumentType !== newInstrumentType) continue;

      if (!conidMatch && newInstrumentType === 'option') {
        const optionTypeMatches = !newTrade.optionType || !existing.option_type || newTrade.optionType === existing.option_type;
        const strikeMatches = newTrade.strikePrice == null || existing.strike_price == null ||
          Math.abs(parseFloat(newTrade.strikePrice) - parseFloat(existing.strike_price)) < 0.0001;
        const expirationMatches = !newTrade.expirationDate || !existing.expiration_date ||
          this.extractDateString(newTrade.expirationDate) === this.extractDateString(existing.expiration_date);

        if (!optionTypeMatches || !strikeMatches || !expirationMatches) {
          continue;
        }
      }

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

        // Deduplicate new trade's executions before comparison to prevent
        // doubled executions from inflating the count (e.g., when conid vs composite key mismatch
        // causes the parser to add executions twice)
        const uniqueNewExecs = [];
        for (const exec of newTrade.executionData) {
          const isDupe = uniqueNewExecs.some(u => this.executionsMatch(u, exec));
          if (!isDupe) uniqueNewExecs.push(exec);
        }

        const matchingCount = uniqueNewExecs.filter(newExecution =>
          existingExecs.some(existingExecution => this.executionsMatch(newExecution, existingExecution))
        ).length;

        if (matchingCount > 0) {
          // Only mark as duplicate if the new trade doesn't have MORE executions
          // If new trade has more executions, it contains additional data (like partial closes)
          const newExecCount = uniqueNewExecs.length;
          const existingExecCount = existingExecs.length;

          if (newExecCount <= existingExecCount) {
            console.log(`[IBKR] Duplicate detected: ${symbol} (${matchingCount} matching executions, new: ${newExecCount}, existing: ${existingExecCount})`);
            return true;
          } else {
            // New trade has MORE executions - this might be an update with partial closes
            console.log(`[IBKR] Trade ${symbol} has ${newExecCount} executions vs ${existingExecCount} existing - NOT duplicate (has additional data)`);
            // Mark for update handling
            newTrade.isUpdate = true;
            newTrade.existingTradeId = newTrade.existingTradeId || existing.id;
            return false;
          }
        }
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

      if (newTrade.exitPrice && existing.exit_price) {
        const exitPriceMatch = Math.abs(
          parseFloat(existing.exit_price) -
          parseFloat(newTrade.exitPrice)
        ) < 0.01;

        const pnlMatch = Math.abs(
          parseFloat(existing.pnl || 0) -
          parseFloat(newTrade.pnl || 0)
        ) < 0.01;

        if (entryTimeMatch && entryPriceMatch && exitPriceMatch && pnlMatch) {
          console.log(`[IBKR] Duplicate detected by closed-trade fields: ${symbol}`);
          return true;
        }
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

  extractDateString(value) {
    if (!value) return null;

    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    const stringValue = String(value);
    if (stringValue.includes('T')) {
      return stringValue.split('T')[0];
    }

    const parsed = new Date(stringValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
  }

  getTradeDateRange(trades) {
    const dateStrings = trades
      .map(trade => this.extractDateString(trade.tradeDate || trade.exitTime || trade.entryTime))
      .filter(Boolean)
      .sort();

    if (dateStrings.length === 0) {
      return { minDate: null, maxDate: null };
    }

    return {
      minDate: dateStrings[0],
      maxDate: dateStrings[dateStrings.length - 1]
    };
  }

  buildReportRequestParams(flexToken, queryId, options = {}) {
    const params = {
      t: flexToken,
      q: queryId,
      v: '3'
    };

    const overrideRange = this.getReportDateOverride(options);
    if (overrideRange) {
      params.fd = overrideRange.start.replace(/-/g, '');
      params.td = overrideRange.end.replace(/-/g, '');
    }

    return params;
  }

  getReportDateOverride(options = {}) {
    const { startDate, endDate, syncType = 'manual' } = options;

    if (startDate || endDate) {
      return this.normalizeReportDateRange(startDate, endDate);
    }

    if (syncType === 'manual') {
      const end = this.normalizeDateString(new Date());
      const startDateValue = new Date(`${end}T00:00:00Z`);
      startDateValue.setUTCDate(startDateValue.getUTCDate() - (DEFAULT_MANUAL_LOOKBACK_DAYS - 1));
      const start = startDateValue.toISOString().split('T')[0];

      return { start, end };
    }

    return null;
  }

  normalizeReportDateRange(startDate, endDate) {
    const normalizedStart = this.normalizeDateString(startDate || endDate);
    const normalizedEnd = this.normalizeDateString(endDate || startDate);

    if (!normalizedStart || !normalizedEnd) {
      throw new Error('Invalid IBKR date override supplied');
    }

    if (normalizedStart > normalizedEnd) {
      throw new Error('IBKR sync start date must be on or before end date');
    }

    const daySpan = Math.floor(
      (new Date(`${normalizedEnd}T00:00:00Z`) - new Date(`${normalizedStart}T00:00:00Z`)) / 86400000
    ) + 1;

    if (daySpan > MAX_FLEX_OVERRIDE_DAYS) {
      throw new Error(`IBKR Flex Web Service supports up to ${MAX_FLEX_OVERRIDE_DAYS} days per request`);
    }

    return {
      start: normalizedStart,
      end: normalizedEnd
    };
  }

  normalizeDateString(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    const stringValue = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
      return stringValue;
    }

    const parsed = new Date(stringValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
  }

  executionsMatch(left, right) {
    if (!left || !right) {
      return false;
    }

    if (left.orderId && right.orderId) {
      return String(left.orderId) === String(right.orderId);
    }

    const leftTime = new Date(left.datetime || left.entryTime).getTime();
    const rightTime = new Date(right.datetime || right.entryTime).getTime();

    if (Number.isNaN(leftTime) || Number.isNaN(rightTime) || Math.abs(leftTime - rightTime) > 1000) {
      return false;
    }

    const leftQuantity = parseFloat(left.quantity);
    const rightQuantity = parseFloat(right.quantity);
    const leftPrice = parseFloat(left.price ?? left.entryPrice);
    const rightPrice = parseFloat(right.price ?? right.entryPrice);

    const quantityMatches = !Number.isNaN(leftQuantity) && !Number.isNaN(rightQuantity)
      ? Math.abs(leftQuantity - rightQuantity) < 0.0001
      : true;
    const priceMatches = !Number.isNaN(leftPrice) && !Number.isNaN(rightPrice)
      ? Math.abs(leftPrice - rightPrice) < 0.01
      : true;
    const actionMatches = !left.action || !right.action || left.action === right.action;
    const conidMatches = !left.conid || !right.conid || String(left.conid) === String(right.conid);

    return quantityMatches && priceMatches && actionMatches && conidMatches;
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
