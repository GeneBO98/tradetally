const { parse } = require('csv-parse/sync');
const logger = require('./logger');
const finnhub = require('./finnhub');
const cache = require('./cache');
const cusipQueue = require('./cusipQueue');
const currencyConverter = require('./currencyConverter');
const db = require('../config/database');
const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('./futuresUtils');
const { localToUTC } = require('./timezone');

// ---------------------------------------------------------------------------
// Localization layer – normalizes non-English CSV headers & cell values so
// that existing broker parsers work regardless of the export language.
// ---------------------------------------------------------------------------

// Map of non-English column headers → canonical English header.
// Keys MUST be lowercase.  Add new languages / brokers here.
const HEADER_LOCALE_MAP = {
  // German (AvaTrade, TradingView DE, etc.)
  'seite': 'Side',
  'typ': 'Type',
  'anz.': 'Qty',
  'anzahl': 'Qty',
  'menge': 'Qty',
  'limit preis': 'Limit Price',
  'stopp-preis': 'Stop Price',
  'aktiv bei': 'Trigger Price',
  'erfüllungsmenge': 'Filled Qty',
  'durchschnittlicher erfüllungspreis': 'Avg Fill Price',
  'durchschn. erfüllungspreis': 'Avg Fill Price',
  'kommission': 'Commission',
  'provision': 'Commission',
  'gebühr': 'Commission',
  'platzierungszeit': 'Placing Time',
  'status zeit': 'Closing Time',
  'order-nummer': 'Order ID',
  'dauer': 'Duration',
  'gewinn': 'PnL',
  'verlust': 'PnL',
  'beschreibung': 'Description',
  // French
  'côté': 'Side',
  'quantité': 'Qty',
  'prix limite': 'Limit Price',
  'prix stop': 'Stop Price',
  'prix de remplissage': 'Fill Price',
  'prix moyen de remplissage': 'Avg Fill Price',
  'quantité remplie': 'Filled Qty',
  'heure de placement': 'Placing Time',
  'numéro de commande': 'Order ID',
  'durée': 'Duration',
  // Spanish
  'lado': 'Side',
  'cantidad': 'Qty',
  'precio límite': 'Limit Price',
  'precio stop': 'Stop Price',
  'precio de llenado': 'Fill Price',
  'precio promedio de llenado': 'Avg Fill Price',
  'cantidad llenada': 'Filled Qty',
  'comisión': 'Commission',
  'hora de colocación': 'Placing Time',
  'número de orden': 'Order ID',
  'duración': 'Duration',
};

// Cell-value translations – keyed by canonical column, then lowercase
// source value → English value.
const VALUE_LOCALE_MAP = {
  'Status': {
    // German
    'ausgeführt': 'Filled',
    'storniert': 'Cancelled',
    'abgelehnt': 'Rejected',
    'ausstehend': 'Pending',
    'teilweise ausgeführt': 'Partially Filled',
    // French
    'exécuté': 'Filled',
    'annulé': 'Cancelled',
    'rejeté': 'Rejected',
    'en attente': 'Pending',
    // Spanish
    'ejecutado': 'Filled',
    'cancelado': 'Cancelled',
    'rechazado': 'Rejected',
    'pendiente': 'Pending',
  },
  'Side': {
    // German
    'kaufen': 'Buy',
    'verkaufen': 'Sell',
    'kauf': 'Buy',
    'verkauf': 'Sell',
    // French
    'achat': 'Buy',
    'vente': 'Sell',
    'acheter': 'Buy',
    'vendre': 'Sell',
    // Spanish
    'compra': 'Buy',
    'venta': 'Sell',
    'comprar': 'Buy',
    'vender': 'Sell',
  },
  'Type': {
    // German
    'markt': 'Market',
    'stop-loss': 'Stop-Loss',
    'take-profit': 'Take-Profit',
    // French
    'marché': 'Market',
    // Spanish
    'mercado': 'Market',
  },
};

/**
 * Detect whether a set of CSV records contain non-English headers that we
 * know how to translate, and if so remap every record in-place.
 *
 * Returns an object { records, localized } where `localized` is true when
 * at least one header was translated.
 */
function localizeRecords(records) {
  if (!records || records.length === 0) return { records, localized: false };

  const sample = records[0];
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    return { records, localized: false };
  }

  // Build a rename map for the headers actually present
  const renameMap = {};  // originalKey → englishKey
  for (const key of Object.keys(sample)) {
    const lower = key.toLowerCase().trim();
    if (HEADER_LOCALE_MAP[lower]) {
      renameMap[key] = HEADER_LOCALE_MAP[lower];
    }
  }

  if (Object.keys(renameMap).length === 0) {
    return { records, localized: false };
  }

  console.log('[LOCALIZE] Detected non-English headers, translating:', renameMap);

  // Build the set of columns that need value translation
  // Map englishColumnName → lookup table
  const valueColumns = {};
  for (const englishCol of Object.values(renameMap)) {
    if (VALUE_LOCALE_MAP[englishCol]) {
      valueColumns[englishCol] = VALUE_LOCALE_MAP[englishCol];
    }
  }
  // Also check columns that already have the English name (e.g. "Status" is
  // the same in German) but whose values may still be non-English.
  for (const key of Object.keys(sample)) {
    const english = key.trim();
    if (VALUE_LOCALE_MAP[english] && !renameMap[key]) {
      valueColumns[english] = VALUE_LOCALE_MAP[english];
    }
  }

  const localized = records.map(record => {
    const newRecord = {};
    for (const [origKey, value] of Object.entries(record)) {
      const englishKey = renameMap[origKey] || origKey;
      let translatedValue = value;

      // Translate known cell values
      const valueLookup = valueColumns[englishKey];
      if (valueLookup && typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        if (valueLookup[lower]) {
          translatedValue = valueLookup[lower];
        }
      }

      newRecord[englishKey] = translatedValue;
    }
    return newRecord;
  });

  return { records: localized, localized: true };
}

// AvaTrade symbol format: F.US.MESM26 → MESM26 (futures), S.US.AAPL → AAPL (stock)
function normalizeAvaTradeSymbol(symbol) {
  if (!symbol) return symbol;
  // Match F.<region>.<contract> or S.<region>.<ticker> patterns
  const match = symbol.match(/^[A-Z]\.[A-Z]{2,}\.(.+)$/);
  return match ? match[1] : symbol;
}

function normalizeWholeLineQuotedCsvRows(csvString) {
  if (!csvString) return csvString;

  const lines = csvString.split('\n');
  if (lines.length < 2) return csvString;

  const firstNonEmptyIndex = lines.findIndex(line => line.trim().length > 0);
  const headerLine = firstNonEmptyIndex >= 0 ? lines[firstNonEmptyIndex] : null;
  if (!headerLine) return csvString;

  let expectedColumnCount;
  let normalizedHeaderLine = headerLine;
  try {
    let [headerFields] = parse(headerLine, {
      columns: false,
      delimiter: ',',
      quote: '"',
      escape: '"',
      trim: true,
      relax: true,
      relax_column_count: true
    });

    if (Array.isArray(headerFields) && headerFields.length === 1) {
      const trimmedHeader = headerLine.trim();
      if (trimmedHeader.startsWith('"') && trimmedHeader.endsWith('"')) {
        const unwrappedHeader = trimmedHeader.slice(1, -1).replace(/""/g, '"');
        const [unwrappedHeaderFields] = parse(unwrappedHeader, {
          columns: false,
          delimiter: ',',
          quote: '"',
          escape: '"',
          trim: true,
          relax: true,
          relax_column_count: true
        });

        if (Array.isArray(unwrappedHeaderFields) && unwrappedHeaderFields.length > 1) {
          headerFields = unwrappedHeaderFields;
          normalizedHeaderLine = unwrappedHeader;
        }
      }
    }

    expectedColumnCount = Array.isArray(headerFields) ? headerFields.length : 0;
  } catch (error) {
    return csvString;
  }

  if (!expectedColumnCount) {
    return csvString;
  }

  let normalizedRows = 0;
  const normalizedLines = lines.map((line, index) => {
    if (index === firstNonEmptyIndex) {
      return normalizedHeaderLine;
    }

    const trimmedLine = line.trim();
    if (!trimmedLine || !(trimmedLine.startsWith('"') && trimmedLine.endsWith('"'))) {
      return line;
    }

    const unwrappedLine = trimmedLine.slice(1, -1).replace(/""/g, '"');

    try {
      const [fields] = parse(unwrappedLine, {
        columns: false,
        delimiter: ',',
        quote: '"',
        escape: '"',
        trim: true,
        relax: true,
        relax_column_count: true
      });

      if (Array.isArray(fields) && fields.length === expectedColumnCount) {
        normalizedRows += 1;
        return unwrappedLine;
      }
    } catch (error) {
      return line;
    }

    return line;
  });

  if (normalizedRows > 0) {
    console.log(`[CSV] Normalized ${normalizedRows} whole-line quoted CSV row(s)`);
  }

  return normalizedLines.join('\n');
}

// CUSIP resolution is now handled by the cusipQueue module

/**
 * Check if an execution already exists in any existing trade
 * @param {Object} execution - The execution to check
 * @param {String} symbol - The symbol
 * @param {Object} context - Context object containing existingExecutions
 * @returns {boolean} - True if execution already exists
 */
function isExecutionDuplicate(execution, symbol, context) {
  // Safety checks
  if (!context || !context.existingExecutions || !context.existingExecutions[symbol]) {
    return false;
  }

  // Check if execution has required fields
  if (!execution || !execution.datetime) {
    return false;
  }

  const symbolExecutions = context.existingExecutions[symbol];

  return symbolExecutions.some(existingExec => {
    // Skip if existingExec is invalid
    if (!existingExec) {
      return false;
    }

    // Lightspeed sequence numbers are execution-level identifiers and are more
    // reliable than trade numbers, which can span multiple fills.
    if (execution.sequenceNumber && existingExec.sequenceNumber) {
      return String(existingExec.sequenceNumber) === String(execution.sequenceNumber);
    }

    // Trade numbers alone are not unique enough for Lightspeed fills.
    // Only treat them as duplicates when the fill details also align.
    if (execution.tradeNumber && existingExec.tradeNumber) {
      const existingDatetime = existingExec.datetime || existingExec.entryTime;
      const existingPrice = existingExec.price ?? existingExec.entryPrice;
      const existingTime = existingDatetime ? new Date(existingDatetime).getTime() : NaN;
      const newTime = new Date(execution.datetime).getTime();

      if (String(existingExec.tradeNumber) !== String(execution.tradeNumber)) {
        return false;
      }

      return !isNaN(existingTime) &&
             !isNaN(newTime) &&
             Math.abs(existingTime - newTime) <= 1000 &&
             Number(existingExec.quantity) === Number(execution.quantity) &&
             Math.abs((existingPrice || 0) - (execution.price || 0)) < 0.01;
    }

    // Check by order ID if available (for Interactive Brokers)
    if (execution.orderId && existingExec.orderId) {
      return String(existingExec.orderId) === String(execution.orderId);
    }

    // Fallback to timestamp + quantity + price matching
    // Handle both naming conventions: datetime/price OR entryTime/entryPrice
    const existingDatetime = existingExec.datetime || existingExec.entryTime;
    const existingPrice = existingExec.price ?? existingExec.entryPrice;

    // Skip if datetime is missing
    if (!existingDatetime) {
      return false;
    }

    const existingTime = new Date(existingDatetime).getTime();
    const newTime = new Date(execution.datetime).getTime();

    // Skip if dates are invalid
    if (isNaN(existingTime) || isNaN(newTime)) {
      return false;
    }

    const timeDiff = Math.abs(existingTime - newTime);

    // Allow up to 1 second difference in timestamps (some brokers round differently)
    return timeDiff <= 1000 &&
           existingExec.quantity === execution.quantity &&
           Math.abs((existingPrice || 0) - (execution.price || 0)) < 0.01;
  });
}

/**
 * Check if an execution already exists using multiple candidate lookup keys.
 * This handles cases where IBKR returns a conid-based key but the DB trade
 * was imported via CSV under a composite key (e.g., AMGN_392.5_2026-03-13_call).
 * @param {Object} execution - The execution to check
 * @param {Array<String>} keys - Array of candidate lookup keys to try
 * @param {Object} context - Context object containing existingExecutions
 * @returns {boolean} - True if execution already exists under any key
 */
function isExecutionDuplicateMultiKey(execution, keys, context) {
  return keys.some(key => isExecutionDuplicate(execution, key, context));
}

/**
 * Detects if CSV contains a currency column
 * @param {Array} records - Parsed CSV records
 * @returns {boolean} - True if currency column is detected
 */
function detectCurrencyColumn(records) {
  if (!records || records.length === 0) {
    console.log('[CURRENCY] No records to check for currency column');
    return false;
  }

  console.log(`[CURRENCY] Checking ${records.length} records for currency column`);

  // Get all field names from the first record (case-insensitive)
  const firstRecord = records[0];
  const fieldNames = Object.keys(firstRecord);
  console.log(`[CURRENCY] Available fields: ${fieldNames.join(', ')}`);

  const currencyFieldPatterns = new Set([
    'currency',
    'curr',
    'ccy',
    'currency_code',
    'currencycode',
    'price currency',
    'currency (price / share)',
    'currency (result)',
    'currency (total)',
    'ibcommissioncurrency',
    'ib commission currency',
    'currencyprimary',
    'currency primary'
  ]);
  const validCurrencyCodePattern = /^[A-Z]{3}$/;

  for (const record of records) {
    for (const fieldName of Object.keys(record)) {
      const lowerFieldName = fieldName.toLowerCase().trim();

      if (currencyFieldPatterns.has(lowerFieldName)) {
        const value = record[fieldName];
        if (value && value.toString().trim() !== '') {
          const currencyValue = value.toString().toUpperCase().trim();
          console.log(`[CURRENCY] Found currency field '${fieldName}' with value '${currencyValue}'`);

          // Detect non-USD currency
          if (validCurrencyCodePattern.test(currencyValue) && currencyValue !== 'USD') {
            console.log(`[CURRENCY] Detected non-USD currency: ${currencyValue}`);
            return true;
          }
        }
      }
    }
  }

  console.log('[CURRENCY] No non-USD currency column detected');
  return false;
}

/**
 * Account column name patterns for flexible matching (case-insensitive)
 */
const ACCOUNT_FIELD_PATTERNS = [
  'account', 'account_id', 'accountid', 'account_number', 'accountnumber',
  'acctid', 'acct_id', 'acct', 'account_identifier', 'brokerage_account',
  'trading_account', 'portfolio'
];

/**
 * Redacts an account ID to show only the last 4 characters for privacy
 * @param {string} accountId - The full account ID
 * @returns {string|null} - Redacted account ID (e.g., "****1234") or null
 */
function redactAccountId(accountId) {
  if (!accountId) return null;
  const str = String(accountId).trim();
  if (str === '') return null;
  if (str.length <= 4) return str;
  return '****' + str.slice(-4);
}

/**
 * Detects if CSV contains an account column and returns the column name
 * @param {Array} records - Parsed CSV records
 * @returns {string|null} - The account column name if found, null otherwise
 */
function detectAccountColumn(records) {
  if (!records || records.length === 0) {
    console.log('[ACCOUNT] No records to check for account column');
    return null;
  }

  // Get all field names from the first record
  const firstRecord = records[0];
  const fieldNames = Object.keys(firstRecord);

  // Log all available columns for debugging
  console.log(`[ACCOUNT] Checking ${fieldNames.length} columns for account field: ${fieldNames.slice(0, 15).join(', ')}${fieldNames.length > 15 ? '...' : ''}`);

  // Normalize field names for comparison
  for (const fieldName of fieldNames) {
    const normalizedField = fieldName.toLowerCase().replace(/[\s_-]/g, '');

    for (const pattern of ACCOUNT_FIELD_PATTERNS) {
      const normalizedPattern = pattern.replace(/[\s_-]/g, '');
      if (normalizedField === normalizedPattern || normalizedField.includes(normalizedPattern)) {
        // Verify the column has actual data
        const hasData = records.some(record => {
          const value = record[fieldName];
          return value && String(value).trim() !== '';
        });

        if (hasData) {
          console.log(`[ACCOUNT] Detected account column: "${fieldName}"`);
          return fieldName;
        } else {
          console.log(`[ACCOUNT] Found potential account column "${fieldName}" but it has no data`);
        }
      }
    }
  }

  console.log(`[ACCOUNT] No account column found in CSV columns`);
  return null;
}

/**
 * Extracts account identifier from a record using the detected column name
 * @param {Object} record - CSV record
 * @param {string} accountColumnName - The detected account column name
 * @returns {string|null} - Full account identifier (not redacted - redaction is for display only)
 */
function extractAccountFromRecord(record, accountColumnName) {
  if (!accountColumnName || !record) return null;
  const value = record[accountColumnName];
  if (!value) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

/**
 * Detects the broker format based on CSV headers
 * @param {Buffer} fileBuffer - The CSV file buffer
 * @returns {string} - Detected broker format
 */
function detectBrokerFormat(fileBuffer) {
  try {
    let csvString = fileBuffer.toString('utf-8');
    // Remove BOM if present
    if (csvString.charCodeAt(0) === 0xFEFF) {
      csvString = csvString.slice(1);
    }
    const lines = csvString.split('\n');

    const headerInfo = findLikelyDelimitedHeaderLine(lines);
    const headerLine = headerInfo?.line || '';
    const headerLineIndex = headerInfo?.index || 0;

    if (!headerLine) {
      return 'generic';
    }

    const headers = headerLine.toLowerCase();
    console.log(`[AUTO-DETECT] Analyzing headers (line ${headerLineIndex + 1}): ${headerLine.substring(0, 200)}...`);

    // ThinkorSwim detection - look for DATE, TIME, TYPE, REF #, DESCRIPTION pattern
    if (headers.includes('date') && headers.includes('time') && headers.includes('type') &&
        headers.includes('ref #') && headers.includes('description')) {
      console.log('[AUTO-DETECT] Detected: ThinkorSwim');
      return 'thinkorswim';
    }

    // AvaTrade detection – German-language futures/stock order export
    // Distinctive headers: Seite (Side), Erfüllungsmenge (Filled Qty), Order-Nummer (Order ID)
    if (headers.includes('seite') && headers.includes('erfüllungsmenge') &&
        headers.includes('order-nummer') && headers.includes('platzierungszeit')) {
      console.log('[AUTO-DETECT] Detected: AvaTrade (German order export)');
      return 'avatrade';
    }

    // Localized CSV detection – if we recognise enough translated headers,
    // try to figure out which English broker format they map to.  This lets
    // e.g. a German TradingView export auto-detect correctly after header
    // normalisation happens later in the pipeline.
    {
      const translatedHeaders = [];
      for (const [foreign, english] of Object.entries(HEADER_LOCALE_MAP)) {
        if (headers.includes(foreign)) {
          translatedHeaders.push(english.toLowerCase());
        }
      }
      if (translatedHeaders.length >= 3) {
        // Re-run detection logic against the *translated* header set
        const joined = translatedHeaders.join(',');
        if (joined.includes('side') && joined.includes('order id') &&
            (joined.includes('fill price') || joined.includes('avg fill price'))) {
          console.log('[AUTO-DETECT] Detected: TradingView (localized futures format, translated headers)');
          return 'tradingview';
        }
      }
    }

    // TradingView detection - covers all 3 sub-formats (futures transactions, performance, paper trading)
    // Performance export: buyFillId, sellFillId, boughtTimestamp, soldTimestamp, pnl
    if (headers.includes('buyfillid') &&
        headers.includes('sellfillid') &&
        headers.includes('boughttimestamp') &&
        headers.includes('soldtimestamp') &&
        headers.includes('pnl')) {
      console.log('[AUTO-DETECT] Detected: TradingView (performance export format)');
      return 'tradingview';
    }
    // Paper trading: buyPrice/sellPrice with status but no buyFillId
    if (headers.includes('buyprice') && headers.includes('sellprice') &&
        headers.includes('boughttimestamp') && headers.includes('soldtimestamp') &&
        headers.includes('status') && !headers.includes('buyfillid')) {
      console.log('[AUTO-DETECT] Detected: TradingView (paper trading format)');
      return 'tradingview';
    }
    // Futures transaction format: Side, Fill Price, Order ID
    if (headers.includes('symbol') &&
        headers.includes('side') &&
        headers.includes('order id') &&
        (headers.includes('fill price') || headers.includes('avg fill price')) &&
        (headers.includes('leverage') || headers.includes('placing time') || headers.includes('closing time') || headers.includes('update time'))) {
      console.log('[AUTO-DETECT] Detected: TradingView (futures trading format)');
      return 'tradingview';
    }

    // Lightspeed detection - look for Trade Number, Execution Time, Buy/Sell columns
    if ((headers.includes('trade number') || headers.includes('sequence number')) &&
        (headers.includes('execution time') || headers.includes('raw exec')) &&
        (headers.includes('commission amount') || headers.includes('feesec'))) {
      console.log('[AUTO-DETECT] Detected: Lightspeed Trader');
      return 'lightspeed';
    }

    // PaperMoney detection - look for Exec Time, Pos Effect, Spread columns
    if (headers.includes('exec time') &&
        headers.includes('pos effect') &&
        headers.includes('spread')) {
      console.log('[AUTO-DETECT] Detected: PaperMoney');
      return 'papermoney';
    }

    // Schwab detection - two formats
    // Format 1: Completed trades with Gain/Loss
    if ((headers.includes('opened date') && headers.includes('closed date') && headers.includes('gain/loss')) ||
        (headers.includes('symbol') && headers.includes('quantity') && headers.includes('cost per share') && headers.includes('proceeds per share'))) {
      console.log('[AUTO-DETECT] Detected: Charles Schwab (completed trades)');
      return 'schwab';
    }
    // Format 2: Transaction history
    if (headers.includes('action') && headers.includes('fees & comm') &&
        (headers.includes('date') && headers.includes('symbol') && headers.includes('description'))) {
      console.log('[AUTO-DETECT] Detected: Charles Schwab (transactions)');
      return 'schwab';
    }

    // IBKR detection - two formats
    // Format 1: Trade Confirmation (with UnderlyingSymbol, Strike, Expiry, Put/Call, Multiplier, Buy/Sell)
    if (headers.includes('underlyingsymbol') && headers.includes('strike') &&
        headers.includes('expiry') && headers.includes('put/call') &&
        headers.includes('multiplier') && headers.includes('buy/sell')) {
      console.log('[AUTO-DETECT] Detected: Interactive Brokers Trade Confirmation');
      return 'ibkr_trade_confirmation';
    }
    // Format 2: Activity Statement (Symbol, Date/Time or DateTime, Quantity, Price)
    if (headers.includes('symbol') &&
        (headers.includes('date/time') || headers.includes('datetime')) &&
        headers.includes('quantity') && headers.includes('price') &&
        !headers.includes('action')) { // Distinguish from Schwab
      console.log('[AUTO-DETECT] Detected: Interactive Brokers Activity Statement');
      return 'ibkr';
    }

    // E*TRADE detection - Transaction Date + Transaction Type is unique to E*TRADE
    if (headers.includes('transaction date') && headers.includes('transaction type')) {
      console.log('[AUTO-DETECT] Detected: E*TRADE');
      return 'etrade';
    }

    // Webull detection - look for Name, Symbol, Side, Status, Filled, Price, Time-in-Force, Placed Time, Filled Time
    if (headers.includes('name') && headers.includes('symbol') && headers.includes('side') &&
        headers.includes('status') && headers.includes('filled') && headers.includes('time-in-force') &&
        headers.includes('placed time') && headers.includes('filled time')) {
      console.log('[AUTO-DETECT] Detected: Webull');
      return 'webull';
    }

    // Webull alternate format detection - B/S, Side Type, Filled Qty, Filled Avg Price
    if (headers.includes('b/s') && headers.includes('side type') &&
        headers.includes('filled qty') && headers.includes('filled avg price') &&
        headers.includes('filled time') && headers.includes('symbol')) {
      console.log('[AUTO-DETECT] Detected: Webull (alternate format)');
      return 'webull';
    }

    // Webull newer format - Side + Side Type, Filled Qty, Filled AVG Price, Fill Time
    if (headers.includes('side') && headers.includes('side type') &&
        headers.includes('filled qty') && headers.includes('filled avg price') &&
        headers.includes('fill time') && headers.includes('symbol')) {
      console.log('[AUTO-DETECT] Detected: Webull (newer format)');
      return 'webull';
    }

    // ProjectX detection - look for ContractName, EnteredAt, ExitedAt, PnL columns
    if (headers.includes('contractname') &&
        headers.includes('enteredat') &&
        headers.includes('exitedat') &&
        headers.includes('pnl') &&
        headers.includes('tradeduration')) {
      console.log('[AUTO-DETECT] Detected: ProjectX');
      return 'projectx';
    }

    // Tradervue detection - completed trades export
    if (headers.includes('open datetime') &&
        headers.includes('close datetime') &&
        headers.includes('symbol') &&
        headers.includes('side') &&
        headers.includes('volume') &&
        headers.includes('entry price') &&
        headers.includes('exit price') &&
        headers.includes('gross p&l')) {
      console.log('[AUTO-DETECT] Detected: Tradervue');
      return 'tradervue';
    }

    // Tradovate detection - supports both order-fill exports and paired trade/performance exports
    // Note: Don't rely on first column (orderId) due to potential BOM issues
    if (headers.includes('b/s') &&
        headers.includes('contract') &&
        headers.includes('product') &&
        headers.includes('fill time') &&
        (headers.includes('avgprice') || headers.includes('avg fill price')) &&
        (headers.includes('filledqty') || headers.includes('filled qty'))) {
      console.log('[AUTO-DETECT] Detected: Tradovate');
      return 'tradovate';
    }
    if (headers.includes('contract') &&
        (headers.includes('paired qty') || headers.includes('pairedqty') || headers.includes('qty')) &&
        headers.includes('buy price') &&
        headers.includes('sell price') &&
        headers.includes('bought timestamp') &&
        headers.includes('sold timestamp')) {
      console.log('[AUTO-DETECT] Detected: Tradovate (paired trades export)');
      return 'tradovate';
    }

    // Questrade detection - prioritize core transaction columns
    // Some Questrade exports omit Option/Strategy when there are no option trades.
    if (headers.includes('fill qty') &&
        headers.includes('fill price') &&
        headers.includes('exec time') &&
        headers.includes('action') &&
        headers.includes('symbol')) {
      console.log('[AUTO-DETECT] Detected: Questrade');
      return 'questrade';
    }

    // TradeStation/TradeNote detection - look for Account, T/D, S/D, Exec Time, Gross Proceeds columns
    if (headers.includes('account') &&
        headers.includes('t/d') &&
        headers.includes('s/d') &&
        headers.includes('exec time') &&
        (headers.includes('gross proceeds') || headers.includes('net proceeds'))) {
      console.log('[AUTO-DETECT] Detected: TradeStation/TradeNote');
      return 'tradestation';
    }

    // Tastytrade detection - look for unique tastytrade headers
    // Supports both standard headers and variant with _type suffixes
    if (headers.includes('instrument type') &&
        headers.includes('root symbol') &&
        headers.includes('underlying symbol') &&
        headers.includes('call or put') &&
        headers.includes('average price')) {
      console.log('[AUTO-DETECT] Detected: Tastytrade');
      return 'tastytrade';
    }

    // Default to generic if no specific format detected
    console.log('[AUTO-DETECT] No specific format detected, using generic parser');
    return 'generic';

  } catch (error) {
    console.error('[AUTO-DETECT] Error detecting broker format:', error);
    return 'generic';
  }
}

function findLikelyDelimitedHeaderLine(lines, maxLines = 15) {
  const headerKeywords = [
    'date', 'time', 'symbol', 'side', 'type', 'action', 'price', 'qty', 'quantity',
    'commission', 'description', 'order', 'profit', 'pnl', 'fill', 'entry', 'exit',
    'trade', 'status', 'account'
  ];
  const delimiters = [',', ';', '\t'];
  let fallback = null;

  for (let i = 0; i < Math.min(maxLines, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let bestDelimiter = null;
    let bestCount = 0;
    for (const delimiter of delimiters) {
      const count = line.split(delimiter).length - 1;
      if (count > bestCount) {
        bestCount = count;
        bestDelimiter = delimiter;
      }
    }

    if (!bestDelimiter || bestCount < 1) {
      continue;
    }

    const fields = line
      .split(bestDelimiter)
      .map(field => field.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    if (fields.length < 2) {
      continue;
    }

    const lowerFields = fields.map(field => field.toLowerCase());
    const keywordMatches = lowerFields.filter(field =>
      headerKeywords.some(keyword => field.includes(keyword))
    ).length;

    if (!fallback || bestCount > fallback.delimiterCount) {
      fallback = { line, index: i, delimiter: bestDelimiter, delimiterCount: bestCount };
    }

    if (bestCount >= 2 && keywordMatches >= 2) {
      return { line, index: i, delimiter: bestDelimiter, delimiterCount: bestCount };
    }
  }

  return fallback;
}

function getTradingViewFuturesInstrumentData(symbol) {
  if (!symbol) {
    return {
      instrumentType: 'stock',
      contractSize: null,
      underlyingAsset: null,
      contractMonth: null,
      contractYear: null,
      tickSize: null,
      pointValue: null
    };
  }

  const normalizedSymbol = symbol.toString().toUpperCase().trim();
  const exchangeMatch = normalizedSymbol.match(/^([^:]+):(.+)$/);
  const contractSymbol = exchangeMatch ? exchangeMatch[2] : normalizedSymbol;

  const standardMatch = contractSymbol.match(/^([A-Z]+?)([FGHJKMNQUVXZ])(\d{1,4})$/);
  if (standardMatch) {
    const monthCodes = { F: '01', G: '02', H: '03', J: '04', K: '05', M: '06', N: '07', Q: '08', U: '09', V: '10', X: '11', Z: '12' };
    let year = parseInt(standardMatch[3], 10);
    if (year < 10) {
      year += Math.floor(new Date().getFullYear() / 10) * 10;
    } else if (year < 100) {
      year += 2000;
    }

    return {
      instrumentType: 'future',
      contractSize: null,
      underlyingAsset: standardMatch[1],
      contractMonth: monthCodes[standardMatch[2]] || null,
      contractYear: year || null,
      tickSize: null,
      pointValue: getFuturesPointValue(standardMatch[1])
    };
  }

  const continuousUnderlying = extractUnderlyingFromFuturesSymbol(normalizedSymbol);
  if (continuousUnderlying) {
    return {
      instrumentType: 'future',
      contractSize: null,
      underlyingAsset: continuousUnderlying,
      contractMonth: 'CONT',
      contractYear: 9999,
      tickSize: null,
      pointValue: getFuturesPointValue(continuousUnderlying)
    };
  }

  return {
    instrumentType: 'stock',
    contractSize: null,
    underlyingAsset: null,
    contractMonth: null,
    contractYear: null,
    tickSize: null,
    pointValue: null
  };
}

/**
 * Extract the CSV header line from a file buffer (first non-empty line with comma in first 10 lines, BOM stripped).
 * Used for recording unknown CSV headers when no parser matches or parse fails.
 * @param {Buffer} fileBuffer - The CSV file buffer
 * @returns {string|null} - The header line or null if not found
 */
function getCsvHeaderLine(fileBuffer) {
  try {
    let csvString = fileBuffer.toString('utf-8');
    if (csvString.charCodeAt(0) === 0xFEFF) {
      csvString = csvString.slice(1);
    }
    const lines = csvString.split('\n');
    return findLikelyDelimitedHeaderLine(lines)?.line || null;
  } catch (error) {
    console.error('[CSV] Error extracting header line:', error);
    return null;
  }
}

/**
 * Extract the first N data rows after the CSV header line.
 * Used to capture sample data for building new parsers.
 * @param {Buffer} fileBuffer - The CSV file buffer
 * @param {number} maxRows - Maximum number of data rows to return (default 5)
 * @returns {string|null} - The sample rows joined by newlines, or null if none found
 */
function getCsvSampleRows(fileBuffer, maxRows = 5) {
  try {
    let csvString = fileBuffer.toString('utf-8');
    if (csvString.charCodeAt(0) === 0xFEFF) {
      csvString = csvString.slice(1);
    }
    const lines = csvString.split('\n');
    const headerIndex = findLikelyDelimitedHeaderLine(lines)?.index ?? -1;
    if (headerIndex === -1) return null;
    // Collect up to maxRows non-empty lines after the header
    const sampleRows = [];
    for (let i = headerIndex + 1; i < lines.length && sampleRows.length < maxRows; i++) {
      const line = lines[i].trim();
      if (line) {
        sampleRows.push(line);
      }
    }
    return sampleRows.length > 0 ? sampleRows.join('\n') : null;
  } catch (error) {
    console.error('[CSV] Error extracting sample rows:', error);
    return null;
  }
}

function parseIBKRTradeConfirmationInstrumentData(record, fallbackSymbol = '') {
  const symbol = cleanString(record.Symbol || fallbackSymbol);
  const underlyingSymbol = cleanString(record.UnderlyingSymbol);
  const strike = parseNumeric(record.Strike, NaN);
  const expiry = cleanString(record.Expiry);
  const putCall = cleanString(record['Put/Call']);
  const assetClass = cleanString(record.AssetClass || record.assetClass).toUpperCase();
  const multiplier = parseNumeric(record.Multiplier, NaN);
  const parsedSymbolData = parseInstrumentData(symbol);

  if (underlyingSymbol && Number.isFinite(strike) && expiry && putCall) {
    const expirationDate = `${expiry.substring(0, 4)}-${expiry.substring(4, 6)}-${expiry.substring(6, 8)}`;

    return {
      instrumentType: 'option',
      underlyingSymbol,
      strikePrice: strike,
      expirationDate,
      optionType: putCall.toLowerCase() === 'c' ? 'call' : 'put',
      contractSize: Number.isFinite(multiplier) ? multiplier : 100
    };
  }

  if (assetClass === 'FUT' || parsedSymbolData.instrumentType === 'future') {
    const underlyingAsset =
      underlyingSymbol ||
      parsedSymbolData.underlyingAsset ||
      extractUnderlyingFromFuturesSymbol(symbol) ||
      symbol;

    return {
      instrumentType: 'future',
      underlyingAsset,
      contractMonth: parsedSymbolData.contractMonth || null,
      contractYear: parsedSymbolData.contractYear || null,
      pointValue: Number.isFinite(multiplier) && multiplier > 0
        ? multiplier
        : (parsedSymbolData.pointValue || getFuturesPointValue(underlyingAsset))
    };
  }

  return parsedSymbolData.instrumentType !== 'stock' ? parsedSymbolData : { instrumentType: 'stock' };
}

const brokerParsers = {
  generic: (row) => {
    // Enhanced generic parser with flexible column mapping
    // Support various column naming conventions

    // Symbol mapping
    const symbol = row.Symbol || row.symbol || row.Ticker || row.ticker || row.Stock || row.stock ||
      row['Underlying Symbol'] || row['underlying symbol'];

    // Date/Time mapping - support more formats
    const tradeDate = parseDate(
      row['Trade Date'] || row['T/D'] || row.Date || row.date ||
      row.trade_date || row['trade_date'] || row['Entry Date'] ||
      row['Transaction Date'] || row['Exec Date'] || row['Execution Date'] ||
      row['Date and time'] || row.Time || row.time ||
      row['Opening time (UTC-4)'] || row['Opening Time'] || row['Open Time'] ||
      row['Opened Time']
    );

    const entryTime = parseDateTime(
      row['Entry Time'] || row['Exec Time'] || row['Execution Time'] ||
      row['Fill Time'] || row['Trade Time'] || row.Timestamp ||
      row.order_execution_time || row['order_execution_time'] ||
      row['Date and time'] || row.Time || row.time ||
      row['Opening time (UTC-4)'] || row['Opening Time'] || row['Open Time'] ||
      row['Opened Time'] ||
      row['Trade Date'] || row.trade_date || row['Entry Date'] || row.Date
    ) || tradeDate;

    const exitTime = parseDateTime(
      row['Exit Time'] || row['Close Time'] || row['Exit Date'] ||
      row['Closed Date'] || row['Sell Time'] ||
      row['Closing time (UTC-4)'] || row['Closing Time']
    );

    // Price mapping - support more variations
    const entryPrice = parseNumeric(
      row['Entry Price'] || row['Buy Price'] || row.Price || row.price ||
      row['Price / share'] || row.TradePrice || row['TradePrice'] ||
      row['Fill Price'] || row['Avg Price'] || row['Average Price'] ||
      row['Open Price'] || row['Opening Price'] || row['Purchase Price'] ||
      row['Entry price']
    );

    const exitPrice = parseNumeric(
      row['Exit Price'] || row['Sell Price'] || row['Close Price'] ||
      row['Sale Price'] || row['Closing Price'] || row['Closing price']
    );

    // Quantity mapping
    const quantity = Math.abs(parseNumeric(
      row.Quantity || row.quantity || row.Qty || row.qty ||
      row.Shares || row.shares || row['No. of shares'] || row.Size || row.size ||
      row.Volume || row.volume || row.Amount || row.amount ||
      row['Fill Qty'] || row['Filled Qty'] || row['Closing Quantity']
    ));

    // Side mapping - handle more variations
    const side = parseSide(
      row.Side || row.side || row.Direction || row.direction ||
      row.Type || row.type || row.trade_type || row['trade_type'] || row.Action || row.action ||
      row['B/S'] || row['Buy/Sell'] || row.BS ||
      row['Opening direction'] || row['Opening Direction']
    );

    // Commission and fees mapping
    const commission = parseNumeric(
      row.Commission || row.commission || row.Comm || row.comm ||
      row.Commissions || row.commissions || row['Commission Amount'] ||
      row['Comm']
    ) || 0;

    const fees = parseNumeric(
      row.Fees || row.fees || row.Fee || row.fee ||
      row['Total Fees'] || row['Fee Amount'] ||
      row.SEC || row.TAF || row.NSCC
    ) || 0;

    // Currency mapping
    const currency = (
      row.Currency || row.currency || row.Curr || row.curr ||
      row.CCY || row.ccy || 'USD'
    ).toUpperCase();

    // Stop loss and take profit
    const stopLoss = parseNumeric(
      row['Stop Loss'] || row['Stop Loss Price'] || row.Stop || row.stop ||
      row.SL || row.sl || row.stopLoss || row.stop_loss
    );

    const takeProfit = parseNumeric(
      row['Take Profit'] || row['Take Profit Price'] || row.Target || row.target ||
      row.TP || row.tp || row.takeProfit || row.take_profit
    );

    // Notes/description
    const notes = cleanString(
      row.Notes || row.notes || row.Note || row.note ||
      row.Description || row.description || row.Comment || row.comment
    );

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      exitTime: exitTime,
      entryPrice: entryPrice,
      exitPrice: exitPrice,
      quantity: quantity,
      side: side,
      commission: commission,
      fees: fees,
      currency: currency,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      notes: notes,
      pnl: parseNumeric(row['Net $'] || row.Net || row.PnL || row.pnl || row['P&L'], null),
      broker: 'generic'
    };
  },

  lightspeed: (row) => ({
    symbol: cleanString(row.Symbol),
    tradeDate: parseDate(row['Trade Date']),
    entryTime: parseLightspeedDateTime(row['Trade Date'] + ' ' + (row['Execution Time'] || row['Raw Exec. Time'] || '09:30')),
    entryPrice: parseNumeric(row.Price),
    quantity: parseInteger(row.Qty),
    side: parseLightspeedSide(row.Side, row['Buy/Sell'], row['Principal Amount'], row['NET Amount']),
    commission: parseNumeric(row['Commission Amount']),
    fees: calculateLightspeedFees(row),
    broker: 'lightspeed',
    notes: `Trade #${row['Trade Number']} - ${row['Security Type']}`
  }),

  thinkorswim: (row) => {
    // Parse the DESCRIPTION field to extract trade details
    const description = row.DESCRIPTION || row.Description || '';
    const type = row.TYPE || row.Type || '';

    // Skip non-trade rows
    if (type !== 'TRD') {
      return null;
    }

    // Parse trade details from description
    // Stock format:  "BOT +1,000 82655M107 @.77"
    // Option format: "BOT +5 CRM 100 (Weeklys) 2 APR 26 175 PUT @1.44 CBOE"
    const tradeMatch = description.match(/(BOT|SOLD)\s+([\+\-]?[\d,]+)\s+(.+?)\s+@([\d.]+)/);
    if (!tradeMatch) {
      return null;
    }

    const [_, action, quantityStr, symbolPart, priceStr] = tradeMatch;
    const quantity = Math.abs(parseFloat(quantityStr.replace(/,/g, '')));
    const price = parseFloat(priceStr);
    const side = action === 'BOT' ? 'long' : 'short';

    // Detect options: "CRM 100 (Weeklys) 2 APR 26 175 PUT"
    let symbol;
    let optionData = {};
    const optionMatch = symbolPart.match(/^(\S+)\s+\d+\s+(?:\(.*?\)\s+)?(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})\s+([\d.]+)\s+(PUT|CALL)$/i);
    if (optionMatch) {
      const [, underlying, day, monthStr, yearStr, strike, optType] = optionMatch;
      const months = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
        'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
      };
      const month = months[monthStr.toUpperCase()];
      const fullYear = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
      symbol = underlying;
      optionData = {
        instrumentType: 'option',
        underlyingSymbol: underlying,
        strikePrice: parseFloat(strike),
        expirationDate: `${fullYear}-${month}-${day.padStart(2, '0')}`,
        optionType: optType.toLowerCase(),
        contractSize: 100
      };
    } else {
      symbol = symbolPart.trim();
    }

    // Parse date and time
    const date = row.DATE || row.Date || '';
    const time = row.TIME || row.Time || '';
    const dateTime = `${date} ${time}`;

    // Parse fees
    const miscFees = parseFloat((row['Misc Fees'] || '0').replace(/[$,]/g, '')) || 0;
    const commissionsFees = parseFloat((row['Commissions & Fees'] || '0').replace(/[$,]/g, '')) || 0;

    return {
      symbol: symbol,
      tradeDate: parseDate(date),
      entryTime: parseDateTime(dateTime),
      entryPrice: price,
      quantity: quantity,
      side: side,
      commission: commissionsFees,
      fees: miscFees,
      broker: 'thinkorswim',
      ...optionData
    };
  },

  ibkr: (row) => {
    // IBKR uses signed quantities: positive = buy, negative = sell
    const quantity = parseNumeric(row.Quantity, NaN);
    const absQuantity = Math.abs(quantity);
    const price = parseNumeric(row.Price, NaN);
    // IBKR commission: negative = fee paid, positive = rebate received
    // Convert to our convention: positive = fee paid, negative = rebate (credit)
    const commission = -(parseNumeric(row.Commission || 0, 0));
    const symbol = cleanString(row.Symbol);

    // Parse instrument data (options/futures detection)
    const instrumentData = parseInstrumentData(symbol);

    // Handle both "DateTime" and "Date/Time" column names
    const dateTimeValue = row.DateTime || row['Date/Time'];

    // For options, IBKR Activity Statement already reports quantity in contracts
    // No conversion needed - the quantity is already in contracts
    let finalQuantity = absQuantity;
    if (instrumentData.instrumentType === 'option') {
      // Ensure quantity is an integer for options contracts
      finalQuantity = Math.round(absQuantity);
      console.log(`[IBKR] Options contract quantity: ${finalQuantity}`);
    }

    return {
      symbol: instrumentData.underlyingSymbol || symbol,
      tradeDate: parseDate(dateTimeValue),
      entryTime: parseDateTime(dateTimeValue),
      entryPrice: price,
      quantity: finalQuantity,
      side: quantity > 0 ? 'buy' : 'sell',
      commission: commission,
      fees: parseNumeric(row.Fees || 0, 0),
      broker: 'ibkr',
      ...instrumentData
    };
  },

  ibkr_trade_confirmation: (row) => {
    // IBKR Trade Confirmation format with separate columns for options data
    // Columns: Symbol, UnderlyingSymbol, Strike, Expiry, Date/Time, Put/Call, Quantity, Multiplier, Buy/Sell, Price, Commission

    const symbol = cleanString(row.Symbol);
    const quantity = parseNumeric(row.Quantity, NaN);
    const buySell = cleanString(row['Buy/Sell']).toUpperCase();
    const price = parseNumeric(row.Price, NaN);
    // IBKR commission: negative = fee paid, positive = rebate received
    // Convert to our convention: positive = fee paid, negative = rebate (credit)
    const commission = -(parseNumeric(row.Commission || 0, 0));

    // Parse date/time - format is YYYYMMDD;HHMMSS
    const dateTimeParts = (row['Date/Time'] || '').split(';');
    const dateStr = dateTimeParts[0]; // YYYYMMDD
    const timeStr = dateTimeParts[1] || '093000'; // HHMMSS

    // Convert YYYYMMDD to YYYY-MM-DD
    const tradeDate = dateStr ? `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}` : null;

    // Convert HHMMSS to HH:MM:SS
    const time = timeStr ? `${timeStr.substring(0,2)}:${timeStr.substring(2,4)}:${timeStr.substring(4,6)}` : '09:30:00';
    const entryTime = tradeDate ? `${tradeDate}T${time}` : null;

    const instrumentData = parseIBKRTradeConfirmationInstrumentData(row, symbol);

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      entryPrice: price,
      quantity: Math.abs(quantity),
      side: buySell === 'BUY' ? 'buy' : 'sell',
      commission: commission,
      fees: 0,
      broker: 'ibkr',
      ...instrumentData
    };
  },

  etrade: (row) => ({
    symbol: row.Symbol,
    tradeDate: parseDate(row['Transaction Date']),
    entryTime: parseDateTime(row['Transaction Date']),
    entryPrice: parseFloat(row.Price),
    quantity: parseInt(row.Quantity),
    side: row['Transaction Type'].includes('Buy') ? 'long' : 'short',
    commission: parseFloat(row.Commission || 0),
    fees: parseFloat(row.Fees || 0),
    broker: 'etrade'
  }),

  schwab: (row) => {
    // Schwab provides completed trades with entry and exit data
    const quantity = Math.abs(parseInt(row.Quantity || 0));
    const isShort = parseFloat(row['Cost Per Share'] || 0) > parseFloat(row['Proceeds Per Share'] || 0) &&
                    parseFloat(row['Gain/Loss ($)'] || 0) > 0;
    
    return {
      symbol: cleanString(row.Symbol),
      tradeDate: parseDate(row['Opened Date']),
      entryTime: parseDateTime(row['Opened Date'] + ' 09:30'), // Default time since not provided
      exitTime: parseDateTime(row['Closed Date'] + ' 16:00'), // Default time since not provided
      entryPrice: isShort ? parseFloat(row['Proceeds Per Share'] || 0) : parseFloat(row['Cost Per Share'] || 0),
      exitPrice: isShort ? parseFloat(row['Cost Per Share'] || 0) : parseFloat(row['Proceeds Per Share'] || 0),
      quantity: quantity,
      side: isShort ? 'short' : 'long',
      // Schwab doesn't provide commission/fees data separately
      commission: 0, // Not provided by Schwab
      fees: 0, // Not provided by Schwab
      broker: 'schwab',
      notes: `${row.Term || 'Unknown'} - ${row['Wash Sale?'] === 'Yes' ? 'Wash Sale' : 'Normal'}`
    };
  },

  papermoney: (row) => {
    // PaperMoney provides individual executions that need to be grouped into trades
    const symbol = cleanString(row.Symbol);
    const side = row.Side ? row.Side.toLowerCase() : '';
    const quantity = Math.abs(parseInt(row.Qty || 0));
    const price = parseFloat(row.Price || row['Net Price'] || 0);
    const execTime = row['Exec Time'] || '';

    // Parse the execution time (format: "9/19/25 13:24:32")
    let tradeDate = null;
    let entryTime = null;
    if (execTime) {
      // Convert MM/DD/YY format to full date
      const dateMatch = execTime.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(.+)$/);
      if (dateMatch) {
        const [_, month, day, year, time] = dateMatch;
        // Smart year conversion: assume 00-49 is 2000-2049, 50-99 is 1950-1999
        const yearNum = parseInt(year);
        const fullYear = yearNum < 50 ? 2000 + yearNum : 1900 + yearNum;
        const fullDate = `${month}/${day}/${fullYear} ${time}`;
        tradeDate = parseDate(fullDate);
        entryTime = parseDateTime(fullDate);
      }
    }

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      entryPrice: price,
      quantity: quantity,
      side: side === 'buy' ? 'buy' : 'sell',
      commission: 0, // PaperMoney doesn't show commissions in this format
      fees: 0,
      broker: 'papermoney',
      notes: `${row['Pos Effect'] || ''} - ${row.Type || 'STOCK'}`
    };
  },

  tradingview: (row) => {
    // TradingView provides individual orders that need to be grouped into trades
    const symbol = cleanString(row.Symbol);
    const side = row.Side ? row.Side.toLowerCase() : '';
    const status = row.Status || '';
    const quantity = Math.abs(parseInteger(row['Filled Qty'] || row.Qty));
    const fillPrice = parseNumeric(row['Fill Price'] || row['Avg Fill Price']);
    const commission = parseNumeric(row.Commission);
    const placingTime = row['Placing Time'] || '';
    const closingTime = row['Closing Time'] || row['Update Time'] || '';
    const orderId = row['Order ID'] || '';
    const orderType = row.Type || '';
    const leverage = row.Leverage || '';

    // Only process filled orders - if no Status column exists, treat all rows as filled
    if (status && status !== 'Filled') {
      return null;
    }

    // Parse the datetime (format: "2025-10-02 21:28:16")
    const tradeDate = parseDate(closingTime || placingTime);
    const entryTime = parseDateTime(closingTime || placingTime);

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      entryPrice: fillPrice,
      quantity: quantity,
      side: side === 'buy' ? 'buy' : side === 'sell' ? 'sell' : side,
      commission: commission,
      fees: 0,
      broker: 'tradingview',
      orderId: orderId,
      orderType: orderType,
      leverage: leverage,
      notes: `${orderType} order ${leverage ? `with ${leverage} leverage` : ''}`
    };
  },

  projectx: (row) => {
    // ProjectX provides completed trades with entry and exit times
    // Format: Id,ContractName,EnteredAt,ExitedAt,EntryPrice,ExitPrice,Fees,PnL,Size,Type,TradeDay,TradeDuration,Commissions

    // Get Id field - handle BOM character that may be present
    const tradeId = row.Id || row['﻿Id'] || row['\uFEFFId'] || '';
    const contractName = cleanString(row.ContractName);
    const enteredAt = row.EnteredAt || '';
    const exitedAt = row.ExitedAt || '';
    const type = row.Type || '';
    const quantity = Math.abs(parseInteger(row.Size));
    const entryPrice = parseNumeric(row.EntryPrice);
    const exitPrice = parseNumeric(row.ExitPrice);
    const fees = parseNumeric(row.Fees);
    const commissions = parseNumeric(row.Commissions);
    const pnl = parseNumeric(row.PnL);
    const tradeDuration = row.TradeDuration || '';

    // Parse timestamps (format: "10/01/2025 21:13:23 +02:00")
    const tradeDate = parseDate(enteredAt);
    const entryTime = parseDateTime(enteredAt);
    const exitTime = parseDateTime(exitedAt);

    // Determine side from Type field (Long/Short)
    // Database expects 'long' or 'short', not 'buy' or 'sell'
    const side = type.toLowerCase() === 'long' ? 'long' : 'short';

    // Parse instrument data for futures/options
    const instrumentData = parseInstrumentData(contractName);

    return {
      symbol: contractName,
      tradeDate: tradeDate,
      entryTime: entryTime,
      exitTime: exitTime,
      entryPrice: entryPrice,
      exitPrice: exitPrice,
      quantity: quantity,
      side: side,
      commission: commissions,  // Commissions map to commission field
      fees: fees,               // Fees map to fees field
      profitLoss: pnl,
      broker: 'projectx',
      notes: `Trade #${tradeId} - Duration: ${tradeDuration}`,
      ...instrumentData  // Add futures/options metadata
    };
  },

  tradervue: (row) => {
    const openDateTime = row['Open Datetime'] || row.OpenDatetime || row['Open Date/Time'] || '';
    const closeDateTime = row['Close Datetime'] || row.CloseDatetime || row['Close Date/Time'] || '';
    const pnl = parseNumeric(row['Gross P&L']);
    const pnlPercent = parseNumeric(row['Gross P&L (%)']);

    return {
      symbol: cleanString(row.Symbol),
      tradeDate: parseDate(openDateTime || closeDateTime),
      entryTime: parseDateTime(openDateTime),
      exitTime: parseDateTime(closeDateTime),
      entryPrice: parseNumeric(row['Entry Price']),
      exitPrice: parseNumeric(row['Exit Price']),
      quantity: Math.abs(parseNumeric(row.Volume)),
      side: parseTradervueSide(row.Side),
      commission: 0,
      fees: 0,
      pnl: pnl,
      profitLoss: pnl,
      pnlPercent: pnlPercent,
      broker: 'tradervue',
      notes: cleanString(row.Notes),
      tags: parseTagList(row.Tags || row.tags)
    };
  },

  tradestation: (row) => {
    // TradeStation/TradeNote format
    // Headers: Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note

    const symbol = cleanString(row.Symbol);
    const tradeDate = parseDate(row['T/D']); // Trade date
    const execTime = row['Exec Time'] || '';
    const entryTime = parseDateTime(`${row['T/D']} ${execTime}`);
    const side = parseSide(row.Side);
    const quantity = Math.abs(parseInteger(row.Qty));
    const price = parseNumeric(row.Price);

    // Calculate total fees from all fee columns
    const commission = parseNumeric(row.Comm) || 0;
    const sec = parseNumeric(row.SEC) || 0;
    const taf = parseNumeric(row.TAF) || 0;
    const nscc = parseNumeric(row.NSCC) || 0;
    const nasdaq = parseNumeric(row.Nasdaq) || 0;
    const ecnRemove = parseNumeric(row['ECN Remove']) || 0;
    const ecnAdd = parseNumeric(row['ECN Add']) || 0;
    const totalFees = commission + sec + taf + nscc + nasdaq + ecnRemove + ecnAdd;

    const currency = (row.Currency || 'USD').toUpperCase();
    const type = cleanString(row.Type); // E, O for equity/option
    const note = cleanString(row.Note);

    // Check if this is an option based on Type field
    let instrumentData = {};
    if (type === 'O' || type === 'Option') {
      instrumentData = parseInstrumentData(symbol);
    }

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      exitTime: null, // TradeStation exports are transactions, not completed trades
      entryPrice: price,
      exitPrice: null,
      quantity: quantity,
      side: side,
      commission: totalFees,
      fees: totalFees,
      currency: currency,
      broker: 'tradestation',
      notes: note || `TradeStation ${type} trade`,
      ...instrumentData
    };
  },

  tradingview_performance: (row) => {
    // TradingView Performance export - contains completed trades with entry/exit
    // Headers: symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration

    const symbol = cleanString(row.symbol);
    const quantity = Math.abs(parseInteger(row.qty));
    const buyPrice = parseNumeric(row.buyPrice);
    const sellPrice = parseNumeric(row.sellPrice);
    const pnl = parseNumeric(row.pnl);

    // Parse timestamps - can be Unix timestamps in milliseconds or local date strings like "02/26/2026 09:12:07"
    const parseTradingViewPerformanceTimestamp = (value) => {
      if (!value) return null;

      const ts = Number(value);
      if (Number.isFinite(ts) && Math.abs(ts) > 1e10) {
        const parsed = new Date(ts);
        return isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }

      return parseDateTime(value);
    };

    let entryTime = null;
    let exitTime = null;

    if (row.boughtTimestamp) {
      entryTime = parseTradingViewPerformanceTimestamp(row.boughtTimestamp);
    }
    if (row.soldTimestamp) {
      exitTime = parseTradingViewPerformanceTimestamp(row.soldTimestamp);
    }
    const tradeDate = parseDate(row.boughtTimestamp) || (entryTime ? entryTime.split('T')[0] : null);

    // Determine side based on P&L and prices
    // If sellPrice > buyPrice and PnL > 0, it was a long trade
    // If sellPrice < buyPrice and PnL > 0, it was a short trade
    const side = pnl >= 0
      ? (sellPrice >= buyPrice ? 'long' : 'short')
      : (sellPrice >= buyPrice ? 'short' : 'long');

    // Parse instrument data for futures/options
    const instrumentData = parseInstrumentData(symbol);

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      exitTime: exitTime,
      entryPrice: side === 'long' ? buyPrice : sellPrice,
      exitPrice: side === 'long' ? sellPrice : buyPrice,
      quantity: quantity,
      side: side,
      commission: 0, // No commission data in this format
      fees: 0,
      broker: 'tradingview',
      profitLoss: pnl,
      notes: `Duration: ${row.duration || 'N/A'}`,
      ...instrumentData
    };
  }
};

/**
 * Groups completed trades based on entry time proximity
 * Applies to all broker formats - merges trades for same symbol within time gap
 * @param {Array} trades - Array of parsed trades
 * @param {Object} settings - Grouping settings {enabled, timeGapMinutes}
 * @returns {Array} - Array of grouped trades
 */
function applyTradeGrouping(trades, settings) {
  if (!trades || trades.length === 0) return trades;

  console.log(`\n=== APPLYING TRADE GROUPING ===`);
  console.log(`Grouping ${trades.length} trades with ${settings.timeGapMinutes} minute time gap`);

  // Group by grouping key - for options, include strike/expiry/type to keep different contracts separate
  const tradesByGroupKey = {};
  trades.forEach(trade => {
    let groupKey;
    if (trade.instrumentType === 'option' && trade.strikePrice && trade.expirationDate && trade.optionType) {
      // For options: group by underlying + strike + expiration + call/put
      // This ensures different contracts on the same underlying are kept separate
      groupKey = `${trade.symbol}_${trade.strikePrice}_${trade.expirationDate}_${trade.optionType}`;
    } else {
      // For stocks and other instruments: group by symbol only
      groupKey = trade.symbol;
    }
    if (!tradesByGroupKey[groupKey]) {
      tradesByGroupKey[groupKey] = [];
    }
    tradesByGroupKey[groupKey].push(trade);
  });

  const groupedTrades = [];

  // Process each group separately
  for (const [groupKey, symbolTrades] of Object.entries(tradesByGroupKey)) {
    console.log(`\n[GROUPING] Processing ${symbolTrades.length} trades for ${groupKey}`);

    // Sort by entry time
    symbolTrades.sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));

    let currentGroup = null;
    let lastEntryTime = null;

    for (const trade of symbolTrades) {
      const entryTime = new Date(trade.entryTime);

      if (!currentGroup) {
        // Start new group - initialize with executionData array (matches Trade model)
        // For grouped trades, each execution represents a complete round-trip sub-trade
        // Handle both 'pnl' and 'profitLoss' field names (different parsers use different names)
        const tradePnlValue = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
        currentGroup = {
          ...trade,
          pnl: tradePnlValue, // Ensure pnl field is set
          profitLoss: tradePnlValue, // Set both for compatibility
          groupedTrades: 1,
          executionData: trade.executionData || trade.executions || [{
            entryTime: trade.entryTime,
            entryPrice: trade.entryPrice,
            exitTime: trade.exitTime,
            exitPrice: trade.exitPrice,
            quantity: trade.quantity,
            side: trade.side,
            commission: trade.commission || 0,
            fees: trade.fees || 0,
            pnl: tradePnlValue
          }]
        };
        lastEntryTime = entryTime;
        console.log(`  [GROUPING] Started new group at ${trade.entryTime}`);
      } else {
        // Check time gap
        const timeSinceLastEntry = (entryTime - lastEntryTime) / (1000 * 60); // minutes

        // Only group if same side and within time gap
        if (timeSinceLastEntry <= settings.timeGapMinutes && trade.side === currentGroup.side) {
          // Merge into current group
          console.log(`  [GROUPING] Merging trade: ${timeSinceLastEntry.toFixed(1)}min gap (${trade.side} ${trade.quantity}@${trade.entryPrice})`);

          // Add this trade's execution to the executionData array
          // For grouped trades, each execution represents a complete round-trip sub-trade
          // Handle both 'pnl' and 'profitLoss' field names
          const executionPnl = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
          const newExecution = {
            entryTime: trade.entryTime,
            entryPrice: trade.entryPrice,
            exitTime: trade.exitTime,
            exitPrice: trade.exitPrice,
            quantity: trade.quantity,
            side: trade.side,
            commission: trade.commission || 0,
            fees: trade.fees || 0,
            pnl: executionPnl
          };

          // If trade has its own executionData/executions array, merge those; otherwise add as single execution
          if ((trade.executionData || trade.executions) && Array.isArray(trade.executionData || trade.executions)) {
            currentGroup.executionData.push(...(trade.executionData || trade.executions));
          } else {
            currentGroup.executionData.push(newExecution);
          }

          // Calculate weighted average entry price
          const totalQuantity = currentGroup.quantity + trade.quantity;
          const totalEntryValue = (currentGroup.entryPrice * currentGroup.quantity) + (trade.entryPrice * trade.quantity);
          currentGroup.entryPrice = totalEntryValue / totalQuantity;

          // Combine quantities
          currentGroup.quantity = totalQuantity;

          // Combine costs
          currentGroup.commission = (currentGroup.commission || 0) + (trade.commission || 0);
          currentGroup.fees = (currentGroup.fees || 0) + (trade.fees || 0);
          currentGroup.entryCommission = (currentGroup.entryCommission || 0) + (trade.entryCommission || 0);
          currentGroup.exitCommission = (currentGroup.exitCommission || 0) + (trade.exitCommission || 0);
          const totalFees = (currentGroup.commission || 0) + (currentGroup.fees || 0);

          // Track grouped count
          currentGroup.groupedTrades = (currentGroup.groupedTrades || 1) + 1;

          // Calculate weighted average exit price if both have exit prices (do this before P&L calculation)
          if (trade.exitTime) {
            currentGroup.exitTime = trade.exitTime;
            if (currentGroup.exitPrice && trade.exitPrice) {
              const prevQuantity = currentGroup.quantity - trade.quantity;
              currentGroup.exitPrice = ((currentGroup.exitPrice * prevQuantity) + (trade.exitPrice * trade.quantity)) / totalQuantity;
            } else if (trade.exitPrice) {
              currentGroup.exitPrice = trade.exitPrice;
            }
          }

          // Preserve instrument type from trade if not already set in group
          if (!currentGroup.instrumentType && trade.instrumentType) {
            currentGroup.instrumentType = trade.instrumentType;
            if (trade.pointValue) {
              currentGroup.pointValue = trade.pointValue;
            }
            if (trade.contractSize !== undefined) {
              currentGroup.contractSize = trade.contractSize;
            }
          }

          // Recalculate P&L from combined entry/exit prices and total fees
          // This ensures consistency with the weighted average prices
          // Use the same calculation method as Trade.calculatePnL to ensure exact match
          if (currentGroup.exitPrice && currentGroup.side && currentGroup.entryPrice && currentGroup.quantity > 0) {
            // Determine multiplier using same logic as Trade.calculatePnL
            let multiplier;
            if (currentGroup.instrumentType === 'future') {
              multiplier = currentGroup.pointValue || 1;
            } else if (currentGroup.instrumentType === 'option') {
              multiplier = currentGroup.contractSize || 100;
            } else {
              multiplier = 1;
            }

            // Calculate P&L using exact same formula as Trade.calculatePnL
            let pnl;
            if (currentGroup.side === 'long') {
              pnl = (currentGroup.exitPrice - currentGroup.entryPrice) * currentGroup.quantity * multiplier;
            } else {
              pnl = (currentGroup.entryPrice - currentGroup.exitPrice) * currentGroup.quantity * multiplier;
            }

            // Subtract commission and fees (matches Trade.calculatePnL: totalPnL = pnl - commission - fees)
            currentGroup.pnl = pnl - (currentGroup.commission || 0) - (currentGroup.fees || 0);
            currentGroup.profitLoss = currentGroup.pnl; // Set both for compatibility

            // Recalculate PL% based on the recalculated P&L and entry value
            const entryValue = currentGroup.entryPrice * currentGroup.quantity * multiplier;
            if (entryValue > 0) {
              currentGroup.pnlPercent = (currentGroup.pnl / entryValue) * 100;
            } else {
              currentGroup.pnlPercent = 0;
            }
          } else {
            // If exit price not available, fall back to summing P&L (for open positions)
            const tradePnl = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
            const groupPnl = currentGroup.pnl !== undefined ? currentGroup.pnl : (currentGroup.profitLoss || 0);
            const totalPnl = groupPnl + tradePnl;
            currentGroup.pnl = totalPnl;
            currentGroup.profitLoss = totalPnl;

            // Recalculate PL% for open positions by summing entry values
            // Calculate entry value from the grouped trade
            let multiplier;
            if (currentGroup.instrumentType === 'future') {
              multiplier = currentGroup.pointValue || 1;
            } else if (currentGroup.instrumentType === 'option') {
              multiplier = currentGroup.contractSize || 100;
            } else {
              multiplier = 1;
            }
            const groupEntryValue = currentGroup.entryPrice * currentGroup.quantity * multiplier;
            
            // Calculate entry value for the trade being added
            let tradeMultiplier;
            if (trade.instrumentType === 'future') {
              tradeMultiplier = trade.pointValue || 1;
            } else if (trade.instrumentType === 'option') {
              tradeMultiplier = trade.contractSize || 100;
            } else {
              tradeMultiplier = 1;
            }
            const tradeEntryValue = trade.entryPrice * trade.quantity * tradeMultiplier;
            
            const totalEntryValue = groupEntryValue + tradeEntryValue;
            if (totalEntryValue > 0) {
              currentGroup.pnlPercent = (totalPnl / totalEntryValue) * 100;
            } else {
              currentGroup.pnlPercent = 0;
            }
          }

          // Keep original notes without merging
          if (!currentGroup.originalNotes) {
            currentGroup.originalNotes = currentGroup.notes;
          }
        } else {
          // Time gap exceeded or different side, save current group and start new one
          const reason = trade.side !== currentGroup.side ? 'different side' : `gap exceeded (${timeSinceLastEntry.toFixed(1)}min)`;
          console.log(`  [GROUPING] ${reason}, starting new group`);
          groupedTrades.push(currentGroup);
          // Handle both 'pnl' and 'profitLoss' field names
          const newGroupPnl = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
          currentGroup = {
            ...trade,
            pnl: newGroupPnl, // Ensure pnl field is set
            profitLoss: newGroupPnl, // Set both for compatibility
            groupedTrades: 1,
            executionData: trade.executionData || trade.executions || [{
              entryTime: trade.entryTime,
              entryPrice: trade.entryPrice,
              exitTime: trade.exitTime,
              exitPrice: trade.exitPrice,
              quantity: trade.quantity,
              side: trade.side,
              commission: trade.commission || 0,
              fees: trade.fees || 0,
              pnl: newGroupPnl
            }]
          };
          lastEntryTime = entryTime;
          console.log(`  [GROUPING] Started new group at ${trade.entryTime}`);
        }
      }
    }

    // Add final group for this symbol
    if (currentGroup) {
      groupedTrades.push(currentGroup);
    }
  }

  console.log(`[SUCCESS] Grouped ${trades.length} trades into ${groupedTrades.length} trades`);
  return groupedTrades;
}

/**
 * Helper to wrap parsing results with diagnostics
 * @param {Array} trades - Parsed trades array
 * @param {Object} diagnostics - Diagnostics object
 * @param {Array} unresolvedCusips - Optional unresolved CUSIPs
 * @returns {Object} - { trades, diagnostics, unresolvedCusips }
 */
/**
 * Convert all naive datetime fields in trades to UTC using the user's timezone.
 * Fields that already have a Z suffix or timezone offset are left unchanged.
 * Also converts datetime fields inside execution arrays.
 *
 * @param {Array} trades - Array of trade objects
 * @param {string} timezone - IANA timezone (e.g., "America/New_York")
 * @returns {Array} trades with datetime fields converted to UTC
 */
function convertTradeDatetimesToUTC(trades, timezone) {
  if (!timezone || timezone === 'UTC' || !trades || trades.length === 0) {
    return trades;
  }

  const datetimeFields = ['entryTime', 'exitTime', 'entry_time', 'exit_time'];
  const executionDatetimeFields = ['datetime', 'time', 'entry_time', 'exit_time', 'entryTime', 'exitTime'];
  const executionFields = ['executions', 'executionData', 'execution'];

  for (const trade of trades) {
    for (const field of datetimeFields) {
      if (trade[field] && typeof trade[field] === 'string') {
        trade[field] = localToUTC(trade[field], timezone);
      }
    }

    // Also convert execution datetimes if present
    for (const executionField of executionFields) {
      const executions = trade[executionField];
      if (Array.isArray(executions)) {
        for (const exec of executions) {
          for (const field of executionDatetimeFields) {
            if (exec[field] && typeof exec[field] === 'string') {
              exec[field] = localToUTC(exec[field], timezone);
            }
          }
        }
      }
    }
  }

  return trades;
}

function normalizeExecutionCollections(trades) {
  if (!Array.isArray(trades) || trades.length === 0) {
    return trades;
  }

  const executionFields = ['executions', 'executionData', 'execution'];
  const compareExecutionOrderIds = (left, right) => {
    if (!left || !right) return 0;
    const leftOrderId = left.orderId ?? left.orderID ?? left.tradeId ?? left.tradeID ?? '';
    const rightOrderId = right.orderId ?? right.orderID ?? right.tradeId ?? right.tradeID ?? '';
    if (!leftOrderId || !rightOrderId) return 0;

    return String(leftOrderId).localeCompare(String(rightOrderId), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  };

  for (const trade of trades) {
    for (const field of executionFields) {
      if (!Array.isArray(trade[field])) continue;

      const seen = new Set();
      trade[field] = trade[field]
        .filter(Boolean)
        .sort((left, right) => {
          const leftTime = new Date(left.datetime || left.entryTime || left.entry_time || 0).getTime();
          const rightTime = new Date(right.datetime || right.entryTime || right.entry_time || 0).getTime();
          if (leftTime !== rightTime) {
            return leftTime - rightTime;
          }

          const orderDiff = compareExecutionOrderIds(left, right);
          if (orderDiff !== 0) {
            return orderDiff;
          }

          const leftSourceIndex = Number(left.sourceIndex ?? left.source_index ?? 0);
          const rightSourceIndex = Number(right.sourceIndex ?? right.source_index ?? 0);
          if (leftSourceIndex !== rightSourceIndex) {
            return leftSourceIndex - rightSourceIndex;
          }

          return 0;
        })
        .filter((execution) => {
          const identifierKey =
            execution.sequenceNumber ??
            execution.sequence_number ??
            execution.orderId ??
            execution.orderID ??
            execution.tradeId ??
            execution.tradeID ??
            execution.sourceIndex ??
            execution.source_index ??
            null;

          if (identifierKey === null || identifierKey === undefined || identifierKey === '') {
            return true;
          }

          const dedupeKey = String(identifierKey);

          if (seen.has(dedupeKey)) {
            return false;
          }

          seen.add(dedupeKey);
          return true;
        });
    }
  }

  return trades;
}

function getExecutionSignedQuantity(execution) {
  const action = String(execution.action || execution.side || '').toLowerCase();
  const quantity = Number(execution.quantity || 0);
  if (!quantity) return 0;
  if (action === 'buy' || action === 'cover') return quantity;
  if (action === 'sell' || action === 'short') return -quantity;
  return 0;
}

function getTradeValueMultiplier(trade) {
  if (trade?.instrumentType === 'future' || trade?.instrument_type === 'future') {
    return Number(trade.pointValue || trade.point_value || 1);
  }
  if (trade?.instrumentType === 'option' || trade?.instrument_type === 'option') {
    return Number(trade.contractSize || trade.contract_size || 100);
  }
  return 1;
}

function cloneTradeMetadata(trade) {
  return {
    symbol: trade.symbol,
    tradeDate: trade.tradeDate || trade.trade_date,
    broker: trade.broker,
    accountIdentifier: trade.accountIdentifier || trade.account_identifier,
    instrumentType: trade.instrumentType || trade.instrument_type,
    strikePrice: trade.strikePrice || trade.strike_price,
    expirationDate: trade.expirationDate || trade.expiration_date,
    optionType: trade.optionType || trade.option_type,
    contractSize: trade.contractSize || trade.contract_size,
    pointValue: trade.pointValue || trade.point_value,
    underlyingSymbol: trade.underlyingSymbol || trade.underlying_symbol,
    contractMonth: trade.contractMonth || trade.contract_month,
    contractYear: trade.contractYear || trade.contract_year,
    tickSize: trade.tickSize || trade.tick_size,
    underlyingAsset: trade.underlyingAsset || trade.underlying_asset,
    brokerConnectionId: trade.brokerConnectionId || trade.broker_connection_id
  };
}

function finalizeRepairedTrade(trade, valueMultiplier) {
  if (!trade) return null;

  trade.entryPrice = trade.totalQuantity > 0
    ? trade.entryValue / (trade.totalQuantity * valueMultiplier)
    : null;
  trade.quantity = trade.currentPosition === 0 ? trade.totalQuantity : Math.abs(trade.currentPosition);
  trade.commission = trade.totalFees;
  trade.fees = 0;
  trade.executionData = trade.executions;

  let entryCommission = 0;
  let exitCommission = 0;
  trade.executions.forEach((exec) => {
    if ((trade.side === 'long' && exec.action === 'buy') || (trade.side === 'short' && exec.action === 'sell')) {
      entryCommission += Number(exec.fees || exec.commission || 0);
    } else {
      exitCommission += Number(exec.fees || exec.commission || 0);
    }
  });
  trade.entryCommission = entryCommission;
  trade.exitCommission = exitCommission;

  const { entryTime, exitTime } = getExecutionTimeBounds(trade.executions);
  trade.entryTime = entryTime || trade.entryTime;

  if (trade.currentPosition === 0) {
    trade.exitPrice = trade.totalQuantity > 0
      ? trade.exitValue / (trade.totalQuantity * valueMultiplier)
      : null;
    trade.exitTime = exitTime || trade.exitTime;
    trade.pnl = trade.side === 'long'
      ? trade.exitValue - trade.entryValue - trade.totalFees
      : trade.entryValue - trade.exitValue - trade.totalFees;
    trade.pnlPercent = trade.entryValue > 0 ? (trade.pnl / trade.entryValue) * 100 : 0;
    trade.notes = trade.notes || `Round trip: ${trade.executions.length} executions`;
  } else {
    trade.exitPrice = null;
    trade.exitTime = null;
    trade.pnl = 0;
    trade.pnlPercent = 0;
    trade.notes = trade.notes || `Open position: ${trade.executions.length} executions`;
  }

  delete trade.currentPosition;
  delete trade.entryValue;
  delete trade.exitValue;
  delete trade.totalFees;
  delete trade.totalQuantity;
  return trade;
}

function rebuildTradeFromExecutions(trade) {
  const executions = Array.isArray(trade.executions) ? trade.executions.filter(Boolean) : [];
  if (executions.length === 0) {
    return [trade];
  }

  const valueMultiplier = getTradeValueMultiplier(trade);
  const metadata = cloneTradeMetadata(trade);
  const rebuilt = [];
  let current = null;
  let currentPosition = 0;

  const startTrade = (execution, signedQty, feePortion, explicitQuantity = null) => {
    const quantity = explicitQuantity ?? Math.abs(signedQty);
    current = {
      ...metadata,
      side: signedQty > 0 ? 'long' : 'short',
      tradeDate: trade.tradeDate || trade.trade_date || (execution.datetime || execution.entryTime || '').split('T')[0],
      entryTime: execution.datetime || execution.entryTime || execution.entry_time || null,
      executions: [{
        ...execution,
        quantity,
        fees: feePortion
      }],
      totalQuantity: quantity,
      totalFees: feePortion,
      entryValue: quantity * Number(execution.price ?? execution.entryPrice ?? 0) * valueMultiplier,
      exitValue: 0,
      currentPosition: signedQty > 0 ? quantity : -quantity
    };
    currentPosition = current.currentPosition;
  };

  for (const execution of executions) {
    const signedQty = getExecutionSignedQuantity(execution);
    if (!signedQty) continue;

    const execPrice = Number(execution.price ?? execution.entryPrice ?? execution.exitPrice ?? 0);
    const execFees = Number(execution.fees ?? execution.commission ?? 0);

    if (!current || currentPosition === 0) {
      startTrade(execution, signedQty, execFees);
      continue;
    }

    const sameDirection = (currentPosition > 0 && signedQty > 0) || (currentPosition < 0 && signedQty < 0);
    if (sameDirection) {
      current.executions.push({ ...execution, fees: execFees });
      current.totalFees += execFees;
      current.totalQuantity += Math.abs(signedQty);
      current.entryValue += Math.abs(signedQty) * execPrice * valueMultiplier;
      currentPosition += signedQty;
      current.currentPosition = currentPosition;
      continue;
    }

    const closeQty = Math.min(Math.abs(currentPosition), Math.abs(signedQty));
    const reversalQty = Math.abs(signedQty) - closeQty;
    const closeFee = Math.abs(signedQty) > 0 ? execFees * (closeQty / Math.abs(signedQty)) : 0;
    const openFee = execFees - closeFee;
    const closeAction = current.side === 'long' ? 'sell' : 'buy';

    current.executions.push({
      ...execution,
      action: closeAction,
      quantity: closeQty,
      fees: closeFee
    });
    current.totalFees += closeFee;
    current.exitValue += closeQty * execPrice * valueMultiplier;
    currentPosition += signedQty > 0 ? closeQty : -closeQty;
    current.currentPosition = currentPosition;

    if (currentPosition === 0) {
      rebuilt.push(finalizeRepairedTrade(current, valueMultiplier));
      current = null;
    }

    if (reversalQty > 0) {
      const reversalSignedQty = signedQty > 0 ? reversalQty : -reversalQty;
      startTrade(execution, reversalSignedQty, openFee, reversalQty);
    }
  }

  if (current) {
    rebuilt.push(finalizeRepairedTrade(current, valueMultiplier));
  }

  return rebuilt.length > 0 ? rebuilt : [trade];
}

function repairTradeReversals(trades, diagnostics) {
  if (!Array.isArray(trades) || trades.length === 0) {
    return trades;
  }

  const repairedTrades = [];

  for (const trade of trades) {
    const executions = Array.isArray(trade.executions) ? trade.executions : [];
    if (executions.length === 0) {
      repairedTrades.push(trade);
      continue;
    }

    let position = 0;
    let sawFlip = false;
    for (const execution of executions) {
      const signedQty = getExecutionSignedQuantity(execution);
      if (!signedQty) continue;
      const previous = position;
      position += signedQty;
      if (previous !== 0 && position !== 0 && Math.sign(previous) !== Math.sign(position)) {
        sawFlip = true;
        break;
      }
    }

    const storedQuantity = Number(trade.quantity || 0);
    const storedSide = String(trade.side || '').toLowerCase();
    const isStoredOpen = !trade.exitPrice && !trade.exit_price && !trade.exitTime && !trade.exit_time;
    const netQuantity = Math.abs(position);
    const sideMismatch =
      position !== 0 &&
      storedSide &&
      ((position > 0 && storedSide !== 'long') || (position < 0 && storedSide !== 'short'));
    const quantityMismatch =
      position !== 0 &&
      storedQuantity > 0 &&
      Math.abs(netQuantity - storedQuantity) > 1e-9;
    const statusMismatch =
      (position === 0 && isStoredOpen) ||
      (position !== 0 && !isStoredOpen);

    if (!sawFlip && !sideMismatch && !quantityMismatch && !statusMismatch) {
      repairedTrades.push(trade);
      continue;
    }

    const rebuilt = rebuildTradeFromExecutions(trade);
    const reasons = [];
    if (sawFlip) reasons.push('reversal');
    if (sideMismatch) reasons.push('side mismatch');
    if (quantityMismatch) reasons.push('quantity mismatch');
    if (statusMismatch) reasons.push('status mismatch');
    diagnostics.warnings.push(`Repaired inconsistent trade for ${trade.symbol} into ${rebuilt.length} trades (${reasons.join(', ')})`);
    repairedTrades.push(...rebuilt);
  }

  return repairedTrades;
}

function wrapResultWithDiagnostics(trades, diagnostics, unresolvedCusips = [], userTimezone = null) {
  // Convert naive datetimes to UTC using the user's timezone
  if (userTimezone && userTimezone !== 'UTC') {
    console.log(`[TIMEZONE] Converting trade datetimes from ${userTimezone} to UTC`);
    convertTradeDatetimesToUTC(trades, userTimezone);
  }

  normalizeExecutionCollections(trades);
  trades = repairTradeReversals(trades, diagnostics);

  // Update diagnostics with final counts
  diagnostics.parsedRows = trades.length;

  // Calculate skip rate
  if (diagnostics.totalRows > 0) {
    const skipRate = ((diagnostics.skippedRows + diagnostics.invalidRows) / diagnostics.totalRows) * 100;
    if (skipRate > 50) {
      diagnostics.warnings.push(`High skip rate: ${skipRate.toFixed(1)}% of rows were skipped or invalid`);
    }
  }

  // Log diagnostics summary
  console.log(`[DIAGNOSTICS] Total: ${diagnostics.totalRows}, Parsed: ${diagnostics.parsedRows}, Skipped: ${diagnostics.skippedRows}, Invalid: ${diagnostics.invalidRows}`);
  if (diagnostics.skippedReasons.length > 0) {
    console.log(`[DIAGNOSTICS] Skip reasons (first 5): ${JSON.stringify(diagnostics.skippedReasons.slice(0, 5))}`);
  }

  return {
    trades,
    diagnostics,
    unresolvedCusips
  };
}

async function parseCSV(fileBuffer, broker = 'generic', context = {}) {
  // Initialize diagnostics object to track parsing details
  const diagnostics = {
    totalRows: 0,           // Total CSV rows (excluding header)
    parsedRows: 0,          // Rows successfully parsed
    skippedRows: 0,         // Rows intentionally skipped (wrong type, etc.)
    invalidRows: 0,         // Rows with validation errors
    skippedReasons: [],     // Array of { row: number, reason: string }
    warnings: [],           // Non-fatal issues
    detectedBroker: null,   // What auto-detect found (or selected broker)
    selectedBroker: broker, // What user originally selected
    headerAnalysis: {
      foundHeaders: [],
      recognizedAs: null    // Which broker pattern matched
    }
  };

  try {
    console.log(`[CURRENCY DEBUG] parseCSV called with broker: ${broker}, userId: ${context.userId}`);

    // Handle auto-detection
    const originalBroker = broker;
    if (broker === 'auto') {
      const detectedBroker = detectBrokerFormat(fileBuffer);
      console.log(`[AUTO-DETECT] Using detected broker format: ${detectedBroker}`);
      diagnostics.detectedBroker = detectedBroker;
      diagnostics.headerAnalysis.recognizedAs = detectedBroker;
      broker = detectedBroker;
    } else {
      diagnostics.detectedBroker = broker;
      diagnostics.headerAnalysis.recognizedAs = broker;
    }

    const existingPositions = context.existingPositions || {};
    const userTimezone = context.userTimezone || null;
    console.log(`\n=== IMPORT CONTEXT ===`);
    console.log(`Broker format: ${broker}`);
    console.log(`User ID: ${context.userId || 'NOT PROVIDED'}`);
    console.log(`User timezone: ${userTimezone || 'NOT PROVIDED (will store as-is)'}`);
    console.log(`Existing open positions: ${Object.keys(existingPositions).length}`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} shares @ $${position.entryPrice}`);
    });
    console.log(`=====================\n`);
    
    let csvString = fileBuffer.toString('utf-8');

    // Remove BOM (Byte Order Mark) if present - this can cause parsing issues
    if (csvString.charCodeAt(0) === 0xFEFF) {
      csvString = csvString.slice(1);
      console.log('Removed BOM from CSV file');
    }
    // Also handle UTF-8 BOM (EF BB BF)
    if (csvString.startsWith('\uFEFF')) {
      csvString = csvString.slice(1);
      console.log('Removed UTF-8 BOM from CSV file');
    }

    // Some broker exports wrap the entire header/data row in a single quoted field.
    // Normalize those rows before broker detection and parsing.
    csvString = normalizeWholeLineQuotedCsvRows(csvString);

    // TradingView sub-format detection: inspect CSV headers to route to the correct parser
    // All TradingView formats come in as broker='tradingview', we determine the sub-format here
    if (broker === 'tradingview') {
      const headerLine = csvString.split('\n').find(line => line.trim().length > 0) || '';
      const tvHeaders = headerLine.toLowerCase();
      if (tvHeaders.includes('buyfillid') && tvHeaders.includes('sellfillid') && tvHeaders.includes('pnl')) {
        broker = 'tradingview_performance';
        console.log('[TRADINGVIEW] Sub-format detected: Performance export');
      } else if (tvHeaders.includes('buyprice') && tvHeaders.includes('sellprice') &&
                 tvHeaders.includes('status') && !tvHeaders.includes('buyfillid')) {
        broker = 'tradingview_paper';
        console.log('[TRADINGVIEW] Sub-format detected: Paper trading');
      } else {
        console.log('[TRADINGVIEW] Sub-format detected: Futures transactions');
      }
      // Keep diagnostics showing 'tradingview' as the detected broker for the user
      diagnostics.detectedBroker = 'tradingview';
    }

    // Handle Lightspeed CSV files that start with a title row
    if (broker === 'lightspeed') {
      const lines = csvString.split('\n');
      // Skip the first line if it doesn't contain commas (likely a title row)
      if (lines.length > 1 && !lines[0].includes(',') && lines[1].includes(',')) {
        csvString = lines.slice(1).join('\n');
        console.log('Skipped title row in Lightspeed CSV');
      }
    }
    
    // Handle PaperMoney CSV files that have multiple sections
    if (broker === 'papermoney') {
      const lines = csvString.split('\n');
      
      // Find the "Filled Orders" section
      let filledOrdersStart = -1;
      let filledOrdersEnd = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Filled Orders')) {
          filledOrdersStart = i + 1; // Skip the "Filled Orders" title line
          break;
        }
      }
      
      if (filledOrdersStart >= 0) {
        // Find the header line (contains "Exec Time,Spread,Side,Qty")
        for (let i = filledOrdersStart; i < lines.length; i++) {
          if (lines[i].includes('Exec Time') && lines[i].includes('Side') && lines[i].includes('Qty')) {
            filledOrdersStart = i;
            break;
          }
        }

        // Find the end of the filled orders section (next empty line or section)
        for (let i = filledOrdersStart + 1; i < lines.length; i++) {
          if (lines[i].trim() === '' || lines[i].includes('Canceled Orders') || lines[i].includes('Rolling Strategies')) {
            filledOrdersEnd = i;
            break;
          }
        }

        if (filledOrdersEnd === -1) {
          filledOrdersEnd = lines.length;
        }

        // Extract only the filled orders section
        csvString = lines.slice(filledOrdersStart, filledOrdersEnd).join('\n');
        console.log(`[PAPERMONEY] Extracted filled orders section: lines ${filledOrdersStart} to ${filledOrdersEnd}`);
      } else {
        // No "Filled Orders" section header - check if the CSV starts directly with the header row
        let headerLineIndex = -1;
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          if (lines[i].includes('Exec Time') && lines[i].includes('Side') && lines[i].includes('Qty')) {
            headerLineIndex = i;
            break;
          }
        }

        if (headerLineIndex >= 0) {
          // Find end of data (next empty line or section header)
          let dataEnd = lines.length;
          for (let i = headerLineIndex + 1; i < lines.length; i++) {
            if (lines[i].trim() === '' || lines[i].includes('Canceled Orders') || lines[i].includes('Rolling Strategies')) {
              dataEnd = i;
              break;
            }
          }
          csvString = lines.slice(headerLineIndex, dataEnd).join('\n');
          console.log(`[PAPERMONEY] No section header found, using CSV directly from line ${headerLineIndex} to ${dataEnd}`);
        } else {
          throw new Error('Could not find "Filled Orders" section or valid header row in PaperMoney CSV');
        }
      }
    }

    // Detect delimiter - check if it's tab-separated (common for Schwab)
    let delimiter = ',';
    let parseOptions = {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: delimiter
    };

    if (broker === 'tradovate') {
      csvString = normalizeWholeLineQuotedCsvRows(csvString);
      parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        relax: true,
        relax_column_count: true,
        quote: '"',
        escape: '"'
      };
      console.log('Using special parsing options for Tradovate CSV');
    }
    
    if (broker === 'schwab') {
      const firstLine = csvString.split('\n')[0];
      if (firstLine.includes('\t') && !firstLine.includes(',')) {
        delimiter = '\t';
        console.log('Detected tab-separated Schwab file');
        parseOptions.delimiter = delimiter;
      }

      // Check if the first line is missing headers (starts with actual data)
      const firstFields = firstLine.split(delimiter);
      if (firstFields.length > 20 && !firstLine.toLowerCase().includes('symbol')) {
        console.log('Schwab file appears to be missing headers, using column indices');
        parseOptions.columns = false; // Parse as arrays instead
      }

      // Extract account number from Schwab header rows
      // Schwab CSVs often start with header text like:
      // "Transactions for account ...1234 as of 01/15/2024"
      // "Positions for account ...1234 as of 01/15/2024"
      // "Brokerage ...1234"
      const lines = csvString.split('\n');
      let schwabAccountNumber = null;

      for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const line = lines[i];

        // Pattern 1: "Transactions/Positions for account ...XXXX" or "account ...XXXX"
        const accountWithDotsMatch = line.match(/(?:account|Account)[^\d]*\.{2,}(\d{4})/i);
        if (accountWithDotsMatch) {
          schwabAccountNumber = `****${accountWithDotsMatch[1]}`;
          console.log(`[ACCOUNT] Extracted Schwab account from header (dots pattern): ${schwabAccountNumber}`);
          break;
        }

        // Pattern 2: "Account: XXXX" or "Account Number: XXXX" (full or partial)
        const accountColonMatch = line.match(/(?:account|Account)\s*(?:Number)?[:\s]+[*\.]*(\d{4,})/i);
        if (accountColonMatch) {
          const accountNum = accountColonMatch[1];
          schwabAccountNumber = accountNum.length <= 4 ? `****${accountNum}` : redactAccountId(accountNum);
          console.log(`[ACCOUNT] Extracted Schwab account from header (colon pattern): ${schwabAccountNumber}`);
          break;
        }

        // Pattern 3: Standalone redacted account like "...1234" or "****1234" or "***1234"
        const redactedMatch = line.match(/(?:\.{2,}|\*{2,})(\d{4})/);
        if (redactedMatch) {
          schwabAccountNumber = `****${redactedMatch[1]}`;
          console.log(`[ACCOUNT] Found Schwab redacted account in header: ${schwabAccountNumber}`);
          break;
        }

        // Pattern 4: "Brokerage XXXX" or "Brokerage ...XXXX"
        const brokerageMatch = line.match(/Brokerage[^\d]*[\.]*(\d{4,})/i);
        if (brokerageMatch) {
          const accountNum = brokerageMatch[1];
          schwabAccountNumber = accountNum.length <= 4 ? `****${accountNum}` : redactAccountId(accountNum);
          console.log(`[ACCOUNT] Extracted Schwab account from brokerage header: ${schwabAccountNumber}`);
          break;
        }
      }

      if (schwabAccountNumber) {
        context.schwabAccountNumber = schwabAccountNumber;
        console.log(`[ACCOUNT] Will use Schwab account: ${schwabAccountNumber}`);
      } else {
        console.log(`[ACCOUNT] No Schwab account number found in header rows`);
      }
    }
    
    // Special handling for thinkorswim CSV format
    if (broker === 'thinkorswim') {
      // Thinkorswim CSVs have account statement header rows that need to be removed
      const lines = csvString.split('\n');

      // Extract account number from header rows before skipping them
      // Thinkorswim headers often contain: "Account Statement for 123456789" or "Account: 123456789"
      let tosAccountNumber = null;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i];
        // Match patterns like "Account Statement for 123456789" or "Account: 123456789" or "Account,123456789"
        const accountMatch = line.match(/Account(?:\s+Statement\s+for|:|,)\s*(\d{6,12})/i);
        if (accountMatch) {
          tosAccountNumber = redactAccountId(accountMatch[1]);
          console.log(`[ACCOUNT] Extracted thinkorswim account from header: ${tosAccountNumber}`);
          break;
        }
        // Also check for standalone account number pattern in the line
        const standaloneMatch = line.match(/^\s*(\d{9,12})\s*$/);
        if (standaloneMatch) {
          tosAccountNumber = redactAccountId(standaloneMatch[1]);
          console.log(`[ACCOUNT] Found thinkorswim account number in header: ${tosAccountNumber}`);
          break;
        }
      }

      // Store the account number in context for use during parsing
      if (tosAccountNumber) {
        context.tosAccountNumber = tosAccountNumber;
        console.log(`[ACCOUNT] Will use thinkorswim account: ${tosAccountNumber}`);
      }

      // Find the actual header line - check multiple possible patterns
      let headerIndex = -1;
      const headerPatterns = [
        'DATE,TIME,TYPE',
        'Date,Time,Type',
        'DATE,TIME,TRANSACTION',
        'Date,Time,Transaction',
        'DATE,TYPE',
        'Date,Type'
      ];

      for (let i = 0; i < lines.length && i < 15; i++) {
        const lineUpper = lines[i].toUpperCase();
        for (const pattern of headerPatterns) {
          if (lineUpper.includes(pattern.toUpperCase())) {
            headerIndex = i;
            break;
          }
        }
        if (headerIndex >= 0) break;
      }

      if (headerIndex >= 0) {
        // Find where the Cash Balance section ends
        // TOS CSVs have multiple sections separated by blank lines and new headers
        // (e.g., "Futures Statements", "Forex Statements", "Account Order History")
        let endIndex = lines.length;
        for (let i = headerIndex + 1; i < lines.length; i++) {
          const trimmed = lines[i].trim().replace(/,+$/, '').trim();
          // Stop at blank lines followed by a new section header, or at known section boundaries
          if (!trimmed) {
            // Check if the next non-empty line is a section header (no commas in the meaningful part)
            for (let j = i + 1; j < lines.length; j++) {
              const nextTrimmed = lines[j].trim().replace(/,+$/, '').trim();
              if (nextTrimmed) {
                // Section headers like "Futures Statements" or "Account Order History" have no data columns
                if (!nextTrimmed.includes(',') || /^[A-Za-z\s#()]+$/.test(nextTrimmed)) {
                  endIndex = i;
                }
                break;
              }
            }
            if (endIndex !== lines.length) break;
          }
        }
        csvString = lines.slice(headerIndex, endIndex).join('\n');
        // Strip Excel formula notation for numeric fields: ="1005762914435" → 1005762914435
        // Some TOS exports don't properly CSV-quote these, causing csv-parse to misinterpret
        // the bare quotes as field delimiters and silently drop rows
        csvString = csvString.replace(/(^|,)="(\d+)"(?=,|$)/gm, '$1$2');
        console.log(`Skipped ${headerIndex} header rows, using ${endIndex - headerIndex} lines from Cash Balance section`);
      } else {
        console.log('Warning: Could not find thinkorswim header pattern, trying to parse as-is');
      }

      // Thinkorswim CSVs have quoted fields with commas inside
      parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        relax: true, // Relax parsing rules for more permissive parsing
        relax_column_count: true, // Allow variable column counts
        quote: '"', // Handle quoted fields
        escape: '"', // Handle escaped quotes
        skip_records_with_empty_values: false,
        skip_records_with_error: true // Skip problematic records
      };
      console.log('Using special parsing options for thinkorswim CSV');

      const previewLineCount = Math.min(csvString.split('\n').length, 5);
      console.log(`Prepared thinkorswim CSV for parsing (preview lines redacted, count=${previewLineCount})`);
    }
    
    // Special handling for TradingView Paper Trading CSV (Margin column has commas in quotes)
    if (broker === 'tradingview_paper') {
      parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        relax: true,
        relax_column_count: true,
        quote: '"',
        escape: '"',
        skip_records_with_empty_values: false,
        skip_records_with_error: true
      };
      console.log('Using special parsing options for TradingView Paper Trading CSV');
    }

    // Special handling for Webull CSV formats
    if (broker === 'webull') {
      // Webull Name column can contain commas (e.g., "Gold 100 OZ, April 2026") which breaks default CSV parsing
      parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        relax: true,
        relax_column_count: true,
        quote: '"',
        escape: '"',
        skip_records_with_empty_values: false,
        skip_records_with_error: true
      };
      console.log('Using special parsing options for Webull CSV');
    }

    // Special handling for Questrade CSV formats
    if (broker === 'questrade') {
      // Questrade exports can include trailing delimiters/empty columns.
      // Use relaxed column handling to avoid hard parse failures.
      parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        relax: true,
        relax_column_count: true,
        quote: '"',
        escape: '"',
        skip_records_with_empty_values: false,
        skip_records_with_error: true
      };
      console.log('Using special parsing options for Questrade CSV');
    }

    // Special handling for IBKR CSV formats
    if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation') {
      // IBKR Flex Query exports can contain multiple sections with different column layouts.
      // Each section has its own header row. We need to extract only the first section
      // (trade executions) and discard later sections to prevent column mismatch issues.
      const lines = csvString.split('\n');
      if (lines.length > 1) {
        const firstHeader = lines[0].trim();
        const filteredLines = [lines[0]]; // Keep the first header
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          // Detect section header rows: they start with "ClientAccountID" or "CurrencyPrimary"
          // and contain column names rather than data values
          if (/^"?ClientAccountID"?,"?AccountAlias"?/i.test(line) ||
              /^"?CurrencyPrimary"?,"?AssetClass"?/i.test(line)) {
            console.log(`[IBKR] Stopping at section header on line ${i + 1} (multi-section Flex Query)`);
            break;
          }
          filteredLines.push(lines[i]);
        }
        if (filteredLines.length < lines.length) {
          console.log(`[IBKR] Trimmed multi-section CSV from ${lines.length} to ${filteredLines.length} lines`);
          csvString = filteredLines.join('\n');
        }
      }

      // IBKR CSVs can have quoted fields with commas inside and variable column counts
      parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        relax: true, // Relax parsing rules for more permissive parsing
        relax_column_count: true, // Allow variable column counts
        quote: '"', // Handle quoted fields
        escape: '"', // Handle escaped quotes
        skip_records_with_empty_values: false,
        skip_records_with_error: true // Skip problematic records instead of failing
      };
      console.log('Using special parsing options for IBKR CSV');

      const previewLineCount = Math.min(csvString.split('\n').length, 5);
      console.log(`Prepared IBKR CSV for parsing (preview lines redacted, count=${previewLineCount})`);
    }
    
    let records;
    try {
      records = parse(csvString, parseOptions);
    } catch (parseError) {
      console.error('CSV parsing error:', parseError.message);
      
      // If IBKR parsing fails, try alternative approach
      if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation') {
        console.log('Trying alternative parsing approach for IBKR');
        
        // Try with even more relaxed options
        parseOptions = {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ',',
          relax: true, // Relax parsing rules
          relax_column_count: true,
          skip_records_with_error: true,
          quote: '"',
          escape: '"',
          on_record: (record, context) => {
            // Log problematic records
            if (context.error) {
              console.log(`Error on line ${context.lines}: ${context.error.message}`);
            }
            return record;
          }
        };
        
        try {
          records = parse(csvString, parseOptions);
        } catch (retryError) {
          console.error('Alternative parsing also failed:', retryError.message);
          throw new Error(`CSV parsing failed: ${retryError.message}`);
        }
      }
      // If thinkorswim parsing fails, try alternative approach
      else if (broker === 'thinkorswim') {
        console.log('Trying alternative parsing approach for thinkorswim');
        console.log('Original error:', parseError.message);

        // Try to find the header line again with more aggressive pattern matching
        const lines = csvString.split('\n');
        let headerFound = false;

        for (let i = 0; i < Math.min(lines.length, 20); i++) {
          // Look for any line that looks like a CSV header (has multiple commas and common column names)
          const line = lines[i];
          const commaCount = (line.match(/,/g) || []).length;
          const hasDateWord = /date/i.test(line);
          const hasTypeWord = /type|transaction|description/i.test(line);

          if (commaCount >= 3 && hasDateWord && hasTypeWord) {
            console.log(`Found potential header at line ${i}`);
            csvString = lines.slice(i).join('\n');
            headerFound = true;
            break;
          }
        }

        if (!headerFound) {
          console.log('Could not find header, trying to parse raw CSV');
        }

        // Try with even more relaxed options
        parseOptions = {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ',',
          relax: true, // Relax parsing rules
          relax_quotes: true, // Be lenient with quotes
          relax_column_count: true,
          skip_records_with_error: true,
          quote: '"',
          escape: '"',
          on_record: (record, context) => {
            // Log problematic records
            if (context.error) {
              console.log(`Error on line ${context.lines}: ${context.error.message}`);
            }
            return record;
          }
        };

        try {
          records = parse(csvString, parseOptions);
        } catch (retryError) {
          console.error('Alternative parsing also failed:', retryError.message);
          throw new Error(`CSV parsing failed for thinkorswim: ${retryError.message}`);
        }
      } else {
        throw parseError;
      }
    }
    
    console.log(`Parsing ${records.length} records with ${broker} parser`);

    // Update diagnostics with row count and headers
    diagnostics.totalRows = records.length;
    if (records.length > 0) {
      diagnostics.headerAnalysis.foundHeaders = Object.keys(records[0]);
    }

    // Store diagnostics in context for broker parsers to use
    context.diagnostics = diagnostics;

    // Localize non-English headers & cell values before any parser logic
    {
      const locResult = localizeRecords(records);
      if (locResult.localized) {
        records = locResult.records;
        console.log(`[LOCALIZE] Translated ${records.length} records to English headers/values`);
      }
    }

    // Normalize records for case-insensitive column access
    // This handles CSVs where headers differ in casing from what parsers expect
    if (records.length > 0 && !Array.isArray(records[0])) {
      records = records.map(normalizeRecord);
    }

    // Check if CSV contains a currency column BEFORE broker-specific parsing
    const hasCurrencyColumn = detectCurrencyColumn(records);

    if (hasCurrencyColumn) {
      console.log(`[CURRENCY] Currency column detected in CSV import`);

      // Some broker parsers (like Questrade) preserve source currency directly
      // and do not require USD conversion at import time.
      const preservesSourceCurrency = broker === 'questrade';
      if (preservesSourceCurrency) {
        console.log(`[CURRENCY] ${broker} parser preserves source currency; skipping Pro conversion gate`);
      } else {
        // Check if user has pro tier access
        const userId = context.userId;
        if (!userId) {
          throw new Error('CURRENCY_REQUIRES_PRO:User authentication required for currency conversion');
        }

        const hasProAccess = await currencyConverter.userHasProAccess(userId);
        if (!hasProAccess) {
          throw new Error('CURRENCY_REQUIRES_PRO:Currency conversion is a Pro feature. Please upgrade to Pro to import trades with non-USD currencies.');
        }

        console.log(`[CURRENCY] User ${userId} has Pro access, currency conversion enabled`);

        // Store currency column info in context for broker parsers to use
        context.hasCurrencyColumn = true;
        context.currencyRecords = records; // Store original records with currency data
      }
    }

    // Check if CSV contains an account column for automatic account detection
    const accountColumnName = detectAccountColumn(records);
    if (accountColumnName) {
      console.log(`[ACCOUNT] Account column "${accountColumnName}" detected - will extract account IDs from CSV`);
      context.accountColumnName = accountColumnName;
      context.hasAccountColumn = true;
    } else if (context.selectedAccountId) {
      // User manually selected an account during import
      console.log(`[ACCOUNT] Using manually selected account: ${context.selectedAccountId}`);
    }

    if (broker === 'lightspeed') {
      console.log('Starting Lightspeed transaction parsing');
      const result = await parseLightspeedTransactions(records, existingPositions, context.userId, context);
      console.log('Finished Lightspeed transaction parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      let finalTrades = result;
      if (tradeGroupingSettings.enabled && result.length > 0) {
        finalTrades = applyTradeGrouping(result, tradeGroupingSettings);
      }

      return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
    }

    if (broker === 'schwab') {
      console.log('Starting Schwab trade parsing');
      const result = await parseSchwabTrades(records, existingPositions, context);
      console.log('Finished Schwab trade parsing');

      // IMPORTANT: Do NOT apply trade grouping for Schwab transactions
      // Schwab parser already uses round-trip position tracking to create properly separated trades
      // Trade grouping would incorrectly merge multiple round trips on the same day
      console.log('[INFO] Skipping trade grouping for Schwab (already grouped by round-trip logic)');

      return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
    }

    if (broker === 'thinkorswim') {
      console.log('Starting thinkorswim transaction parsing');
      const result = await parseThinkorswimTransactions(records, existingPositions, context);
      console.log('Finished thinkorswim transaction parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      let finalTrades = result;
      if (tradeGroupingSettings.enabled && result.length > 0) {
        finalTrades = applyTradeGrouping(result, tradeGroupingSettings);
      }

      return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
    }

    if (broker === 'papermoney') {
      // console.log('Starting PaperMoney transaction parsing');
      const result = await parsePaperMoneyTransactions(records, existingPositions, context);
      console.log('Finished PaperMoney transaction parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      let finalTrades = result;
      if (tradeGroupingSettings.enabled && result.length > 0) {
        finalTrades = applyTradeGrouping(result, tradeGroupingSettings);
      }

      return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
    }

    if (broker === 'avatrade') {
      console.log('Starting AvaTrade transaction parsing (via TradingView transaction engine)');
      // Normalize AvaTrade symbols: F.US.MESM26 → MESM26, S.US.AAPL → AAPL
      for (const record of records) {
        const sym = record.Symbol || record.symbol;
        if (sym) {
          const normalized = normalizeAvaTradeSymbol(sym);
          if (normalized !== sym) {
            record.Symbol = normalized;
            if (record.symbol) record.symbol = normalized;
          }
        }
      }
      // Headers have already been localized to English; reuse TradingView transaction parser
      const result = await parseTradingViewTransactions(records, existingPositions, context);
      // Tag trades as avatrade instead of tradingview
      for (const trade of result) {
        trade.broker = 'avatrade';
      }
      console.log('Finished AvaTrade transaction parsing');

      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      let finalTrades = result;
      if (tradeGroupingSettings.enabled && result.length > 0) {
        finalTrades = applyTradeGrouping(result, tradeGroupingSettings);
      }

      return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
    }

    if (broker === 'tradingview') {
      console.log('Starting TradingView transaction parsing');
      const result = await parseTradingViewTransactions(records, existingPositions, context);
      console.log('Finished TradingView transaction parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      let finalTrades = result;
      if (tradeGroupingSettings.enabled && result.length > 0) {
        finalTrades = applyTradeGrouping(result, tradeGroupingSettings);
      }

      return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
    }

    if (broker === 'tradingview_paper') {
      console.log('Starting TradingView Paper Trading parsing');
      const result = await parseTradingViewPaperTrades(records, context);
      console.log('Finished TradingView Paper Trading parsing');
      return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
    }

    if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation') {
      console.log(`Starting IBKR transaction parsing (${broker} format)`);
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      const result = await parseIBKRTransactions(records, existingPositions, tradeGroupingSettings, context);
      console.log('Finished IBKR transaction parsing');
      return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
    }

    if (broker === 'webull') {
      console.log('Starting Webull transaction parsing');
      const result = await parseWebullTransactions(records, existingPositions, { ...context, diagnostics });
      console.log('Finished Webull transaction parsing');

      // IMPORTANT: Do NOT apply trade grouping for Webull transactions.
      // The Webull parser already creates round-trip trades from executions.
      // Grouping here incorrectly merges distinct scalps on the same symbol.
      console.log('[INFO] Skipping trade grouping for Webull (already grouped by round-trip logic)');

      return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
    }

    if (broker === 'tradervue') {
      console.log('Starting Tradervue completed trade parsing');
      const result = await parseTradervueCompletedTrades(records, context);
      console.log('Finished Tradervue completed trade parsing');
      return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
    }

    if (broker === 'tradovate') {
      // Check if this is a Performance Report format (pre-matched round-trip trades)
      // vs the standard Order/Fill History format
      const firstRecord = records[0] || {};
      const recordKeys = Object.keys(firstRecord).map(k => k.toLowerCase().trim());
      const isPerformanceReport = recordKeys.some(k => k === 'buyprice' || k === 'buy price') &&
                                   recordKeys.some(k => k === 'sellprice' || k === 'sell price') &&
                                   recordKeys.some(k => k === 'boughttimestamp' || k === 'bought timestamp') &&
                                   (
                                     recordKeys.some(k => k === 'qty') ||
                                     recordKeys.some(k => k === 'paired qty' || k === 'pairedqty')
                                   );

      if (isPerformanceReport) {
        console.log('Starting Tradovate Performance Report parsing');
        const result = await parseTradovatePerformanceReport(records, context);
        console.log('Finished Tradovate Performance Report parsing');
        return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
      }

      console.log('Starting Tradovate transaction parsing');
      const result = await parseTradovateTransactions(records, existingPositions, context);
      console.log('Finished Tradovate transaction parsing');

      // IMPORTANT: Do NOT apply trade grouping for Tradovate transactions
      // Tradovate parser uses round-trip position tracking to create properly separated trades
      // Trade grouping would incorrectly merge multiple round trips when exit and new entry have same timestamp
      console.log('[INFO] Skipping trade grouping for Tradovate (already grouped by round-trip logic)');

      return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
    }

    if (broker === 'questrade') {
      console.log('Starting Questrade transaction parsing');
      const result = await parseQuestradeTransactions(records, existingPositions, context);
      console.log('Finished Questrade transaction parsing');

      // Skip trade grouping for Questrade - the parser already handles position tracking
      // and trade grouping would incorrectly merge partial close trades back together
      console.log('[INFO] Skipping trade grouping for Questrade (already grouped by round-trip logic)');

      return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
    }

    if (broker === 'tastytrade') {
      console.log('Starting Tastytrade transaction parsing');
      const result = await parseTastytradeTransactions(records, existingPositions, context);
      console.log('Finished Tastytrade transaction parsing');

      // Skip trade grouping for Tastytrade - the parser already handles position tracking
      console.log('[INFO] Skipping trade grouping for Tastytrade (already grouped by round-trip logic)');

      return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
    }

    // TradeStation exports transactions, needs position tracking
    if (broker === 'tradestation') {
      console.log('Starting TradeStation transaction parsing');
      // Use generic transaction parser with TradeStation-specific parser
      const parser = brokerParsers.tradestation;
      const trades = [];
      let rowIndex = 0;

      // Convert TradeStation records to transactions then process with position tracking
      const transactions = [];
      for (const record of records) {
        rowIndex++;
        try {
          const trade = parser(record);
          if (trade && trade.symbol && trade.quantity && trade.entryPrice) {
            // Convert to transaction format for position tracking
            transactions.push({
              symbol: trade.symbol,
              date: trade.tradeDate,
              datetime: trade.entryTime,
              action: trade.side === 'buy' || trade.side === 'long' ? 'buy' : 'sell',
              quantity: trade.quantity,
              price: trade.entryPrice,
              commission: trade.commission,
              currency: trade.currency,
              notes: trade.notes,
              raw: record
            });
          }
        } catch (error) {
          console.error(`Error parsing TradeStation record:`, error.message);
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: `Parse error: ${error.message}` });
        }
      }

      // Process transactions with position tracking
      const completedTrades = [];
      const transactionsBySymbol = {};

      for (const transaction of transactions) {
        if (!transactionsBySymbol[transaction.symbol]) {
          transactionsBySymbol[transaction.symbol] = [];
        }
        transactionsBySymbol[transaction.symbol].push(transaction);
      }

      // Process each symbol's transactions
      for (const [symbol, symbolTransactions] of Object.entries(transactionsBySymbol)) {
        const position = existingPositions[symbol] || { quantity: 0, trades: [] };
        let currentPosition = position.quantity;

        for (const transaction of symbolTransactions) {
          const isBuy = transaction.action === 'buy';
          const prevPosition = currentPosition;
          currentPosition = isBuy
            ? currentPosition + transaction.quantity
            : currentPosition - transaction.quantity;

          // Determine if this completes a trade
          if (prevPosition === 0) {
            // Starting new trade
            completedTrades.push({
              symbol: transaction.symbol,
              tradeDate: transaction.date,
              entryTime: transaction.datetime,
              entryPrice: transaction.price,
              quantity: transaction.quantity,
              side: isBuy ? 'long' : 'short',
              commission: transaction.commission,
              fees: transaction.commission,
              currency: transaction.currency,
              broker: 'tradestation',
              notes: transaction.notes
            });
          } else if ((prevPosition > 0 && currentPosition <= 0) || (prevPosition < 0 && currentPosition >= 0)) {
            // Closing or reversing position
            const lastTrade = completedTrades[completedTrades.length - 1];
            if (lastTrade && lastTrade.symbol === symbol && !lastTrade.exitTime) {
              lastTrade.exitTime = transaction.datetime;
              lastTrade.exitPrice = transaction.price;
              lastTrade.commission += transaction.commission || 0;
              lastTrade.fees = lastTrade.commission;
            }
          }
        }
      }

      console.log(`[SUCCESS] Parsed ${completedTrades.length} TradeStation trades`);
      return wrapResultWithDiagnostics(completedTrades, diagnostics, [], userTimezone);
    }

    // ProjectX provides completed trades (not transactions), use simple parsing
    if (broker === 'projectx') {
      console.log('Starting ProjectX completed trade parsing');
      const parser = brokerParsers.projectx;
      const trades = [];
      let rowIndex = 0;

      for (const record of records) {
        rowIndex++;
        try {
          let trade = parser(record);
          if (isValidTrade(trade)) {
            // Currency conversion if needed
            if (context.hasCurrencyColumn && trade.symbol) {
              const currencyRecord = context.currencyRecords?.find(r =>
                (r.Symbol || r.symbol) === trade.symbol &&
                (r.DateTime || r['Date/Time'] || r.Date) === (record.DateTime || record['Date/Time'] || record.Date)
              );

              if (currencyRecord && currencyRecord.Currency) {
                const currency = currencyRecord.Currency.trim().toUpperCase();
                if (currency && currency !== 'USD') {
                  trade.currency = currency;
                }
              }
            }

            trades.push(trade);
          } else {
            diagnostics.invalidRows++;
            diagnostics.skippedReasons.push({ row: rowIndex, reason: 'Invalid trade: missing required fields' });
          }
        } catch (error) {
          console.error(`Error parsing ProjectX record:`, error.message);
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: `Parse error: ${error.message}` });
        }
      }

      console.log(`[SUCCESS] Parsed ${trades.length} ProjectX completed trades`);

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      let finalTrades = trades;
      if (tradeGroupingSettings.enabled && trades.length > 0) {
        finalTrades = applyTradeGrouping(trades, tradeGroupingSettings);
      }

      return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
    }

    // TradingView Performance also provides completed trades (not transactions), use simple parsing
    if (broker === 'tradingview_performance') {
      console.log('Starting TradingView Performance completed trade parsing');
      const parser = brokerParsers.tradingview_performance;
      const trades = [];
      let rowIndex = 0;

      for (const record of records) {
        rowIndex++;
        try {
          let trade = parser(record);
          if (isValidTrade(trade)) {
            trades.push(trade);
          } else {
            diagnostics.invalidRows++;
            diagnostics.skippedReasons.push({ row: rowIndex, reason: 'Invalid trade: missing required fields' });
          }
        } catch (error) {
          console.error(`Error parsing TradingView Performance record:`, error.message);
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: `Parse error: ${error.message}` });
        }
      }

      console.log(`[SUCCESS] Parsed ${trades.length} TradingView Performance completed trades`);

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      let finalTrades = trades;
      if (tradeGroupingSettings.enabled && trades.length > 0) {
        finalTrades = applyTradeGrouping(trades, tradeGroupingSettings);
      }

      return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
    }

    const hasGenericCompletedTradeRows = records.some(record => Boolean(
      record['Opening time (UTC-4)'] ||
      record['Closing time (UTC-4)'] ||
      record['Entry Date'] && record['Exit Date'] ||
      record['Entry Price'] && record['Exit Price'] ||
      record['Entry price'] && record['Closing price']
    ));

    // Generic parser - Use transaction-based processing for better position tracking
    // Check for user preference or use enhanced mode by default when context is available
    // Custom mappings represent complete trade rows. Routing them through the
    // transaction parser drops row-level exit fields and can produce "0 trades
    // imported" after a successful mapping step.
    const useEnhancedMode = context.usePositionTracking !== false; // Default to true

    if (useEnhancedMode && !context.customMapping && !hasGenericCompletedTradeRows) {
      console.log('Using enhanced generic parser with position tracking');
      const result = await parseGenericTransactions(records, existingPositions, context.customMapping, context);
      console.log('Finished generic transaction-based parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      let finalTrades = result;
      if (tradeGroupingSettings.enabled && result.length > 0) {
        finalTrades = applyTradeGrouping(result, tradeGroupingSettings);
      }

      return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
    }

    // Fallback to simple row-by-row parsing (legacy mode)
    // Used when position tracking is disabled or when a custom mapping is used.
    console.log('Using simple generic parser (legacy mode - no position tracking)');
    // Create custom parser if custom mapping is provided
    let parser;
    if (context.customMapping) {
      const mapping = context.customMapping;
      console.log(`[CUSTOM MAPPING] Using custom mapping: ${mapping.mapping_name}`);
      console.log(`[CUSTOM MAPPING] Column mappings:`, {
        symbol: mapping.symbol_column,
        side: mapping.side_column,
        quantity: mapping.quantity_column,
        entryPrice: mapping.entry_price_column,
        exitPrice: mapping.exit_price_column,
        date: mapping.entry_date_column
      });

      parser = (row) => {
        const quantity = parseNumeric(row[mapping.quantity_column]);

        // Infer side from quantity if no side column specified
        let side;
        if (mapping.side_column && row[mapping.side_column]) {
          side = parseSide(row[mapping.side_column]);
        } else {
          // Infer from quantity sign: positive = long, negative = short
          side = quantity >= 0 ? 'long' : 'short';
        }

        return {
          symbol: row[mapping.symbol_column] || '',
          tradeDate: mapping.entry_date_column ? parseDate(row[mapping.entry_date_column]) : new Date(),
          entryTime: mapping.entry_date_column ? parseDateTime(row[mapping.entry_date_column]) : new Date(),
          exitTime: mapping.exit_date_column ? parseDateTime(row[mapping.exit_date_column]) : null,
          entryPrice: parseNumeric(row[mapping.entry_price_column]),
          exitPrice: mapping.exit_price_column ? parseNumeric(row[mapping.exit_price_column]) : null,
          quantity: Math.abs(quantity), // Use absolute value
          side: side,
          commission: mapping.fees_column ? parseNumeric(row[mapping.fees_column]) : 0,
          fees: mapping.fees_column ? parseNumeric(row[mapping.fees_column]) : 0,
          pnl: mapping.pnl_column ? parseNumeric(row[mapping.pnl_column]) : null,
          notes: mapping.notes_column ? row[mapping.notes_column] : '',
          stopLoss: mapping.stop_loss_column ? parseNumeric(row[mapping.stop_loss_column]) : null,
          takeProfit: mapping.take_profit_column ? parseNumeric(row[mapping.take_profit_column]) : null,
          broker: 'custom'
        };
      };
    } else {
      parser = brokerParsers[broker] || brokerParsers.generic;
    }

    const trades = [];
    let rowIndex = 0;

    for (const record of records) {
      rowIndex++;
      try {
        let trade = parser(record);
        if (isValidTrade(trade)) {
          // Parse instrument data for futures/options detection
          if (trade.symbol) {
            const instrumentData = parseInstrumentData(trade.symbol);
            if (instrumentData.instrumentType === 'future' || instrumentData.instrumentType === 'option') {
              // Add instrument data to trade
              Object.assign(trade, instrumentData);
            }
          }

          // Check if this trade has a currency that needs conversion
          if (hasCurrencyColumn) {
            const currencyFieldPatterns = ['currency', 'curr', 'ccy', 'currency_code', 'currencycode'];
            let currency = null;

            // Find the currency field in the record
            for (const fieldName of Object.keys(record)) {
              const lowerFieldName = fieldName.toLowerCase().trim();
              if (currencyFieldPatterns.some(pattern => lowerFieldName.includes(pattern))) {
                currency = record[fieldName];
                break;
              }
            }

            // Convert trade if currency is not USD
            if (currency && currency.toString().toUpperCase().trim() !== 'USD') {
              const tradeDate = trade.tradeDate || trade.date;
              if (!tradeDate) {
                console.warn(`[CURRENCY] Cannot convert trade without date: ${JSON.stringify(trade)}`);
              } else {
                try {
                  console.log(`[CURRENCY] Converting trade from ${currency} to USD on ${tradeDate}`);
                  trade = await currencyConverter.convertTradeToUSD(trade, currency, tradeDate);
                } catch (conversionError) {
                  console.error(`[CURRENCY] Failed to convert trade: ${conversionError.message}`);
                  throw new Error(`Currency conversion failed for ${currency}: ${conversionError.message}`);
                }
              }
            }
          }

          // Add account identifier - user selection takes priority over CSV column
          const accountIdentifier = context.selectedAccountId
            ? context.selectedAccountId
            : context.accountColumnName
              ? extractAccountFromRecord(record, context.accountColumnName)
              : null;

          if (accountIdentifier) {
            trade.accountIdentifier = accountIdentifier;
          }

          trades.push(trade);
        } else {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: 'Invalid trade: missing required fields (symbol, date, price, or quantity)' });
        }
      } catch (error) {
        console.error('Error parsing row:', error, record);
        diagnostics.invalidRows++;
        diagnostics.skippedReasons.push({ row: rowIndex, reason: `Parse error: ${error.message}` });
      }
    }

    console.log(`[SUCCESS] Parsed ${trades.length} trades (legacy mode)`);

    // Apply trade grouping if enabled
    const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
    let finalTrades = trades;
    if (tradeGroupingSettings.enabled && trades.length > 0) {
      finalTrades = applyTradeGrouping(trades, tradeGroupingSettings);
    }

    return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
  } catch (error) {
    throw new Error(`CSV parsing failed: ${error.message}`);
  }
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.toString().trim() === '') return null;

  // Remove leading and trailing quotes/apostrophes (including Unicode curly quotes), then trim
  const cleanDateStr = dateStr.toString().replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();
  const normalizedDateStr = cleanDateStr.replace(
    /^([A-Za-z]+ \d{1,2}, \d{4})(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)$/i,
    '$1 $2'
  );

  // Try to parse IBKR format XX-XX-YY (could be MM-DD-YY or DD-MM-YY)
  const xxyyMatch = normalizedDateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2})/);
  if (xxyyMatch) {
    const [_, first, second, shortYear] = xxyyMatch;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const yearNum = 2000 + parseInt(shortYear);

    // Determine if this is MM-DD-YY or DD-MM-YY format
    // If first > 12, it must be DD-MM-YY (day first)
    // If second > 12, it must be MM-DD-YY (month first)
    // If both <= 12, assume DD-MM-YY (more common internationally and in IBKR Activity Statements)
    let monthNum, dayNum;
    if (firstNum > 12) {
      // First number is too large to be a month, so it's DD-MM-YY
      dayNum = firstNum;
      monthNum = secondNum;
    } else if (secondNum > 12) {
      // Second number is too large to be a month, so it's MM-DD-YY
      monthNum = firstNum;
      dayNum = secondNum;
    } else {
      // Ambiguous - default to DD-MM-YY (IBKR Activity Statement format)
      dayNum = firstNum;
      monthNum = secondNum;
    }

    // Validate date components for PostgreSQL 16 compatibility
    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2099) return null;

    // Create date in YYYY-MM-DD format
    const monthPadded = monthNum.toString().padStart(2, '0');
    const dayPadded = dayNum.toString().padStart(2, '0');

    return `${yearNum}-${monthPadded}-${dayPadded}`;
  }

  // Try to parse IBKR Flex Query format: YYYYMMDD or YYYYMMDD;HHMMSS
  // This format is used in IBKR Japan and other regional Flex Query exports
  const ibkrFlexMatch = normalizedDateStr.match(/^(\d{4})(\d{2})(\d{2})(;(\d{2})(\d{2})(\d{2}))?$/);
  if (ibkrFlexMatch) {
    const [, year, month, day] = ibkrFlexMatch;
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);

    // Validate date components for PostgreSQL 16 compatibility
    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;

    return `${year}-${month}-${day}`;
  }

  // Try to parse slash-separated YYYY dates. Prefer MM/DD/YYYY for ambiguous
  // US-style dates, but accept DD/MM/YYYY when the first component cannot be a
  // month.
  const mmddyyyyMatch = normalizedDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mmddyyyyMatch) {
    const [_, first, second, year] = mmddyyyyMatch;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const monthNum = firstNum > 12 ? secondNum : firstNum;
    const dayNum = firstNum > 12 ? firstNum : secondNum;
    const yearNum = parseInt(year);

    // Validate date components for PostgreSQL 16 compatibility
    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;

    // Validate the date is actually valid (e.g., not Feb 30)
    const date = new Date(yearNum, monthNum - 1, dayNum);
    if (date.getFullYear() !== yearNum || date.getMonth() !== monthNum - 1 || date.getDate() !== dayNum) {
      return null; // Invalid date (e.g., Feb 30)
    }

    // Create date in YYYY-MM-DD format directly to avoid timezone issues
    const monthPadded = monthNum.toString().padStart(2, '0');
    const dayPadded = dayNum.toString().padStart(2, '0');
    return `${yearNum}-${monthPadded}-${dayPadded}`;
  }

  // Try to parse MM/DD/YY format (2-digit year with slashes, used in some IBKR Flex Query exports)
  // Also handles MM/DD/YY;HHMMSS by matching only the date portion
  const mmddyySlashMatch = normalizedDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:;|$|\s)/);
  if (mmddyySlashMatch) {
    const [_, month, day, shortYear] = mmddyySlashMatch;
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    const yearNum = 2000 + parseInt(shortYear);

    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;

    const monthPadded = monthNum.toString().padStart(2, '0');
    const dayPadded = dayNum.toString().padStart(2, '0');
    return `${yearNum}-${monthPadded}-${dayPadded}`;
  }

  const monthNameMatch = normalizedDateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (monthNameMatch) {
    const [, monthName, day, year] = monthNameMatch;
    const date = new Date(`${monthName} ${day}, ${year}`);
    if (isNaN(date.getTime())) return null;

    const yearNum = date.getFullYear();
    if (yearNum < 1900 || yearNum > 2100) return null;

    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yearNum}-${mm}-${dd}`;
  }
  
  // Fall back to default date parsing with validation
  try {
    const date = new Date(normalizedDateStr);
    if (isNaN(date.getTime())) return null;

    // Additional validation for PostgreSQL 16
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) return null;

    // Use local date components to avoid timezone shifting
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (error) {
    console.warn(`Invalid date format: ${cleanDateStr}`);
    return null;
  }
}

function parseDateTime(dateTimeStr) {
  if (!dateTimeStr || dateTimeStr.toString().trim() === '') return null;

  // Remove leading and trailing quotes/apostrophes (including Unicode curly quotes), then trim
  const cleanDateTimeStr = dateTimeStr.toString().replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();
  const normalizedDateTimeStr = cleanDateTimeStr.replace(
    /^([A-Za-z]+ \d{1,2}, \d{4})(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)$/i,
    '$1 $2'
  );
  const timezoneAbbreviationOffsets = {
    UTC: 'Z',
    GMT: 'Z',
    EST: '-05:00',
    EDT: '-04:00',
    CST: '-06:00',
    CDT: '-05:00',
    MST: '-07:00',
    MDT: '-06:00',
    PST: '-08:00',
    PDT: '-07:00'
  };
  const trailingTimezoneMatch = normalizedDateTimeStr.match(/^(.*?)(?:\s+([A-Z]{2,4}))$/);
  const trailingTimezone = trailingTimezoneMatch?.[2]?.toUpperCase();
  const trailingTimezoneOffset = trailingTimezone && timezoneAbbreviationOffsets[trailingTimezone]
    ? timezoneAbbreviationOffsets[trailingTimezone]
    : null;
  const dateTimeBody = trailingTimezoneOffset
    ? trailingTimezoneMatch[1].trim()
    : normalizedDateTimeStr;

  const normalizeTimezoneOffset = (offset) => {
    if (!offset || offset === 'Z') return 'Z';
    return /^[+-]\d{4}$/.test(offset)
      ? `${offset.slice(0, 3)}:${offset.slice(3)}`
      : offset;
  };
  const withTrailingTimezone = (value) => {
    if (!value || !trailingTimezoneOffset) return value;
    return `${value}${normalizeTimezoneOffset(trailingTimezoneOffset)}`;
  };

  try {
    // Preserve ISO timestamps that already include timezone information.
    const isoWithTimezoneMatch = dateTimeBody.match(
      /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i
    );
    if (isoWithTimezoneMatch) {
      const [, datePart, hour, minute, second = '00', offset] = isoWithTimezoneMatch;
      return `${datePart}T${hour}:${minute}:${second}${normalizeTimezoneOffset(offset.toUpperCase())}`;
    }

    // Check for MM/DD/YYYY HH:MM:SS +TZ format (ProjectX with timezone)
    const mmddyyyyTimeWithTzMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+([+-]\d{2}:?\d{2})$/);
    if (mmddyyyyTimeWithTzMatch) {
      const [, month, day, year, hour, minute, second, offset] = mmddyyyyTimeWithTzMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return `${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:${second}${normalizeTimezoneOffset(offset)}`;
    }

    // Check for slash-separated YYYY datetime. Prefer MM/DD/YYYY for
    // ambiguous US-style dates, but accept DD/MM/YYYY when the first component
    // cannot be a month. Fractional seconds are ignored.
    const mmddyyyyTimeMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (mmddyyyyTimeMatch) {
      const [, first, secondDatePart, year, hour, minute, second] = mmddyyyyTimeMatch;
      const firstNum = parseInt(first);
      const secondNum = parseInt(secondDatePart);
      const month = firstNum > 12 ? secondDatePart : first;
      const day = firstNum > 12 ? first : secondDatePart;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:${second}`);
    }

    // Check for MM/DD/YYYY HH:MM format (without seconds)
    const mmddyyyyTimeNoSecMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (mmddyyyyTimeNoSecMatch) {
      const [, month, day, year, hour, minute] = mmddyyyyTimeNoSecMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:00`);
    }

    // Check for IBKR Flex Query format: YYYYMMDD;HHMMSS (used in IBKR Japan and other regional exports)
    const ibkrFlexDateTimeMatch = dateTimeBody.match(/^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})(\d{2})$/);
    if (ibkrFlexDateTimeMatch) {
      const [, year, month, day, hour, minute, second] = ibkrFlexDateTimeMatch;
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);

      // Validate date components
      if (monthNum < 1 || monthNum > 12) return null;
      if (dayNum < 1 || dayNum > 31) return null;
      if (yearNum < 1900 || yearNum > 2100) return null;

      return withTrailingTimezone(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    }

    // Check for MM/DD/YY;HHMMSS format (IBKR Flex Query with slash-separated dates)
    const mmddyyFlexMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2});(\d{2})(\d{2})(\d{2})$/);
    if (mmddyyFlexMatch) {
      const [, month, day, shortYear, hour, minute, second] = mmddyyFlexMatch;
      const yearNum = 2000 + parseInt(shortYear);
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);

      if (monthNum < 1 || monthNum > 12) return null;
      if (dayNum < 1 || dayNum > 31) return null;
      if (yearNum < 1900 || yearNum > 2100) return null;

      const monthPadded = monthNum.toString().padStart(2, '0');
      const dayPadded = dayNum.toString().padStart(2, '0');
      return withTrailingTimezone(`${yearNum}-${monthPadded}-${dayPadded}T${hour}:${minute}:${second}`);
    }

    // Check for IBKR format "XX-XX-YY H:MM" or "XX-XX-YY HH:MM" (could be MM-DD-YY or DD-MM-YY)
    const ibkrDateTimeMatch = dateTimeBody.match(/^(\d{1,2})-(\d{1,2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (ibkrDateTimeMatch) {
      const [, first, second, shortYear, hour, minute] = ibkrDateTimeMatch;
      const year = 2000 + parseInt(shortYear); // Convert YY to YYYY
      const firstNum = parseInt(first);
      const secondNum = parseInt(second);

      // Determine if this is MM-DD-YY or DD-MM-YY format
      // If first > 12, it must be DD-MM-YY (day first)
      // If second > 12, it must be MM-DD-YY (month first)
      // If both <= 12, assume DD-MM-YY (IBKR Activity Statement format)
      let monthNum, dayNum;
      if (firstNum > 12) {
        dayNum = firstNum;
        monthNum = secondNum;
      } else if (secondNum > 12) {
        monthNum = firstNum;
        dayNum = secondNum;
      } else {
        // Ambiguous - default to DD-MM-YY
        dayNum = firstNum;
        monthNum = secondNum;
      }

      const monthPadded = monthNum.toString().padStart(2, '0');
      const dayPadded = dayNum.toString().padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:00`);
    }

    // Check if the string is in format "YYYY-MM-DD HH:MM:SS" (local time without timezone)
    const localDateTimeMatch = dateTimeBody.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (localDateTimeMatch) {
      const [, year, month, day, hour, minute, second] = localDateTimeMatch;
      // Return as-is without timezone conversion
      return withTrailingTimezone(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    }

    // Check if just a date is provided (no time component)
    const dateOnlyMatch = dateTimeBody.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dateOnlyMatch) {
      const [, month, day, year] = dateOnlyMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      // Default to 09:30 (market open) if no time provided
      return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T09:30:00`);
    }

    const monthNameDateTimeMatch = dateTimeBody.match(
      /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i
    );
    if (monthNameDateTimeMatch) {
      let [, monthName, day, year, hour, minute, second = '00', ampm] = monthNameDateTimeMatch;
      let hourNum = parseInt(hour, 10);
      if (ampm.toUpperCase() === 'PM' && hourNum !== 12) hourNum += 12;
      if (ampm.toUpperCase() === 'AM' && hourNum === 12) hourNum = 0;

      const date = new Date(`${monthName} ${day}, ${year}`);
      if (isNaN(date.getTime())) return null;

      const month = String(date.getMonth() + 1).padStart(2, '0');
      const normalizedDay = String(date.getDate()).padStart(2, '0');
      const normalizedHour = String(hourNum).padStart(2, '0');
      return withTrailingTimezone(`${year}-${month}-${normalizedDay}T${normalizedHour}:${minute}:${second}`);
    }

    // Otherwise, parse manually to avoid timezone issues
    // Try to extract date and time components without Date object conversion
    const spaceSplit = dateTimeBody.split(' ');
    if (spaceSplit.length >= 2) {
      const datePart = spaceSplit[0];
      const timePart = spaceSplit[1];

      // Parse date part
      let year, month, day;
      if (datePart.includes('/')) {
        const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dateMatch) {
          const [, first, second, parsedYear] = dateMatch;
          const firstNum = parseInt(first);
          year = parsedYear;
          month = firstNum > 12 ? second : first;
          day = firstNum > 12 ? first : second;
        }
      } else if (datePart.includes('-')) {
        const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
          [, year, month, day] = dateMatch;
        }
      }

      // Parse time part
      const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
      if (year && month && day && timeMatch) {
        const [, hour, minute, second = '00'] = timeMatch;
        const monthPadded = month.padStart(2, '0');
        const dayPadded = day.padStart(2, '0');
        const hourPadded = hour.padStart(2, '0');
        return withTrailingTimezone(`${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:${second}`);
      }
    }

    // Last resort: use Date parsing but extract components carefully
    const date = new Date(dateTimeBody);
    if (isNaN(date.getTime())) return null;

    // Additional validation for PostgreSQL 16
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) return null;

    // Format as ISO string in local time to avoid timezone shifting
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return withTrailingTimezone(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);
  } catch (error) {
    console.warn(`Invalid datetime format: ${cleanDateTimeStr}`);
    return null;
  }
}

function hasExplicitTimezone(dateTimeStr) {
  return typeof dateTimeStr === 'string' &&
    (dateTimeStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateTimeStr));
}

function compareCanonicalDateTimes(left, right) {
  if (left === right) return 0;

  const leftHasTimezone = hasExplicitTimezone(left);
  const rightHasTimezone = hasExplicitTimezone(right);

  if (leftHasTimezone || rightHasTimezone) {
    const leftTime = new Date(left).getTime();
    const rightTime = new Date(right).getTime();

    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
  }

  return left.localeCompare(right);
}

function getExecutionTimeBounds(executions = []) {
  const datetimes = executions
    .map((execution) => execution?.datetime)
    .filter((value) => typeof value === 'string' && value.trim() !== '');

  if (datetimes.length === 0) {
    return { entryTime: null, exitTime: null };
  }

  const sortedTimes = [...datetimes].sort(compareCanonicalDateTimes);
  return {
    entryTime: sortedTimes[0],
    exitTime: sortedTimes[sortedTimes.length - 1]
  };
}

// Lightspeed-specific datetime parser that handles Central Time
function parseLightspeedDateTime(dateTimeStr) {
  if (!dateTimeStr) return null;
  
  try {
    // Lightspeed exports times in Central Time (America/Chicago)
    // We need to parse the datetime and convert it to UTC properly
    
    // Parse the datetime string components manually to avoid timezone interpretation
    // Expected formats: "2025-04-09 16:33" or "04/09/2025 16:33:00"
    const parts = dateTimeStr.trim().split(' ');
    if (parts.length < 2) return null;
    
    const [datePart, timePart] = parts;
    let year, month, day;
    
    // Check if date is in MM/DD/YYYY format
    if (datePart.includes('/')) {
      const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dateMatch) {
        [_, month, day, year] = dateMatch.map(Number);
      } else {
        return null;
      }
    } else {
      // Assume YYYY-MM-DD format
      [year, month, day] = datePart.split('-').map(Number);
    }
    
    // Parse time part (HH:MM or HH:MM:SS)
    const timeParts = timePart.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    
    if (!year || !month || !day || hours === undefined || minutes === undefined) return null;
    
    // Create UTC date object with explicit values (treating input as literal time)
    // Month is 0-indexed in JavaScript Date
    const literalDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
    
    // Now adjust for Lightspeed timezone
    // Based on your requirement: 16:33 should become 20:33 UTC
    // This means we need to add 4 hours to the literal time
    const offsetHours = 4; // Fixed 4-hour offset to get 16:33 -> 20:33 conversion
    
    // Add offset hours to convert from Lightspeed time to UTC
    const utcDate = new Date(literalDate.getTime() + (offsetHours * 60 * 60 * 1000));
    
    console.log(`Lightspeed time conversion: ${dateTimeStr} (Central) -> ${utcDate.toISOString()} (UTC)`);
    
    return utcDate.toISOString();
  } catch (error) {
    console.warn('Error parsing Lightspeed datetime:', dateTimeStr, error.message);
    return null;
  }
}

// Helper function to determine if a date is in daylight saving time
function isDaylightSavingTime(date) {
  // DST in US typically runs from second Sunday in March to first Sunday in November
  const year = date.getFullYear();
  
  // Second Sunday in March
  const marchSecondSunday = new Date(year, 2, 1); // March 1st
  marchSecondSunday.setDate(marchSecondSunday.getDate() + (7 - marchSecondSunday.getDay()) + 7);
  
  // First Sunday in November  
  const novemberFirstSunday = new Date(year, 10, 1); // November 1st
  novemberFirstSunday.setDate(novemberFirstSunday.getDate() + (7 - novemberFirstSunday.getDay()));
  
  return date >= marchSecondSunday && date < novemberFirstSunday;
}

function parseSide(sideStr) {
  if (!sideStr) return 'long';
  const normalized = sideStr.toString().trim().toLowerCase();
  if (
    normalized === 's' ||
    normalized === 'short' ||
    normalized === 'sell' ||
    normalized === 'sold' ||
    normalized === 'sto' ||
    normalized === 'stc' ||
    normalized.includes('short') ||
    normalized.includes('sell')
  ) return 'short';
  return 'long';
}

function parseTradervueSide(sideStr) {
  const normalized = cleanString(sideStr).toUpperCase();
  if (normalized === 'S') return 'short';
  if (normalized === 'L') return 'long';
  return parseSide(sideStr);
}

function parseLightspeedSide(sideCode, buySell, principalAmount, netAmount, quantity) {
  
  // PRIORITY 1: Check Side column (B/S indicator) - this is most reliable
  if (sideCode) {
    const cleanSide = sideCode.toString().trim().toUpperCase();
    
    if (cleanSide === 'S' || cleanSide === 'SELL') {
      return 'sell';
    }
    if (cleanSide === 'B' || cleanSide === 'BUY') {
      return 'buy';
    }
  }
  
  // PRIORITY 2: Check quantity sign (negative = sell, positive = buy)
  if (quantity !== undefined && quantity !== null) {
    const qty = parseFloat(quantity);
    if (qty < 0) {
      return 'sell';
    }
    if (qty > 0) {
      return 'buy';
    }
  }
  
  // PRIORITY 3: Check Buy/Sell column (Long Buy/Long Sell)
  if (buySell) {
    const cleanBuySell = buySell.toString().toLowerCase().trim();
    
    if (cleanBuySell.includes('sell') || cleanBuySell === 'long sell' || cleanBuySell === 'short sell') {
      return 'sell';
    }
    if (cleanBuySell.includes('buy') || cleanBuySell === 'long buy' || cleanBuySell === 'short buy') {
      return 'buy';
    }
  }
  
  // Default to buy if we can't determine
  return 'buy';
}

function cleanString(str) {
  if (!str) return '';
  return str.toString().trim();
}

function parseTagList(tagValue) {
  const raw = cleanString(tagValue);
  if (!raw) return [];
  return raw
    .split(/[;,|]/)
    .map(tag => cleanString(tag))
    .filter(Boolean);
}

/**
 * Creates a case-insensitive proxy around a CSV record object.
 * Exact key matches are tried first (preserving existing behavior),
 * then a case-insensitive + trimmed fallback is used.
 * This handles CSVs where header casing differs from what parsers expect
 * (e.g. "symbol" vs "Symbol", "DATE" vs "Date").
 */
function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const lowerMap = new Map();
  for (const key of Object.keys(record)) {
    const normalized = key.toLowerCase().trim();
    // First key wins for a given normalized form, preserving original casing priority
    if (!lowerMap.has(normalized)) {
      lowerMap.set(normalized, key);
    }
  }
  return new Proxy(record, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        // Exact match first (fast path, preserves existing behavior)
        if (prop in target) return target[prop];
        // Case-insensitive fallback
        const originalKey = lowerMap.get(prop.toLowerCase().trim());
        if (originalKey) return target[originalKey];
      }
      return Reflect.get(target, prop, receiver);
    },
    // Support `prop in record` checks
    has(target, prop) {
      if (prop in target) return true;
      if (typeof prop === 'string') {
        return lowerMap.has(prop.toLowerCase().trim());
      }
      return false;
    },
    // Preserve Object.keys() behavior (returns original keys)
    ownKeys(target) {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, prop) {
      // For original keys, return real descriptor
      if (prop in target) return Object.getOwnPropertyDescriptor(target, prop);
      // For case-insensitive matches, synthesize a descriptor
      if (typeof prop === 'string') {
        const originalKey = lowerMap.get(prop.toLowerCase().trim());
        if (originalKey) {
          return { value: target[originalKey], writable: true, enumerable: true, configurable: true };
        }
      }
      return undefined;
    }
  });
}

// Parse options/futures instrument data from symbol
function parseInstrumentData(symbol) {
  if (!symbol) {
    return { instrumentType: 'stock' };
  }

  // Normalize: uppercase and standardize spaces
  const normalizedSymbol = symbol.toString().toUpperCase().replace(/\s+/g, ' ').trim();

  // Compact options with space: "Cl 251024C00322500" -> "CL251024C00322500" for pattern matching
  const symbolNoSpaces = normalizedSymbol.replace(/\s+/g, '');

  // Readable IBKR options format: "DIA 10OCT25 466 PUT" (underlying + date + strike + type)
  const readableOptionMatch = normalizedSymbol.match(/^([A-Z]+)\s+(\d{1,2})([A-Z]{3})(\d{2})\s+(\d+(?:\.\d+)?)\s+(PUT|CALL)$/i);
  if (readableOptionMatch) {
    const [, underlying, day, monthStr, year, strike, type] = readableOptionMatch;

    // Convert month abbreviation to number
    const months = {
      'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
      'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = months[monthStr.toUpperCase()];
    const fullYear = 2000 + parseInt(year);

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: parseFloat(strike),
      expirationDate: `${fullYear}-${month}-${day.padStart(2, '0')}`,
      optionType: type.toLowerCase(),
      contractSize: 100
    };
  }

  // Compact IBKR options format: "DIA10OCT25466PUT" (underlying + date + strike + type, no spaces)
  const compactReadableOptionMatch = symbolNoSpaces.match(/^([A-Z]+)(\d{1,2})([A-Z]{3})(\d{2})(\d+(?:\.\d+)?)(PUT|CALL)$/i);
  if (compactReadableOptionMatch) {
    const [, underlying, day, monthStr, year, strike, type] = compactReadableOptionMatch;

    // Convert month abbreviation to number
    const months = {
      'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
      'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = months[monthStr.toUpperCase()];
    const fullYear = 2000 + parseInt(year);

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: parseFloat(strike),
      expirationDate: `${fullYear}-${month}-${day.padStart(2, '0')}`,
      optionType: type.toLowerCase(),
      contractSize: 100
    };
  }

  // IBKR Options format: "SEDG  250801P00025000" or "AMD   251010C00240000" (underlying + spaces + YYMMDD + C/P + strike)
  // This format has the underlying padded with spaces, then date, call/put indicator, and strike*1000
  // Try with spaces first (original format), then without spaces (e.g., "Cl 251024C00322500" -> "Cl251024C00322500")
  const ibkrOptionMatch = normalizedSymbol.match(/^([A-Z]+)\s+(\d{6})([CP])(\d{8})$/) ||
                          symbolNoSpaces.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (ibkrOptionMatch) {
    const [, underlying, expiry, type, strikeStr] = ibkrOptionMatch;
    const year = 2000 + parseInt(expiry.substr(0, 2));
    const month = parseInt(expiry.substr(2, 2));
    const day = parseInt(expiry.substr(4, 2));
    const strike = parseInt(strikeStr) / 1000;

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: strike,
      expirationDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      optionType: type.toLowerCase() === 'c' ? 'call' : 'put',
      contractSize: 100
    };
  }

  // Standard compact options format: "AAPL230120C00150000" (6-char underlying + YYMMDD + C/P + 8-digit strike)
  // Also handles format with spaces like "Cl 251024C00322500" by using symbolNoSpaces
  const compactOptionMatch = symbolNoSpaces.match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
  if (compactOptionMatch) {
    const [, underlying, expiry, type, strikeStr] = compactOptionMatch;
    const year = 2000 + parseInt(expiry.substr(0, 2));
    const month = parseInt(expiry.substr(2, 2));
    const day = parseInt(expiry.substr(4, 2));
    const strike = parseInt(strikeStr) / 1000;

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: strike,
      expirationDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      optionType: type.toLowerCase() === 'c' ? 'call' : 'put',
      contractSize: 100
    };
  }

  // Futures format detection: "ESM4", "NQU24", "CLZ23", "NYMEX_MINI:QG1!", etc.
  const futuresPatterns = [
    /^([A-Z]{1,3})([FGHJKMNQUVXZ])(\d{1,2})$/,  // Standard: ESM4, NQU24, CLZ23
    /^([A-Z_]+):([A-Z0-9]+)!?$/,                 // TradingView: NYMEX_MINI:QG1!
    /^\/([A-Z]{1,3})([FGHJKMNQUVXZ])(\d{2})$/,   // Slash notation: /ESM24
    /^F\.[A-Z]{2,}\.([A-Z]{1,3})([FGHJKMNQUVXZ])(\d{1,2})$/  // AvaTrade: F.US.MESM26
  ];

  for (const pattern of futuresPatterns) {
    const match = normalizedSymbol.match(pattern);
    if (match) {
      let underlying, monthCode, year;

      if (pattern.source.includes(':')) {
        // TradingView format
        [, underlying] = match;
        // Extract month/year from symbol if present
        const tvMatch = underlying.match(/([A-Z]+)(\d+)/);
        if (tvMatch) {
          underlying = tvMatch[1];
          year = parseInt(tvMatch[2]);
          if (year < 100) year += 2000;
        }
      } else {
        [, underlying, monthCode, year] = match;
        year = parseInt(year);
        if (year < 10) {
          // Single digit year: interpret as last digit of current decade (e.g., 5 = 2025, 9 = 2029, 0 = 2020)
          const currentYear = new Date().getFullYear();
          const currentDecade = Math.floor(currentYear / 10) * 10;
          year = currentDecade + year;
        } else if (year < 100) {
          // Two digit year: use standard logic (00-49 = 2000s, 50-99 = 1900s)
          year += year < 50 ? 2000 : 1900;
        }
      }

      const monthCodes = { F: '01', G: '02', H: '03', J: '04', K: '05', M: '06', N: '07', Q: '08', U: '09', V: '10', X: '11', Z: '12' };
      const month = monthCode ? monthCodes[monthCode] : null;

      return {
        instrumentType: 'future',
        underlyingAsset: underlying,
        contractMonth: month,
        contractYear: year || null,
        pointValue: getFuturesPointValue(underlying)
      };
    }
  }

  return { instrumentType: 'stock' };
}

// getFuturesPointValue is now imported from futuresUtils

// PostgreSQL 16 compatible numeric parsing
function parseNumeric(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') return defaultValue;

  let cleanValue = value.toString().trim().replace(/[$,]/g, '');
  if (cleanValue === '') return defaultValue;

  // Handle accounting-style negative: (123.45) -> -123.45
  const parenMatch = cleanValue.match(/^\((.+)\)$/);
  if (parenMatch) {
    cleanValue = '-' + parenMatch[1];
  }

  const parsed = parseFloat(cleanValue);
  if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;

  // PostgreSQL 16 has stricter limits on numeric precision
  if (Math.abs(parsed) > 1e15) return defaultValue;

  return parsed;
}

function parseInteger(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') return defaultValue;
  
  const cleanValue = value.toString().trim().replace(/[,]/g, '');
  if (cleanValue === '') return defaultValue;
  
  const parsed = parseInt(cleanValue);
  if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;
  
  // PostgreSQL 16 integer limits
  if (parsed < -2147483648 || parsed > 2147483647) return defaultValue;
  
  return Math.abs(parsed); // Ensure positive for quantities
}

function calculateLightspeedFees(row) {
  const fees = [
    'FeeSEC', 'FeeMF', 'Fee1', 'Fee2', 'Fee3', 
    'FeeStamp', 'FeeTAF', 'Fee4'
  ];
  
  let totalFees = 0;
  fees.forEach(feeField => {
    totalFees += parseNumeric(row[feeField]);
  });
  
  return totalFees;
}



async function parseLightspeedTransactions(records, existingPositions = {}, userId = null, context = {}) {
  console.log(`Processing ${records.length} Lightspeed records for user ${userId}`);

  if (records.length === 0) {
    return [];
  }

  // First, collect all unique CUSIPs for batch lookup
  const cusipsToResolve = new Set();
  records.forEach(record => {
    const symbol = cleanString(record.Symbol);
    const cusip = cleanString(record.CUSIP);

    // Check if symbol looks like CUSIP
    if (symbol && symbol.length === 9 && /^[0-9A-Z]{8}[0-9]$/.test(symbol)) {
      cusipsToResolve.add(symbol);
    }
    // Check if CUSIP column has value
    if (cusip && cusip.length === 9 && /^[0-9A-Z]{8}[0-9]$/.test(cusip)) {
      cusipsToResolve.add(cusip);
    }
  });

  // Check database first, then cache, then schedule background resolution
  let cusipToTickerMap = {};
  const unresolvedCusips = [];

  if (cusipsToResolve.size > 0) {
    console.log(`[CUSIP] Found ${cusipsToResolve.size} unique CUSIPs to resolve`);

    // Check database mappings first (both user-specific and global)
    for (const cusip of cusipsToResolve) {
      const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
      let resolved = false;

      try {
        // Check database using get_cusip_mapping function
        const query = `SELECT * FROM get_cusip_mapping($1, $2)`;
        const result = await db.query(query, [cleanCusip, userId]);

        if (result.rows.length > 0) {
          const mapping = result.rows[0];
          cusipToTickerMap[cleanCusip] = mapping.ticker;
          console.log(`[CUSIP] ${cleanCusip} found in database: ${mapping.ticker} (${mapping.resolution_source}${mapping.is_user_override ? ', user override' : ', global'})`);
          resolved = true;
        }
      } catch (error) {
        console.warn(`[CUSIP] Failed to check database for ${cleanCusip}:`, error.message);
      }

      // If not in database, check cache
      if (!resolved) {
        try {
          const cached = await cache.get('cusip_resolution', cleanCusip);

          if (cached) {
            cusipToTickerMap[cleanCusip] = cached;
            console.log(`[CUSIP] ${cleanCusip} found in cache: ${cached}`);
            resolved = true;
          }
        } catch (error) {
          console.warn(`[CUSIP] Failed to check cache for ${cleanCusip}:`, error.message);
        }
      }

      // If still not resolved, add to queue
      if (!resolved) {
        unresolvedCusips.push(cleanCusip);
        console.log(`[CUSIP] ${cleanCusip} not resolved, will process in background`);
      }
    }
    
    console.log(`[CUSIP] Resolved ${Object.keys(cusipToTickerMap).length} of ${cusipsToResolve.size} CUSIPs from database/cache. ${unresolvedCusips.length} will be queued for background processing.`);
    
    // Add unresolved CUSIPs to the processing queue
    if (unresolvedCusips.length > 0) {
      await cusipQueue.addToQueue(unresolvedCusips, 2); // High priority for import
      console.log(`Added ${unresolvedCusips.length} CUSIPs to background processing queue`);
    }
  }
  
  // Parse all transactions
  const transactions = [];
  
  for (const record of records) {
    try {
      // Resolve symbol (convert CUSIP if needed) using batch results
      const rawSymbol = cleanString(record.Symbol);
      const rawCusip = cleanString(record.CUSIP);
      
      let resolvedSymbol = rawSymbol;
      
      // Check if symbol is a CUSIP and we have it in our batch results
      if (rawSymbol && rawSymbol.length === 9 && /^[0-9A-Z]{8}[0-9]$/.test(rawSymbol) && cusipToTickerMap[rawSymbol]) {
        resolvedSymbol = cusipToTickerMap[rawSymbol];
      }
      // Otherwise check if we have a separate CUSIP column
      else if (rawCusip && cusipToTickerMap[rawCusip]) {
        resolvedSymbol = cusipToTickerMap[rawCusip];
      }
      // Otherwise keep the symbol as-is if it's a normal ticker
      else if (/^[A-Z]{1,5}$/.test(rawSymbol)) {
        resolvedSymbol = rawSymbol;
      }

      const sideValue = record.Side || record.side || record.SIDE;
      const buySellValue = record['Buy/Sell'] || record['Buy Sell'] || record.BuySell || record['Long/Short'];
      const side = parseLightspeedSide(sideValue, buySellValue, record['Principal Amount'], record['NET Amount'], record.Qty);
      
      // DEBUG: Log the raw CSV data and parsed side for ALL transactions
      console.log(`[PROCESS] CSV TRANSACTION DEBUG: ${resolvedSymbol}`);
      console.log(`  Side: "${record.Side}"`);
      console.log(`  Buy/Sell: "${record['Buy/Sell']}"`);
      console.log(`  Qty: "${record.Qty}"`);
      console.log(`  PARSED side: "${side}"`);
      console.log(`  Raw Symbol: "${record.Symbol}"`);
      console.log(`  Resolved Symbol: "${resolvedSymbol}"`);
      console.log(`---`);
      
      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      const transaction = {
        symbol: resolvedSymbol,
        tradeDate: parseDate(record['Trade Date']),
        entryTime: parseLightspeedDateTime(record['Trade Date'] + ' ' + (record['Execution Time'] || record['Raw Exec. Time'] || '09:30')),
        entryPrice: parseNumeric(record.Price),
        quantity: parseInteger(record.Qty),
        side: side,
        commission: parseNumeric(record['Commission Amount']),
        fees: calculateLightspeedFees(record),
        broker: 'lightspeed',
        tradeNumber: record['Trade Number'],  // Add unique trade number
        sequenceNumber: record['Sequence Number'],  // Add unique sequence number
        notes: `Trade #${record['Trade Number']} - ${record['Security Type'] || ''}`,
        accountIdentifier: accountIdentifier
      };

      if (transaction.symbol && transaction.entryPrice > 0 && transaction.quantity > 0) {
        transactions.push(transaction);
      }
    } catch (error) {
      console.error('Error parsing transaction:', error);
    }
  }

  console.log(`Parsed ${transactions.length} valid transactions`);
  
  // Calculate total commissions from all CSV transactions
  const totalCSVCommissions = transactions.reduce((sum, tx) => sum + tx.commission, 0);
  const totalCSVFees = transactions.reduce((sum, tx) => sum + tx.fees, 0);
  console.log(`Total commissions from CSV: $${totalCSVCommissions.toFixed(2)}`);
  console.log(`Total fees from CSV: $${totalCSVFees.toFixed(2)}`);

  // Group transactions by symbol
  const symbolGroups = {};
  transactions.forEach(transaction => {
    if (!symbolGroups[transaction.symbol]) {
      symbolGroups[transaction.symbol] = [];
    }
    symbolGroups[transaction.symbol].push(transaction);
  });

  const completedTrades = [];
  
  // Process transactions using round-trip trade grouping (like TradersVue and updated Schwab parser)
  Object.keys(symbolGroups).forEach(symbol => {
    const symbolTransactions = symbolGroups[symbol];

    // Calculate total commissions and fees for this symbol from CSV
    const totalCommissions = symbolTransactions.reduce((sum, tx) => sum + tx.commission, 0);
    const totalFees = symbolTransactions.reduce((sum, tx) => sum + tx.fees, 0);

    console.log(`\n=== Processing ${symbolTransactions.length} Lightspeed transactions for ${symbol} ===`);
    console.log(`Symbol ${symbol}: CSV commissions: $${totalCommissions.toFixed(2)}, fees: $${totalFees.toFixed(2)}`);

    // Detect instrument type to apply correct multiplier
    const instrumentData = parseInstrumentData(symbol);
    const valueMultiplier = instrumentData.instrumentType === 'option' ? 100 :
                            instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    console.log(`Instrument type: ${instrumentData.instrumentType}, value multiplier: ${valueMultiplier}`);

    // Sort by execution time for FIFO matching
    symbolTransactions.sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));

    // Track position and round-trip trades
    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: null,  // Will be set from first CSV transaction
      tradeDate: null,  // Will be set from first CSV transaction
      side: existingPosition.side,
      executions: Array.isArray(existingPosition.executions)
        ? existingPosition.executions
        : (existingPosition.executions ? JSON.parse(existingPosition.executions) : []),  // Parse JSON executions
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'lightspeed',
      isExistingPosition: true, // Flag to identify this came from database
      existingTradeId: existingPosition.id, // Store original trade ID for updates
      newExecutionsAdded: 0 // Track how many new executions are actually added
    } : null;
    
    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }
    
    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;
      let pendingReversalTrade = null;
      
      console.log(`\n${transaction.side} ${qty} @ $${transaction.entryPrice} | Position: ${currentPosition}`);
      
      // DEBUG: Extra logging for PYXS
      if (symbol === 'PYXS') {
        console.log(`🐛 PYXS DEBUG: transaction.side="${transaction.side}", qty=${qty}, currentPosition before=${currentPosition}`);
      }
      
      // Set entry time from first CSV transaction for existing position
      if (currentTrade && currentTrade.entryTime === null) {
        currentTrade.entryTime = transaction.entryTime;
        currentTrade.tradeDate = transaction.tradeDate;
      }
      
      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.entryTime,
          tradeDate: transaction.tradeDate,
          side: transaction.side === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0, // Accumulate fees for this specific trade
          totalFeesForSymbol: totalCommissions + totalFees, // Include all fees/commissions for the symbol
          entryValue: 0,
          exitValue: 0,
          broker: 'lightspeed',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }
      
      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.side,
          quantity: qty,
          price: transaction.entryPrice,
          datetime: transaction.entryTime,
          fees: transaction.commission + transaction.fees,
          tradeNumber: transaction.tradeNumber,  // Include unique trade number
          sequenceNumber: transaction.sequenceNumber  // Include unique sequence number
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers (tradeNumber/sequenceNumber)
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // Sequence number is execution-level and should take priority.
          if (exec.sequenceNumber && newExecution.sequenceNumber) {
            return String(exec.sequenceNumber) === String(newExecution.sequenceNumber);
          }

          // Trade number alone is not unique enough for Lightspeed partial fills.
          if (exec.tradeNumber && newExecution.tradeNumber) {
            if (String(exec.tradeNumber) !== String(newExecution.tradeNumber)) {
              return false;
            }

            const existingTime = new Date(exec.datetime || exec.entryTime || 0).getTime();
            const newTime = new Date(newExecution.datetime).getTime();
            const existingPrice = exec.price ?? exec.entryPrice;

            return !isNaN(existingTime) &&
              !isNaN(newTime) &&
              Math.abs(existingTime - newTime) <= 1000 &&
              Number(exec.quantity) === Number(newExecution.quantity) &&
              Math.abs((existingPrice || 0) - (newExecution.price || 0)) < 0.01;
          }

          // Without unique identifiers, don't deduplicate within the current import
          // This allows multiple identical executions from the same CSV (legitimate fills)
          // The global check (existsGlobally) still prevents re-importing existing trades
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (executionExists) {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          continue;
        }

        currentTrade.executions.push(newExecution);
        if (currentTrade.isExistingPosition) {
          currentTrade.newExecutionsAdded++;
        }
        if (symbol === 'PYXS' || symbol === 'CURR') {
          console.log(`  [SUCCESS] Added new execution (${currentTrade.newExecutionsAdded} new total)`);
        }
        
        // Accumulate total fees for this trade
        currentTrade.totalFees += (transaction.commission || 0) + (transaction.fees || 0);
      }
      
      // Process the transaction
      if (transaction.side === 'buy') {
        currentPosition += qty;

        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.entryPrice * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.entryPrice * valueMultiplier;
          // Don't add to totalQuantity for covering short position

          // Check if this is a partial close (position will still be negative after this buy)
          if (currentPosition < 0 && currentTrade.totalQuantity > 0) {
            // Calculate P&L for this partial close using weighted average entry price
            const avgEntryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
            const partialPnl = (avgEntryPrice - transaction.entryPrice) * qty * valueMultiplier;
            // Prorate commission for partial close
            const partialCommission = (currentTrade.totalFees / currentTrade.totalQuantity) * qty;
            const netPartialPnl = partialPnl - partialCommission;

            // Update the last execution with exit info and P&L
            const lastExec = currentTrade.executions[currentTrade.executions.length - 1];
            if (lastExec && lastExec.action === 'buy') {
              lastExec.entryTime = currentTrade.entryTime;
              lastExec.exitTime = transaction.entryTime;
              lastExec.exitPrice = transaction.entryPrice;
              lastExec.entryPrice = avgEntryPrice;
              lastExec.pnl = netPartialPnl;
              console.log(`  → [PARTIAL COVER] Covered ${qty} @ $${transaction.entryPrice.toFixed(2)}, Entry avg: $${avgEntryPrice.toFixed(2)}, P&L: $${netPartialPnl.toFixed(2)}, Remaining: ${Math.abs(currentPosition)} shares short`);
            }
          }

          if (prevPosition < 0 && currentPosition > 0) {
            const closeQty = Math.abs(prevPosition);
            const reversalQty = currentPosition;
            const totalTxnFees = (transaction.commission || 0) + (transaction.fees || 0);
            const closeFees = qty > 0 ? totalTxnFees * (closeQty / qty) : 0;
            const openFees = totalTxnFees - closeFees;
            const avgEntryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
            const closingExec = currentTrade.executions[currentTrade.executions.length - 1];

            if (closingExec && closingExec.action === 'buy') {
              closingExec.quantity = closeQty;
              closingExec.fees = closeFees;
              closingExec.entryTime = currentTrade.entryTime;
              closingExec.exitTime = transaction.entryTime;
              closingExec.exitPrice = transaction.entryPrice;
              closingExec.entryPrice = avgEntryPrice;
              closingExec.pnl = ((avgEntryPrice - transaction.entryPrice) * closeQty * valueMultiplier) - closeFees;
            }

            currentTrade.totalFees -= openFees;
            currentTrade.exitValue -= reversalQty * transaction.entryPrice * valueMultiplier;
            currentPosition = 0;

            pendingReversalTrade = {
              symbol,
              entryTime: transaction.entryTime,
              tradeDate: transaction.tradeDate,
              side: 'long',
              executions: [{
                action: 'buy',
                quantity: reversalQty,
                price: transaction.entryPrice,
                datetime: transaction.entryTime,
                fees: openFees,
                tradeNumber: transaction.tradeNumber,
                sequenceNumber: transaction.sequenceNumber
              }],
              totalQuantity: reversalQty,
              totalFees: openFees,
              totalFeesForSymbol: totalCommissions + totalFees,
              entryValue: reversalQty * transaction.entryPrice * valueMultiplier,
              exitValue: 0,
              broker: 'lightspeed',
              accountIdentifier: transaction.accountIdentifier
            };

            console.log(`  → [REVERSAL] Closed short ${closeQty} and opened long ${reversalQty} @ $${transaction.entryPrice.toFixed(2)}`);
          }
        }

      } else if (transaction.side === 'sell') {
        currentPosition -= qty;

        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.entryPrice * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.entryPrice * valueMultiplier;
          // Don't modify totalQuantity when selling from long position

          // Check if this is a partial close (position will still be positive after this sell)
          if (currentPosition > 0 && currentTrade.totalQuantity > 0) {
            // Calculate P&L for this partial close using weighted average entry price
            const avgEntryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
            const partialPnl = (transaction.entryPrice - avgEntryPrice) * qty * valueMultiplier;
            // Prorate commission for partial close
            const partialCommission = (currentTrade.totalFees / currentTrade.totalQuantity) * qty;
            const netPartialPnl = partialPnl - partialCommission;

            // Update the last execution with exit info and P&L
            const lastExec = currentTrade.executions[currentTrade.executions.length - 1];
            if (lastExec && lastExec.action === 'sell') {
              lastExec.entryTime = currentTrade.entryTime;
              lastExec.exitTime = transaction.entryTime;
              lastExec.exitPrice = transaction.entryPrice;
              lastExec.entryPrice = avgEntryPrice;
              lastExec.pnl = netPartialPnl;
              console.log(`  → [PARTIAL CLOSE] Sold ${qty} @ $${transaction.entryPrice.toFixed(2)}, Entry avg: $${avgEntryPrice.toFixed(2)}, P&L: $${netPartialPnl.toFixed(2)}, Remaining: ${currentPosition} shares`);
            }
          }

          if (prevPosition > 0 && currentPosition < 0) {
            const closeQty = prevPosition;
            const reversalQty = Math.abs(currentPosition);
            const totalTxnFees = (transaction.commission || 0) + (transaction.fees || 0);
            const closeFees = qty > 0 ? totalTxnFees * (closeQty / qty) : 0;
            const openFees = totalTxnFees - closeFees;
            const avgEntryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
            const closingExec = currentTrade.executions[currentTrade.executions.length - 1];

            if (closingExec && closingExec.action === 'sell') {
              closingExec.quantity = closeQty;
              closingExec.fees = closeFees;
              closingExec.entryTime = currentTrade.entryTime;
              closingExec.exitTime = transaction.entryTime;
              closingExec.exitPrice = transaction.entryPrice;
              closingExec.entryPrice = avgEntryPrice;
              closingExec.pnl = ((transaction.entryPrice - avgEntryPrice) * closeQty * valueMultiplier) - closeFees;
            }

            currentTrade.totalFees -= openFees;
            currentTrade.exitValue -= reversalQty * transaction.entryPrice * valueMultiplier;
            currentPosition = 0;

            pendingReversalTrade = {
              symbol,
              entryTime: transaction.entryTime,
              tradeDate: transaction.tradeDate,
              side: 'short',
              executions: [{
                action: 'sell',
                quantity: reversalQty,
                price: transaction.entryPrice,
                datetime: transaction.entryTime,
                fees: openFees,
                tradeNumber: transaction.tradeNumber,
                sequenceNumber: transaction.sequenceNumber
              }],
              totalQuantity: reversalQty,
              totalFees: openFees,
              totalFeesForSymbol: totalCommissions + totalFees,
              entryValue: reversalQty * transaction.entryPrice * valueMultiplier,
              exitValue: 0,
              broker: 'lightspeed',
              accountIdentifier: transaction.accountIdentifier
            };

            console.log(`  → [REVERSAL] Closed long ${closeQty} and opened short ${reversalQty} @ $${transaction.entryPrice.toFixed(2)}`);
          }
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        // Divide by multiplier to get per-contract/per-share price
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;

        // Calculate split commissions based on entry vs exit executions
        // This ensures fees are attributed to the correct date for cashflow calculations
        let entryCommission = 0;
        let exitCommission = 0;
        currentTrade.executions.forEach(exec => {
          if ((currentTrade.side === 'long' && exec.action === 'buy') ||
              (currentTrade.side === 'short' && exec.action === 'sell')) {
            entryCommission += exec.fees || 0;
          } else {
            exitCommission += exec.fees || 0;
          }
        });
        currentTrade.entryCommission = entryCommission;
        currentTrade.exitCommission = exitCommission;

        currentTrade.fees = 0;
        // FIXED: Calculate proper entry and exit times from all executions
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
        }

        // Executions are stored in the executions field (no need for executionData)

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }
        
        // Only add trade if it has executions (skip if all were duplicates)
        if (currentTrade.executions.length > 0) {
          // Map executions to executionData for Trade.create
          currentTrade.executionData = currentTrade.executions;
          completedTrades.push(currentTrade);
        } else {
          console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        }
        currentTrade = null;
      }

      if (pendingReversalTrade) {
        currentTrade = pendingReversalTrade;
        currentPosition = currentTrade.side === 'long'
          ? currentTrade.totalQuantity
          : -currentTrade.totalQuantity;
        console.log(`  → Started new reversal ${currentTrade.side} trade with ${currentTrade.totalQuantity} shares`);
      }
    }
    
    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    
    // DEBUG: Extra logging for PYXS  
    if (symbol === 'PYXS') {
      console.log(`🐛 PYXS FINAL DEBUG: currentPosition=${currentPosition}, Math.abs(currentPosition)=${Math.abs(currentPosition)}`);
      if (currentTrade) {
        console.log(`🐛 PYXS FINAL DEBUG: currentTrade.totalQuantity=${currentTrade.totalQuantity}, currentTrade.side=${currentTrade.side}`);
      }
    }
    
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);

      // Skip if no executions (all were duplicates)
      if (currentTrade.executions.length === 0) {
        console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        currentTrade = null;
      }
    }

    if (currentTrade) {
      // Add open position as incomplete trade
      // For open positions, use the net position, not the accumulated totalQuantity
      const netQuantity = Math.abs(currentPosition);
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      currentTrade.quantity = netQuantity; // Use actual net position

      // ALSO fix totalQuantity for display consistency
      currentTrade.totalQuantity = netQuantity;
      currentTrade.commission = currentTrade.totalFees;

      // Calculate split commissions based on entry vs exit executions
      // For open positions, all fees are entry fees (no exit yet)
      let entryCommission = 0;
      let exitCommission = 0;
      currentTrade.executions.forEach(exec => {
        if ((currentTrade.side === 'long' && exec.action === 'buy') ||
            (currentTrade.side === 'short' && exec.action === 'sell')) {
          entryCommission += exec.fees || 0;
        } else {
          exitCommission += exec.fees || 0;
        }
      });
      currentTrade.entryCommission = entryCommission;
      currentTrade.exitCommission = exitCommission;

      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      
      // Mark as update if this was an existing position (partial or full)
      if (currentTrade.isExistingPosition) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated existing position: ${currentTrade.executions.length} executions, remaining ${Math.abs(currentPosition)} shares`;
        console.log(`  → Updated existing ${currentTrade.side} position: ${existingPosition.quantity} → ${currentTrade.quantity} shares`);
      } else {
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        console.log(`  → Added open ${currentTrade.side} position: ${currentTrade.quantity} shares`);
      }
      
      // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  });

  console.log(`Created ${completedTrades.length} trades from ${transactions.length} transactions`);
  return completedTrades;
}

async function parseSchwabTrades(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} Schwab trade records`);
  
  // Check if this is the new transaction format: Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
  if (records.length > 0 && !Array.isArray(records[0])) {
    const columns = Object.keys(records[0]);
    console.log('Available columns:', columns);
    
    // Check for the new transaction format
    if (columns.includes('Date') && columns.includes('Action') && columns.includes('Symbol') && columns.includes('Price')) {
      console.log('Detected new Schwab transaction format - processing buy/sell transactions');
      return await parseSchwabTransactions(records, existingPositions, context);
    }
  }
  
  // Fall back to original format processing
  const completedTrades = [];
  let totalCommissions = 0;
  let totalFees = 0;
  let totalPnL = 0;
  
  for (const record of records) {
    try {
      let symbol, quantity, costPerShare, proceedsPerShare, gainLoss, openedDate, closedDate, costBasis, term, washSale;
      
      // Handle array format (positional data without headers)
      if (Array.isArray(record)) {
        symbol = record[0];
        openedDate = record[3];
        closedDate = record[2];
        quantity = Math.abs(parseInt(record[4]?.replace(/,/g, '') || 0));
        proceedsPerShare = parseFloat(record[5]?.replace(/[$,]/g, '') || 0);
        costPerShare = parseFloat(record[6]?.replace(/[$,]/g, '') || 0);
        costBasis = parseFloat(record[8]?.replace(/[$,]/g, '') || 0);
        gainLoss = parseFloat(record[9]?.replace(/[$,]/g, '') || 0);
        term = record[13] || 'Unknown';
        washSale = record[15] === 'Yes';
      } else {
        // Handle original named columns format
        symbol = record['Symbol'];
        quantity = Math.abs(parseInt(record['Quantity']?.replace(/,/g, '') || 0));
        costPerShare = parseFloat(record['Cost Per Share']?.replace(/[$,]/g, '') || 0);
        proceedsPerShare = parseFloat(record['Proceeds Per Share']?.replace(/[$,]/g, '') || 0);
        gainLoss = parseFloat(record['Gain/Loss ($)']?.replace(/[$,]/g, '') || 0);
        openedDate = record['Opened Date'];
        closedDate = record['Closed Date'];
        costBasis = parseFloat(record['Cost Basis (CB)']?.replace(/[$,]/g, '') || 0);
        term = record['Term'] || 'Unknown';
        washSale = record['Wash Sale?'] === 'Yes';
      }
      
      const estimatedCommission = 0;
      let gainLossPercent = 0;
      if (Array.isArray(record)) {
        gainLossPercent = parseFloat(record[10]?.replace(/[%,]/g, '') || 0);
      } else {
        gainLossPercent = parseFloat(record['Gain/Loss (%)']?.replace(/[%,]/g, '') || 0);
      }
      
      // Determine account identifier - user selection takes priority, then CSV column, then header extraction
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : (context.schwabAccountNumber || null);

      const trade = {
        symbol: cleanString(symbol),
        tradeDate: parseDate(openedDate),
        entryTime: parseDateTime(openedDate + ' 09:30'),
        exitTime: parseDateTime(closedDate + ' 16:00'),
        entryPrice: costPerShare,
        exitPrice: proceedsPerShare,
        quantity: quantity,
        side: 'long',
        commission: estimatedCommission,
        fees: 0,
        pnl: gainLoss,
        pnlPercent: gainLossPercent,
        broker: 'schwab',
        notes: `${term} - ${washSale ? 'Wash Sale' : 'Normal'}`,
        accountIdentifier
      };
      
      if (trade.symbol && trade.entryPrice > 0 && trade.exitPrice > 0 && trade.quantity > 0) {
        completedTrades.push(trade);
        totalCommissions += estimatedCommission;
        totalPnL += gainLoss;
        console.log(`Valid trade added: ${trade.symbol} - P&L: $${gainLoss.toFixed(2)}`);
      }
    } catch (error) {
      console.error('Error parsing Schwab trade:', error, record);
    }
  }
  
  console.log(`Created ${completedTrades.length} Schwab trades`);
  return completedTrades;
}

async function parseSchwabTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} Schwab transaction records`);
  
  const transactions = [];
  const completedTrades = [];
  
  // First, parse all transactions - only process Buy and Sell actions
  for (const record of records) {
    try {
      const action = (record['Action'] || '').toLowerCase();
      const symbol = cleanString(record['Symbol'] || '');
      const quantityStr = (record['Quantity'] || '').toString().replace(/,/g, '');
      const priceStr = (record['Price'] || '').toString().replace(/[$,]/g, '');
      const amountStr = (record['Amount'] || '').toString().replace(/[$,]/g, '');
      const feesStr = (record['Fees & Comm'] || '').toString().replace(/[$,]/g, '');
      const date = record['Date'] || '';
      const description = record['Description'] || '';
      
      // Only process buy and sell transactions
      if (!action.includes('buy') && !action.includes('sell')) {
        console.log(`Skipping non-trade action: ${action}`);
        continue;
      }
      
      // Skip if missing essential data
      if (!symbol || !quantityStr || !priceStr) {
        console.log(`Skipping transaction missing data:`, { symbol, quantityStr, priceStr, action });
        continue;
      }
      
      const quantity = Math.abs(parseFloat(quantityStr));
      const price = parseFloat(priceStr);
      const amount = Math.abs(parseFloat(amountStr));
      const fees = parseFloat(feesStr) || 0;
      
      if (quantity === 0 || price === 0) {
        console.log(`Skipping transaction with zero values:`, { symbol, quantity, price });
        continue;
      }
      
      // Detect short sales - only check action field to avoid false positives
      // from security names containing "short" (e.g., "PROSHARES SHORT QQQ ETF")
      const isShort = action.includes('sell short');
      
      let transactionType;
      if (action.includes('buy')) {
        transactionType = isShort ? 'cover' : 'buy';  // Buy to cover vs regular buy
      } else {
        transactionType = isShort ? 'short' : 'sell'; // Short sell vs regular sell
      }
      
      // Parse date and skip if invalid
      const parsedDate = parseDate(date);
      if (!parsedDate) {
        console.log(`Skipping transaction with invalid date:`, { symbol, date, action });
        continue;
      }
      
      const parsedDateTime = parseDateTime(date + ' 09:30');
      if (!parsedDateTime) {
        console.log(`Skipping transaction with invalid datetime:`, { symbol, date, action });
        continue;
      }
      
      // Determine account identifier - user selection takes priority, then CSV column, then header extraction
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : (context.schwabAccountNumber || null);

      transactions.push({
        symbol,
        date: parsedDate,
        datetime: parsedDateTime,
        action: transactionType,
        quantity,
        price,
        amount,
        fees,
        description,
        isShort,
        raw: record,
        accountIdentifier
      });
      
      console.log(`Parsed transaction: ${transactionType} ${quantity} ${symbol} @ $${price} ${isShort ? '(SHORT)' : ''}`);
    } catch (error) {
      console.error('Error parsing Schwab transaction:', error, record);
    }
  }
  
  // Assign unique times to transactions on the same date+symbol to preserve CSV order
  // This prevents issues with duplicate detection when multiple round trips occur on the same day
  const transactionsByDateSymbol = {};
  for (const txn of transactions) {
    // txn.date is a string in YYYY-MM-DD format from parseDate()
    // Ensure date is valid (not null) before using it
    if (!txn.date) {
      console.warn(`[WARNING] Transaction missing date field:`, txn);
      continue;
    }
    const key = `${txn.symbol}_${txn.date}`;
    if (!transactionsByDateSymbol[key]) {
      transactionsByDateSymbol[key] = [];
    }
    transactionsByDateSymbol[key].push(txn);
  }

  // Assign incremental seconds to transactions with the same date+symbol to make each unique
  // IMPORTANT: Keep datetime as a naive string (no Z suffix) so convertTradeDatetimesToUTC
  // will properly convert it using the user's timezone, not Docker's TZ env var
  for (const key in transactionsByDateSymbol) {
    const group = transactionsByDateSymbol[key];
    if (group.length > 1) {
      console.log(`[DEBUG] Found ${group.length} transactions for ${key}:`);
      group.forEach((txn, index) => {
        const originalTime = txn.datetime;
        // Add incremental seconds to make each unique while keeping naive format
        // Parse the existing time and add index seconds
        const match = String(txn.datetime).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):(\d{2})(.*)$/);
        if (match) {
          const [, prefix, secStr, suffix] = match;
          const newSec = String(Math.min(parseInt(secStr) + index, 59)).padStart(2, '0');
          txn.datetime = `${prefix}:${newSec}${suffix}`;
        }
        console.log(`[DEBUG]   [${index}] ${txn.action} ${txn.quantity} @ $${txn.price} - Time: ${originalTime} → ${txn.datetime}`);
      });
      console.log(`[INFO] Assigned unique times to ${group.length} transactions for ${key} to preserve order`);
    }
  }

  // Sort transactions by symbol and date
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid transactions`);

  // Track the last trade end time for each symbol (for time-gap-based grouping)
  const lastTradeEndTime = {};

  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }

  // Process transactions using round-trip trade grouping (like TradersVue)
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];

    console.log(`\n=== Processing ${symbolTransactions.length} transactions for ${symbol} ===`);

    // Detect instrument type to apply correct multiplier
    const instrumentData = parseInstrumentData(symbol);
    const valueMultiplier = instrumentData.instrumentType === 'option' ? 100 :
                            instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    console.log(`Instrument type: ${instrumentData.instrumentType}, value multiplier: ${valueMultiplier}`);

    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: Array.isArray(existingPosition.executions)
        ? existingPosition.executions
        : (existingPosition.executions ? JSON.parse(existingPosition.executions) : []),
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'schwab',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;
    const openLots = []; // FIFO queue of position lots

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'} @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}, entryValue: $${currentTrade.entryValue.toFixed(2)}`);
    }

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          weightedEntryPrice: 0,
          weightedExitPrice: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'schwab',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees || 0
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += (transaction.fees || 0);
          console.log(`  → Added execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price} at ${newExecution.datetime}`);
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price} at ${newExecution.datetime}`);
        }
      }
      
      // Process the transaction
      if (transaction.action === 'buy') {
        currentPosition += qty;

        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'long') {
          const beforeEntry = currentTrade.entryValue;
          const beforeQty = currentTrade.totalQuantity;
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
          console.log(`  → [LONG BUY] Added to entry: ${beforeEntry} + ${qty * transaction.price} = ${currentTrade.entryValue}, Qty: ${beforeQty} + ${qty} = ${currentTrade.totalQuantity}`);
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price;
          console.log(`  → [SHORT BUY] Added to exit: ${currentTrade.exitValue}`);

          // Check if this is a partial close (position will still be negative after this buy)
          if (currentPosition < 0 && currentTrade.totalQuantity > 0) {
            // Calculate P&L for this partial close using weighted average entry price
            const avgEntryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
            const partialPnl = (avgEntryPrice - transaction.price) * qty * valueMultiplier;
            // Prorate commission for partial close
            const partialCommission = (currentTrade.totalFees / currentTrade.totalQuantity) * qty;
            const netPartialPnl = partialPnl - partialCommission;

            // Update the last execution with exit info and P&L
            const lastExec = currentTrade.executions[currentTrade.executions.length - 1];
            if (lastExec && lastExec.action === 'buy') {
              lastExec.entryTime = currentTrade.entryTime;
              lastExec.exitTime = transaction.datetime;
              lastExec.exitPrice = transaction.price;
              lastExec.entryPrice = avgEntryPrice;
              lastExec.pnl = netPartialPnl;
              console.log(`  → [PARTIAL COVER] Covered ${qty} @ $${transaction.price.toFixed(2)}, Entry avg: $${avgEntryPrice.toFixed(2)}, P&L: $${netPartialPnl.toFixed(2)}, Remaining: ${Math.abs(currentPosition)} shares short`);
            }
          }
        }

        openLots.push({
          type: 'long',
          quantity: qty,
          price: transaction.price,
          date: transaction.date,
          datetime: transaction.datetime
        });

      } else if (transaction.action === 'short' || transaction.action === 'sell') {
        currentPosition -= qty;

        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
          console.log(`  → [SHORT SELL] Added to entry: ${currentTrade.entryValue}, Qty: ${currentTrade.totalQuantity}`);
        } else if (currentTrade && currentTrade.side === 'long') {
          const beforeExit = currentTrade.exitValue;
          currentTrade.exitValue += qty * transaction.price;
          console.log(`  → [LONG SELL] Added to exit: ${beforeExit} + ${qty * transaction.price} = ${currentTrade.exitValue}`);

          // Check if this is a partial close (position will still be positive after this sell)
          if (currentPosition > 0 && currentTrade.totalQuantity > 0) {
            // Calculate P&L for this partial close using weighted average entry price
            const avgEntryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
            const partialPnl = (transaction.price - avgEntryPrice) * qty * valueMultiplier;
            // Prorate commission for partial close
            const partialCommission = (currentTrade.totalFees / currentTrade.totalQuantity) * qty;
            const netPartialPnl = partialPnl - partialCommission;

            // Update the last execution with exit info and P&L
            const lastExec = currentTrade.executions[currentTrade.executions.length - 1];
            if (lastExec && lastExec.action === 'sell') {
              lastExec.entryTime = currentTrade.entryTime;
              lastExec.exitTime = transaction.datetime;
              lastExec.exitPrice = transaction.price;
              lastExec.entryPrice = avgEntryPrice;
              lastExec.pnl = netPartialPnl;
              console.log(`  → [PARTIAL CLOSE] Sold ${qty} @ $${transaction.price.toFixed(2)}, Entry avg: $${avgEntryPrice.toFixed(2)}, P&L: $${netPartialPnl.toFixed(2)}, Remaining: ${currentPosition} shares`);
            }
          }
        }

        if (transaction.action === 'short') {
          openLots.push({
            type: 'short',
            quantity: qty,
            price: transaction.price,
            date: transaction.date,
            datetime: transaction.datetime
          });
        }
      }
      
      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        // Divide by multiplier to get per-contract/per-share price
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
        }

        currentTrade.executionData = currentTrade.executions;

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.shouldUpdate = true;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} total executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        completedTrades.push(currentTrade);

        // Record the end time for time-gap-based grouping
        lastTradeEndTime[symbol] = transaction.datetime;

        currentTrade = null;
        openLots.length = 0; // Clear lots when trade completes
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade && currentPosition !== 0) {
      // Add open position as incomplete trade
      // Check if this is an update to existing position or new position
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        // Updated existing position - mark for update
        currentTrade.shouldUpdate = true;
        currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, ${currentTrade.newExecutionsAdded} new executions`);
      } else if (!currentTrade.isExistingPosition) {
        // New open position
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        console.log(`  → Added open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares`);
      }

      // Calculate weighted average entry price for display
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.executionData = currentTrade.executions;

      completedTrades.push(currentTrade);
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);
    }
  }

  console.log(`Created ${completedTrades.length} completed trades (including open positions) from transaction pairing`);
  console.log(`\n[DEBUG] Schwab trades summary:`);
  completedTrades.forEach((trade, index) => {
    console.log(`  Trade #${index + 1}: ${trade.symbol} ${trade.side} ${trade.quantity} shares, Entry: $${trade.entryPrice?.toFixed(2)}, Exit: $${trade.exitPrice?.toFixed(2)}, P&L: $${trade.pnl?.toFixed(2)}`);
  });

  return completedTrades;
}

async function parseThinkorswimTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} thinkorswim transaction records`);

  const transactions = [];
  const completedTrades = [];
  
  // Debug: Log first few records to see structure
  console.log('Sample records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });
  
  // Count record types
  const typeCounts = {};
  records.forEach(record => {
    const type = record.TYPE || record.Type || 'UNKNOWN';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  console.log('Record type counts:', typeCounts);
  
  // Get diagnostics from context if available
  const diagnostics = context.diagnostics;

  // First, parse all trade transactions
  let rowIndex = 0;
  for (const record of records) {
    rowIndex++;
    try {
      const type = record.TYPE || record.Type || '';

      // Only process TRD (trade) rows
      if (type !== 'TRD') {
        if (diagnostics) {
          diagnostics.skippedRows++;
          // Provide clear, user-friendly skip reasons
          let reason;
          if (!type) {
            reason = 'Missing TYPE column - file may not be in ThinkorSwim format';
          } else if (type === 'DIV') {
            reason = 'Dividend row (not a trade)';
          } else if (type === 'RAD') {
            reason = 'Receive/Deliver row (not a trade)';
          } else if (type === 'JNL') {
            reason = 'Journal entry (not a trade)';
          } else if (type === 'INT') {
            reason = 'Interest row (not a trade)';
          } else {
            reason = `Non-trade row type: ${type}`;
          }
          diagnostics.skippedReasons.push({ row: rowIndex, reason });
        }
        continue;
      }

      const description = record.DESCRIPTION || record.Description || '';
      const date = record.DATE || record.Date || '';
      const time = record.TIME || record.Time || '';
      const refNum = record['REF #'] || record['Ref #'] || record.REF || '';

      // Parse trade details from description
      // Stock format:  "BOT +1,000 82655M107 @.77"
      // Option format: "BOT +5 CRM 100 (Weeklys) 2 APR 26 175 PUT @1.44 CBOE"
      const tradeMatch = description.match(/(BOT|SOLD)\s+([\+\-]?[\d,]+)\s+(.+?)\s+@([\d.]+)/);
      if (!tradeMatch) {
        console.log(`Skipping unparseable trade description: ${description}`);
        if (diagnostics) {
          diagnostics.skippedRows++;
          const truncatedDesc = description ? description.substring(0, 40) : '(empty)';
          const reason = description
            ? `Unexpected description format: "${truncatedDesc}..." - ThinkorSwim expects "BOT/SOLD +qty SYMBOL @price"`
            : 'Empty DESCRIPTION field - file may not be in ThinkorSwim format';
          diagnostics.skippedReasons.push({ row: rowIndex, reason });
        }
        continue;
      }

      const [_, action, quantityStr, symbolPart, priceStr] = tradeMatch;
      const quantity = Math.abs(parseFloat(quantityStr.replace(/,/g, '')));
      const price = parseFloat(priceStr);

      // Detect options: "CRM 100 (Weeklys) 2 APR 26 175 PUT" or "CRM 100 2 APR 26 175 CALL"
      // Pattern: UNDERLYING MULTIPLIER [optional (series)] DAY MONTH YEAR STRIKE PUT/CALL
      let symbol;
      let instrumentData = { instrumentType: 'stock' };
      const optionMatch = symbolPart.match(/^(\S+)\s+\d+\s+(?:\(.*?\)\s+)?(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})\s+([\d.]+)\s+(PUT|CALL)$/i);
      if (optionMatch) {
        const [, underlying, day, monthStr, yearStr, strike, optType] = optionMatch;
        const months = {
          'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
          'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        };
        const month = months[monthStr.toUpperCase()];
        const fullYear = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
        symbol = underlying;
        instrumentData = {
          instrumentType: 'option',
          underlyingSymbol: underlying,
          strikePrice: parseFloat(strike),
          expirationDate: `${fullYear}-${month}-${day.padStart(2, '0')}`,
          optionType: optType.toLowerCase(),
          contractSize: 100
        };
        console.log(`[TOS] Detected option: ${underlying} ${strike} ${optType} exp ${instrumentData.expirationDate}`);
      } else {
        // Stock - symbolPart is just the ticker
        symbol = symbolPart.trim();
      }

      // Parse fees
      const miscFees = parseFloat((record['Misc Fees'] || '0').replace(/[$,]/g, '')) || 0;
      const commissionsFees = parseFloat((record['Commissions & Fees'] || '0').replace(/[$,]/g, '')) || 0;
      const totalFees = miscFees + commissionsFees;

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : (context.tosAccountNumber || null);

      transactions.push({
        symbol,
        date: parseDate(date),
        datetime: parseDateTime(`${date} ${time}`),
        action: action.toLowerCase() === 'bot' ? 'buy' : 'sell',
        quantity,
        price,
        fees: totalFees,
        description,
        refNum,
        raw: record,
        accountIdentifier,
        instrumentData
      });

      console.log(`Parsed transaction: ${action} ${quantity} ${symbol} @ $${price}${instrumentData.instrumentType === 'option' ? ` (${instrumentData.optionType} ${instrumentData.strikePrice})` : ''}`);
    } catch (error) {
      console.error('Error parsing thinkorswim transaction:', error, record);
    }
  }
  
  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid trade transactions`);

  // Group transactions by REF # first, then merge them
  const transactionsByRef = {};
  for (const transaction of transactions) {
    if (transaction.refNum) {
      if (!transactionsByRef[transaction.refNum]) {
        transactionsByRef[transaction.refNum] = [];
      }
      transactionsByRef[transaction.refNum].push(transaction);
    }
  }

  // Merge transactions with the same REF # into single transactions
  const mergedTransactions = [];
  const processedRefs = new Set();

  for (const transaction of transactions) {
    // If this transaction has a REF # and we haven't processed it yet
    if (transaction.refNum && !processedRefs.has(transaction.refNum)) {
      const refTransactions = transactionsByRef[transaction.refNum];

      if (refTransactions.length > 1) {
        // Multiple transactions with same REF # - merge them
        console.log(`Merging ${refTransactions.length} transactions with REF # ${transaction.refNum}`);

        // Sum quantities and fees, weighted average for price
        let totalQuantity = 0;
        let totalValue = 0;
        let totalFees = 0;

        for (const refTx of refTransactions) {
          totalQuantity += refTx.quantity;
          totalValue += refTx.quantity * refTx.price;
          totalFees += refTx.fees;
        }

        const avgPrice = totalValue / totalQuantity;

        // Create merged transaction using first transaction as template
        const mergedTransaction = {
          ...refTransactions[0],
          quantity: totalQuantity,
          price: avgPrice,
          fees: totalFees
        };

        console.log(`  → Merged into: ${mergedTransaction.action} ${totalQuantity} ${mergedTransaction.symbol} @ $${avgPrice.toFixed(4)}`);
        mergedTransactions.push(mergedTransaction);
      } else {
        // Single transaction with this REF #
        mergedTransactions.push(transaction);
      }

      processedRefs.add(transaction.refNum);
    } else if (!transaction.refNum) {
      // No REF #, keep as-is
      mergedTransactions.push(transaction);
    }
    // Skip if already processed
  }

  console.log(`After REF # grouping: ${mergedTransactions.length} transactions (from ${transactions.length})`);

  // Group transactions by symbol (and option contract details for options)
  const transactionsBySymbol = {};
  for (const transaction of mergedTransactions) {
    // For options, group by underlying+strike+expiry+type to keep different contracts separate
    let groupKey = transaction.symbol;
    if (transaction.instrumentData && transaction.instrumentData.instrumentType === 'option') {
      const d = transaction.instrumentData;
      groupKey = `${transaction.symbol}_${d.strikePrice}${d.optionType === 'put' ? 'P' : 'C'}_${d.expirationDate}`;
    }
    transaction._groupKey = groupKey;
    if (!transactionsBySymbol[groupKey]) {
      transactionsBySymbol[groupKey] = [];
    }
    transactionsBySymbol[groupKey].push(transaction);
  }
  
  // Process transactions using round-trip trade grouping
  for (const groupKey in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[groupKey];
    const firstTx = symbolTransactions[0];
    const symbol = firstTx.symbol;
    const instrumentData = firstTx.instrumentData || { instrumentType: 'stock' };
    const isOption = instrumentData.instrumentType === 'option';
    const valueMultiplier = isOption ? 100 : 1;

    console.log(`\n=== Processing ${symbolTransactions.length} transactions for ${groupKey} ===`);

    // Track position and round-trip trades
    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: existingPosition.executions || [],
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice,
      exitValue: 0,
      broker: existingPosition.broker || 'thinkorswim',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;
    
    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }
    
    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;
      
      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);
      
      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'thinkorswim',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price;
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        // For options, prices in the CSV are per-share; multiply by valueMultiplier for actual dollar value
        const entryTotal = currentTrade.entryValue * valueMultiplier;
        const exitTotal = currentTrade.exitValue * valueMultiplier;
        currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
        currentTrade.exitPrice = currentTrade.exitValue / currentTrade.totalQuantity;

        // Calculate P/L using actual dollar values
        if (currentTrade.side === 'long') {
          currentTrade.pnl = exitTotal - entryTotal - currentTrade.totalFees;
        } else {
          currentTrade.pnl = entryTotal - exitTotal - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / entryTotal) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} ${isOption ? 'contracts' : 'shares'}, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} ${isOption ? 'contracts' : 'shares'}, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        // Only add trade if it has executions (skip if all were duplicates)
        if (currentTrade.executions.length > 0) {
          currentTrade.executionData = currentTrade.executions;
          completedTrades.push(currentTrade);
        } else {
          console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        }
        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} ${isOption ? 'contracts' : 'shares'}`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} ${isOption ? 'contracts' : 'shares'}, ${currentTrade.executions.length} executions`);

      // Add open position as incomplete trade
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
      currentTrade.exitPrice = null;
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // Mark as update if this was an existing position with new executions
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} ${isOption ? 'contracts' : 'shares'}, ${currentTrade.newExecutionsAdded} new executions`);
      }

      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  }

  console.log(`Created ${completedTrades.length} trades from ${transactions.length} transactions`);
  return completedTrades;
}

async function parsePaperMoneyTransactions(records, existingPositions = {}, context = {}) {
  const DEBUG = process.env.DEBUG_IMPORT === 'true';
  if (DEBUG) console.log(`Processing ${records.length} PaperMoney transaction records`);
  
  const transactions = [];
  const completedTrades = [];
  
  // Debug: Log first few records to see structure
  console.log('Sample PaperMoney records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });
  
  // First, parse all trade transactions from the filled orders
  for (const record of records) {
    try {
      const symbol = cleanString(record.Symbol);
      const side = record.Side ? record.Side.toLowerCase() : '';
      const quantity = Math.abs(parseInt(record.Qty || 0));
      const price = parseFloat(record.Price || record['Net Price'] || 0);
      const execTime = record['Exec Time'] || '';
      const posEffect = record['Pos Effect'] || '';
      const type = record.Type || 'STOCK';
      
      // Skip if missing essential data
      if (!symbol || !side || quantity === 0 || price === 0 || !execTime) {
        console.log(`Skipping PaperMoney record missing data:`, { symbol, side, quantity, price, execTime });
        continue;
      }
      
      // Parse the execution time (format: "9/19/25 13:24:32")
      let tradeDate = null;
      let entryTime = null;
      if (execTime) {
        // Convert MM/DD/YY format to full date
        const dateMatch = execTime.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(.+)$/);
        if (dateMatch) {
          const [_, month, day, year, time] = dateMatch;
          // Smart year conversion: assume 00-49 is 2000-2049, 50-99 is 1950-1999
          const yearNum = parseInt(year);
          const fullYear = yearNum < 50 ? 2000 + yearNum : 1900 + yearNum;
          const fullDate = `${month}/${day}/${fullYear} ${time}`;
          tradeDate = parseDate(fullDate);
          entryTime = parseDateTime(fullDate);
        }
      }
      
      if (!tradeDate || !entryTime) {
        console.log(`Skipping PaperMoney record with invalid date: ${execTime}`);
        continue;
      }
      
      // Validate date is reasonable (not in future, not too old)
      const now = new Date();
      const maxFutureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Allow 1 day in future for timezone issues
      const minPastDate = new Date('2000-01-01');
      
      if (entryTime > maxFutureDate) {
        console.log(`Skipping PaperMoney record with future date: ${execTime}`);
        continue;
      }
      
      if (entryTime < minPastDate) {
        console.log(`Skipping PaperMoney record with date too far in past: ${execTime}`);
        continue;
      }
      
      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol,
        date: tradeDate,
        datetime: entryTime,
        action: side === 'buy' ? 'buy' : 'sell',
        quantity,
        price,
        fees: 0, // PaperMoney doesn't show fees in this format
        posEffect,
        type,
        description: `${posEffect} - ${type}`,
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed PaperMoney transaction: ${side} ${quantity} ${symbol} @ $${price} (${posEffect})`);
    } catch (error) {
      console.error('Error parsing PaperMoney transaction:', error, record);
    }
  }
  
  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });
  
  console.log(`Parsed ${transactions.length} valid PaperMoney trade transactions`);
  
  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }
  
  // Process transactions using round-trip trade grouping
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];
    const instrumentData = parseInstrumentData(symbol);
    const valueMultiplier = instrumentData.instrumentType === 'option' ? 100 :
                            instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    console.log(`\n=== Processing ${symbolTransactions.length} PaperMoney transactions for ${symbol} ===`);
    
    // Track position and round-trip trades
    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: existingPosition.executions || [],
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'papermoney',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;
    
    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }
    
    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;
      
      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);
      
      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'papermoney',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);
        
        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }
        
        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);
        
        // For options, update symbol to use underlying symbol instead of the full option symbol
        if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
          currentTrade.symbol = instrumentData.underlyingSymbol;
        }
        
        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }
        
        // Only add trade if it has executions (skip if all were duplicates)
        if (currentTrade.executions.length > 0) {
          // Map executions to executionData for Trade.create
          currentTrade.executionData = currentTrade.executions;
          completedTrades.push(currentTrade);
        } else {
          console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        }
        currentTrade = null;
      }
    }
    
    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);
      
      // Add open position as incomplete trade
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // For options, update symbol to use underlying symbol instead of the full option symbol
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      // Mark as update if this was an existing position with new executions
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, ${currentTrade.newExecutionsAdded} new executions`);
      }

      // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  }

  console.log(`Created ${completedTrades.length} PaperMoney trades from ${transactions.length} transactions`);
  return completedTrades;
}

async function parseTradingViewTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} TradingView transaction records`);

  const transactions = [];
  const completedTrades = [];
  const lastTradeEndTime = {};

  // Debug: Log first few records to see structure
  console.log('Sample TradingView records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // Get diagnostics from context if available
  const diagnostics = context.diagnostics;

  // Helper for case-insensitive field access
  const getField = (record, fieldName) => {
    if (record[fieldName] !== undefined) return record[fieldName];
    const lower = fieldName.toLowerCase();
    for (const key of Object.keys(record)) {
      if (key.toLowerCase() === lower) return record[key];
    }
    return undefined;
  };

  // Some TradingView transaction exports omit the Status column entirely.
  // In that format, all rows represent executed fills and should be parsed.
  const fileHasStatusColumn = records.some(record => getField(record, 'Status') !== undefined);

  // First, parse all filled orders
  let rowIndex = 0;
  for (const record of records) {
    rowIndex++;
    try {
      const symbol = cleanString(getField(record, 'Symbol'));
      const side = getField(record, 'Side') ? getField(record, 'Side').toLowerCase() : '';
      const statusRaw = getField(record, 'Status') || '';
      const status = statusRaw.toLowerCase();
      const quantity = Math.abs(parseInteger(
        getField(record, 'Filled Qty') ||
        getField(record, 'Qty') ||
        getField(record, 'Quantity')
      ));
      const fillPrice = parseNumeric(
        getField(record, 'Fill Price') ||
        getField(record, 'Avg Fill Price') ||
        getField(record, 'Price')
      );
      const commission = parseNumeric(getField(record, 'Commission'));
      const placingTime = getField(record, 'Placing Time') || '';
      const closingTime = getField(record, 'Closing Time') || getField(record, 'Update Time') || getField(record, 'Time') || placingTime;
      const orderId = getField(record, 'Order ID') || '';
      const orderType = getField(record, 'Type') || '';
      const leverage = getField(record, 'Leverage') || '';

      // Only require Filled status when the CSV actually includes a Status column.
      if (fileHasStatusColumn && status !== 'filled') {
        console.log(`Skipping non-filled order: ${statusRaw}`);
        if (diagnostics) {
          diagnostics.skippedRows++;
          // Provide clear, user-friendly skip reasons
          let reason;
          if (!status) {
            reason = 'Missing Status column - file may not be in TradingView format';
          } else if (status === 'cancelled' || status === 'canceled') {
            reason = 'Cancelled order (not executed)';
          } else if (status === 'pending') {
            reason = 'Pending order (not yet filled)';
          } else if (status === 'rejected') {
            reason = 'Rejected order';
          } else {
            reason = `Order not filled (status: ${statusRaw})`;
          }
          diagnostics.skippedReasons.push({ row: rowIndex, reason });
        }
        continue;
      }

      // Skip if missing essential data
      if (!symbol || !side || quantity === 0 || fillPrice === 0 || !closingTime) {
        console.log(`Skipping TradingView record missing data:`, { symbol, side, quantity, fillPrice, closingTime });
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: 'Missing required fields (symbol, side, quantity, fill price, or closing time)' });
        }
        continue;
      }

      // Parse the datetime (format: "2025-10-02 21:28:16")
      const tradeDate = parseDate(closingTime);
      const entryTime = parseDateTime(closingTime);

      if (!tradeDate || !entryTime) {
        console.log(`Skipping TradingView record with invalid date: ${closingTime}`);
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: `Invalid date format: ${closingTime}` });
        }
        continue;
      }

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol,
        date: tradeDate,
        datetime: entryTime,
        action: side === 'buy' ? 'buy' : 'sell',
        quantity,
        price: fillPrice,
        fees: commission,
        orderId,
        orderType,
        leverage,
        description: `${orderType} order ${leverage ? `with ${leverage}` : ''}`,
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed TradingView transaction: ${side} ${quantity} ${symbol} @ $${fillPrice} (${orderType})`);
    } catch (error) {
      console.error('Error parsing TradingView transaction:', error, record);
    }
  }

  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid TradingView trade transactions`);

  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }

  // Process transactions using round-trip trade grouping
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];

    console.log(`\n=== Processing ${symbolTransactions.length} TradingView transactions for ${symbol} ===`);

    // Detect futures from TradingView exchange prefix (e.g., CME_MINI:MNQH2026, CME:ESH2026, NYMEX:CLH2026)
    const futuresExchanges = ['CME_MINI', 'CME', 'NYMEX', 'COMEX', 'CBOT', 'CME_MICRO'];
    const exchangeMatch = symbol.match(/^([^:]+):(.+)$/);
    const exchange = exchangeMatch ? exchangeMatch[1] : null;
    const rawContract = exchangeMatch ? exchangeMatch[2] : symbol;
    const isFutures = exchange && futuresExchanges.includes(exchange.toUpperCase());

    let contractMultiplier = 1;
    const instrumentData = {
      underlyingSymbol: null,
      optionType: null,
      strikePrice: null,
      expirationDate: null,
      ...getTradingViewFuturesInstrumentData(symbol)
    };

    let valueMultiplier = 1;

    if (isFutures) {
      // Parse futures contract: MNQH2026 -> MNQ (product), H (month), 2026 (year)
      const futuresMatch = rawContract.match(/^([A-Z]+?)([FGHJKMNQUVXZ])(\d{2,4})$/);
      const baseProduct = futuresMatch
        ? futuresMatch[1]
        : instrumentData.underlyingAsset || extractUnderlyingFromFuturesSymbol(symbol) || rawContract.replace(/[FGHJKMNQUVXZ]\d+$/, '');
      const pointValue = instrumentData.pointValue || getFuturesPointValue(baseProduct);
      valueMultiplier = pointValue;
      instrumentData.instrumentType = 'future';
      instrumentData.underlyingAsset = baseProduct;
      instrumentData.pointValue = pointValue;

      if (futuresMatch) {
        const monthCodes = { F: '01', G: '02', H: '03', J: '04', K: '05', M: '06', N: '07', Q: '08', U: '09', V: '10', X: '11', Z: '12' };
        instrumentData.contractMonth = monthCodes[futuresMatch[2]];
        let year = parseInt(futuresMatch[3]);
        if (year < 100) year += 2000;
        instrumentData.contractYear = year;
      }

      console.log(`  Detected futures: product=${baseProduct}, pointValue=$${pointValue}, contract=${rawContract}`);
    }

    // Use contract symbol without exchange prefix for storage
    const tradeSymbol = isFutures ? rawContract : symbol;

    // Track position and round-trip trades
    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: tradeSymbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: existingPosition.executions || [],
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'tradingview',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: tradeSymbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'tradingview',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees,
          orderId: transaction.orderId
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        // Divide by multiplier to get per-contract/per-share price
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity * (typeof contractMultiplier !== 'undefined' ? contractMultiplier : 1);
        currentTrade.commission = currentTrade.totalFees;

        // Calculate split commissions based on entry vs exit executions
        let entryCommission = 0;
        let exitCommission = 0;
        currentTrade.executions.forEach(exec => {
          if ((currentTrade.side === 'long' && exec.action === 'buy') ||
              (currentTrade.side === 'short' && exec.action === 'sell')) {
            entryCommission += exec.fees;
          } else {
            exitCommission += exec.fees;
          }
        });
        currentTrade.entryCommission = entryCommission;
        currentTrade.exitCommission = exitCommission;

        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);
        
        // For options, update symbol to use underlying symbol instead of the full option symbol
        if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
          currentTrade.symbol = instrumentData.underlyingSymbol;
        }

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        completedTrades.push(currentTrade);

        // Record the end time for time-gap-based grouping
        lastTradeEndTime[symbol] = transaction.datetime;

        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);

      // Skip if no executions (all were duplicates)
      if (currentTrade.executions.length === 0) {
        console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        currentTrade = null;
      }
    }

    if (currentTrade) {
      // Add open position as incomplete trade
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // For options, update symbol to use underlying symbol instead of the full option symbol
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      // Mark as update if this was an existing position with new executions
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, ${currentTrade.newExecutionsAdded} new executions`);
      }

      completedTrades.push(currentTrade);
    }
  }

  console.log(`Created ${completedTrades.length} TradingView trades from ${transactions.length} transactions`);
  return completedTrades;
}

/**
 * Parse TradingView Paper Trading CSV - each row is a complete round-trip trade
 * Headers: symbol,,qty,buyPrice,sellPrice,boughtTimestamp,soldTimestamp,Margin,Commission,leverage,status
 * Timestamps are Unix milliseconds. Side is determined by which timestamp came first.
 * Symbol format: EXCHANGE:TICKER (e.g., COMEX:GC1!)
 */
async function parseTradingViewPaperTrades(records, context = {}) {
  console.log(`\n=== TRADINGVIEW PAPER TRADING PARSER ===`);
  console.log(`Processing ${records.length} TradingView paper trading records`);

  const diagnostics = context.diagnostics;
  const completedTrades = [];

  // Debug: Log first few records
  console.log('Sample TradingView Paper records:');
  records.slice(0, 3).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // Helper for case-insensitive field access
  const getField = (record, fieldName) => {
    if (record[fieldName] !== undefined) return record[fieldName];
    const lower = fieldName.toLowerCase();
    for (const key of Object.keys(record)) {
      if (key.toLowerCase() === lower) return record[key];
    }
    return undefined;
  };

  let rowIndex = 0;
  for (const record of records) {
    rowIndex++;
    try {
      const rawSymbol = cleanString(getField(record, 'symbol'));
      const quantity = Math.abs(parseInteger(getField(record, 'qty')));
      const buyPrice = parseNumeric(getField(record, 'buyPrice'));
      const sellPrice = parseNumeric(getField(record, 'sellPrice'));
      const boughtTs = parseInt(getField(record, 'boughtTimestamp'));
      const soldTs = parseInt(getField(record, 'soldTimestamp'));
      const commission = parseNumeric(getField(record, 'Commission'));
      const statusRaw = cleanString(getField(record, 'status'));
      const status = statusRaw.toLowerCase();
      const leverage = cleanString(getField(record, 'leverage'));

      // Only process filled orders
      if (status !== 'filled') {
        console.log(`Skipping non-filled order: ${statusRaw}`);
        if (diagnostics) {
          diagnostics.skippedRows++;
          const reason = status === 'cancelled' || status === 'canceled'
            ? 'Cancelled order' : `Order not filled (status: ${statusRaw})`;
          diagnostics.skippedReasons.push({ row: rowIndex, reason });
        }
        continue;
      }

      // Validate essential data
      if (!rawSymbol || quantity === 0 || buyPrice === 0 || sellPrice === 0 || isNaN(boughtTs) || isNaN(soldTs)) {
        console.log(`Skipping record missing data:`, { rawSymbol, quantity, buyPrice, sellPrice, boughtTs, soldTs });
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: 'Missing required fields (symbol, qty, prices, or timestamps)' });
        }
        continue;
      }

      // Parse timestamps (Unix milliseconds)
      const boughtTime = new Date(boughtTs);
      const soldTime = new Date(soldTs);

      if (isNaN(boughtTime.getTime()) || isNaN(soldTime.getTime())) {
        console.log(`Skipping record with invalid timestamps:`, { boughtTs, soldTs });
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: `Invalid timestamp values` });
        }
        continue;
      }

      // Determine side from timestamp order
      // If bought first then sold -> long; if sold first then bought -> short
      const isLong = boughtTs <= soldTs;
      const side = isLong ? 'long' : 'short';
      const entryPrice = isLong ? buyPrice : sellPrice;
      const exitPrice = isLong ? sellPrice : buyPrice;
      const entryTime = isLong ? boughtTime : soldTime;
      const exitTime = isLong ? soldTime : boughtTime;
      const tradeDate = entryTime.toISOString().split('T')[0];

      // Clean symbol: strip exchange prefix (COMEX:GC1! -> GC1!)
      let symbol = rawSymbol;
      if (rawSymbol.includes(':')) {
        symbol = rawSymbol.split(':')[1];
      }

      // Detect futures instrument from symbol
      const underlying = extractUnderlyingFromFuturesSymbol(rawSymbol);
      const pointValue = underlying ? getFuturesPointValue(underlying) : 1;
      const isFuture = !!underlying;

      // Calculate P&L: (sellPrice - buyPrice) * qty * pointValue - commission
      const rawPnl = (sellPrice - buyPrice) * quantity * pointValue;
      const pnl = rawPnl - commission;

      // Build instrument data
      const instrumentData = isFuture ? {
        instrumentType: 'future',
        underlyingSymbol: underlying,
        underlyingAsset: underlying,
        pointValue: pointValue,
        contractSize: pointValue
      } : {
        instrumentType: 'stock',
        contractSize: null
      };

      // Determine account identifier
      const accountIdentifier = context.selectedAccountId || null;

      const trade = {
        symbol: underlying || symbol,
        tradeDate,
        entryTime: entryTime.toISOString(),
        exitTime: exitTime.toISOString(),
        entryPrice,
        exitPrice,
        quantity,
        side,
        commission,
        fees: 0,
        pnl,
        profitLoss: pnl,
        broker: 'tradingview',
        accountIdentifier,
        notes: leverage ? `Leverage: ${leverage}` : '',
        executions: [
          {
            entryTime: entryTime.toISOString(),
            entryPrice,
            quantity,
            side,
            commission: 0,
            fees: 0
          },
          {
            exitTime: exitTime.toISOString(),
            exitPrice,
            quantity,
            side: isLong ? 'sell' : 'buy',
            commission,
            fees: 0,
            pnl
          }
        ],
        executionData: [
          {
            entryTime: entryTime.toISOString(),
            entryPrice,
            quantity,
            side,
            commission: 0,
            fees: 0
          },
          {
            exitTime: exitTime.toISOString(),
            exitPrice,
            quantity,
            side: isLong ? 'sell' : 'buy',
            commission,
            fees: 0,
            pnl
          }
        ],
        ...instrumentData
      };

      completedTrades.push(trade);
      console.log(`Parsed TradingView paper trade: ${side} ${quantity} ${symbol} @ $${entryPrice} -> $${exitPrice}, P&L: $${pnl.toFixed(2)}`);
    } catch (error) {
      console.error('Error parsing TradingView paper trade:', error, record);
      if (diagnostics) {
        diagnostics.invalidRows++;
        diagnostics.skippedReasons.push({ row: rowIndex, reason: `Parse error: ${error.message}` });
      }
    }
  }

  console.log(`[SUCCESS] Parsed ${completedTrades.length} TradingView paper trades from ${records.length} records`);
  return completedTrades;
}

async function parseTradervueCompletedTrades(records, context = {}) {
  const trades = [];

  for (const record of records) {
    const trade = brokerParsers.tradervue(record);
    if (!isValidTrade(trade)) {
      continue;
    }

    if (trade.symbol) {
      const instrumentData = parseInstrumentData(trade.symbol);
      if (instrumentData.instrumentType === 'future' || instrumentData.instrumentType === 'option') {
        Object.assign(trade, instrumentData);
      }
    }

    const accountIdentifier = context.selectedAccountId
      ? context.selectedAccountId
      : context.accountColumnName
        ? extractAccountFromRecord(record, context.accountColumnName)
        : null;

    if (accountIdentifier) {
      trade.accountIdentifier = accountIdentifier;
    }

    trades.push(trade);
  }

  return trades;
}

async function parseIBKRTransactions(records, existingPositions = {}, tradeGroupingSettings = { enabled: true, timeGapMinutes: 60 }, context = {}) {
  console.log(`\n=== IBKR TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} IBKR transaction records`);
  console.log(`Existing open positions passed to parser: ${Object.keys(existingPositions).length}`);
  console.log(`Trade grouping: ${tradeGroupingSettings.enabled ? `enabled (${tradeGroupingSettings.timeGapMinutes} minute time gap)` : 'disabled'}`);

  if (Object.keys(existingPositions).length > 0) {
    console.log(`Existing positions:`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} @ $${position.entryPrice} (Trade ID: ${position.id})`);
    });
  }

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records to see structure
  console.log('\nSample IBKR records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // Detect format: Trade Confirmation vs Activity Statement
  const isTradeConfirmation = records.length > 0 && records[0].hasOwnProperty('Buy/Sell');

  // First, parse all transactions
  let rowIndex = 0;
  for (const record of records) {
    rowIndex++;
    try {
      let symbol, quantity, absQuantity, price, commission, dateTime, action, multiplierFromCSV;

      // Capture Code column if present (O = Open, P = Partial, C = Close)
      // Handle both "Code" and "Notes/Codes" column names (Flex Query exports use Notes/Codes)
      let code = null;
      if (record.Code || record.code || record['Notes/Codes']) {
        code = cleanString(record.Code || record.code || record['Notes/Codes']).toUpperCase();
        console.log(`[IBKR] Transaction code: ${code}`);
      }

      if (isTradeConfirmation) {
        // Trade Confirmation format (also matches Flex Query exports with Buy/Sell column)
        symbol = cleanString(record.Symbol);
        quantity = parseNumeric(record.Quantity, NaN);
        absQuantity = Math.abs(quantity);
        // Handle both "Price" and "TradePrice" column names (Flex Query exports use TradePrice)
        price = parseNumeric(record.Price || record.TradePrice, NaN);
        // IBKR commission: negative = fee paid, positive = rebate received
        // Convert to our convention: positive = fee paid, negative = rebate (credit)
        // Handle both "Commission" and "IBCommission" column names
        commission = -(parseNumeric(record.Commission || record.IBCommission || 0, 0));

        // Handle multiple DateTime formats:
        // - YYYYMMDD;HHMMSS (original Trade Confirmation)
        // - MM/DD/YY;HHMMSS (Flex Query with slash dates, e.g. IBKR Japan)
        // - Date/Time or DateTime column names
        const rawDateTime = (record['Date/Time'] || record.DateTime || '').toString();
        dateTime = rawDateTime.replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();

        // Determine action from Buy/Sell column
        const buySell = cleanString(record['Buy/Sell']).toUpperCase();
        action = buySell === 'BUY' ? 'buy' : 'sell';
        // Read Multiplier column for Trade Confirmation format
        multiplierFromCSV = record.Multiplier ? parseNumeric(record.Multiplier, null) : null;
      } else {
        // Activity Statement format (original)
        symbol = cleanString(record.Symbol);
        quantity = parseNumeric(record.Quantity, NaN);
        absQuantity = Math.abs(quantity);
        price = parseNumeric(record.Price, NaN);
        // IBKR commission: negative = fee paid, positive = rebate received
        // Convert to our convention: positive = fee paid, negative = rebate (credit)
        commission = -(parseNumeric(record.Commission || 0, 0));
        // Handle both "DateTime" and "Date/Time" column names
        // Clean DateTime - remove leading and trailing apostrophes/quotes if present
        const rawDateTime = (record.DateTime || record['Date/Time'] || '').toString();
        dateTime = rawDateTime.replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();
        action = quantity > 0 ? 'buy' : 'sell';
        // Check for Multiplier column (some IBKR Activity Statement exports include this)
        multiplierFromCSV = record.Multiplier ? parseNumeric(record.Multiplier, null) : null;
      }


      // Skip header rows and non-execution records in multi-section Flex Query exports
      // Flex Query exports have LevelOfDetail = "EXECUTION" for actual trades
      const levelOfDetail = record.LevelOfDetail || '';
      if (levelOfDetail === 'LevelOfDetail' || levelOfDetail === 'Header') {
        // This is a header row from a different section, skip it
        continue;
      }

      // In multi-section Flex Query CSVs, later sections have different column layouts.
      // When parsed using the first section's headers, these rows produce garbage data.
      // If LevelOfDetail exists in the header and this row has a non-empty value that
      // isn't EXECUTION, skip it (e.g., "DETAIL", "SUMMARY", or text from wrong columns).
      if (levelOfDetail && levelOfDetail !== 'EXECUTION') {
        continue;
      }

      // Skip if symbol is literally "Symbol" or other header text (a header row being parsed as data)
      if (symbol === 'SYMBOL' || symbol === 'Symbol' || symbol === 'ISIN' || symbol === 'SecurityIDType') {
        continue;
      }

      // Skip rows from other Flex Query sections where ClientAccountID column has unexpected values
      // (e.g., "CurrencyPrimary" from Financial Instrument Information section)
      const clientAccountId = cleanString(record.ClientAccountID || '');
      if (clientAccountId === 'ClientAccountID' || clientAccountId === 'CurrencyPrimary') {
        continue;
      }

      // Skip if missing essential data
      // Note: price === 0 is valid for expired options (Code contains "Ep" or "Ex" or "A" or "C")
      // Also valid when Code is 'C' (close) for options with price=0 (worthless expiration)
      const isOptionSymbol = symbol && (symbol.includes(' ') || /\d{6}[PC]\d{8}/.test(symbol));
      const isExpirationCode = code && (code.includes('EP') || code.includes('EX') || code.includes('A'));
      const isOptionClose = code && code.includes('C') && isOptionSymbol;
      const isExpiration = isExpirationCode || (price === 0 && isOptionClose);
      const invalidQuantity = !isFinite(absQuantity) || absQuantity <= 0;
      const invalidPrice = !isFinite(price) || (price === 0 && !isExpiration);
      if (!symbol || invalidQuantity || invalidPrice || !dateTime) {
        console.log(`Skipping IBKR record missing data:`, { symbol, quantity, price, dateTime, code });
        continue;
      }

      // Parse the datetime
      const tradeDate = parseDate(dateTime);
      const entryTime = parseDateTime(dateTime);

      if (!tradeDate || !entryTime) {
        console.log(`Skipping IBKR record with invalid date: ${dateTime}`);
        continue;
      }

      // For options, IBKR Activity Statement already reports quantity in contracts
      let processedQuantity = absQuantity;
      const instrumentData = parseInstrumentData(symbol);
      if (instrumentData.instrumentType === 'option') {
        // IBKR reports options quantity in contracts already (not shares)
        // So we don't need to divide by 100
        processedQuantity = Math.round(absQuantity); // Ensure whole number
        console.log(`[IBKR] Options contract quantity: ${processedQuantity} contracts`);
      } else {
        // For stocks, use the quantity as-is
        processedQuantity = absQuantity;
        console.log(`[IBKR] Stock quantity: ${processedQuantity} shares`);
      }

      // Detect if this is an expiration transaction
      // Include EP (expired), EX (exercised), A (assigned), or option close with price=0
      const isExpirationTx = isExpiration || (price === 0 && instrumentData.instrumentType === 'option');

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      // Extract Conid (Contract ID) for options grouping - this is the most reliable way to group
      // options trades for the same contract regardless of symbol parsing issues
      const conid = cleanString(record.Conid || record.conid || record.ConId || record.ConID || '');
      if (conid) {
        console.log(`[IBKR] Contract ID (Conid): ${conid} for symbol ${symbol}`);
      }

      const orderId = cleanString(
        record['Order ID'] ||
        record.OrderID ||
        record.OrderId ||
        record.orderId ||
        record['OrderId'] ||
        record['Trade ID'] ||
        record.TradeID ||
        ''
      );

      transactions.push({
        symbol,
        conid, // Contract ID for reliable options grouping
        orderId,
        sourceIndex: rowIndex,
        date: tradeDate,
        datetime: entryTime,
        action: action,
        quantity: processedQuantity,
        price: price,
        fees: commission,
        code: code, // O = Open, P = Partial, C = Close, Ep = Expired, Ex = Exercised, A = Assigned
        isExpiration: isExpirationTx,
        multiplier: multiplierFromCSV, // Contract multiplier from CSV (if available)
        description: isExpirationTx ? `IBKR option expiration/assignment` : `IBKR transaction`,
        raw: record,
        accountIdentifier
      });

      if (isExpirationTx) {
        console.log(`[IBKR] Parsed EXPIRATION/ASSIGNMENT: ${action} ${processedQuantity} ${symbol} @ $${price} [${code || 'no code'}] (options expired/assigned)`);
      } else {
        console.log(`Parsed IBKR transaction: ${action} ${processedQuantity} ${symbol} @ $${price}${code ? ` [${code}]` : ''}${commission < 0 ? ` (rebate: $${Math.abs(commission).toFixed(2)})` : ''}`);
      }
    } catch (error) {
      console.error('Error parsing IBKR transaction:', error, record);
    }
  }

  // Sort transactions by grouping key (conid if available, otherwise symbol) and datetime
  // Using Conid ensures options contracts are grouped correctly even if symbol parsing has issues
  const compareIBKROrderIds = (a, b) => {
    if (!a.orderId || !b.orderId) {
      return 0;
    }

    return a.orderId.localeCompare(b.orderId, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  };

  transactions.sort((a, b) => {
    const keyA = a.conid || a.symbol;
    const keyB = b.conid || b.symbol;
    if (keyA !== keyB) return keyA.localeCompare(keyB);
    const timeDiff = new Date(a.datetime) - new Date(b.datetime);
    if (timeDiff !== 0) return timeDiff;

    const orderDiff = compareIBKROrderIds(a, b);
    if (orderDiff !== 0) return orderDiff;

    return a.sourceIndex - b.sourceIndex;
  });

  console.log(`Parsed ${transactions.length} valid IBKR trade transactions`);

  // Track the last trade end time for each grouping key (for time-gap-based grouping)
  const lastTradeEndTime = {};

  // Group transactions by Conid when available, otherwise by symbol
  // Conid is the most reliable way to group options trades for the same contract
  const transactionsByGroupKey = {};
  for (const transaction of transactions) {
    // Use Conid as primary grouping key for options, fall back to symbol
    const groupKey = transaction.conid || transaction.symbol;
    if (!transactionsByGroupKey[groupKey]) {
      transactionsByGroupKey[groupKey] = [];
    }
    transactionsByGroupKey[groupKey].push(transaction);
  }

  // Log grouping info
  const conidGroupCount = Object.keys(transactionsByGroupKey).filter(k => /^\d+$/.test(k)).length;
  const symbolGroupCount = Object.keys(transactionsByGroupKey).length - conidGroupCount;
  console.log(`[IBKR] Grouped into ${Object.keys(transactionsByGroupKey).length} groups (${conidGroupCount} by Conid, ${symbolGroupCount} by symbol)`);

  // For backwards compatibility, create transactionsBySymbol as an alias
  const transactionsBySymbol = transactionsByGroupKey;

  // Log all available existing positions for debugging
  console.log(`\n[IBKR] Available existing positions:`);
  if (Object.keys(existingPositions).length === 0) {
    console.log(`  → No existing positions found`);
  } else {
    Object.entries(existingPositions).forEach(([sym, pos]) => {
      console.log(`  → ${sym}: ${pos.side} ${pos.quantity} @ $${pos.entryPrice} (ID: ${pos.id})`);
    });
  }

  // Process transactions using round-trip trade grouping
  for (const groupKey in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[groupKey];

    // Get the actual symbol from the first transaction (groupKey might be a Conid)
    const symbol = symbolTransactions[0].symbol;
    const conid = symbolTransactions[0].conid;

    if (conid) {
      console.log(`\n=== Processing ${symbolTransactions.length} IBKR transactions for Conid ${conid} (${symbol}) ===`);
    } else {
      console.log(`\n=== Processing ${symbolTransactions.length} IBKR transactions for ${symbol} ===`);
    }

    // Parse instrument data to check if this is an option/future
    let instrumentData;

    // Check if Trade Confirmation format with separate columns
    if (isTradeConfirmation && symbolTransactions[0].raw) {
      instrumentData = parseIBKRTradeConfirmationInstrumentData(symbolTransactions[0].raw, symbol);
    } else {
      // Activity Statement format - parse from symbol
      instrumentData = parseInstrumentData(symbol);
    }

    // Note: For IBKR, quantity is in contracts for options
    // Price interpretation varies:
    //   - Standard options: prices are per-share, multiply by 100 for dollar value
    //   - Mini options: prices are per-share, multiply by 10 for dollar value
    //   - Some exports: prices may be per-contract, multiply by 1 for dollar value
    // We read the Multiplier column from CSV if available to handle all cases correctly
    const contractMultiplier = 1; // Quantity is already in contracts

    console.log(`Instrument type: ${instrumentData.instrumentType}, contract multiplier: ${contractMultiplier}`);

    // For dollar value calculations (entryValue/exitValue), we need to apply appropriate multipliers
    // Priority: CSV Multiplier > Trade Confirmation contractSize > default (100)
    const csvMultiplier = symbolTransactions[0]?.multiplier;
    const valueMultiplier = instrumentData.instrumentType === 'option' ?
                            (csvMultiplier || instrumentData.contractSize || 100) :
                            instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    if (csvMultiplier && instrumentData.instrumentType === 'option') {
      console.log(`[IBKR] Using multiplier from CSV: ${csvMultiplier} (option price is per-${csvMultiplier === 1 ? 'contract' : csvMultiplier === 10 ? 'share (mini)' : 'share'})`);
    } else if (instrumentData.instrumentType === 'option') {
      console.log(`[IBKR] Using default multiplier: ${valueMultiplier} (standard options pricing)`);
    }

    // Track position and round-trip trades
    // For options, build composite key (underlying_strike_expiration_type) to match specific contracts
    // This prevents different option contracts (same underlying, different strikes/expirations) from being merged
    // Also try Conid lookup if available (most reliable for IBKR)
    let existingPosition = null;
    let positionLookupKey = symbol;

    // Debug: Log all available conid keys for this lookup
    const availableConidKeys = Object.keys(existingPositions).filter(k => k.startsWith('conid_'));
    if (conid) {
      console.log(`  → [DEBUG] Looking for conid_${conid}`);
      console.log(`  → [DEBUG] Available conid keys: ${availableConidKeys.length > 0 ? availableConidKeys.join(', ') : 'NONE'}`);
    }

    // First try Conid lookup if available (most reliable)
    if (conid && existingPositions[`conid_${conid}`]) {
      positionLookupKey = `conid_${conid}`;
      console.log(`  → Looking up position by Conid: ${conid}`);
      existingPosition = existingPositions[positionLookupKey];
    } else if (conid) {
      // Conid provided but not found - log detailed info
      console.log(`  → [WARNING] Conid ${conid} not found in existing positions`);
      // Fallback to composite key for options
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol &&
          instrumentData.strikePrice && instrumentData.expirationDate && instrumentData.optionType) {
        positionLookupKey = `${instrumentData.underlyingSymbol}_${instrumentData.strikePrice}_${instrumentData.expirationDate}_${instrumentData.optionType}`;
        console.log(`  → Trying composite key fallback: ${positionLookupKey}`);
        existingPosition = existingPositions[positionLookupKey];
      }
    } else if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol &&
        instrumentData.strikePrice && instrumentData.expirationDate && instrumentData.optionType) {
      // Build composite key for options: underlying_strike_expiration_type
      positionLookupKey = `${instrumentData.underlyingSymbol}_${instrumentData.strikePrice}_${instrumentData.expirationDate}_${instrumentData.optionType}`;
      console.log(`  → Looking up option position with key: ${positionLookupKey}`);
      existingPosition = existingPositions[positionLookupKey];
    } else {
      // For stocks/futures or options without full metadata, use symbol directly
      existingPosition = existingPositions[symbol];
    }

    if (!existingPosition) {
      console.log(`  → No existing position found for key: ${positionLookupKey}`);
      // Log all existing position keys for debugging
      const allKeys = Object.keys(existingPositions);
      if (allKeys.length > 0) {
        console.log(`  → [DEBUG] All existing position keys: ${allKeys.slice(0, 20).join(', ')}${allKeys.length > 20 ? '...' : ''}`);
      }
    }

    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;

    // When loading an existing position, we need to recalculate entry/exit values from executions
    // This is critical for partial closes - the stored quantity is the REMAINING, not total
    let currentTrade = null;
    if (existingPosition) {
      const existingExecutions = Array.isArray(existingPosition.executions)
        ? existingPosition.executions
        : (existingPosition.executions ? JSON.parse(existingPosition.executions) : []);

      // Recalculate entry/exit values from executions to handle partial closes correctly
      let recalcEntryQty = 0;
      let recalcEntryValue = 0;
      let recalcExitQty = 0;
      let recalcExitValue = 0;
      let recalcFees = 0;

      for (const exec of existingExecutions) {
        const execQty = Math.abs(parseFloat(exec.quantity) || 0);
        const execPrice = parseFloat(exec.price) || 0;
        const execFees = parseFloat(exec.fees) || 0;
        // Use exec.action to determine entry vs exit - quantity is always stored as absolute value
        const execAction = exec.action;

        recalcFees += execFees;

        if (existingPosition.side === 'long') {
          // For long positions: buy = entry, sell = exit
          if (execAction === 'buy') {
            recalcEntryQty += execQty;
            recalcEntryValue += execQty * execPrice * valueMultiplier;
          } else if (execAction === 'sell') {
            recalcExitQty += execQty;
            recalcExitValue += execQty * execPrice * valueMultiplier;
          }
        } else {
          // For short positions: sell = entry, buy = exit
          if (execAction === 'sell') {
            recalcEntryQty += execQty;
            recalcEntryValue += execQty * execPrice * valueMultiplier;
          } else if (execAction === 'buy') {
            recalcExitQty += execQty;
            recalcExitValue += execQty * execPrice * valueMultiplier;
          }
        }
      }

      console.log(`  → [PARTIAL CLOSE FIX] Recalculated from ${existingExecutions.length} executions:`);
      console.log(`    Entry: ${recalcEntryQty} @ $${(recalcEntryValue / recalcEntryQty / valueMultiplier).toFixed(4)} = $${recalcEntryValue.toFixed(2)}`);
      console.log(`    Exit so far: ${recalcExitQty} @ $${recalcExitQty > 0 ? (recalcExitValue / recalcExitQty / valueMultiplier).toFixed(4) : '0'} = $${recalcExitValue.toFixed(2)}`);
      console.log(`    Remaining position: ${existingPosition.quantity} (stored), fees so far: $${recalcFees.toFixed(2)}`);

      currentTrade = {
        symbol: symbol,
        conid: existingPosition.conid || conid,
        entryTime: existingPosition.entryTime,
        tradeDate: existingPosition.tradeDate,
        side: existingPosition.side,
        executions: existingExecutions,
        // Use recalculated values from executions for accurate P&L
        totalQuantity: recalcEntryQty,  // Total entry quantity, not remaining
        totalFees: recalcFees,
        entryValue: recalcEntryValue,
        exitValue: recalcExitValue,  // Include partial close exit value!
        broker: existingPosition.broker || 'ibkr',
        isExistingPosition: true,
        existingTradeId: existingPosition.id,
        newExecutionsAdded: 0
      };
    }

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'} remaining`);
      console.log(`  → Total entry: ${currentTrade.totalQuantity}, entryValue: $${currentTrade.entryValue.toFixed(2)}, exitValue so far: $${currentTrade.exitValue.toFixed(2)}`);
    }

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;
      const transactionCode = transaction.code;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}${transactionCode ? ` | Code: ${transactionCode}` : ''}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0 && !currentTrade) {
        // Check if this is a close-only transaction (Code contains 'C' but not 'O' or standalone 'P')
        // IBKR codes: O=Open, C=Close, P=Partial, EP=Expired, EX=Exercised, A=Assigned
        // We check for ';P' or standalone 'P' to distinguish from 'EP' (Expired)
        // This is just a HINT - we'll still process the transaction even if we can't find the position
        const hasPartialCode = transactionCode && (transactionCode.includes(';P') || transactionCode === 'P' || transactionCode.startsWith('P;'));
        const isCloseOnly = transactionCode && transactionCode.includes('C') &&
                           !transactionCode.includes('O') && !hasPartialCode;

        if (isCloseOnly) {
          // Code='C' or 'A;C' indicates this should close an existing position, but we don't have one loaded
          // Instead of creating an incorrect open position, create a completed "close-only" trade
          // This represents a position that was opened outside this import and is now being closed
          console.log(`  → [CLOSE-ONLY] Code='${transactionCode}' is a closing transaction without existing position`);
          console.log(`  → Creating completed close-only trade for: ${transaction.action} ${qty} ${symbol} @ $${transaction.price}`);

          // For close-only transactions, determine the original trade direction:
          // - If we're BUYING to close (action='buy'), the original was a SHORT position
          // - If we're SELLING to close (action='sell'), the original was a LONG position
          const originalSide = transaction.action === 'buy' ? 'short' : 'long';

          // Calculate P&L: For close-only, we only have the exit value and commission
          // The entry value is unknown, so we use the close price as entry (P&L = -commission only)
          // This is a best-effort approach when the opening transaction is missing
          const closeValue = qty * transaction.price * valueMultiplier;
          const pnl = -(transaction.fees || 0); // Only commission loss since we don't know entry

          const closeOnlyTrade = {
            symbol: symbol,
            conid: conid,
            entryTime: transaction.datetime,
            exitTime: transaction.datetime,
            tradeDate: transaction.date,
            side: originalSide,
            quantity: qty,
            entryPrice: transaction.price, // Use close price as entry (unknown actual entry)
            exitPrice: transaction.price,
            pnl: pnl,
            pnlPercent: 0,
            commission: transaction.fees || 0,
            fees: 0,
            broker: 'ibkr',
            accountIdentifier: transaction.accountIdentifier,
            executions: [{
              action: transaction.action,
              quantity: qty,
              price: transaction.price,
              datetime: transaction.datetime,
              fees: transaction.fees || 0,
              conid: transaction.conid,
              orderId: transaction.orderId || null
            }],
            executionData: [{
              action: transaction.action,
              quantity: qty,
              price: transaction.price,
              datetime: transaction.datetime,
              fees: transaction.fees || 0,
              conid: transaction.conid,
              orderId: transaction.orderId || null
            }],
            notes: `Close-only trade: ${originalSide} position closed via ${transactionCode}. Opening transaction not in import.`,
            isCloseOnly: true
          };

          // Add instrument data
          Object.assign(closeOnlyTrade, instrumentData);
          if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
            closeOnlyTrade.symbol = instrumentData.underlyingSymbol;
          }

          completedTrades.push(closeOnlyTrade);
          console.log(`  → [SUCCESS] Created close-only ${originalSide} trade: ${qty} ${symbol} @ $${transaction.price}`);
          continue; // Skip the normal trade creation flow
        }

        // Start a new trade for non-close-only transactions
        // Check time gap if grouping is enabled
        let shouldStartNewTrade = true;

        if (tradeGroupingSettings.enabled && lastTradeEndTime[symbol]) {
          const timeSinceLastTrade = (new Date(transaction.datetime) - new Date(lastTradeEndTime[symbol])) / (1000 * 60); // minutes

          if (timeSinceLastTrade <= tradeGroupingSettings.timeGapMinutes) {
            // Within time gap - continue previous trade
            shouldStartNewTrade = false;
            console.log(`  → [GROUPING] Within ${tradeGroupingSettings.timeGapMinutes}min gap (${timeSinceLastTrade.toFixed(1)}min) - continuing previous trade`);
          } else {
            console.log(`  → [GROUPING] Beyond ${tradeGroupingSettings.timeGapMinutes}min gap (${timeSinceLastTrade.toFixed(1)}min) - starting new trade`);
          }
        }

        if (shouldStartNewTrade || !currentTrade) {
          // Always create a new trade if currentTrade is null (previous trade already completed)
          // Time gap grouping only applies when there's an active trade to continue
          if (!shouldStartNewTrade && !currentTrade) {
            console.log(`  → [GROUPING] No active trade to continue - starting new trade despite time gap`);
          }

          // Determine trade side - for sell-to-open, this is a short position
          const tradeSide = transaction.action === 'buy' ? 'long' : 'short';

          currentTrade = {
            symbol: symbol,
            conid: conid, // IBKR Contract ID for reliable options tracking
            entryTime: transaction.datetime,
            tradeDate: transaction.date,
            side: tradeSide,
            executions: [],
            totalQuantity: 0,
            totalFees: 0,
            entryValue: 0,
            exitValue: 0,
            broker: 'ibkr',
            accountIdentifier: transaction.accountIdentifier
          };

          // Log with extra detail for short option positions
          if (tradeSide === 'short' && instrumentData.instrumentType === 'option') {
            console.log(`  → Started new SHORT OPTION trade (sell-to-open)${transactionCode ? ` [Code: ${transactionCode}]` : ''}`);
          } else {
            console.log(`  → Started new ${currentTrade.side} trade${transactionCode ? ` [Code: ${transactionCode}]` : ''}`);
          }
        }
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees,
          conid: transaction.conid, // Include Conid for duplicate detection
          orderId: transaction.orderId || null,
          sourceIndex: transaction.sourceIndex
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        // Try multiple candidate keys: conid, composite key, and plain symbol
        // This handles cases where IBKR returns conid but DB trade was imported via CSV under composite key
        const candidateKeys = [];
        if (transaction.conid) candidateKeys.push(`conid_${transaction.conid}`);
        if (positionLookupKey && !candidateKeys.includes(positionLookupKey)) candidateKeys.push(positionLookupKey);
        if (symbol && !candidateKeys.includes(symbol)) candidateKeys.push(symbol);
        const existsGlobally = isExecutionDuplicateMultiKey(newExecution, candidateKeys, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers (orderId)
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison (most reliable)
          if (exec.orderId && newExecution.orderId) {
            return String(exec.orderId) === String(newExecution.orderId);
          }
          // Without unique identifiers, don't deduplicate within the current import
          // This allows multiple identical executions from the same CSV (legitimate fills)
          // The global check (existsGlobally) still prevents re-importing existing trades
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;

          // Check if this is a partial close (position will still be negative after this buy)
          if (currentPosition < 0 && currentTrade.totalQuantity > 0) {
            // Calculate P&L for this partial close using weighted average entry price
            const avgEntryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
            const partialPnl = (avgEntryPrice - transaction.price) * qty * valueMultiplier;
            // Prorate commission for partial close
            const partialCommission = (currentTrade.totalFees / currentTrade.totalQuantity) * qty;
            const netPartialPnl = partialPnl - partialCommission;

            console.log(`  → [PARTIAL COVER] Covered ${qty} @ $${transaction.price.toFixed(2)}, Entry avg: $${avgEntryPrice.toFixed(2)}, P&L: $${netPartialPnl.toFixed(2)}, Remaining: ${Math.abs(currentPosition)} shares short`);
          }
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          // For short positions, entry value is what we receive from selling
          const saleProceeds = qty * transaction.price * valueMultiplier;
          currentTrade.entryValue += saleProceeds;
          currentTrade.totalQuantity += qty;

          // For short options, log detailed information about proceeds and commission rebates
          if (instrumentData.instrumentType === 'option') {
            // Commission rebates show as negative fees, so net proceeds = sale - fees (adds rebate)
            const netProceeds = saleProceeds - transaction.fees;
            console.log(`  [SHORT OPTION ENTRY] Sold ${qty} contracts @ $${transaction.price}/share`);
            console.log(`    Sale proceeds: $${saleProceeds.toFixed(2)} (${qty} × $${transaction.price} × ${valueMultiplier})`);
            console.log(`    Commission/rebate: $${transaction.fees.toFixed(2)} ${transaction.fees < 0 ? '(REBATE - credit)' : '(fee - debit)'}`);
            console.log(`    Net proceeds: $${netProceeds.toFixed(2)}`);
          }
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;

          // Check if this is a partial close (position will still be positive after this sell)
          if (currentPosition > 0 && currentTrade.totalQuantity > 0) {
            // Calculate P&L for this partial close using weighted average entry price
            const avgEntryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
            const partialPnl = (transaction.price - avgEntryPrice) * qty * valueMultiplier;
            // Prorate commission for partial close
            const partialCommission = (currentTrade.totalFees / currentTrade.totalQuantity) * qty;
            const netPartialPnl = partialPnl - partialCommission;

            console.log(`  → [PARTIAL CLOSE] Sold ${qty} @ $${transaction.price.toFixed(2)}, Entry avg: $${avgEntryPrice.toFixed(2)}, P&L: $${netPartialPnl.toFixed(2)}, Remaining: ${currentPosition} shares`);
          }
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        // Divide by multiplier to get per-contract/per-share price
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        // For short positions: P/L = what you received (entry) - what you paid (exit) - fees
        // For long positions: P/L = what you received (exit) - what you paid (entry) - fees
        // Commission rebates (negative fees) increase profit when subtracted
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;

          // Log P&L calculation for short options to help debugging
          if (instrumentData.instrumentType === 'option') {
            console.log(`  [SHORT OPTION P&L] Entry: $${currentTrade.entryValue.toFixed(2)}, Exit: $${currentTrade.exitValue.toFixed(2)}, Fees: $${currentTrade.totalFees.toFixed(2)}, P&L: $${currentTrade.pnl.toFixed(2)}`);
          }
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity * (typeof contractMultiplier !== 'undefined' ? contractMultiplier : 1);
        currentTrade.commission = currentTrade.totalFees;

        // Calculate split commissions based on entry vs exit executions
        let entryCommission = 0;
        let exitCommission = 0;
        currentTrade.executions.forEach(exec => {
          if ((currentTrade.side === 'long' && exec.action === 'buy') ||
              (currentTrade.side === 'short' && exec.action === 'sell')) {
            entryCommission += exec.fees;
          } else {
            exitCommission += exec.fees;
          }
        });
        currentTrade.entryCommission = entryCommission;
        currentTrade.exitCommission = exitCommission;

        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);
        
        // For options, update symbol to use underlying symbol instead of the full option symbol
        if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
          currentTrade.symbol = instrumentData.underlyingSymbol;
        }

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        completedTrades.push(currentTrade);

        // Record the end time for time-gap-based grouping
        lastTradeEndTime[symbol] = transaction.datetime;

        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);

      // Skip if no executions (all were duplicates)
      if (currentTrade.executions.length === 0) {
        console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        currentTrade = null;
      }
    }

    if (currentTrade) {
      // Add open position as incomplete trade
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      // IMPORTANT: Store the REMAINING position quantity, not total entry quantity
      // This ensures correct position tracking when importing additional closing transactions later
      const remainingQuantity = Math.abs(currentPosition);
      currentTrade.quantity = remainingQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;

      console.log(`  [OPEN POSITION] Storing remaining quantity: ${remainingQuantity} (currentPosition: ${currentPosition}, totalEntry: ${currentTrade.totalQuantity})`);

      // Calculate entry commission for open positions (all fees are entry fees since no exit yet)
      let entryCommission = 0;
      currentTrade.executions.forEach(exec => {
        if ((currentTrade.side === 'long' && exec.action === 'buy') ||
            (currentTrade.side === 'short' && exec.action === 'sell')) {
          entryCommission += exec.fees || 0;
        }
      });
      currentTrade.entryCommission = entryCommission;
      currentTrade.exitCommission = 0;

      // For open positions, P&L should be null (not yet realized)
      // This prevents showing incorrect "loss" for open short positions
      currentTrade.pnl = null;
      currentTrade.pnlPercent = null;

      // Create descriptive notes for open positions
      if (currentTrade.side === 'short' && instrumentData.instrumentType === 'option') {
        // For short options, calculate and show the net proceeds received
        const netProceeds = currentTrade.entryValue - currentTrade.totalFees;
        currentTrade.notes = `Open SHORT option position: ${remainingQuantity} contracts remaining (sold ${currentTrade.totalQuantity} @ $${currentTrade.entryPrice.toFixed(2)}/share), net proceeds: $${netProceeds.toFixed(2)} (${currentTrade.totalFees < 0 ? 'includes rebate' : 'after commission'})`;
        console.log(`  [OPEN SHORT OPTION] Entry price: $${currentTrade.entryPrice.toFixed(2)}/share, Net proceeds: $${netProceeds.toFixed(2)}, Remaining: ${remainingQuantity} contracts`);
      } else {
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      }

      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // For options, update symbol to use underlying symbol instead of the full option symbol
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      // Mark as update if this was an existing position with new executions
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        currentTrade.isUpdate = true;

        // Create more descriptive notes for short option updates
        if (currentTrade.side === 'short' && instrumentData.instrumentType === 'option') {
          const netProceeds = currentTrade.entryValue - currentTrade.totalFees;
          currentTrade.notes = `Updated open SHORT option position: ${currentTrade.newExecutionsAdded} new executions added, net proceeds: $${netProceeds.toFixed(2)}`;
        } else {
          currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        }

        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'}, ${currentTrade.newExecutionsAdded} new executions`);
      }

      completedTrades.push(currentTrade);
    }
  }

  console.log(`Created ${completedTrades.length} IBKR trades (including open positions) from ${transactions.length} transactions`);
  return completedTrades;
}

/**
 * Parse Webull options CSV transactions with position tracking
 * Webull format: Name, Symbol, Side, Status, Filled, Total Qty, Price, Avg Price, Time-in-Force, Placed Time, Filled Time
 * Options symbol format: SPY251114C00672000 (underlying + YYMMDD + C/P + strike*1000)
 * @param {Array} records - CSV records to parse
 * @param {Object} existingPositions - Map of existing open positions by symbol
 * @param {Object} context - Context object containing existingExecutions
 * @returns {Array} - Array of completed and open trades
 */
async function parseWebullTransactions(records, existingPositions = {}, context = {}) {
  console.log(`\n=== WEBULL TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} Webull transaction records`);
  console.log(`Existing open positions passed to parser: ${Object.keys(existingPositions).length}`);

  if (Object.keys(existingPositions).length > 0) {
    console.log(`Existing positions:`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} @ $${position.entryPrice} (Trade ID: ${position.id})`);
    });
  }

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records to see structure
  console.log('\nSample Webull records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // First, parse all transactions
  for (const record of records) {
    try {
      // Get symbol from Symbol column (full option symbol like SPY251114C00672000)
      const symbol = cleanString(record.Symbol || record.symbol);
      // Support both formats: "Side" (old) and "B/S" (alternate)
      const sideRaw = cleanString(record.Side || record.side || record['B/S'] || record['b/s']);
      const side = sideRaw.toLowerCase();
      const status = cleanString(record.Status || record.status);
      // Support both "Filled" (old) and "Filled Qty" (alternate)
      const filled = parseInt(record.Filled || record.filled || record['Filled Qty'] || record['filled qty'] || 0);
      // Support both "Avg Price" (old) and "Filled Avg Price" / "Filled AVG Price" (alternate, may have $ prefix)
      const priceRaw = cleanString(record['Avg Price'] || record['avg price'] || record['Filled Avg Price'] || record['filled avg price'] || record['Filled AVG Price'] || record.Price || record.price || '0');
      const price = parseFloat(priceRaw.replace(/^\$/, ''));
      const filledTime = record['Filled Time'] || record['filled time'] || record['Fill Time'] || record['fill time'] || '';

      const diag = context.diagnostics;

      // Determine if this is the alternate format (no Status column, uses B/S + Side Type)
      const isAlternateFormat = !!(record['B/S'] || record['b/s'] || record['Side Type'] || record['side type']);

      // Only process filled orders (skip status check for alternate format which has no Status column)
      if (!isAlternateFormat && (status.toLowerCase() !== 'filled' || filled === 0)) {
        console.log(`Skipping Webull record - not filled or zero quantity:`, { symbol, status, filled });
        if (diag) {
          diag.skippedRows = (diag.skippedRows || 0) + 1;
          if (!diag.skippedReasons) diag.skippedReasons = {};
          const reason = status.toLowerCase() === 'cancelled' ? 'Cancelled order' : `Status: ${status}, Filled: ${filled}`;
          diag.skippedReasons[reason] = (diag.skippedReasons[reason] || 0) + 1;
        }
        continue;
      }

      // For alternate format, skip if zero quantity
      if (isAlternateFormat && filled === 0) {
        console.log(`Skipping Webull record - zero quantity:`, { symbol, filled });
        if (diag) {
          diag.skippedRows = (diag.skippedRows || 0) + 1;
        }
        continue;
      }

      // Skip if missing essential data
      if (!symbol || !side || price === 0 || !filledTime) {
        console.log(`Skipping Webull record missing data:`, { symbol, side, filled, price, filledTime });
        if (diag) {
          diag.invalidRows = (diag.invalidRows || 0) + 1;
          if (!diag.skippedReasons) diag.skippedReasons = {};
          diag.skippedReasons['Missing essential data'] = (diag.skippedReasons['Missing essential data'] || 0) + 1;
        }
        continue;
      }

      // Parse the filled time (format: "11/14/2025 11:31:56 EST")
      let tradeDate = null;
      let entryTime = null;
      if (filledTime) {
        tradeDate = parseDate(filledTime);
        entryTime = parseDateTime(filledTime);
      }

      if (!tradeDate || !entryTime) {
        console.log(`Skipping Webull record with invalid date: ${filledTime}`);
        continue;
      }

      // Validate date is reasonable (not in future, not too old)
      const now = new Date();
      const maxFutureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Allow 1 day in future for timezone issues
      const minPastDate = new Date('2000-01-01');
      const entryTimeDate = new Date(entryTime);

      if (isNaN(entryTimeDate.getTime()) || entryTimeDate > maxFutureDate) {
        console.log(`Skipping Webull record with invalid/future date: ${filledTime}`);
        if (diag) {
          diag.invalidRows = (diag.invalidRows || 0) + 1;
          if (!diag.skippedReasons) diag.skippedReasons = {};
          diag.skippedReasons['Invalid or future date'] = (diag.skippedReasons['Invalid or future date'] || 0) + 1;
        }
        continue;
      }

      if (entryTimeDate < minPastDate) {
        console.log(`Skipping Webull record with date too far in past: ${filledTime}`);
        if (diag) {
          diag.invalidRows = (diag.invalidRows || 0) + 1;
          if (!diag.skippedReasons) diag.skippedReasons = {};
          diag.skippedReasons['Date too far in past'] = (diag.skippedReasons['Date too far in past'] || 0) + 1;
        }
        continue;
      }

      // Determine action from side
      const action = side === 'buy' ? 'buy' : 'sell';

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      // Parse fees - alternate format has Commission, Fee, Platform Fee, GST columns (may have $ prefix)
      const commissionRaw = cleanString(record.Commission || record.commission || '0');
      const feeRaw = cleanString(record.Fee || record.fee || '0');
      const platformFeeRaw = cleanString(record['Platform Fee'] || record['platform fee'] || '0');
      const gstRaw = cleanString(record.GST || record.gst || '0');
      const totalFees = parseFloat(commissionRaw.replace(/^\$/, '')) + parseFloat(feeRaw.replace(/^\$/, ''))
        + parseFloat(platformFeeRaw.replace(/^\$/, '')) + parseFloat(gstRaw.replace(/^\$/, ''));

      transactions.push({
        symbol,
        date: tradeDate,
        datetime: entryTime,
        action: action,
        quantity: filled,
        price: price,
        fees: isNaN(totalFees) ? 0 : totalFees,
        description: `Webull ${action}`,
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed Webull transaction: ${action} ${filled} ${symbol} @ $${price.toFixed(2)}`);
    } catch (error) {
      console.error('Error parsing Webull transaction:', error, record);
    }
  }

  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid Webull trade transactions`);

  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }

  // Log all available existing positions for debugging
  console.log(`\n[WEBULL] Available existing positions:`);
  if (Object.keys(existingPositions).length === 0) {
    console.log(`  → No existing positions found`);
  } else {
    Object.entries(existingPositions).forEach(([sym, pos]) => {
      console.log(`  → ${sym}: ${pos.side} ${pos.quantity} @ $${pos.entryPrice} (ID: ${pos.id})`);
    });
  }

  // Process transactions using round-trip trade grouping
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];

    console.log(`\n=== Processing ${symbolTransactions.length} Webull transactions for ${symbol} ===`);

    // Parse instrument data from symbol (options format: SPY251114C00672000)
    const instrumentData = parseInstrumentData(symbol);

    console.log(`Instrument type: ${instrumentData.instrumentType}`);
    if (instrumentData.instrumentType === 'option') {
      console.log(`  Underlying: ${instrumentData.underlyingSymbol}`);
      console.log(`  Strike: $${instrumentData.strikePrice}`);
      console.log(`  Expiration: ${instrumentData.expirationDate}`);
      console.log(`  Type: ${instrumentData.optionType}`);
    }

    // For options, quantity is in contracts but prices are per-share
    // We need to apply a multiplier when calculating dollar values (entryValue/exitValue)
    const contractMultiplier = 1; // Quantity is already in contracts
    const valueMultiplier = instrumentData.instrumentType === 'option' ? 100 :
                            instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    // Track position and round-trip trades
    // For options, try looking up by underlying symbol since that's what gets saved to database
    let existingPosition = existingPositions[symbol];
    if (!existingPosition && instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
      existingPosition = existingPositions[instrumentData.underlyingSymbol];
      if (existingPosition) {
        console.log(`  → Found existing position using underlying symbol: ${instrumentData.underlyingSymbol}`);
      }
    }

    if (!existingPosition) {
      console.log(`  → No existing position found for symbol: ${symbol}`);
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        console.log(`  → Also checked underlying symbol: ${instrumentData.underlyingSymbol}`);
      }
    }

    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    const existingExecutions = normalizeExecutionCollections([{
      executions: Array.isArray(existingPosition?.executions)
        ? existingPosition.executions
        : (existingPosition?.executions ? JSON.parse(existingPosition.executions) : [])
    }])[0].executions;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: existingExecutions,
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'webull',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'} @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}, entryValue: $${currentTrade.entryValue.toFixed(2)}`);
    }

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'webull',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices (divide by valueMultiplier to get per-share/per-contract price)
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity * contractMultiplier;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);

        // For options, update symbol to use underlying symbol instead of the full option symbol
        if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
          currentTrade.symbol = instrumentData.underlyingSymbol;
        }

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} contracts, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} contracts, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        // Only add trade if it has executions (skip if all were duplicates)
        if (currentTrade.executions.length > 0) {
          currentTrade.executionData = currentTrade.executions;
          completedTrades.push(currentTrade);
        } else {
          console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        }
        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'}`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'}, ${currentTrade.executions.length} executions`);

      // Add open position as incomplete trade
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // For options, update symbol to use underlying symbol instead of the full option symbol
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      // Mark as update if this was an existing position
      if (currentTrade.isExistingPosition) {
        currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
        console.log(`  → Updated existing position with ${currentTrade.newExecutionsAdded} new executions`);
      } else {
        console.log(`  → Creating new open position`);
      }

      // Only add if it has executions (skip if all were duplicates)
      if (currentTrade.executions.length > 0) {
        completedTrades.push(currentTrade);
      } else {
        console.log(`  [SKIP] Open position has no executions (all were duplicates), not creating trade`);
      }
    }
  }

  console.log(`\nCreated ${completedTrades.length} Webull trades (including open positions) from ${transactions.length} transactions`);
  return completedTrades;
}

/**
 * Parse generic CSV transactions with position tracking
 * This function properly matches opening and closing trades across imports
 * @param {Array} records - CSV records to parse
 * @param {Object} existingPositions - Map of existing open positions by symbol
 * @returns {Array} - Array of completed and open trades
 */
async function parseGenericTransactions(records, existingPositions = {}, customMapping = null, context = {}) {
  console.log(`Processing ${records.length} generic CSV records with position tracking`);
  if (customMapping) {
    console.log(`[CUSTOM MAPPING] Using custom mapping in position tracking mode: ${customMapping.mapping_name}`);
  }

  const transactions = [];
  const completedTrades = [];
  const lastTradeEndTime = {}; // Track last trade end time for each symbol
  const diagnostics = context.diagnostics;

  // First, parse all records into transactions
  let rowIndex = 0;
  for (const record of records) {
    rowIndex++;
    try {
      // Use custom mapping parser if provided, otherwise use generic parser
      let parser;
      if (customMapping) {
        const mapping = customMapping;
        parser = (row) => {
          // Parse quantity preserving sign (don't use parseInteger as it returns absolute value)
          const rawQuantityStr = (row[mapping.quantity_column] || '0').toString().trim().replace(/[,]/g, '');
          const rawQuantity = parseFloat(rawQuantityStr) || 0;
          const rawPrice = parseNumeric(row[mapping.entry_price_column]);

          // Infer side from quantity sign if no side column specified
          // Positive quantity = buy, Negative quantity = sell
          let side;
          if (mapping.side_column && row[mapping.side_column]) {
            side = parseSide(row[mapping.side_column]);
          } else {
            // Infer from quantity sign: negative quantity = sell, positive = buy
            side = rawQuantity < 0 ? 'short' : 'long';
          }

          return {
            symbol: row[mapping.symbol_column] || '',
            tradeDate: mapping.entry_date_column ? parseDate(row[mapping.entry_date_column]) : new Date(),
            entryTime: mapping.entry_date_column ? parseDateTime(row[mapping.entry_date_column]) : new Date(),
            entryPrice: Math.abs(rawPrice), // Use absolute value for price
            quantity: Math.abs(rawQuantity), // Use absolute value for quantity
            side: side,
            commission: mapping.fees_column ? Math.abs(parseNumeric(row[mapping.fees_column])) : 0,
            fees: mapping.fees_column ? Math.abs(parseNumeric(row[mapping.fees_column])) : 0,
            stopLoss: mapping.stop_loss_column ? parseNumeric(row[mapping.stop_loss_column]) : null,
            takeProfit: mapping.take_profit_column ? parseNumeric(row[mapping.take_profit_column]) : null,
            broker: 'custom'
          };
        };
      } else {
        parser = brokerParsers.generic;
      }

      const trade = parser(record);
      const transactionPriceCandidates = [
        trade.entryPrice,
        trade.exitPrice,
        trade.price
      ].map(value => parseNumeric(value, 0));
      const transactionPrice = transactionPriceCandidates.find(value => value > 0) || 0;
      const hasGenericTransactionFields = Boolean(
        trade.symbol &&
        trade.tradeDate &&
        trade.entryTime &&
        transactionPrice > 0 &&
        Number(trade.quantity) > 0
      );

      if (!hasGenericTransactionFields) {
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({
            row: rowIndex,
            reason: 'Invalid trade: missing required fields (symbol, date, price, or quantity)'
          });
        }
        continue;
      }

      // Determine transaction type based on the parsed side
      // The generic parser returns 'long' or 'short' as the side
      // We need to convert this to buy/sell transactions
      let transactionSide;

      // If custom mapping was used with a side column, check that first
      if (customMapping && customMapping.side_column && record[customMapping.side_column]) {
        const sideValue = record[customMapping.side_column].toString().toLowerCase();
        if (sideValue.includes('buy') || sideValue.includes('purchase') || sideValue.includes('bot') || sideValue.includes('long')) {
          transactionSide = 'buy';
        } else if (sideValue.includes('sell') || sideValue.includes('sold') || sideValue.includes('sld') || sideValue.includes('short')) {
          transactionSide = 'sell';
        } else {
          // Fallback based on parsed side
          transactionSide = trade.side === 'short' ? 'sell' : 'buy';
        }
      } else {
        // Check if there's an explicit action/type field in the CSV
        const action = (
          record.Action || record.action ||
          record.Type || record.type ||
          record.trade_type || record['trade_type'] ||
          record.Side || record.side ||
          ''
        ).toLowerCase();

        if (action.includes('buy') || action.includes('purchase') || action.includes('bot')) {
          transactionSide = 'buy';
        } else if (action.includes('sell') || action.includes('sold') || action.includes('sld')) {
          transactionSide = 'sell';
        } else {
          // Fallback: use the parsed side from generic parser
          // If side is 'long', assume it's a buy; if 'short', assume it's a sell
          transactionSide = trade.side === 'short' ? 'sell' : 'buy';
        }
      }

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol: trade.symbol.toUpperCase(),
        datetime: trade.entryTime,
        tradeDate: trade.tradeDate,
        side: transactionSide,
        quantity: Math.abs(trade.quantity),
        price: transactionPrice,
        commission: trade.commission || 0,
        fees: trade.fees || 0,
        broker: trade.broker || 'generic',
        originalRecord: record,
        accountIdentifier
      });
    } catch (error) {
      console.error('Error parsing generic transaction:', error, record);
      if (diagnostics) {
        diagnostics.invalidRows++;
        diagnostics.skippedReasons.push({ row: rowIndex, reason: `Parse error: ${error.message}` });
      }
    }
  }

  // Sort transactions by datetime
  transactions.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  console.log(`Parsed ${transactions.length} valid transactions from ${records.length} records`);

  // Group transactions by symbol
  const symbolGroups = {};
  for (const transaction of transactions) {
    if (!symbolGroups[transaction.symbol]) {
      symbolGroups[transaction.symbol] = [];
    }
    symbolGroups[transaction.symbol].push(transaction);
  }

  console.log(`Processing ${Object.keys(symbolGroups).length} symbols`);

  // Process each symbol's transactions
  for (const [symbol, symbolTransactions] of Object.entries(symbolGroups)) {
    console.log(`\nProcessing ${symbol}: ${symbolTransactions.length} transactions`);

    // Initialize position tracking
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;

    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: Array.isArray(existingPosition.executions)
        ? existingPosition.executions
        : (existingPosition.executions ? JSON.parse(existingPosition.executions) : []),
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice,
      exitValue: 0,
      broker: existingPosition.broker || 'generic',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }

    // Process each transaction chronologically
    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;

      console.log(`\n  ${transaction.side.toUpperCase()} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.tradeDate,
          side: transaction.side === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: transaction.broker,
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade
      if (currentTrade) {
        const newExecution = {
          action: transaction.side,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.commission + transaction.fees
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check for duplicate executions in current trade
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        }

        currentTrade.totalFees += transaction.commission + transaction.fees;
      }

      // Process the transaction and update position
      if (transaction.side === 'buy') {
        currentPosition += qty;

        if (currentTrade) {
          if (currentTrade.side === 'long') {
            // Adding to long position
            currentTrade.entryValue += qty * transaction.price;
            currentTrade.totalQuantity += qty;
          } else if (currentTrade.side === 'short') {
            // Covering short position
            currentTrade.exitValue += qty * transaction.price;

            // Check if this is a partial close (position will still be negative after this buy)
            if (currentPosition < 0 && currentTrade.totalQuantity > 0) {
              // Calculate P&L for this partial close using weighted average entry price
              const avgEntryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
              const partialPnl = (avgEntryPrice - transaction.price) * qty;
              // Prorate commission for partial close
              const partialCommission = (currentTrade.totalFees / currentTrade.totalQuantity) * qty;
              const netPartialPnl = partialPnl - partialCommission;

              // Update the last execution with exit info and P&L
              const lastExec = currentTrade.executions[currentTrade.executions.length - 1];
              if (lastExec && lastExec.action === 'buy') {
                lastExec.entryTime = currentTrade.entryTime;
                lastExec.exitTime = transaction.datetime;
                lastExec.exitPrice = transaction.price;
                lastExec.entryPrice = avgEntryPrice;
                lastExec.pnl = netPartialPnl;
                console.log(`  → [PARTIAL COVER] Covered ${qty} @ $${transaction.price.toFixed(2)}, Entry avg: $${avgEntryPrice.toFixed(2)}, P&L: $${netPartialPnl.toFixed(2)}, Remaining: ${Math.abs(currentPosition)} shares short`);
              }
            }
          }
        }
      } else if (transaction.side === 'sell') {
        currentPosition -= qty;

        if (currentTrade) {
          if (currentTrade.side === 'short') {
            // Adding to short position
            currentTrade.entryValue += qty * transaction.price;
            currentTrade.totalQuantity += qty;
          } else if (currentTrade.side === 'long') {
            // Selling long position
            currentTrade.exitValue += qty * transaction.price;

            // Check if this is a partial close (position will still be positive after this sell)
            if (currentPosition > 0 && currentTrade.totalQuantity > 0) {
              // Calculate P&L for this partial close using weighted average entry price
              const avgEntryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
              const partialPnl = (transaction.price - avgEntryPrice) * qty;
              // Prorate commission for partial close
              const partialCommission = (currentTrade.totalFees / currentTrade.totalQuantity) * qty;
              const netPartialPnl = partialPnl - partialCommission;

              // Update the last execution with exit info and P&L
              const lastExec = currentTrade.executions[currentTrade.executions.length - 1];
              if (lastExec && lastExec.action === 'sell') {
                lastExec.entryTime = currentTrade.entryTime;
                lastExec.exitTime = transaction.datetime;
                lastExec.exitPrice = transaction.price;
                lastExec.entryPrice = avgEntryPrice;
                lastExec.pnl = netPartialPnl;
                console.log(`  → [PARTIAL CLOSE] Sold ${qty} @ $${transaction.price.toFixed(2)}, Entry avg: $${avgEntryPrice.toFixed(2)}, P&L: $${netPartialPnl.toFixed(2)}, Remaining: ${currentPosition} shares`);
              }
            }
          }
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate final values
        currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
        currentTrade.exitPrice = currentTrade.exitValue / currentTrade.totalQuantity;

        // Calculate P&L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Set proper entry and exit times
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
        }

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed position via generic import: ${currentTrade.executions.length} executions`;
          console.log(`  [CHECK] CLOSED existing ${currentTrade.side} position: P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip trade: ${currentTrade.executions.length} executions`;
          console.log(`  [CHECK] Completed ${currentTrade.side} trade: P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        currentTrade.executionData = currentTrade.executions;
        completedTrades.push(currentTrade);

        // Record the end time for time-gap-based grouping
        lastTradeEndTime[symbol] = transaction.datetime;

        currentTrade = null;
      }
    }

    // Handle remaining open position
    if (currentTrade && Math.abs(currentPosition) > 0) {
      const netQuantity = Math.abs(currentPosition);

      // For open positions
      currentTrade.entryPrice = currentTrade.totalQuantity > 0 ?
        currentTrade.entryValue / currentTrade.totalQuantity : 0;
      currentTrade.exitPrice = null;
      currentTrade.exitTime = null;
      currentTrade.quantity = netQuantity;
      currentTrade.totalQuantity = netQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;

      // Update side based on final position
      currentTrade.side = currentPosition > 0 ? 'long' : 'short';

      if (currentTrade.isExistingPosition) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated position via generic import: ${currentTrade.executions.length} executions`;
        console.log(`  [CHECK] UPDATED ${currentTrade.side} position: ${netQuantity} shares`);
      } else {
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        console.log(`  [CHECK] Created open ${currentTrade.side} position: ${netQuantity} shares`);
      }

      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} transactions`);
  return completedTrades;
}

/**
 * Parse Tradovate futures transactions
 * Tradovate Performance Report parser - pre-matched round-trip trades
 * Headers: symbol, _priceFormat, _priceFormatType, _tickSize, buyFillId, sellFillId, qty, buyPrice, sellPrice, pnl, boughtTimestamp, soldTimestamp, duration
 * Each row is a completed round-trip trade (entry + exit already paired)
 */
async function parseTradovatePerformanceReport(records, context = {}) {
  console.log(`\n=== TRADOVATE PERFORMANCE REPORT PARSER ===`);
  console.log(`Processing ${records.length} pre-matched round-trip trades`);

  const completedTrades = [];
  const diagnostics = context.diagnostics;

  const getField = (record, ...fieldNames) => {
    for (const fieldName of fieldNames) {
      if (record[fieldName] !== undefined && record[fieldName] !== null) {
        return record[fieldName];
      }
    }
    return undefined;
  };

  const parseTradovateTimestamp = (value) => {
    const rawValue = cleanString(value);
    if (!rawValue) {
      return null;
    }

    if (/^\d{10,13}$/.test(rawValue)) {
      const numericValue = Number(rawValue);
      const milliseconds = rawValue.length === 10 ? numericValue * 1000 : numericValue;
      const parsed = new Date(milliseconds);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    return parseDateTime(rawValue);
  };

  // Debug: Log first few records
  console.log('Sample Tradovate Performance Report records:');
  records.slice(0, 3).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const rawSymbol = cleanString(
        getField(record, 'symbol', 'Symbol', 'Contract', 'contract', 'Product', 'product')
      );
      const quantity = Math.abs(parseInteger(
        getField(record, 'qty', 'Qty', 'Paired Qty', 'pairedQty', 'paired qty')
      ));
      const buyPrice = parseNumeric(getField(record, 'buyPrice', 'Buy Price', 'buy price'));
      const sellPrice = parseNumeric(getField(record, 'sellPrice', 'Sell Price', 'sell price'));

      // Parse PnL - Tradovate uses $185.00 or $(160.00) for negative
      let pnlStr = cleanString(getField(record, 'pnl', 'P/L', 'pl'));
      let pnl = 0;
      if (pnlStr) {
        const isNegative = pnlStr.includes('(') && pnlStr.includes(')');
        const cleaned = pnlStr.replace(/[$(),]/g, '');
        pnl = parseFloat(cleaned) || 0;
        if (isNegative) pnl = -pnl;
      }

      const rawBought = cleanString(getField(record, 'boughtTimestamp', 'Bought Timestamp', 'bought timestamp'));
      const rawSold = cleanString(getField(record, 'soldTimestamp', 'Sold Timestamp', 'sold timestamp'));
      const boughtTime = parseTradovateTimestamp(rawBought);
      const soldTime = parseTradovateTimestamp(rawSold);

      if (!boughtTime || !soldTime) {
        console.log(`[WARNING] Skipping row ${i + 1}: invalid timestamps - bought: "${rawBought}", sold: "${rawSold}"`);
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: i + 1, reason: 'Invalid bought/sold timestamps in Tradovate paired trade row' });
        }
        continue;
      }

      if (!rawSymbol || quantity === 0) {
        console.log(`[WARNING] Skipping row ${i + 1}: missing symbol or zero quantity`);
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: i + 1, reason: 'Missing contract/product symbol or paired quantity in Tradovate paired trade row' });
        }
        continue;
      }

      // Determine side: if bought first then sold -> LONG, if sold first then bought -> SHORT
      const boughtMs = new Date(boughtTime).getTime();
      const soldMs = new Date(soldTime).getTime();
      const isLong = boughtMs !== soldMs
        ? boughtMs <= soldMs
        : (pnl >= 0 ? sellPrice >= buyPrice : sellPrice < buyPrice);
      const side = isLong ? 'long' : 'short';
      const entryPrice = isLong ? buyPrice : sellPrice;
      const exitPrice = isLong ? sellPrice : buyPrice;
      const entryTime = isLong ? boughtTime : soldTime;
      const exitTime = isLong ? soldTime : boughtTime;
      const tradeDate = parseDate(rawBought) || parseDate(rawSold) || entryTime.split('T')[0];

      const product = cleanString(getField(record, 'Product', 'product'));
      const instrumentData = parseInstrumentData(rawSymbol);
      if (instrumentData.instrumentType === 'future') {
        instrumentData.underlyingAsset = instrumentData.underlyingAsset || product || extractUnderlyingFromFuturesSymbol(rawSymbol);
        instrumentData.underlyingSymbol = instrumentData.underlyingSymbol || instrumentData.underlyingAsset || null;
      }
      const pointValue = instrumentData.instrumentType === 'future'
        ? (instrumentData.pointValue || getFuturesPointValue(product || extractUnderlyingFromFuturesSymbol(rawSymbol)))
        : (instrumentData.contractSize || 1);

      // If PnL was not parsed from the formatted string, calculate it from the inferred side
      if (pnl === 0 && buyPrice !== sellPrice) {
        const priceDelta = isLong ? (sellPrice - buyPrice) : (buyPrice - sellPrice);
        pnl = priceDelta * quantity * pointValue;
      }

      // Determine account identifier
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      const entryOrderId = isLong
        ? cleanString(getField(record, 'buyFillId', 'Buy Fill ID', 'buy fill id'))
        : cleanString(getField(record, 'sellFillId', 'Sell Fill ID', 'sell fill id'));
      const exitOrderId = isLong
        ? cleanString(getField(record, 'sellFillId', 'Sell Fill ID', 'sell fill id'))
        : cleanString(getField(record, 'buyFillId', 'Buy Fill ID', 'buy fill id'));
      const notes = [];
      const duration = cleanString(getField(record, 'duration', 'Duration'));
      const pairId = cleanString(getField(record, 'Pair ID', 'pairId', 'pair id'));
      if (duration) notes.push(`Duration: ${duration}`);
      if (pairId) notes.push(`Pair ID: ${pairId}`);

      const trade = {
        symbol: rawSymbol,
        tradeDate,
        entryTime,
        exitTime,
        entryPrice,
        exitPrice,
        quantity,
        side,
        commission: 0,
        fees: 0,
        pnl,
        profitLoss: pnl,
        broker: 'tradovate',
        accountIdentifier,
        currency: cleanString(getField(record, 'Currency', 'currency')) || 'USD',
        notes: notes.join(' | '),
        executions: [
          {
            action: isLong ? 'buy' : 'sell',
            side: isLong ? 'buy' : 'sell',
            datetime: entryTime,
            entryTime,
            entryPrice,
            price: entryPrice,
            quantity,
            orderId: entryOrderId || undefined,
            commission: 0,
            fees: 0
          },
          {
            action: isLong ? 'sell' : 'buy',
            side: isLong ? 'sell' : 'buy',
            datetime: exitTime,
            exitTime,
            exitPrice,
            price: exitPrice,
            quantity,
            orderId: exitOrderId || undefined,
            commission: 0,
            fees: 0,
            pnl
          }
        ],
        executionData: [
          {
            action: isLong ? 'buy' : 'sell',
            side: isLong ? 'buy' : 'sell',
            datetime: entryTime,
            entryTime,
            entryPrice,
            price: entryPrice,
            quantity,
            orderId: entryOrderId || undefined,
            commission: 0,
            fees: 0
          },
          {
            action: isLong ? 'sell' : 'buy',
            side: isLong ? 'sell' : 'buy',
            datetime: exitTime,
            exitTime,
            exitPrice,
            price: exitPrice,
            quantity,
            orderId: exitOrderId || undefined,
            commission: 0,
            fees: 0,
            pnl
          }
        ],
        ...instrumentData
      };

      completedTrades.push(trade);
      console.log(`Parsed Tradovate performance trade: ${side} ${quantity} ${rawSymbol} @ $${entryPrice} -> $${exitPrice}, P&L: $${pnl.toFixed(2)}`);
    } catch (error) {
      console.error(`Error parsing Tradovate Performance Report row ${i + 1}:`, error.message, record);
    }
  }

  console.log(`[SUCCESS] Parsed ${completedTrades.length} Tradovate Performance Report trades from ${records.length} records`);
  return completedTrades;
}

/**
 * Tradovate exports orders with columns: orderId, B/S, Contract, Product, avgPrice, filledQty, Fill Time, Status, Text
 * This parser matches entry orders with exit orders to create complete trades
 */
async function parseTradovateTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} Tradovate order records`);

  const transactions = [];
  const completedTrades = [];
  const lastTradeEndTime = {};

  // Debug: Log first few records to see structure
  console.log('Sample Tradovate records:');
  records.slice(0, 3).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // First, parse all filled orders
  for (const record of records) {
    try {
      // Handle column names with potential leading spaces
      const status = (record.Status || record.status || '').trim();

      // Only process filled orders
      if (status !== 'Filled') {
        continue;
      }

      const contract = cleanString(record.Contract || record.contract);
      const product = cleanString(record.Product || record.product);
      const productDesc = record['Product Description'] || record.productDescription || '';
      const side = (record['B/S'] || record.bs || '').trim().toLowerCase();
      const quantity = Math.abs(parseInteger(record.filledQty || record['Filled Qty'] || record.Quantity));
      const fillPrice = parseNumeric(record.avgPrice || record['Avg Fill Price'] || record.decimalFillAvg);
      const fillTime = record['Fill Time'] || record.Timestamp || '';
      const orderId = record.orderId || record['Order ID'] || '';
      const orderText = (record.Text || '').trim();

      // Skip if missing essential data
      if (!contract || !side || quantity === 0 || fillPrice === 0 || !fillTime) {
        console.log(`Skipping Tradovate record missing data:`, { contract, side, quantity, fillPrice, fillTime });
        continue;
      }

      // Parse the datetime (format: "11/25/2025 04:38:24")
      const tradeDate = parseDate(fillTime);
      const entryTime = parseDateTime(fillTime);

      if (!tradeDate || !entryTime) {
        console.log(`Skipping Tradovate record with invalid date: ${fillTime}`);
        continue;
      }

      // Determine if this is an entry or exit order
      const isExit = orderText.toLowerCase().includes('exit');

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol: contract,        // Full contract symbol (e.g., MESZ5)
        product: product,        // Base product (e.g., MES)
        productDesc: productDesc,
        date: tradeDate,
        datetime: entryTime,
        action: side === 'buy' ? 'buy' : 'sell',
        quantity,
        price: fillPrice,
        fees: 0, // Tradovate doesn't include fees in this export
        orderId,
        isExit,
        orderText,
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed Tradovate transaction: ${side} ${quantity} ${contract} @ $${fillPrice} (${isExit ? 'EXIT' : 'ENTRY'})`);
    } catch (error) {
      console.error('Error parsing Tradovate transaction:', error, record);
    }
  }

  // Sort transactions by symbol, datetime, and orderId
  // IMPORTANT: orderId is used as tiebreaker for same-timestamp transactions
  // This ensures correct trade pairing when exit and new entry happen at same timestamp
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    const timeDiff = new Date(a.datetime) - new Date(b.datetime);
    if (timeDiff !== 0) return timeDiff;
    // Use orderId as tiebreaker - lower orderId means earlier execution
    const orderIdA = parseInt(a.orderId) || 0;
    const orderIdB = parseInt(b.orderId) || 0;
    return orderIdA - orderIdB;
  });

  console.log(`Parsed ${transactions.length} valid Tradovate filled orders`);

  // Group transactions by symbol (full contract symbol)
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }

  // Process transactions using round-trip trade grouping
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];

    console.log(`\n=== Processing ${symbolTransactions.length} Tradovate transactions for ${symbol} ===`);

    // Get the base product for point value lookup
    const baseProduct = symbolTransactions[0]?.product || symbol.replace(/[A-Z]?\d+$/, '');
    const pointValue = getFuturesPointValue(baseProduct);

    // For futures, the value multiplier is the point value
    const valueMultiplier = pointValue;

    console.log(`  Product: ${baseProduct}, Point Value: $${pointValue}`);

    const instrumentData = {
      instrumentType: 'future',
      underlyingAsset: baseProduct,
      contractSize: null,
      pointValue: pointValue,
      optionType: null,
      strikePrice: null,
      expirationDate: null,
      contractMonth: null,
      contractYear: null,
      tickSize: null
    };

    // Parse contract month/year from symbol (e.g., MESZ5 -> Z = December, 5 = 2025)
    const contractMatch = symbol.match(/^([A-Z]+)([FGHJKMNQUVXZ])(\d{1,2})$/);
    if (contractMatch) {
      const [, , monthCode, yearDigit] = contractMatch;
      const monthCodes = { F: '01', G: '02', H: '03', J: '04', K: '05', M: '06', N: '07', Q: '08', U: '09', V: '10', X: '11', Z: '12' };
      instrumentData.contractMonth = monthCodes[monthCode];

      // Handle year - single digit means current decade
      let year = parseInt(yearDigit);
      if (year < 10) {
        const currentYear = new Date().getFullYear();
        const currentDecade = Math.floor(currentYear / 10) * 10;
        year = currentDecade + year;
      } else if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }
      instrumentData.contractYear = year;
    }

    // Track position and round-trip trades
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: existingPosition.executions || [],
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'tradovate',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;

    if (existingPosition) {
      console.log(`  Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} contracts @ $${existingPosition.entryPrice}`);
    }

    const startTradovateTrade = (transaction, actionOverride = transaction.action) => {
      currentTrade = {
        symbol: symbol,
        entryTime: transaction.datetime,
        tradeDate: transaction.date,
        side: actionOverride === 'buy' ? 'long' : 'short',
        executions: [],
        totalQuantity: 0,
        totalFees: 0,
        entryValue: 0,
        exitValue: 0,
        broker: 'tradovate',
        accountIdentifier: transaction.accountIdentifier
      };
      console.log(`  Started new ${currentTrade.side} trade`);
    };

    const finalizeTradovateTrade = (transaction) => {
      if (!(currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0)) {
        return;
      }

        // Calculate weighted average prices (divide by multiplier to get per-contract price)
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L (values already include multiplier)
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;

        // Calculate split commissions
        let entryCommission = 0;
        let exitCommission = 0;
        currentTrade.executions.forEach(exec => {
          if ((currentTrade.side === 'long' && exec.action === 'buy') ||
              (currentTrade.side === 'short' && exec.action === 'sell')) {
            entryCommission += exec.fees;
          } else {
            exitCommission += exec.fees;
          }
        });
        currentTrade.entryCommission = entryCommission;
        currentTrade.exitCommission = exitCommission;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
        }

        currentTrade.executionData = currentTrade.executions;
        Object.assign(currentTrade, instrumentData);

        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} contracts, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} contracts, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        completedTrades.push(currentTrade);
        lastTradeEndTime[symbol] = transaction.datetime;
        currentTrade = null;
    };

    const appendTradovateExecution = (transaction, quantity, feesForExecution) => {
      if (!currentTrade || quantity <= 0) {
        return;
      }

      const newExecution = {
        action: transaction.action,
        quantity,
        price: transaction.price,
        datetime: transaction.datetime,
        commission: 0,
        fees: feesForExecution,
        orderId: transaction.orderId
      };

      const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);
      const executionExists = existsGlobally || currentTrade.executions.some(exec => {
        if (exec.orderId && newExecution.orderId) {
          return exec.orderId === newExecution.orderId;
        }
        return false;
      });

      if (executionExists) {
        console.log(`  Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        return false;
      }

      currentTrade.executions.push(newExecution);
      currentTrade.totalFees += feesForExecution;
      if (currentTrade.isExistingPosition) {
        currentTrade.newExecutionsAdded++;
      }
      return true;
    };

    const applyTradovateExecution = (transaction, quantity) => {
      const valueDelta = quantity * transaction.price * valueMultiplier;
      if (transaction.action === 'buy') {
        currentPosition += quantity;
        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += valueDelta;
          currentTrade.totalQuantity += quantity;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += valueDelta;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= quantity;
        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += valueDelta;
          currentTrade.totalQuantity += quantity;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += valueDelta;
        }
      }
    };

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const totalFees = transaction.fees || 0;
      let remainingQty = qty;
      let remainingFees = totalFees;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      while (remainingQty > 0) {
        if (currentPosition === 0) {
          startTradovateTrade(transaction);
        }

        const sameDirection =
          (currentPosition > 0 && transaction.action === 'buy') ||
          (currentPosition < 0 && transaction.action === 'sell') ||
          currentPosition === 0;

        const consumeQty = sameDirection
          ? remainingQty
          : Math.min(Math.abs(currentPosition), remainingQty);
        const feesForExecution = remainingQty === consumeQty
          ? remainingFees
          : totalFees * (consumeQty / qty);
        const previousPosition = currentPosition;

        if (!appendTradovateExecution(transaction, consumeQty, feesForExecution)) {
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          remainingQty = 0;
          remainingFees = 0;
          continue;
        }

        applyTradovateExecution(transaction, consumeQty);
        remainingQty -= consumeQty;
        remainingFees -= feesForExecution;

        console.log(`  Position: ${previousPosition} -> ${currentPosition}`);

        if (!sameDirection) {
          finalizeTradovateTrade(transaction);

          if (remainingQty > 0) {
            startTradovateTrade(transaction);
          }
          continue;
        }

        finalizeTradovateTrade(transaction);
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} contracts`);

    // Handle remaining open position
    if (currentTrade && Math.abs(currentPosition) > 0) {
      const netQuantity = Math.abs(currentPosition);

      currentTrade.entryPrice = currentTrade.totalQuantity > 0 ?
        currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier) : 0;
      currentTrade.exitPrice = null;
      currentTrade.exitTime = null;
      currentTrade.quantity = netQuantity;
      currentTrade.totalQuantity = netQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;

      currentTrade.side = currentPosition > 0 ? 'long' : 'short';

      if (currentTrade.isExistingPosition) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated position: ${currentTrade.executions.length} executions`;
      } else {
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      }

      currentTrade.executionData = currentTrade.executions;
      Object.assign(currentTrade, instrumentData);

      console.log(`  [CHECK] Open ${currentTrade.side} position: ${netQuantity} contracts`);
      completedTrades.push(currentTrade);
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} Tradovate transactions`);
  return completedTrades;
}

/**
 * Parse Questrade Edge CSV export
 *
 * Questrade CSV format:
 * - Headers: Symbol, Action, Fill qty, Fill price, Currency, Exec time, Total value, Time placed, Option, Strategy, Commission, Account
 * - Date format: "16 Dec 2025 11:15:58 AM"
 * - Actions: Buy, Sell (stocks), BTO (Buy to Open), STC (Sell to Close), BTC (Buy to Close), STO (Sell to Open) for options
 * - Options symbols: SLV20Feb26C55.00 (underlying + day + month + year + C/P + strike)
 * - Option column: "Call" or "Put" or empty for stocks
 */
async function parseQuestradeTransactions(records, existingPositions = {}, context = {}) {
  console.log(`\n=== QUESTRADE TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} Questrade transaction records`);
  console.log(`Existing open positions passed to parser: ${Object.keys(existingPositions).length}`);
  const diagnostics = context.diagnostics;

  if (Object.keys(existingPositions).length > 0) {
    console.log(`Existing positions:`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} @ $${position.entryPrice} (Trade ID: ${position.id})`);
    });
  }

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records to see structure
  console.log('\nSample Questrade records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // Helper to parse Questrade date format: "16 Dec 2025 11:15:58 AM"
  function parseQuestradeDate(dateStr) {
    if (!dateStr) return null;

    const isoLikeMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
    if (isoLikeMatch) {
      const [, year, month, day, hours, minutes, seconds, ampm] = isoLikeMatch;
      let hour = parseInt(hours, 10);
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
      }

      return `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minutes}:${seconds}`;
    }

    // Parse format: "16 Dec 2025 11:15:58 AM"
    const months = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    const match = dateStr.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) {
      console.log(`[QUESTRADE] Failed to parse date: ${dateStr}`);
      return null;
    }

    const [, day, monthStr, year, hours, minutes, seconds, ampm] = match;
    const month = months[monthStr.toLowerCase()];

    if (month === undefined) {
      console.log(`[QUESTRADE] Unknown month: ${monthStr}`);
      return null;
    }

    let hour = parseInt(hours);
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }

    // Return naive datetime string (no timezone) so convertTradeDatetimesToUTC
    // will properly convert it using the user's timezone, not Docker's TZ env var
    const y = parseInt(year);
    const d = String(parseInt(day)).padStart(2, '0');
    const mo = String(month + 1).padStart(2, '0');
    const h = String(hour).padStart(2, '0');
    const mi = String(parseInt(minutes)).padStart(2, '0');
    const s = String(parseInt(seconds)).padStart(2, '0');
    return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  }

  // Helper to parse Questrade options symbol format: SLV20Feb26C55.00
  function parseQuestradeOptionsSymbol(symbol, optionColumn) {
    if (!symbol) return { instrumentType: 'stock' };

    // Check if Option column indicates this is an option
    const isOption = optionColumn && (optionColumn.toLowerCase() === 'call' || optionColumn.toLowerCase() === 'put');

    // Try to parse options symbol format: SLV20Feb26C55.00 or SLV20Feb26P55.00
    // Format: UNDERLYING + DAY + MONTH + YEAR + C/P + STRIKE
    const optionMatch = symbol.match(/^([A-Z]+)(\d{1,2})([A-Za-z]{3})(\d{2})([CP])(\d+(?:\.\d+)?)$/i);

    if (optionMatch || isOption) {
      if (optionMatch) {
        const [, underlying, day, monthStr, year, callPut, strike] = optionMatch;

        const months = {
          'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
          'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };

        const month = months[monthStr.toLowerCase()];
        const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
        const expirationDate = `${fullYear}-${month}-${day.padStart(2, '0')}`;
        const optionType = callPut.toUpperCase() === 'C' ? 'call' : 'put';

        return {
          instrumentType: 'option',
          underlyingSymbol: underlying,
          strikePrice: parseFloat(strike),
          expirationDate: expirationDate,
          optionType: optionType,
          contractSize: 100
        };
      } else if (isOption) {
        // Option column is set but symbol format doesn't match - use fallback
        // Try to extract underlying from symbol (remove any suffix)
        const underlying = symbol.replace(/\.[A-Z]+$/, ''); // Remove exchange suffix like .TO
        return {
          instrumentType: 'option',
          underlyingSymbol: underlying,
          optionType: optionColumn.toLowerCase(),
          contractSize: 100
        };
      }
    }

    // Stock - might have exchange suffix like .TO for Toronto
    return {
      instrumentType: 'stock',
      underlyingSymbol: symbol.replace(/\.[A-Z]+$/, '') // Remove exchange suffix for display
    };
  }

  // First, parse all transactions
  let rowIndex = 0;
  for (const record of records) {
    rowIndex++;
    try {
      // Get fields from Questrade columns
      const symbol = cleanString(record.Symbol || record.symbol);
      const action = cleanString(record.Action || record.action).toUpperCase();
      const fillQty = parseInteger(record['Fill qty'] || record['fill qty'] || record.Quantity || record.quantity || record.Filled || 0);
      const fillPrice = parseNumeric(record['Fill price'] || record['fill price'] || record.Price || record.price || 0);
      const currency = cleanString(record.Currency || record.currency || 'USD');
      const execTime = record['Exec time'] || record['exec time'] || record['Transaction Date'] || record['transaction date'] || '';
      const optionColumn = cleanString(record.Option || record.option || '');
      const commission = parseNumeric(record.Commission || record.commission || 0);
      const accountRaw = cleanString(record.Account || record.account || record['Account #'] || record['account #'] || '');

      // Skip if missing essential data
      if (!symbol || fillQty === 0 || fillPrice === 0 || !execTime) {
        console.log(`Skipping Questrade record missing data:`, { symbol, action, fillQty, fillPrice, execTime });
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: 'Missing required fields (symbol, quantity, price, or exec time)' });
        }
        continue;
      }

      // Parse execution time
      const execDateTime = parseQuestradeDate(execTime);
      if (!execDateTime) {
        console.log(`Skipping Questrade record with invalid date: ${execTime}`);
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: `Invalid exec time: ${execTime}` });
        }
        continue;
      }

      // Validate date is reasonable (compare as strings - naive dates are YYYY-MM-DD format)
      const execYear = parseInt(execDateTime.substring(0, 4));
      if (execYear < 2000 || execYear > new Date().getFullYear() + 1) {
        console.log(`Skipping Questrade record with invalid date range: ${execTime}`);
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: `Exec time out of range: ${execTime}` });
        }
        continue;
      }

      // Determine trade action from Questrade action codes
      // Stock: Buy, Sell
      // Options: BTO (Buy to Open), STC (Sell to Close), BTC (Buy to Close), STO (Sell to Open)
      let tradeAction;
      switch (action) {
        case 'BUY':
        case 'BTO': // Buy to Open (long options entry)
        case 'BTC': // Buy to Close (short options exit)
          tradeAction = 'buy';
          break;
        case 'SELL':
        case 'STC': // Sell to Close (long options exit)
        case 'STO': // Sell to Open (short options entry)
          tradeAction = 'sell';
          break;
        default:
          console.log(`Skipping Questrade record with unknown action: ${action}`);
          if (diagnostics) {
            diagnostics.skippedRows++;
            diagnostics.skippedReasons.push({ row: rowIndex, reason: `Unknown action: ${action}` });
          }
          continue;
      }

      // Extract account identifier - user selection takes priority, otherwise extract from account column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : (accountRaw ? accountRaw.split(' - ')[0].trim() : null);

      // Parse instrument data
      const instrumentData = parseQuestradeOptionsSymbol(symbol, optionColumn);

      // Use underlying symbol for grouping if it's an option
      const groupingSymbol = instrumentData.instrumentType === 'option'
        ? (instrumentData.underlyingSymbol || symbol)
        : symbol;

      transactions.push({
        symbol: groupingSymbol,
        fullSymbol: symbol, // Keep original for options
        date: execDateTime.split('T')[0],
        datetime: execDateTime,
        action: tradeAction,
        quantity: fillQty,
        price: fillPrice,
        commission: Math.abs(commission), // Ensure positive
        currency: currency.toUpperCase(),
        description: `Questrade ${action}`,
        raw: record,
        accountIdentifier,
        instrumentData
      });

      console.log(`Parsed Questrade transaction: ${action} ${fillQty} ${symbol} @ $${fillPrice.toFixed(2)} (${currency})`);
    } catch (error) {
      console.error('Error parsing Questrade transaction:', error, record);
      if (diagnostics) {
        diagnostics.invalidRows++;
        diagnostics.skippedReasons.push({ row: rowIndex, reason: `Parse error: ${error.message}` });
      }
    }
  }

  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid Questrade trade transactions`);

  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    const key = transaction.instrumentData.instrumentType === 'option'
      ? `${transaction.symbol}_${transaction.instrumentData.strikePrice}_${transaction.instrumentData.expirationDate}_${transaction.instrumentData.optionType}`
      : transaction.symbol;

    if (!transactionsBySymbol[key]) {
      transactionsBySymbol[key] = [];
    }
    transactionsBySymbol[key].push(transaction);
  }

  // Process transactions using round-trip trade grouping (FIFO)
  for (const symbolKey in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbolKey];
    const firstTx = symbolTransactions[0];
    const instrumentData = firstTx.instrumentData;

    console.log(`\n=== Processing ${symbolTransactions.length} Questrade transactions for ${symbolKey} ===`);
    console.log(`Instrument type: ${instrumentData.instrumentType}`);

    // Value multiplier for options
    const valueMultiplier = instrumentData.instrumentType === 'option' ? 100 : 1;

    // Track position using FIFO
    let currentPosition = 0;
    let currentTrade = null;

    // Check for existing position
    const existingPosition = existingPositions[firstTx.symbol] || existingPositions[symbolKey];
    if (existingPosition) {
      currentPosition = existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity;
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} @ $${existingPosition.entryPrice}`);

      // Initialize currentTrade from the existing position so we don't create duplicate trades
      currentTrade = {
        id: existingPosition.id, // Mark that this is an existing trade to update, not create
        symbol: existingPosition.symbol,
        tradeDate: existingPosition.tradeDate,
        entryTime: existingPosition.entryTime,
        entryPrice: existingPosition.entryPrice,
        quantity: existingPosition.quantity,
        side: existingPosition.side,
        commission: existingPosition.commission || 0,
        fees: 0,
        broker: existingPosition.broker || 'Questrade',
        currency: firstTx.currency,
        accountIdentifier: firstTx.accountIdentifier,
        executions: existingPosition.executions || [],
        instrumentType: existingPosition.instrumentType,
        strikePrice: existingPosition.strikePrice,
        expirationDate: existingPosition.expirationDate,
        optionType: existingPosition.optionType,
        ...instrumentData
      };
      console.log(`  → Initialized trade from existing position with ${currentTrade.executions.length} executions`);
    }

    // Debug: Log existing executions for this symbol
    console.log(`  → Existing executions for ${symbolKey}: ${context.existingExecutions?.[symbolKey]?.length || 0}`);
    if (context.existingExecutions?.[symbolKey]?.length > 0) {
      context.existingExecutions[symbolKey].forEach((exec, i) => {
        console.log(`    [${i}] ${exec.action || 'unknown'} ${exec.quantity} @ $${exec.price || exec.entryPrice} at ${exec.datetime || exec.entryTime}`);
      });
    }

    for (const transaction of symbolTransactions) {
      // Check for duplicate execution before processing
      const executionToCheck = {
        datetime: transaction.datetime,
        quantity: transaction.quantity,
        price: transaction.price,
        action: transaction.action
      };
      const isDuplicate = isExecutionDuplicate(executionToCheck, symbolKey, context);
      console.log(`  [DUPLICATE CHECK] ${transaction.action.toUpperCase()} ${transaction.quantity} @ $${transaction.price.toFixed(2)} at ${transaction.datetime} → ${isDuplicate ? 'DUPLICATE' : 'NEW'}`);
      if (isDuplicate) {
        console.log(`  [SKIP] Duplicate execution: ${transaction.action.toUpperCase()} ${transaction.quantity} @ $${transaction.price.toFixed(2)}`);
        continue; // Skip this transaction entirely
      }

      const signedQty = transaction.action === 'buy' ? transaction.quantity : -transaction.quantity;
      const prevPosition = currentPosition;
      currentPosition += signedQty;

      console.log(`  ${transaction.action.toUpperCase()} ${transaction.quantity} @ $${transaction.price.toFixed(2)} → Position: ${prevPosition} → ${currentPosition}`);

      // Opening or adding to position
      if ((prevPosition >= 0 && signedQty > 0) || (prevPosition <= 0 && signedQty < 0)) {
        if (!currentTrade || (prevPosition === 0)) {
          // Start new trade
          const side = signedQty > 0 ? 'long' : 'short';
          currentTrade = {
            symbol: transaction.symbol,
            tradeDate: transaction.date,
            entryTime: transaction.datetime,
            entryPrice: transaction.price,
            quantity: Math.abs(signedQty),
            side: side,
            commission: transaction.commission,
            fees: 0,
            broker: 'Questrade',
            currency: transaction.currency,
            accountIdentifier: transaction.accountIdentifier,
            executions: [{
              entryTime: transaction.datetime,
              entryPrice: transaction.price,
              quantity: Math.abs(signedQty),
              side: side,
              commission: transaction.commission,
              fees: 0
            }],
            ...instrumentData
          };
          console.log(`  [NEW] Started ${side} position: ${Math.abs(signedQty)} @ $${transaction.price.toFixed(2)}`);
        } else {
          // Adding to existing position - calculate weighted average entry
          const prevValue = currentTrade.entryPrice * currentTrade.quantity;
          const newValue = transaction.price * Math.abs(signedQty);
          const totalQty = currentTrade.quantity + Math.abs(signedQty);
          currentTrade.entryPrice = (prevValue + newValue) / totalQty;
          currentTrade.quantity = totalQty;
          currentTrade.commission += transaction.commission;
          currentTrade.executions.push({
            entryTime: transaction.datetime,
            entryPrice: transaction.price,
            quantity: Math.abs(signedQty),
            side: currentTrade.side,
            commission: transaction.commission,
            fees: 0
          });
          console.log(`  [ADD] Added to position: now ${totalQty} @ avg $${currentTrade.entryPrice.toFixed(2)}`);
        }
      }
      // Closing position (fully or partially)
      else if ((prevPosition > 0 && signedQty < 0) || (prevPosition < 0 && signedQty > 0)) {
        if (currentTrade) {
          const closeQty = Math.min(Math.abs(signedQty), Math.abs(prevPosition));
          const remainingQty = Math.abs(prevPosition) - closeQty;
          const isPartialClose = remainingQty > 0;

          // Calculate P&L for the closed portion
          let pnl;
          if (currentTrade.side === 'long') {
            pnl = (transaction.price - currentTrade.entryPrice) * closeQty * valueMultiplier;
          } else {
            pnl = (currentTrade.entryPrice - transaction.price) * closeQty * valueMultiplier;
          }
          // Prorate commission for partial closes
          const closeCommission = isPartialClose
            ? (currentTrade.commission * closeQty / currentTrade.quantity) + transaction.commission
            : currentTrade.commission + transaction.commission;
          pnl -= closeCommission;

          // Handle partial close - keep as ONE trade with the sell recorded as an execution
          if (isPartialClose) {
            // Add the sell execution to the trade
            currentTrade.executions.push({
              entryTime: currentTrade.entryTime || currentTrade.datetime,
              entryPrice: currentTrade.entryPrice,
              exitTime: transaction.datetime,
              exitPrice: transaction.price,
              quantity: closeQty,
              side: currentTrade.side === 'long' ? 'sell' : 'buy', // Opposite action to close
              commission: transaction.commission,
              fees: 0,
              pnl: pnl
            });

            // Update trade to reflect remaining position
            currentTrade.quantity = remainingQty;
            currentTrade.commission += transaction.commission;
            // Track realized P&L from partial close (position still open)
            currentTrade.realizedPnl = (currentTrade.realizedPnl || 0) + pnl;

            console.log(`  [PARTIAL CLOSE] Sold ${closeQty} @ $${transaction.price.toFixed(2)}, realized P&L: $${pnl.toFixed(2)}, remaining: ${remainingQty} shares`);
          }
          // Handle full close (and possible reversal)
          else {
            // Add the closing execution
            currentTrade.executions.push({
              exitTime: transaction.datetime,
              exitPrice: transaction.price,
              quantity: closeQty,
              side: currentTrade.side === 'long' ? 'sell' : 'buy',
              commission: transaction.commission,
              fees: 0,
              pnl: pnl
            });

            currentTrade.exitTime = transaction.datetime;
            currentTrade.exitPrice = transaction.price;
            currentTrade.pnl = pnl;
            currentTrade.profitLoss = pnl;
            currentTrade.commission += transaction.commission;
            currentTrade.executionData = currentTrade.executions;

            console.log(`  [CLOSE] Closed ${closeQty} @ $${transaction.price.toFixed(2)}, P&L: $${pnl.toFixed(2)}`);
            completedTrades.push(currentTrade);

            // Handle reversal (closing more than position - start new position in opposite direction)
            if (Math.abs(signedQty) > Math.abs(prevPosition)) {
              const reversalQty = Math.abs(signedQty) - Math.abs(prevPosition);
              const newSide = signedQty > 0 ? 'long' : 'short';
              currentTrade = {
                symbol: transaction.symbol,
                tradeDate: transaction.date,
                entryTime: transaction.datetime,
                entryPrice: transaction.price,
                quantity: reversalQty,
                side: newSide,
                commission: 0,
                fees: 0,
                broker: 'Questrade',
                currency: transaction.currency,
                accountIdentifier: transaction.accountIdentifier,
                executions: [{
                  entryTime: transaction.datetime,
                  entryPrice: transaction.price,
                  quantity: reversalQty,
                  side: newSide,
                  commission: 0,
                  fees: 0
                }],
                ...instrumentData
              };
              console.log(`  [REVERSAL] Started new ${newSide} position: ${reversalQty} @ $${transaction.price.toFixed(2)}`);
            } else {
              currentTrade = null;
            }
          }
        }
      }
    }

    // Handle remaining open position
    if (currentTrade && currentPosition !== 0) {
      // Only update if not already set correctly (avoid double-counting)
      if (!currentTrade.exitTime) {
        currentTrade.quantity = Math.abs(currentPosition);
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        currentTrade.executionData = currentTrade.executions;
        // If this is from an existing position, mark it for update instead of create
        if (currentTrade.id) {
          currentTrade.isUpdate = true;
          currentTrade.existingTradeId = currentTrade.id;
        }
        console.log(`  [OPEN] Remaining open ${currentTrade.side} position: ${Math.abs(currentPosition)} @ $${currentTrade.entryPrice.toFixed(2)}${currentTrade.id ? ' (updating existing)' : ''}`);
        completedTrades.push(currentTrade);
      }
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} Questrade transactions`);
  // Debug: Log all created trades
  completedTrades.forEach((trade, i) => {
    console.log(`  Trade ${i + 1}: ${trade.symbol} ${trade.side} ${trade.quantity} shares, entry $${trade.entryPrice?.toFixed(2)}, exit $${trade.exitPrice?.toFixed(2) || 'OPEN'}, P&L: $${trade.pnl?.toFixed(2) || 'N/A'}, executions: ${trade.executions?.length || 0}${trade.isUpdate ? ' (UPDATE)' : ''}`);
  });
  return completedTrades;
}

/**
 * Parse tastytrade transaction CSV records into round-trip trades.
 * Tastytrade exports include Trade, Receive Deliver, Money Movement rows.
 * Only Trade rows are actual trades. Uses position tracking (FIFO) to create round-trip trades.
 */
async function parseTastytradeTransactions(records, existingPositions = {}, context = {}) {
  console.log(`\n=== TASTYTRADE TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} Tastytrade transaction records`);
  console.log(`Existing open positions passed to parser: ${Object.keys(existingPositions).length}`);

  if (Object.keys(existingPositions).length > 0) {
    console.log(`Existing positions:`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} @ $${position.entryPrice} (Trade ID: ${position.id})`);
    });
  }

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records
  console.log('\nSample Tastytrade records:');
  records.slice(0, 3).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // Helper to parse OCC option symbol: "IBM   260220C00265000"
  // Format: 6-char padded underlying + YYMMDD + C/P + 8-digit strike*1000
  function parseOCCSymbol(symbol) {
    if (!symbol) return null;
    const trimmed = symbol.trim();
    // OCC format: at least 15 chars with embedded C or P
    const match = trimmed.match(/^(.{6})(\d{6})([CP])(\d{8})$/);
    if (!match) return null;
    const [, underlying, dateStr, callPut, strikeStr] = match;
    const underlyingClean = underlying.trim();
    const year = `20${dateStr.substring(0, 2)}`;
    const month = dateStr.substring(2, 4);
    const day = dateStr.substring(4, 6);
    const expirationDate = `${year}-${month}-${day}`;
    const strikePrice = parseInt(strikeStr) / 1000;
    const optionType = callPut === 'C' ? 'call' : 'put';
    return { underlyingClean, expirationDate, strikePrice, optionType };
  }

  // Parse each record
  for (const record of records) {
    try {
      // Only process Trade rows
      const type = cleanString(record.Type || record.type || '');
      if (type !== 'Trade') {
        continue;
      }

      // Get action - support both header variants
      const actionCode = cleanString(record.Action || record.action || record.Action_Type || record.action_type || '').toUpperCase();
      const subType = cleanString(record['Sub Type'] || record['sub type'] || '');
      const rawSymbol = cleanString(record.Symbol || record.symbol || record.Symbol_Type || record.symbol_type || '');
      const instrumentType = cleanString(record['Instrument Type'] || record['instrument type'] || '');
      const quantity = Math.abs(parseInteger(record.Quantity || record.quantity || record.Quantity_Type || record.quantity_type || 0));
      const commission = Math.abs(parseNumeric(record.Commissions || record.commissions || 0));
      const fees = Math.abs(parseNumeric(record.Fees || record.fees || 0));
      const multiplier = parseInteger(record.Multiplier || record.multiplier || 1);
      // Tastytrade "Average Price" is already multiplied by the contract multiplier
      // (e.g., a $1.00 option with 100x multiplier shows as -100 in Average Price)
      // Divide by multiplier to get the per-share/per-contract price
      const rawAvgPrice = Math.abs(parseNumeric(record['Average Price'] || record['average price'] || 0));
      const avgPrice = multiplier > 1 ? rawAvgPrice / multiplier : rawAvgPrice;
      const rootSymbol = cleanString(record['Root Symbol'] || record['root symbol'] || '');
      const underlyingSymbol = cleanString(record['Underlying Symbol'] || record['underlying symbol'] || '');
      const expirationDateRaw = cleanString(record['Expiration Date'] || record['expiration date'] || '');
      const strikePrice = parseNumeric(record['Strike Price'] || record['strike price'] || 0);
      const callOrPut = cleanString(record['Call or Put'] || record['call or put'] || '');
      const currency = cleanString(record.Currency || record.currency || 'USD').toUpperCase();
      const dateStr = cleanString(record.Date || record.date || '');
      const accountRaw = cleanString(record.Account || record.account || '');

      // Skip if missing essential data
      if (!rawSymbol || quantity === 0 || !dateStr) {
        console.log(`Skipping Tastytrade record missing data:`, { rawSymbol, quantity, dateStr });
        continue;
      }

      // Parse date - ISO 8601 format: 2026-02-18T06:59:36-0800
      const execDateTime = new Date(dateStr);
      if (isNaN(execDateTime.getTime())) {
        console.log(`Skipping Tastytrade record with invalid date: ${dateStr}`);
        continue;
      }

      // Determine action from Action code or Sub Type
      let tradeAction;
      if (actionCode.includes('BUY')) {
        tradeAction = 'buy';
      } else if (actionCode.includes('SELL')) {
        tradeAction = 'sell';
      } else {
        // Fall back to Sub Type
        const subTypeLower = subType.toLowerCase();
        if (subTypeLower.includes('buy')) {
          tradeAction = 'buy';
        } else if (subTypeLower.includes('sell')) {
          tradeAction = 'sell';
        } else if (subTypeLower === 'expiration') {
          // Expirations close the position at $0
          // For long positions, expiration is a sell; for short, it's a buy
          // We'll handle this in position tracking - default to sell for now
          tradeAction = 'sell';
        } else {
          console.log(`Skipping Tastytrade record with unknown action: ${actionCode} / ${subType}`);
          continue;
        }
      }

      // Determine instrument type and build position key
      let symbol, instrumentData;
      const isOption = instrumentType.toLowerCase().includes('option');
      const isFuture = instrumentType.toLowerCase().includes('future');

      if (isOption) {
        // Parse option details from columns or OCC symbol
        let optUnderlying = underlyingSymbol || rootSymbol;
        let optExpiration = '';
        let optStrike = strikePrice;
        let optType = callOrPut.toLowerCase() === 'call' || callOrPut.toLowerCase() === 'c' ? 'call' : 'put';

        // Parse expiration date - format: M/D/YY or M/D/YYYY
        if (expirationDateRaw) {
          const parts = expirationDateRaw.split('/');
          if (parts.length === 3) {
            // Handle 2-digit year (e.g., 2/20/26 -> 2026-02-20)
            // Use parseInt to be robust against invisible Unicode characters
            const yearNum = parseInt(parts[2], 10);
            const year = yearNum < 100 ? `${2000 + yearNum}` : `${yearNum}`;
            optExpiration = `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }

        // Fallback: parse from OCC symbol if columns are missing
        if (!optUnderlying || !optExpiration) {
          const occData = parseOCCSymbol(rawSymbol);
          if (occData) {
            optUnderlying = optUnderlying || occData.underlyingClean;
            optExpiration = optExpiration || occData.expirationDate;
            optStrike = optStrike || occData.strikePrice;
            optType = optType || occData.optionType;
          }
        }

        symbol = optUnderlying || rawSymbol.trim().substring(0, 6).trim();
        instrumentData = {
          instrumentType: 'option',
          underlyingSymbol: optUnderlying,
          strikePrice: optStrike,
          expirationDate: optExpiration,
          optionType: optType,
          contractSize: multiplier || 100
        };
      } else if (isFuture) {
        symbol = rootSymbol || rawSymbol;
        instrumentData = {
          instrumentType: 'future',
          underlyingSymbol: rootSymbol || rawSymbol,
          contractSize: multiplier || 1
        };
      } else {
        // Stock / Equity
        symbol = rawSymbol;
        instrumentData = {
          instrumentType: 'stock',
          underlyingSymbol: rawSymbol
        };
      }

      // Extract account identifier
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : (accountRaw || null);

      transactions.push({
        symbol,
        fullSymbol: rawSymbol,
        date: execDateTime.toISOString().split('T')[0],
        datetime: execDateTime,
        action: tradeAction,
        quantity,
        price: avgPrice,
        commission,
        fees,
        currency,
        description: `Tastytrade ${subType || actionCode}`,
        raw: record,
        accountIdentifier,
        instrumentData,
        multiplier: multiplier || (isOption ? 100 : 1),
        subType
      });

      console.log(`Parsed Tastytrade transaction: ${tradeAction.toUpperCase()} ${quantity} ${symbol} @ $${avgPrice.toFixed(2)} (${instrumentType})`);
    } catch (error) {
      console.error('Error parsing Tastytrade transaction:', error, record);
    }
  }

  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid Tastytrade trade transactions`);

  // Group transactions by position key
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    const key = transaction.instrumentData.instrumentType === 'option'
      ? `${transaction.symbol}_${transaction.instrumentData.strikePrice}_${transaction.instrumentData.expirationDate}_${transaction.instrumentData.optionType}`
      : transaction.symbol;

    if (!transactionsBySymbol[key]) {
      transactionsBySymbol[key] = [];
    }
    transactionsBySymbol[key].push(transaction);
  }

  // Process transactions using round-trip trade grouping (FIFO)
  for (const symbolKey in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbolKey];
    const firstTx = symbolTransactions[0];
    const instrumentData = firstTx.instrumentData;

    console.log(`\n=== Processing ${symbolTransactions.length} Tastytrade transactions for ${symbolKey} ===`);
    console.log(`Instrument type: ${instrumentData.instrumentType}`);

    // Value multiplier for options/futures
    const valueMultiplier = instrumentData.contractSize || (instrumentData.instrumentType === 'option' ? 100 : 1);

    // Track position using FIFO
    let currentPosition = 0;
    let currentTrade = null;

    // Check for existing position
    const existingPosition = existingPositions[firstTx.symbol] || existingPositions[symbolKey];
    if (existingPosition) {
      currentPosition = existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity;
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} @ $${existingPosition.entryPrice}`);

      currentTrade = {
        id: existingPosition.id,
        symbol: existingPosition.symbol,
        tradeDate: existingPosition.tradeDate,
        entryTime: existingPosition.entryTime,
        entryPrice: existingPosition.entryPrice,
        quantity: existingPosition.quantity,
        side: existingPosition.side,
        commission: existingPosition.commission || 0,
        fees: existingPosition.fees || 0,
        broker: existingPosition.broker || 'Tastytrade',
        currency: firstTx.currency,
        accountIdentifier: firstTx.accountIdentifier,
        executions: existingPosition.executions || [],
        ...instrumentData
      };
      console.log(`  → Initialized trade from existing position with ${currentTrade.executions.length} executions`);
    }

    for (const transaction of symbolTransactions) {
      // Check for duplicate execution
      const executionToCheck = {
        datetime: transaction.datetime,
        quantity: transaction.quantity,
        price: transaction.price,
        action: transaction.action
      };
      const isDuplicate = isExecutionDuplicate(executionToCheck, symbolKey, context);
      console.log(`  [DUPLICATE CHECK] ${transaction.action.toUpperCase()} ${transaction.quantity} @ $${transaction.price.toFixed(2)} at ${transaction.datetime} → ${isDuplicate ? 'DUPLICATE' : 'NEW'}`);
      if (isDuplicate) {
        console.log(`  [SKIP] Duplicate execution: ${transaction.action.toUpperCase()} ${transaction.quantity} @ $${transaction.price.toFixed(2)}`);
        continue;
      }

      const signedQty = transaction.action === 'buy' ? transaction.quantity : -transaction.quantity;
      const prevPosition = currentPosition;
      currentPosition += signedQty;

      console.log(`  ${transaction.action.toUpperCase()} ${transaction.quantity} @ $${transaction.price.toFixed(2)} → Position: ${prevPosition} → ${currentPosition}`);

      // Opening or adding to position
      if ((prevPosition >= 0 && signedQty > 0) || (prevPosition <= 0 && signedQty < 0)) {
        if (!currentTrade || (prevPosition === 0)) {
          // Start new trade
          const side = signedQty > 0 ? 'long' : 'short';
          currentTrade = {
            symbol: transaction.symbol,
            tradeDate: transaction.date,
            entryTime: transaction.datetime,
            entryPrice: transaction.price,
            quantity: Math.abs(signedQty),
            side: side,
            commission: transaction.commission,
            fees: transaction.fees,
            broker: 'Tastytrade',
            currency: transaction.currency,
            accountIdentifier: transaction.accountIdentifier,
            executions: [{
              entryTime: transaction.datetime,
              entryPrice: transaction.price,
              quantity: Math.abs(signedQty),
              side: side,
              commission: transaction.commission,
              fees: transaction.fees
            }],
            ...instrumentData
          };
          console.log(`  [NEW] Started ${side} position: ${Math.abs(signedQty)} @ $${transaction.price.toFixed(2)}`);
        } else {
          // Adding to existing position - calculate weighted average entry
          const prevValue = currentTrade.entryPrice * currentTrade.quantity;
          const newValue = transaction.price * Math.abs(signedQty);
          const totalQty = currentTrade.quantity + Math.abs(signedQty);
          currentTrade.entryPrice = (prevValue + newValue) / totalQty;
          currentTrade.quantity = totalQty;
          currentTrade.commission += transaction.commission;
          currentTrade.fees += transaction.fees;
          currentTrade.executions.push({
            entryTime: transaction.datetime,
            entryPrice: transaction.price,
            quantity: Math.abs(signedQty),
            side: currentTrade.side,
            commission: transaction.commission,
            fees: transaction.fees
          });
          console.log(`  [ADD] Added to position: now ${totalQty} @ avg $${currentTrade.entryPrice.toFixed(2)}`);
        }
      }
      // Closing position (fully or partially)
      else if ((prevPosition > 0 && signedQty < 0) || (prevPosition < 0 && signedQty > 0)) {
        if (currentTrade) {
          const closeQty = Math.min(Math.abs(signedQty), Math.abs(prevPosition));
          const remainingQty = Math.abs(prevPosition) - closeQty;
          const isPartialClose = remainingQty > 0;

          // Calculate P&L for the closed portion
          let pnl;
          if (currentTrade.side === 'long') {
            pnl = (transaction.price - currentTrade.entryPrice) * closeQty * valueMultiplier;
          } else {
            pnl = (currentTrade.entryPrice - transaction.price) * closeQty * valueMultiplier;
          }
          // Prorate commission for partial closes
          const closeCommission = isPartialClose
            ? (currentTrade.commission * closeQty / currentTrade.quantity) + transaction.commission
            : currentTrade.commission + transaction.commission;
          const closeFees = isPartialClose
            ? (currentTrade.fees * closeQty / currentTrade.quantity) + transaction.fees
            : currentTrade.fees + transaction.fees;
          pnl -= closeCommission + closeFees;

          if (isPartialClose) {
            currentTrade.executions.push({
              exitTime: transaction.datetime,
              exitPrice: transaction.price,
              quantity: closeQty,
              side: currentTrade.side === 'long' ? 'sell' : 'buy',
              commission: transaction.commission,
              fees: transaction.fees,
              pnl: pnl
            });

            currentTrade.quantity = remainingQty;
            currentTrade.commission += transaction.commission;
            currentTrade.fees += transaction.fees;
            currentTrade.realizedPnl = (currentTrade.realizedPnl || 0) + pnl;

            console.log(`  [PARTIAL CLOSE] Closed ${closeQty} @ $${transaction.price.toFixed(2)}, realized P&L: $${pnl.toFixed(2)}, remaining: ${remainingQty}`);
          } else {
            // Full close
            currentTrade.executions.push({
              exitTime: transaction.datetime,
              exitPrice: transaction.price,
              quantity: closeQty,
              side: currentTrade.side === 'long' ? 'sell' : 'buy',
              commission: transaction.commission,
              fees: transaction.fees,
              pnl: pnl
            });

            currentTrade.exitTime = transaction.datetime;
            currentTrade.exitPrice = transaction.price;
            currentTrade.pnl = pnl;
            currentTrade.profitLoss = pnl;
            currentTrade.commission += transaction.commission;
            currentTrade.fees += transaction.fees;
            currentTrade.executionData = currentTrade.executions;

            console.log(`  [CLOSE] Closed ${closeQty} @ $${transaction.price.toFixed(2)}, P&L: $${pnl.toFixed(2)}`);
            completedTrades.push(currentTrade);

            // Handle reversal
            if (Math.abs(signedQty) > Math.abs(prevPosition)) {
              const reversalQty = Math.abs(signedQty) - Math.abs(prevPosition);
              const newSide = signedQty > 0 ? 'long' : 'short';
              currentTrade = {
                symbol: transaction.symbol,
                tradeDate: transaction.date,
                entryTime: transaction.datetime,
                entryPrice: transaction.price,
                quantity: reversalQty,
                side: newSide,
                commission: 0,
                fees: 0,
                broker: 'Tastytrade',
                currency: transaction.currency,
                accountIdentifier: transaction.accountIdentifier,
                executions: [{
                  entryTime: transaction.datetime,
                  entryPrice: transaction.price,
                  quantity: reversalQty,
                  side: newSide,
                  commission: 0,
                  fees: 0
                }],
                ...instrumentData
              };
              console.log(`  [REVERSAL] Started new ${newSide} position: ${reversalQty} @ $${transaction.price.toFixed(2)}`);
            } else {
              currentTrade = null;
            }
          }
        }
      }
    }

    // Handle remaining open position
    if (currentTrade && currentPosition !== 0) {
      if (!currentTrade.exitTime) {
        currentTrade.quantity = Math.abs(currentPosition);
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        currentTrade.executionData = currentTrade.executions;
        if (currentTrade.id) {
          currentTrade.isUpdate = true;
          currentTrade.existingTradeId = currentTrade.id;
        }
        console.log(`  [OPEN] Remaining open ${currentTrade.side} position: ${Math.abs(currentPosition)} @ $${currentTrade.entryPrice.toFixed(2)}${currentTrade.id ? ' (updating existing)' : ''}`);
        completedTrades.push(currentTrade);
      }
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} Tastytrade transactions`);
  completedTrades.forEach((trade, i) => {
    console.log(`  Trade ${i + 1}: ${trade.symbol} ${trade.side} ${trade.quantity}, entry $${trade.entryPrice?.toFixed(2)}, exit $${trade.exitPrice?.toFixed(2) || 'OPEN'}, P&L: $${trade.pnl?.toFixed(2) || 'N/A'}, executions: ${trade.executions?.length || 0}${trade.isUpdate ? ' (UPDATE)' : ''}`);
  });
  return completedTrades;
}

function isValidTrade(trade) {
  return trade.symbol &&
         trade.tradeDate &&
         trade.entryTime &&
         trade.entryPrice > 0 &&
         trade.quantity > 0;
}

module.exports = {
  parseCSV,
  detectBrokerFormat,
  getCsvHeaderLine,
  getCsvSampleRows,
  wrapResultWithDiagnostics,
  brokerParsers,
  parseDate,
  parseDateTime,
  parseSide,
  cleanString,
  parseNumeric,
  parseInteger,
  applyTradeGrouping,
  isValidTrade,
  parseInstrumentData,
  normalizeRecord
};
