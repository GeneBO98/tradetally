/**
 * IBKR Flex Web Service Integration
 * Fetches trade data from Interactive Brokers using the Flex Query API
 *
 * API Documentation: https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/
 */

const axios = require('axios');
const { parse } = require('csv-parse/sync');
const { parseCSV } = require('../../utils/csvParser');
const Trade = require('../../models/Trade');
const BrokerConnection = require('../../models/BrokerConnection');
const db = require('../../config/database');
const { computeTradePnl } = require('../pnlEngine');
const { getUserTimezone } = require('../../utils/timezone');
const AnalyticsCache = require('../analyticsCache');
const OptionStrategyGroupingService = require('../optionStrategyGroupingService');
const { version: APP_VERSION } = require('../../../package.json');

const FLEX_BASE_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';
const FLEX_USER_AGENT = `TradeTally/${APP_VERSION}`;
const REPORT_REQUEST_TIMEOUT = 120000; // 2 minutes to request report
const REPORT_POLL_INTERVAL = 5000; // Poll every 5 seconds
const REPORT_INITIAL_MAX_WAIT = 300000; // Initial 5 min poll window before extending
const REPORT_EXTENDED_MAX_WAIT = 720000; // 12 min total when first poll times out
const IBKR_OPEN_POSITION_MAX_SYNTHETIC_TRADES = 50;

// Transient network errors that warrant a retry
const RETRYABLE_NETWORK_CODES = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED']);
// IBKR error codes that mean "try again in a moment" (per official Version 3 error code docs)
const RETRYABLE_IBKR_CODES = new Set(['1001', '1004', '1005', '1006', '1007', '1008', '1009', '1018', '1019', '1021']);

// Phrases in IBKR's <ErrorMessage> text that indicate a transient condition,
// regardless of whether the numeric ErrorCode is one we know about. IBKR
// occasionally returns codes outside the documented set with these messages.
const RETRYABLE_MESSAGE_PHRASES = [
  'try again',
  'temporary',
  'temporarily',
  'shortly',
  'please wait',
  'being generated',
  'not ready',
  'in a moment',
  'currently unavailable',
  'heavy load'
];

const OPEN_POSITION_SECTION_NAMES = new Set(['openpositions', 'openposition']);
const STOCK_ASSET_CLASSES = new Set(['stock', 'stocks', 'stk', 'equity', 'equities']);
const SELF_DESCRIBING_OPEN_POSITION_FIELDS = new Set([
  'position',
  'positionquantity',
  'openquantity'
]);
const OPEN_POSITION_COST_FIELDS = [
  'CostBasisPrice',
  'Cost Basis Price',
  'OpenPrice',
  'Open Price',
  'Average Price',
  'Avg Price',
  'Average Cost',
  'Avg Cost',
  'Cost Price'
];
const OPEN_POSITION_BASIS_FIELDS = [
  'CostBasisMoney',
  'Cost Basis Money',
  'Cost Basis',
  'CostBasis',
  'Basis'
];
const TRADE_EXECUTION_HEADER_FIELDS = new Set([
  'tradeid',
  'tradeprice',
  'buysell',
  'opencloseindicator',
  'levelofdetail',
  'datetime',
  'ordertime',
  'proceeds',
  'ibcommission',
  'realizedpl',
  'mtmpl'
]);

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseCsvLine(line) {
  try {
    const [fields] = parse(line, {
      delimiter: ',',
      relax: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true
    });
    return fields || [];
  } catch (_) {
    return [];
  }
}

function recordFromFields(headers, fields) {
  return headers.reduce((record, header, index) => {
    record[header] = fields[index];
    return record;
  }, {});
}

function getRecordValue(record, candidates) {
  if (!record) return null;

  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(record, candidate)) {
      const value = record[candidate];
      if (value !== null && value !== undefined && String(value).trim() !== '') return value;
    }
  }

  const normalizedCandidates = new Set(candidates.map(normalizeHeader));
  for (const [key, value] of Object.entries(record)) {
    if (
      normalizedCandidates.has(normalizeHeader(key)) &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ''
    ) {
      return value;
    }
  }

  return null;
}

