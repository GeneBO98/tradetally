const { parse } = require('csv-parse/sync');


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
/**
 * IBKR/CapTrader Activity Statement exports prefix every row with
 * `<Section>,<Header|Data|SubTotal|Total|Notes|Hinweise>,...`. The trade data
 * lives in either:
 *   - `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,...`
 *     (full Activity Statement; data rows have `DataDiscriminator = Order`)
 *   - `Transaction History,Header,Date,Account,Description,Transaction Type,Symbol,Quantity,Price,...`
 *     (CapTrader Transaction History export; filter by `Transaction Type` ∈ {Buy, Sell})
 *
 * This helper extracts just that section, strips the section prefix, filters
 * to actual trade executions, and returns a clean CSV string suitable for
 * csv-parse. Returns null when the input doesn't look like a multi-section
 * Activity Statement.
 */
function extractIBKRActivityStatementSection(csvString) {
  const lines = csvString.split('\n');

  // Use csv-parse on candidate header lines so quoted/comma-containing fields
  // are handled correctly when we strip the section prefix.
  const parseLine = (line) => {
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
      return null;
    }
  };

  // Locate header line + section type
  let headerLineIndex = -1;
  let section = null; // 'Trades' | 'TransactionHistory'
  let headerFields = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/^"?Trades"?\s*,\s*"?Header"?\s*,\s*"?DataDiscriminator"?/i.test(line)) {
      const fields = parseLine(line);
      if (!fields) continue;
      headerLineIndex = i;
      section = 'Trades';
      // Drop the leading "Trades", "Header" prefix
      headerFields = fields.slice(2);
      break;
    }
    if (/^"?Transaction History"?\s*,\s*"?Header"?\s*,\s*"?(?:Date|Datum)"?\s*,/i.test(line)) {
      const fields = parseLine(line);
      if (!fields) continue;
      headerLineIndex = i;
      section = 'TransactionHistory';
      headerFields = fields.slice(2);
      break;
    }
  }

  if (headerLineIndex === -1 || !headerFields) {
    return null;
  }

  // Identify the section's row prefix so we only collect rows from this section.
  // The section name itself can contain commas inside quotes (it doesn't here),
  // so match by the literal first token before the comma.
  const sectionPrefixRegex = section === 'Trades'
    ? /^"?Trades"?\s*,\s*"?Data"?\s*,/i
    : /^"?Transaction History"?\s*,\s*"?Data"?\s*,/i;

  // For Trades: only `DataDiscriminator = Order` rows are real executions
  // (SubTotal/Total/etc. have different layouts).
  // For Transaction History: filter to `Transaction Type` ∈ {Buy, Sell}.
  const transactionTypeIndex = section === 'TransactionHistory'
    ? headerFields.findIndex((f) => /^transaction type$/i.test(f.trim()))
    : -1;
  const dataDiscriminatorIndex = section === 'Trades'
    ? 0 // DataDiscriminator is the first field after stripping "Trades,Header"
    : -1;

  const collectedRows = [];
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    if (!sectionPrefixRegex.test(line)) {
      // Skip rows from other sections; do not break, since the trades section
      // can be interleaved with SubTotal/Total/Notes lines we want to ignore.
      continue;
    }
    const fields = parseLine(line);
    if (!fields || fields.length < 3) continue;
    const stripped = fields.slice(2);

    if (section === 'Trades') {
      const discriminator = (stripped[dataDiscriminatorIndex] || '').trim();
      if (discriminator !== 'Order') continue;
    } else if (transactionTypeIndex >= 0) {
      const txType = (stripped[transactionTypeIndex] || '').trim();
      if (txType !== 'Buy' && txType !== 'Sell') continue;
    }

    collectedRows.push(stripped);
  }

  if (collectedRows.length === 0) {
    return null;
  }

  // Re-quote fields for output. Standard CSV escaping: wrap in quotes when
  // the value contains a comma, quote, or newline; double up internal quotes.
  const escapeField = (value) => {
    const v = value == null ? '' : String(value);
    if (/[",\r\n]/.test(v)) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const renderRow = (row) => row.map(escapeField).join(',');

  const csv = [renderRow(headerFields), ...collectedRows.map(renderRow)].join('\n');
  return { section, csv, dataRows: collectedRows.length };
}

function detectBrokerFormat(fileBuffer) {
  try {
    let csvString = fileBuffer.toString('utf-8');
    // Remove BOM if present
    if (csvString.charCodeAt(0) === 0xFEFF) {
      csvString = csvString.slice(1);
    }
    const lines = csvString.split('\n');

    // IBKR/CapTrader multi-section Activity Statement format detection.
    // These exports prefix every row with `<Section>,<Header|Data|SubTotal|...>,...`
    // and contain either a `Trades,Header,DataDiscriminator,...` header (full
    // Activity Statement) or a `Transaction History,Header,Date,...` header
    // (CapTrader Transaction History export). The real column headers can be
    // hundreds of lines into the file, so the standard header sniffing below
    // misses them.
    //
    // CapTrader (German introducing broker on IBKR) uses the same CSV format,
    // but is distinguishable by either German metadata column names
    // (`Feldname,Feldwert`) or an explicit `CapTrader GmbH` master-name row.
    let multiSectionDetected = false;
    let captraderMarkerFound = false;
    const scanLimit = Math.min(lines.length, 1000);
    for (let i = 0; i < scanLimit; i++) {
      const line = lines[i];
      if (!line) continue;
      if (!multiSectionDetected) {
        if (/^"?Trades"?\s*,\s*"?Header"?\s*,\s*"?DataDiscriminator"?/i.test(line) ||
            /^"?Transaction History"?\s*,\s*"?Header"?\s*,\s*"?(?:Date|Datum)"?\s*,/i.test(line)) {
          multiSectionDetected = true;
        }
      }
      if (!captraderMarkerFound) {
        if (/^[^,]*,\s*"?Header"?\s*,\s*"?Feldname"?\s*,\s*"?Feldwert"?/i.test(line) ||
            /CapTrader/i.test(line)) {
          captraderMarkerFound = true;
        }
      }
      if (multiSectionDetected && captraderMarkerFound) break;
    }
    if (multiSectionDetected) {
      const detected = captraderMarkerFound ? 'captrader' : 'ibkr';
      console.log(`[AUTO-DETECT] Detected: ${captraderMarkerFound ? 'CapTrader' : 'Interactive Brokers'} Activity Statement (multi-section)`);
      return detected;
    }

    // ThinkorSwim / paperMoney multi-section "Account Statement" detection.
    // These exports lead with a disclaimer and several non-tabular sections
    // (Cash Balance, Account Order History, ...), so the real "Filled Orders"
    // header (",,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,...") sits far below
    // the 15-line window the generic header sniffer scans. Scan deeper for the
    // Filled-Orders column signature and route to the paperMoney parser, which
    // isolates the Filled Orders section itself (see parseCSV `papermoney` block).
    {
      const tosScanLimit = Math.min(lines.length, 2000);
      for (let i = 0; i < tosScanLimit; i++) {
        const line = lines[i];
        if (!line) continue;
        const lowerLine = line.toLowerCase();
        if ((lowerLine.includes('exec time') || lowerLine.includes('time placed')) &&
            lowerLine.includes('pos effect') &&
            lowerLine.includes('spread')) {
          console.log('[AUTO-DETECT] Detected: ThinkorSwim/paperMoney Account Statement (multi-section Filled Orders)');
          return 'papermoney';
        }
      }
    }

    // MetaTrader 5 trade-history report ("Report Cronistorico dei Trade" and
    // localized equivalents). Semicolon-delimited, a title row offsets the real
    // header, column names are localized (Italian: Simbolo/Tipo/Volume/Prezzo/
    // Profitto) and prices use European decimals (e.g. "4 577,86"). The generic
    // header sniffer can't see past the title row, so scan for the position-report
    // header signature directly and route to the dedicated MetaTrader 5 parser.
    {
      const mtScanLimit = Math.min(lines.length, 30);
      for (let i = 0; i < mtScanLimit; i++) {
        const cells = (lines[i] || '').split(';').map(c => c.trim().toLowerCase());
        if (cells.length >= 8 &&
            cells.includes('simbolo') && cells.includes('tipo') &&
            cells.includes('volume') && cells.includes('prezzo') &&
            cells.includes('profitto')) {
          console.log('[AUTO-DETECT] Detected: MetaTrader 5 history report (Italian)');
          return 'metatrader5';
        }
      }
    }

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
    if ((headers.includes('exec time') || headers.includes('time placed')) &&
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

    // IBKR detection - three formats
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
    // Format 3: Compact Flex Query trade export. These files use TradeDate
    // instead of DateTime and include IBKR-specific account/currency fields.
    if (headers.includes('clientaccountid') && headers.includes('symbol') &&
        headers.includes('buy/sell') && headers.includes('quantity') &&
        headers.includes('price') && headers.includes('tradedate') &&
        headers.includes('currencyprimary') && headers.includes('assetclass')) {
      console.log('[AUTO-DETECT] Detected: Interactive Brokers compact Flex Query');
      return 'ibkr';
    }

    // E*TRADE detection. Detailed account-history exports use Activity Type and
    // Activity/Trade Date, while the compact export uses Transaction Type.
    if ((headers.includes('transaction date') && headers.includes('transaction type')) ||
        (headers.includes('activity/trade date') && headers.includes('activity type') &&
         headers.includes('quantity #') && headers.includes('price $'))) {
      console.log('[AUTO-DETECT] Detected: E*TRADE');
      return 'etrade';
    }

    // Fidelity account history export. Action values contain phrases such as
    // "YOU BOUGHT" and "YOU SOLD", and Price/Commission/Fees use ($) suffixes.
    if (headers.includes('run date') && headers.includes('account number') &&
        headers.includes('action') && headers.includes('price ($)') &&
        headers.includes('quantity')) {
      console.log('[AUTO-DETECT] Detected: Fidelity account history');
      return 'fidelity';
    }

    // ProjectX-derived order export used by several prop firms. Only completed
    // rows with qty_done and price_done are imported.
    if (headers.includes('order_id') && headers.includes('account_id') &&
        headers.includes('qty_done') && headers.includes('price_done') &&
        headers.includes('trading_symbol')) {
      console.log('[AUTO-DETECT] Detected: ProjectX completed orders');
      return 'projectx_orders';
    }

    // Firstrade detection - account history export
    if (headers.includes('tradedate') &&
        headers.includes('settleddate') &&
        headers.includes('recordtype') &&
        headers.includes('description') &&
        headers.includes('cusip')) {
      console.log('[AUTO-DETECT] Detected: Firstrade');
      return 'firstrade';
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

    // Webull international trade-record export with a distinctive combined
    // Symbol & Name column. Do not claim the split Symbol/Name + Trade Price
    // layout here because Tiger Brokers uses that signature and is correctly
    // handled by the generic parser's timezone-aware mapping.
    if (headers.includes('symbol & name') && headers.includes('traded price') &&
        headers.includes('trade date') && headers.includes('buy/sell') &&
        headers.includes('quantity')) {
      console.log('[AUTO-DETECT] Detected: Webull international trade record');
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

    // Trading 212 detection - distinctive `No. of shares`, `Price / share`,
    // and `ISIN` columns with an `Action` value like "Market buy"/"Market sell".
    // The generic parser already handles these column names, so we route there
    // (and log the detection so it shows up in diagnostics).
    if (headers.includes('action') && headers.includes('ticker') &&
        headers.includes('isin') &&
        headers.includes('no. of shares') &&
        headers.includes('price / share')) {
      console.log('[AUTO-DETECT] Detected: Trading 212 (routed to generic parser)');
      return 'generic';
    }

    // MetaTrader 4/5 detection - `ticket` + `opening_time_utc` (snake_case
    // column names are diagnostic of MT4/MT5 history exports).
    if (headers.includes('ticket') &&
        headers.includes('opening_time_utc') &&
        headers.includes('closing_time_utc') &&
        (headers.includes('lots') || headers.includes('original_position_size')) &&
        headers.includes('symbol')) {
      console.log('[AUTO-DETECT] Detected: MetaTrader 4/5 history export (routed to generic parser)');
      return 'generic';
    }

    // Robinhood detection - `Activity Date,Process Date,Settle Date,Instrument,
    // Description,Trans Code,Quantity,Price,Amount` is the canonical account
    // history export. The generic parser maps `Activity Date` → date,
    // `Instrument` → symbol, `Trans Code` → side.
    if (headers.includes('activity date') &&
        headers.includes('process date') &&
        headers.includes('settle date') &&
        headers.includes('instrument') &&
        headers.includes('trans code')) {
      console.log('[AUTO-DETECT] Detected: Robinhood account history (routed to generic parser)');
      return 'generic';
    }

    // NinjaTrader grid export (semicolon-delimited; European decimal commas in price)
    if (headers.includes('instrument') && headers.includes('action') &&
        headers.includes('quantity') && headers.includes('price') &&
        (headers.includes('e/x') || headers.includes('order id'))) {
      console.log('[AUTO-DETECT] Detected: NinjaTrader grid export (routed to generic parser)');
      return 'generic';
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
    'trade', 'status', 'account', 'instrument', 'position', 'rate', 'connection'
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

module.exports = {
  HEADER_LOCALE_MAP,
  VALUE_LOCALE_MAP,
  localizeRecords,
  normalizeWholeLineQuotedCsvRows,
  detectCurrencyColumn,
  ACCOUNT_FIELD_PATTERNS,
  redactAccountId,
  detectAccountColumn,
  extractAccountFromRecord,
  extractIBKRActivityStatementSection,
  detectBrokerFormat,
  findLikelyDelimitedHeaderLine,
  getCsvHeaderLine,
  getCsvSampleRows
};