function parseOpenPositionNumber(value) {
  if (value === null || value === undefined) return null;
  let cleaned = String(value).trim();
  if (!cleaned || cleaned === '-' || cleaned.toUpperCase() === 'N/A') return null;

  const parenMatch = cleaned.match(/^\((.*)\)$/);
  cleaned = cleaned
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/%/g, '')
    .replace(/\u2212/g, '-');

  if (parenMatch) {
    cleaned = `-${parenMatch[1].replace(/\$/g, '').replace(/,/g, '').replace(/%/g, '')}`;
  }

  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSelfDescribingOpenPositionHeader(fields) {
  const normalized = fields.map(normalizeHeader);
  const hasSymbol = normalized.includes('symbol');
  const hasPositionQuantity = normalized.some(field => SELF_DESCRIBING_OPEN_POSITION_FIELDS.has(field));
  const hasCostBasis = normalized.some(field => ['costbasisprice', 'costbasismoney', 'openprice', 'averageprice', 'avgprice', 'averagecost', 'avgcost'].includes(field));
  const hasTradeExecutionFields = normalized.some(field => TRADE_EXECUTION_HEADER_FIELDS.has(field));

  return hasSymbol && hasPositionQuantity && hasCostBasis && !hasTradeExecutionFields;
}

function isLikelyHeader(fields) {
  const normalized = fields.map(normalizeHeader);
  const knownHeaderFields = normalized.filter(field => [
    'clientaccountid',
    'accountalias',
    'assetclass',
    'assetcategory',
    'currencyprimary',
    'symbol',
    'tradeid',
    'levelofdetail',
    'position'
  ].includes(field));

  return knownHeaderFields.length >= 2;
}

function normalizeDateString(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const compactMatch = raw.match(/\b(20\d{2}|19\d{2})(\d{2})(\d{2})\b/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;

  const slashMatch = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slashMatch) {
    const yearNumber = parseInt(slashMatch[3], 10);
    const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
    return `${year}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  }

  return null;
}

function isRetryableErrorMessage(message) {
  if (!message) return false;
  const text = String(message).toLowerCase();
  return RETRYABLE_MESSAGE_PHRASES.some(phrase => text.includes(phrase));
}

/**
 * Build an Error annotated with the IBKR error code and a transient flag.
 * The caller (sync orchestrator) uses these to (a) save error_details and
 * (b) decide whether to schedule an auto-retry.
 */
function buildIBKRError(humanMessage, { errorCode = null, rawMessage = null, transient = false } = {}) {
  const err = new Error(humanMessage);
  err.errorCode = errorCode;
  err.rawMessage = rawMessage;
  err.transient = transient;
  return err;
}

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
   * Retries up to 3 times on transient DNS/network errors and retryable IBKR codes.
   */
  async requestFlexReport(flexToken, queryId, options = {}) {
    console.log('[IBKR] Requesting Flex report...');

    const url = `${FLEX_BASE_URL}/SendRequest`;
    const params = this.buildReportRequestParams(flexToken, queryId, options);
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.get(url, {
          params,
          timeout: REPORT_REQUEST_TIMEOUT,
          headers: { 'User-Agent': FLEX_USER_AGENT }
        });

        const data = response.data;
        console.log(`[IBKR] Request response received (${data.length} chars)`);

        if (data.includes('<ErrorCode>')) {
          const errorCodeMatch = data.match(/<ErrorCode>(\d+)<\/ErrorCode>/);
          const errorMsgMatch = data.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
          const errorCode = errorCodeMatch ? errorCodeMatch[1] : 'Unknown';
          const errorMsg = errorMsgMatch ? errorMsgMatch[1] : 'Unknown error';

          // Retry if the code is known-transient OR the human message says
          // "try again"/"temporary"/etc. IBKR sometimes returns undocumented
          // codes with explicitly retryable wording.
          const isTransient = RETRYABLE_IBKR_CODES.has(errorCode) || isRetryableErrorMessage(errorMsg);
          if (isTransient && attempt < maxAttempts) {
            const delay = attempt * 15000;
            console.warn(`[IBKR] Retryable error ${errorCode} ("${errorMsg}") on attempt ${attempt}/${maxAttempts}, retrying in ${delay / 1000}s...`);
            await this.sleep(delay);
            continue;
          }

          throw buildIBKRError(this.getErrorMessage(errorCode, errorMsg), {
            errorCode,
            rawMessage: errorMsg,
            transient: isTransient // true if retries were exhausted on a transient error
          });
        }

        const refCodeMatch = data.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/);
        if (!refCodeMatch) {
          throw buildIBKRError('Failed to get reference code from IBKR response', { errorCode: 'NO_REF_CODE' });
        }

        const referenceCode = refCodeMatch[1];
        console.log('[IBKR] Got reference code:', referenceCode);
        return { referenceCode };
      } catch (error) {
        if (error.response) {
          console.error('[IBKR] API error status:', error.response.status);
          throw buildIBKRError(`IBKR API error: ${error.response.status}`, {
            errorCode: `HTTP_${error.response.status}`,
            transient: error.response.status >= 500
          });
        }

        // Retry on transient network/DNS errors
        if (RETRYABLE_NETWORK_CODES.has(error.code) && attempt < maxAttempts) {
          const delay = attempt * 10000;
          console.warn(`[IBKR] Network error (${error.code}) on attempt ${attempt}/${maxAttempts}, retrying in ${delay / 1000}s...`);
          await this.sleep(delay);
          continue;
        }

        if (RETRYABLE_NETWORK_CODES.has(error.code)) {
          // Exhausted retries on a transient network error — mark as transient
          // so the scheduler can auto-retry later.
          error.transient = true;
          error.errorCode = error.code;
        }
        throw error;
      }
    }
  }

  /**
   * Fetch the generated Flex report
   * @param {string} referenceCode - Report reference code
   * @param {string} flexToken - IBKR Flex Token
   * @param {object} [options]
   * @param {number} [options.maxWait] - Override the default poll window in ms
   * @returns {Promise<string>} - CSV data
   */
  async fetchFlexReport(referenceCode, flexToken, options = {}) {
    const maxWait = options.maxWait || REPORT_INITIAL_MAX_WAIT;
    console.log(`[IBKR] Fetching Flex report (max wait ${Math.round(maxWait / 1000)}s)...`);

    const url = `${FLEX_BASE_URL}/GetStatement`;
    const params = {
      t: flexToken,
      q: referenceCode,
      v: '3'
    };

    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        const response = await axios.get(url, {
          params,
          timeout: 60000,
          headers: { 'User-Agent': FLEX_USER_AGENT }
        });

        const data = response.data;

        // Check for errors in the GetStatement response
        if (data.includes('<ErrorCode>')) {
          const errorCodeMatch = data.match(/<ErrorCode>(\d+)<\/ErrorCode>/);
          const errorMsgMatch = data.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
          const errorCode = errorCodeMatch ? errorCodeMatch[1] : 'Unknown';
          const errorMsg = errorMsgMatch ? errorMsgMatch[1] : 'Unknown error';

          // Treat known-transient codes AND messages with retry hints as
          // transient. Polling will continue until maxWait is reached.
          const isTransient = RETRYABLE_IBKR_CODES.has(errorCode) || isRetryableErrorMessage(errorMsg);
          if (isTransient) {
            console.log(`[IBKR] Transient error ${errorCode} ("${errorMsg}") on GetStatement, waiting to retry...`);
            await this.sleep(REPORT_POLL_INTERVAL);
            continue;
          }

          throw buildIBKRError(this.getErrorMessage(errorCode, errorMsg), {
            errorCode,
            rawMessage: errorMsg,
            transient: false
          });
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
        if (RETRYABLE_NETWORK_CODES.has(error.code)) {
          console.warn(`[IBKR] Network error while fetching report (${error.code}), retrying...`);
          await this.sleep(REPORT_POLL_INTERVAL);
          continue;
        }
        throw error;
      }
    }

    // Timeout: poll window exceeded. Mark as transient so the caller can
    // retry with a longer window or schedule an auto-retry later.
    throw buildIBKRError('Timeout waiting for IBKR report generation', {
      errorCode: 'TIMEOUT',
      transient: true
    });
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

    // Two-phase fetch: poll for up to 5 minutes first (fast path). If the
    // report still isn't ready, keep polling the same reference code for
    // another window up to a 12-minute total. Larger accounts often need
    // longer than 5 minutes; small accounts shouldn't have to wait.
    let csvData;
    try {
      csvData = await this.fetchFlexReport(
        reportResponse.referenceCode,
        connection.ibkrFlexToken,
        { maxWait: REPORT_INITIAL_MAX_WAIT }
      );
    } catch (error) {
      if (error.errorCode === 'TIMEOUT') {
        const remainingMs = REPORT_EXTENDED_MAX_WAIT - REPORT_INITIAL_MAX_WAIT;
        console.warn(`[IBKR] Report not ready after 5 min, continuing to poll for up to ${Math.round(remainingMs / 60000)} more minutes...`);
        csvData = await this.fetchFlexReport(
          reportResponse.referenceCode,
          connection.ibkrFlexToken,
          { maxWait: remainingMs }
        );
      } else {
        throw error;
      }
    }

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
    const parserContext = {
      ...existingContext,
      brokerConnectionId: connection.id,
      brokerType: connection.brokerType
    };
    const parseResult = await parseCSV(
      Buffer.from(csvData, 'utf8'),
      brokerFormat,
      parserContext
    );

    let trades = Array.isArray(parseResult) ? parseResult : parseResult.trades;
    const manualReviewItems = Array.isArray(parseResult?.manualReviewItems)
      ? parseResult.manualReviewItems
      : [];
    const parseWarnings = parseResult?.diagnostics?.warnings || [];
    console.log(`[IBKR] Parsed ${trades.length} trades`);
    if (manualReviewItems.length > 0) {
      console.warn(`[IBKR] ${manualReviewItems.length} sell-only stock execution(s) require manual review`);
    }

    const openPositionResult = this.extractOpenPositionTrades(csvData, connection, existingContext, {
      parsedTrades: trades,
      endDate
    });
    openPositionResult.warnings.forEach(warning => console.warn(`[IBKR] ${warning}`));

    if (openPositionResult.trades.length > 0) {
      trades = [...trades, ...openPositionResult.trades];
      console.log(`[IBKR] Added ${openPositionResult.trades.length} synthetic stock open-position trades from IBKR Open Positions`);
    }

    // Filter by date range if specified
    if (startDate || endDate) {
      trades = this.filterByDateRange(trades, startDate, endDate);
      console.log(`[IBKR] After date filter: ${trades.length} trades`);
    }

    // Update sync log with fetched count
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'importing', {
        tradesFetched: trades.length
      });
    }

    // Import trades
    const result = await this.importTrades(connection.userId, trades, existingContext);
    result.warnings = [...parseWarnings, ...openPositionResult.warnings];
    result.openPositionsParsed = openPositionResult.trades.length;
    result.manualReviewItems = manualReviewItems;
    result.manualReviewCount = manualReviewItems.length;

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
          console.log(`[IBKR] Updating existing trade ${tradeData.existingTradeId} with additional executions for ${tradeData.symbol}`);

          const rawExecutions = preparedTrade.executions || preparedTrade.executionData || [];
          const ibkrTimezone = await getUserTimezone(userId);
          const engineResult = computeTradePnl({
            side: preparedTrade.side,
            instrumentType: preparedTrade.instrumentType || 'stock',
            contractSize: preparedTrade.contractSize || (preparedTrade.instrumentType === 'option' ? 100 : null),
            pointValue: preparedTrade.pointValue,
            fallbackCommission: preparedTrade.commission != null ? preparedTrade.commission : null,
            fallbackFees: preparedTrade.fees != null ? preparedTrade.fees : null,
            executions: rawExecutions,
            timezone: ibkrTimezone,
            tradeId: tradeData.existingTradeId
          });
          const annotatedExecs = engineResult.annotatedExecutions;
          const agg = engineResult.aggregate;

          const updateQuery = `
            UPDATE trades
            SET executions = $1::jsonb,
                entry_price = $2,
                exit_time = $3,
                exit_price = $4,
                entry_time = $5,
                trade_date = $6,
                pnl = $7,
                pnl_percent = $8,
                quantity = $9,
                commission = $10,
                fees = $11,
                entry_commission = $12,
                exit_commission = $13,
                updated_at = NOW()
            WHERE id = $14 AND user_id = $15
          `;
          await db.query(updateQuery, [
            JSON.stringify(annotatedExecs),
            agg.entry_price,
            agg.is_fully_closed ? agg.exit_time : (preparedTrade.exitTime || null),
            agg.exit_price,
            agg.entry_time || preparedTrade.entryTime || null,
            agg.trade_date || preparedTrade.tradeDate || null,
            agg.pnl,
            agg.pnl_percent,
            agg.quantity || preparedTrade.quantity,
            agg.commission,
            agg.fees,
            preparedTrade.entryCommission || 0,
            preparedTrade.exitCommission || 0,
            tradeData.existingTradeId,
            userId
          ]);

          const existingTrade = existingTrades.find(trade => trade.id === tradeData.existingTradeId);
          if (existingTrade) {
            existingTrade.executions = annotatedExecs;
            existingTrade.exit_time = agg.is_fully_closed ? agg.exit_time : (preparedTrade.exitTime || null);
            existingTrade.exit_price = agg.exit_price;
            existingTrade.pnl = agg.pnl;
            existingTrade.quantity = agg.quantity || preparedTrade.quantity;
          }

          updated++;
        } else {
          // Create new trade
          const createdTrade = await Trade.create(userId, preparedTrade, {
            skipAchievements: true,
            skipApiCalls: true,
            skipOptionGrouping: true
          });

          imported++;

          // Track newly-created trades so duplicate detection also works within the same sync batch.
          existingTrades.push({
            id: createdTrade?.id || preparedTrade.id,
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

    try {
      await OptionStrategyGroupingService.rebuildUserGroupsSafe(userId, 'IBKR broker sync');
      await AnalyticsCache.invalidate(userId);
    } catch (cacheErr) {
      console.warn(`[IBKR] AnalyticsCache invalidation failed: ${cacheErr.message}`);
    }

    return { imported, updated, skipped, failed, duplicates };
  }

  /**
   * Detect which IBKR CSV format we're dealing with.
   *
   * Returns one of:
   *   - 'ibkr_trade_confirmation' — IBKR Flex Query Trade Confirmation layout
   *     (UnderlyingSymbol, Strike, Expiry, Put/Call columns)
   *   - 'captrader'               — CapTrader Activity Statement (multi-section
   *     IBKR format with German metadata markers like `Feldname,Feldwert` or
   *     an explicit `CapTrader GmbH` master-name row)
   *   - 'ibkr'                    — Vanilla IBKR Activity Statement
   *
   * CapTrader is an IBKR introducing broker — it uses the same Flex Web
   * Service API but exports CSVs with CapTrader-specific markers. Tagging
   * these trades as 'captrader' (vs 'ibkr') is purely cosmetic; the parser
   * handles both via the same code path, but the broker label shown in the
   * UI/database matches the user's actual broker.
   */
  detectIBKRFormat(csvData) {
    const headerLine = csvData.split('\n')[0].toLowerCase();

    if (headerLine.includes('underlyingsymbol') && headerLine.includes('strike') &&
        headerLine.includes('expiry') && headerLine.includes('put/call')) {
      // Trade Confirmation files don't have CapTrader-style section markers,
      // so we keep them as plain IBKR even if the user is on CapTrader.
      return 'ibkr_trade_confirmation';
    }

    // Scan first ~1000 lines for CapTrader markers. Reuses the same patterns
    // as the CSV parser's auto-detection (csvParser.js:680-702) so detection
    // is consistent across import paths.
    const lines = csvData.split('\n');
    const scanLimit = Math.min(lines.length, 1000);
    for (let i = 0; i < scanLimit; i++) {
      const line = lines[i];
      if (!line) continue;
      if (/^[^,]*,\s*"?Header"?\s*,\s*"?Feldname"?\s*,\s*"?Feldwert"?/i.test(line) ||
          /CapTrader/i.test(line)) {
        console.log('[IBKR] CapTrader markers found — tagging sync as captrader');
        return 'captrader';
      }
    }

    return 'ibkr';
  }

  extractOpenPositionTrades(csvData, connection, existingContext = {}, options = {}) {
    const records = this.extractOpenPositionRecords(csvData);
    const warnings = [];

    if (records.length === 0) {
      warnings.push('IBKR Flex Query did not include a recognized Open Positions stock section; transferred stock positions without executions cannot be imported.');
      return { trades: [], warnings };
    }

    const fallbackTradeDate =
      this.extractOpenPositionStatementDate(csvData) ||
      this.extractDateString(options.endDate) ||
      new Date().toISOString().slice(0, 10);
    const parsedTrades = Array.isArray(options.parsedTrades) ? options.parsedTrades : [];
    const trades = [];

    records.forEach((record, index) => {
      const built = this.buildOpenPositionTrade(record, connection, fallbackTradeDate);
      if (!built.trade) {
        warnings.push(`Skipped IBKR open-position row ${index + 1}: ${built.reason}`);
        return;
      }

      if (this.openPositionAlreadyRepresented(built.trade, parsedTrades, existingContext)) {
        console.log(`[IBKR] Skipping Open Positions row for ${built.trade.symbol}; open stock position already exists`);
        return;
      }

      trades.push(built.trade);
    });

    if (trades.length > IBKR_OPEN_POSITION_MAX_SYNTHETIC_TRADES) {
      warnings.push(`Skipped IBKR Open Positions import because ${trades.length} stock candidates exceeded safety limit ${IBKR_OPEN_POSITION_MAX_SYNTHETIC_TRADES}.`);
      return { trades: [], warnings };
    }

    return { trades, warnings };
  }

  extractOpenPositionRecords(csvData) {
    const lines = String(csvData || '').split(/\r?\n/);
    const records = [];
    let activeHeader = null;
    let activeHeaderIsExplicitOpenPositions = false;

    for (const line of lines) {
      if (!line || !line.trim()) continue;

      const fields = parseCsvLine(line);
      if (fields.length === 0) continue;

      const sectionName = normalizeHeader(fields[0]);
      const rowType = normalizeHeader(fields[1]);

      if (OPEN_POSITION_SECTION_NAMES.has(sectionName) && rowType === 'header') {
        activeHeader = fields.slice(2);
        activeHeaderIsExplicitOpenPositions = true;
        continue;
      }

      if (activeHeaderIsExplicitOpenPositions && OPEN_POSITION_SECTION_NAMES.has(sectionName) && rowType === 'data') {
        const record = recordFromFields(activeHeader, fields.slice(2));
        if (this.isPotentialOpenPositionRecord(record, true)) {
          records.push(record);
        }
        continue;
      }

      if (isSelfDescribingOpenPositionHeader(fields)) {
        activeHeader = fields;
        activeHeaderIsExplicitOpenPositions = false;
        continue;
      }

      if (!activeHeader || activeHeaderIsExplicitOpenPositions) {
        continue;
      }

      if (isLikelyHeader(fields)) {
        activeHeader = isSelfDescribingOpenPositionHeader(fields) ? fields : null;
        continue;
      }

      const record = recordFromFields(activeHeader, fields);
      if (this.isPotentialOpenPositionRecord(record, false)) {
        records.push(record);
      }
    }

    return records;
  }

  isPotentialOpenPositionRecord(record, explicitOpenPositionsSection) {
    const symbol = this.getOpenPositionSymbol(record);
    const quantity = this.getOpenPositionQuantity(record, explicitOpenPositionsSection);
    return Boolean(symbol) && Number.isFinite(quantity) && quantity !== 0;
  }

  buildOpenPositionTrade(record, connection, fallbackTradeDate) {
    const symbol = this.getOpenPositionSymbol(record);
    if (!symbol) {
      return { trade: null, reason: 'missing symbol' };
    }

    const assetClass = normalizeHeader(getRecordValue(record, [
      'AssetClass',
      'Asset Class',
      'Asset Category',
      'AssetCategory',
      'SecType',
      'Security Type'
    ]));
    if (!STOCK_ASSET_CLASSES.has(assetClass)) {
      return { trade: null, reason: `unsupported asset class for ${symbol}` };
    }

    const quantity = this.getOpenPositionQuantity(record, true);
    if (!Number.isFinite(quantity) || quantity === 0) {
      return { trade: null, reason: `invalid quantity for ${symbol}` };
    }

    const explicitPrice = this.getFirstFiniteRecordNumber(record, OPEN_POSITION_COST_FIELDS);
    const costBasis = this.getFirstFiniteRecordNumber(record, OPEN_POSITION_BASIS_FIELDS);
    let entryPrice = Number.isFinite(explicitPrice) && explicitPrice > 0 ? explicitPrice : null;

    if ((!entryPrice || entryPrice <= 0) && Number.isFinite(costBasis)) {
      entryPrice = Math.abs(costBasis) / Math.abs(quantity);
    }

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return { trade: null, reason: `missing usable cost basis for ${symbol}` };
    }

    const tradeDate = normalizeDateString(getRecordValue(record, [
      'ReportDate',
      'Report Date',
      'Date',
      'AsOfDate',
      'As Of Date',
      'Position Date',
      'Statement Date'
    ])) || fallbackTradeDate;
    const entryTime = `${tradeDate}T09:30:00`;
    const side = quantity > 0 ? 'long' : 'short';
    const action = side === 'long' ? 'buy' : 'sell';
    const absQuantity = Math.abs(quantity);
    const conid = getRecordValue(record, ['Conid', 'ConID', 'ConId', 'conid']);
    const accountIdentifier = getRecordValue(record, [
      'ClientAccountID',
      'Account',
      'Account ID',
      'AccountId',
      'Account Number',
      'AccountNumber'
    ]);
    const currency = getRecordValue(record, ['Currency', 'CurrencyPrimary']) || 'USD';
    const syntheticExecution = {
      action,
      quantity: absQuantity,
      price: entryPrice,
      datetime: entryTime,
      fees: 0,
      conid: conid || null,
      synthetic: true,
      synthetic_reason: 'ibkr_open_stock_position_without_execution',
      source: 'IBKR Open Positions'
    };

    return {
      trade: {
        symbol,
        side,
        quantity: absQuantity,
        entryPrice,
        exitPrice: null,
        entryTime,
        exitTime: null,
        tradeDate,
        pnl: null,
        pnlPercent: null,
        commission: 0,
        fees: 0,
        entryCommission: 0,
        exitCommission: 0,
        broker: connection.brokerType || 'ibkr',
        brokerConnectionId: connection.id,
        accountIdentifier: accountIdentifier || null,
        conid: conid || null,
        originalCurrency: currency,
        instrumentType: 'stock',
        executions: [syntheticExecution],
        executionData: [syntheticExecution],
        notes: 'Imported from IBKR Open Positions because no stock execution history was present; cost basis came from IBKR position data.',
        isSyntheticOpenPosition: true,
        syntheticReason: 'ibkr_open_stock_position_without_execution'
      }
    };
  }

  getOpenPositionSymbol(record) {
    const rawSymbol = getRecordValue(record, ['Symbol', 'LocalSymbol', 'Local Symbol']);
    if (!rawSymbol) return null;

    const symbol = String(rawSymbol).trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,15}$/.test(symbol)) {
      return null;
    }

    return symbol;
  }

  getOpenPositionQuantity(record, explicitOpenPositionsSection) {
    const candidates = explicitOpenPositionsSection
      ? ['Position', 'Position Quantity', 'Open Quantity', 'Quantity', 'Qty']
      : ['Position', 'Position Quantity', 'Open Quantity'];
    return parseOpenPositionNumber(getRecordValue(record, candidates));
  }

  getFirstFiniteRecordNumber(record, fields) {
    for (const field of fields) {
      const value = parseOpenPositionNumber(getRecordValue(record, [field]));
      if (Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  extractOpenPositionStatementDate(csvData) {
    const dates = [];
    const lines = String(csvData || '').split(/\r?\n/);

    for (const line of lines) {
      if (!line || !line.trim()) continue;
      const fields = parseCsvLine(line);
      const normalizedLine = fields.map(normalizeHeader).join('|');
      if (!/statement|period|todate|reportdate|generated|asofdate|positiondate/.test(normalizedLine)) {
        continue;
      }

      fields.forEach(field => {
        const date = normalizeDateString(field);
        if (date) dates.push(date);
      });
    }

    return dates.length > 0 ? dates[dates.length - 1] : null;
  }

  openPositionAlreadyRepresented(openTrade, parsedTrades = [], existingContext = {}) {
    const parsedOpenTrade = parsedTrades.some(trade => {
      const isOpen = !trade.exitPrice && !trade.exit_time && !trade.exitTime && !trade.exit_price;
      return isOpen && this.tradesRepresentSameStockPosition(openTrade, trade);
    });
    if (parsedOpenTrade) return true;

    const uniqueExistingPositions = new Set(Object.values(existingContext.existingPositions || {}));
    for (const existingPosition of uniqueExistingPositions) {
      if (this.tradesRepresentSameStockPosition(openTrade, existingPosition)) {
        return true;
      }
    }

    return false;
  }

  tradesRepresentSameStockPosition(left, right) {
    if (!left || !right) return false;

    const leftInstrumentType = left.instrumentType || left.instrument_type || 'stock';
    const rightInstrumentType = right.instrumentType || right.instrument_type || 'stock';
    if (leftInstrumentType !== 'stock' || rightInstrumentType !== 'stock') {
      return false;
    }

    const leftAccount = left.accountIdentifier || left.account_identifier || null;
    const rightAccount = right.accountIdentifier || right.account_identifier || null;
    if (leftAccount && rightAccount && String(leftAccount) !== String(rightAccount)) {
      return false;
    }

    const leftConid = left.conid ? String(left.conid) : null;
    const rightConid = right.conid ? String(right.conid) : null;
    if (leftConid && rightConid) {
      return leftConid === rightConid;
    }

    return String(left.symbol || '').toUpperCase() === String(right.symbol || '').toUpperCase();
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
             instrument_type, strike_price, expiration_date, option_type, conid, account_identifier
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
        quantity: parseFloat(row.quantity) || 0,
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
        conid: row.conid,
        accountIdentifier: row.account_identifier || null,
        account_identifier: row.account_identifier || null
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

      const existingQuantity = parseFloat(existing.quantity);
      const newQuantity = parseFloat(newTrade.quantity);
      const quantityMatch = Number.isFinite(existingQuantity) && Number.isFinite(newQuantity)
        ? Math.abs(existingQuantity - newQuantity) < 0.0001
        : parseInt(existing.quantity) === parseInt(newTrade.quantity);

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

  buildReportRequestParams(flexToken, queryId) {
    // We intentionally do not send fd/td. The Flex Query's own period (configured
    // in IBKR) determines what data IBKR returns; TradeTally filters to the
    // user-requested date range after parsing via filterByDateRange().
    return {
      t: flexToken,
      q: queryId,
      v: '3'
    };
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
    // Error codes per official IBKR Flex Web Service Version 3 documentation
    const errorMessages = {
      '1001': 'IBKR could not generate the statement right now. This is temporary — please try again in a few minutes.',
      '1003': 'Statement not available. Your Flex Query may have no data for the configured period, or the query was just created. Try running it manually in IBKR first.',
      '1004': 'Statement is incomplete. Please try again shortly.',
      '1005': 'Settlement data is not ready yet. Please try again shortly.',
      '1006': 'FIFO P/L data is not ready yet. Please try again shortly.',
      '1007': 'MTM P/L data is not ready yet. Please try again shortly.',
      '1008': 'MTM and FIFO P/L data is not ready yet. Please try again shortly.',
      '1009': 'IBKR server is under heavy load. Please try again shortly.',
      '1010': 'Legacy Flex Queries are no longer supported. Please convert your query to an Activity Flex Query in IBKR.',
      '1011': 'Service account is inactive. Please check your IBKR account status.',
      '1012': 'Flex Token has expired. Please generate a new token in IBKR: Performance & Reports > Flex Queries > gear icon > Flex Web Service.',
      '1013': "IP restriction — this server's IP is not authorised for your Flex Token. Add it in IBKR: Performance & Reports > Flex Queries > gear icon > Flex Web Service.",
      '1014': 'Query is invalid. Please verify your Flex Query ID in IBKR.',
      '1015': 'Flex Token is invalid. Please generate a new token in IBKR: Performance & Reports > Flex Queries > gear icon > Flex Web Service.',
      '1016': 'Account is invalid. Please check your IBKR account configuration.',
      '1017': 'Reference code is invalid.',
      '1018': 'IBKR rate limit reached (max 10 requests per minute per token). Please wait before trying again.',
      '1019': 'Statement is being generated — please wait a moment and try again.',
      '1020': 'Invalid request. Please check your Flex Token and Query ID.',
      '1021': 'Statement could not be retrieved right now. Please try again shortly.',
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
