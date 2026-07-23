const { parse } = require('csv-parse/sync');
const currencyConverter = require('../currencyConverter');
const { brokerParsers } = require('./brokerParsers');
const { localizeRecords, normalizeWholeLineQuotedCsvRows, detectCurrencyColumn, redactAccountId, detectAccountColumn, extractAccountFromRecord, extractIBKRActivityStatementSection, detectBrokerFormat, findLikelyDelimitedHeaderLine, getCsvHeaderLine, getCsvSampleRows } = require('./detect');
const { buildGenericValidationReason, wrapResultWithDiagnostics, attachManualReviewDiagnostics } = require('./diagnostics');
const { applyTradeGrouping } = require('./grouping');
const { parseFirstradeTransactions } = require('./parsers/firstrade');
const { parseGenericTransactions } = require('./parsers/generic');
const { parseIBKRTransactions } = require('./parsers/ibkr');
const { parseLightspeedTransactions } = require('./parsers/lightspeed');
const { parseMetaTrader5History } = require('./parsers/metatrader');
const { parsePaperMoneyTransactions } = require('./parsers/papermoney');
const { parseQuestradeTransactions } = require('./parsers/questrade');
const { parseSchwabTrades } = require('./parsers/schwab');
const { parseTastytradeTransactions } = require('./parsers/tastytrade');
const { parseThinkorswimTransactions } = require('./parsers/thinkorswim');
const { parseTradervueCompletedTrades } = require('./parsers/tradervue');
const { hasTradingViewOrderHistoryHeaders, parseTradingViewTransactions, parseTradingViewPaperTrades } = require('./parsers/tradingview');
const { parseTradovatePerformanceReport, parseTradovateTransactions } = require('./parsers/tradovate');
const { parseWebullTransactions } = require('./parsers/webull');
const { normalizeSupportedBrokerRows } = require('./parsers/normalizedBrokerRows');
const { parseDate, extractDateFromFilename, parseDateTime, parseSide, normalizePositionQuantity, normalizeRecord, parseInstrumentData, parseNumeric, isValidTrade, cleanString, parseInteger } = require('./shared');
const { decodeIBKRFlexReport } = require('../ibkrFlexReport');

function createDiagnostics(broker) {
  return {
    totalRows: 0,
    parsedRows: 0,
    skippedRows: 0,
    expected_skipped_rows: 0,
    invalidRows: 0,
    skippedReasons: [],
    warnings: [],
    detectedBroker: broker,
    selectedBroker: broker,
    headerAnalysis: { foundHeaders: [], recognizedAs: broker }
  };
}

async function parseIBKRRecords(inputRecords, context = {}, broker = 'ibkr', providedDiagnostics = null) {
  const diagnostics = providedDiagnostics || createDiagnostics(broker);
  const records = Array.isArray(inputRecords)
    ? inputRecords.map(record => normalizeRecord(record))
    : [];
  diagnostics.totalRows = records.length;
  diagnostics.detectedBroker = broker;
  diagnostics.selectedBroker = diagnostics.selectedBroker || broker;
  diagnostics.headerAnalysis.recognizedAs = broker;
  diagnostics.headerAnalysis.foundHeaders = records[0] ? Object.keys(records[0]) : [];

  const accountColumnName = detectAccountColumn(records);
  const parserContext = { ...context };
  if (accountColumnName) {
    parserContext.accountColumnName = accountColumnName;
    parserContext.hasAccountColumn = true;
  }

  const existingPositions = parserContext.existingPositions || {};
  const tradeGroupingSettings = parserContext.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
  const manualReviewItems = Array.isArray(parserContext.manualReviewItems) ? parserContext.manualReviewItems : [];
  const ibkrContext = {
    ...parserContext,
    brokerTag: broker === 'captrader' ? 'captrader' : 'ibkr',
    manualReviewItems,
    diagnostics
  };
  const result = await parseIBKRTransactions(records, existingPositions, tradeGroupingSettings, ibkrContext);
  const wrapped = wrapResultWithDiagnostics(result, diagnostics, [], parserContext.userTimezone || null);
  return attachManualReviewDiagnostics(wrapped, diagnostics, manualReviewItems, parserContext.userTimezone || null);
}


// AvaTrade symbol format: F.US.MESM26 → MESM26 (futures), S.US.AAPL → AAPL (stock)
function normalizeAvaTradeSymbol(symbol) {
  if (!symbol) return symbol;
  // Match F.<region>.<contract> or S.<region>.<ticker> patterns
  const match = symbol.match(/^[A-Z]\.[A-Z]{2,}\.(.+)$/);
  return match ? match[1] : symbol;
}

async function parseCSV(fileBuffer, broker = 'generic', context = {}) {
  // Initialize diagnostics object to track parsing details
  const diagnostics = createDiagnostics(broker);
  diagnostics.detectedBroker = null;
  diagnostics.headerAnalysis.recognizedAs = null;

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
    } else if (broker === 'generic') {
      // When the user keeps the default 'generic' selection but the headers
      // unambiguously match a known broker (e.g. Firstrade's account history
      // export), route to that broker's parser instead of forcing the user to
      // pick from the dropdown. Generic remains the fallback when detection
      // returns 'generic'.
      const detectedBroker = detectBrokerFormat(fileBuffer);
      if (detectedBroker && detectedBroker !== 'generic') {
        console.log(`[AUTO-DETECT] Generic selected but headers match ${detectedBroker} — using ${detectedBroker} parser`);
        broker = detectedBroker;
      }
      diagnostics.detectedBroker = broker;
      diagnostics.headerAnalysis.recognizedAs = broker;
    } else {
      diagnostics.detectedBroker = broker;
      diagnostics.headerAnalysis.recognizedAs = broker;
    }

    const existingPositions = context.existingPositions || {};
    const userTimezone = context.userTimezone || null;
    const importDateFromFileName = extractDateFromFilename(context.fileName);
    diagnostics.importDate = context.importDate || importDateFromFileName || null;
    console.log(`\n=== IMPORT CONTEXT ===`);
    console.log(`Broker format: ${broker}`);
    console.log(`User ID: ${context.userId || 'NOT PROVIDED'}`);
    console.log(`User timezone: ${userTimezone || 'NOT PROVIDED (will store as-is)'}`);
    console.log(`Import date from filename: ${importDateFromFileName || 'NOT PROVIDED'}`);
    console.log(`Existing open positions: ${Object.keys(existingPositions).length}`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} shares @ $${position.entryPrice}`);
    });
    console.log(`=====================\n`);
    context.importDate = context.importDate || importDateFromFileName;

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

    if (['ibkr', 'ibkr_trade_confirmation'].includes(broker)) {
      const decoded = decodeIBKRFlexReport(csvString);
      if (decoded.recognized) {
        diagnostics.report_format = decoded.format;
        diagnostics.open_position_rows = decoded.open_position_records.length;
        return parseIBKRRecords(decoded.trade_records, context, broker, diagnostics);
      }
    }

    // MetaTrader 5 history reports are semicolon-delimited with duplicate column
    // names, a localized title row and European decimals — none of which the
    // csv-parse pipeline below can represent. Parse the raw string positionally
    // and return early.
    if (broker === 'metatrader5') {
      console.log('Starting MetaTrader 5 history parsing');
      const result = await parseMetaTrader5History(csvString, { ...context, diagnostics });
      console.log('Finished MetaTrader 5 history parsing');
      return wrapResultWithDiagnostics(result, diagnostics, [], userTimezone);
    }

    const firstHeaderLine = csvString.split('\n').find(line => line.trim().length > 0) || '';
    const firstHeaders = firstHeaderLine.split(',').map(header => header.replace(/^"|"$/g, '').trim());
    if (broker === 'tradestation' && hasTradingViewOrderHistoryHeaders(firstHeaders)) {
      const warning = 'Selected broker was TradeStation, but the CSV headers match TradingView order history. TradeTally used the TradingView parser for this import.';
      console.log(`[BROKER MISMATCH] ${warning}`);
      diagnostics.warnings.push(warning);
      diagnostics.detectedBroker = 'tradingview';
      diagnostics.headerAnalysis.recognizedAs = 'tradingview';
      broker = 'tradingview';
    }

    // TradingView sub-format detection: inspect CSV headers to route to the correct parser
    // All TradingView formats come in as broker='tradingview', we determine the sub-format here
    if (broker === 'tradingview') {
      const tvHeaders = firstHeaderLine.toLowerCase();
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

    const isPaperMoneyOrderHeader = (line) => {
      const lowerLine = String(line || '').toLowerCase();
      return (lowerLine.includes('exec time') || lowerLine.includes('time placed')) &&
        lowerLine.includes('side') &&
        lowerLine.includes('qty') &&
        lowerLine.includes('pos effect') &&
        lowerLine.includes('symbol');
    };

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
          if (isPaperMoneyOrderHeader(lines[i])) {
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
        // No "Filled Orders" section header - check if the CSV starts directly
        // with the header row or contains a standalone trade activity table.
        let headerLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (isPaperMoneyOrderHeader(lines[i])) {
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
      delimiter: delimiter,
      // Resilient defaults: many broker exports have variable column counts
      // (trailing commas, multi-section files, footer rows). Without these
      // options, csv-parse throws "Invalid Record Length" and the entire
      // import fails. Broker-specific overrides may add more options below.
      relax: true,
      relax_column_count: true,
      skip_records_with_error: true,
      quote: '"',
      escape: '"'
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
    if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation' || broker === 'captrader') {
      // IBKR/CapTrader Activity Statement exports prefix every row with
      // `<Section>,<Header|Data|SubTotal|Total|Notes|Hinweise>,...`. We need
      // to extract only the trade-execution section, strip the prefix, and
      // rebuild a clean CSV before handing off to csv-parse. Without this,
      // the parser sees mismatched column counts across sections and aborts.
      const sectionExtracted = extractIBKRActivityStatementSection(csvString);
      if (sectionExtracted) {
        console.log(`[IBKR] Extracted multi-section Activity Statement (${sectionExtracted.section} section, ${sectionExtracted.dataRows} data rows)`);
        csvString = sectionExtracted.csv;
      } else {
        // IBKR Flex Query exports can also contain multiple sections, but with
        // a different layout (each section is its own self-describing block).
        // Each section has its own header row. We extract only the first
        // section (trade executions) and discard later sections.
        const lines = csvString.split('\n');
        if (lines.length > 1) {
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

    // Custom mapping delimiter, or auto-detect semicolon/tab (e.g. NinjaTrader grid exports).
    // Must run after broker-specific parseOptions overrides so saved mappings win.
    if (context.customMapping?.delimiter) {
      parseOptions.delimiter = context.customMapping.delimiter;
      console.log(`[CUSTOM MAPPING] Using delimiter from mapping: ${JSON.stringify(context.customMapping.delimiter)}`);
    } else {
      const headerInfo = findLikelyDelimitedHeaderLine(csvString.split('\n'));
      if (headerInfo?.delimiter) {
        parseOptions.delimiter = headerInfo.delimiter;
        console.log(`[CSV] Auto-detected delimiter: ${JSON.stringify(headerInfo.delimiter)}`);
      }
    }

    let records;
    try {
      records = parse(csvString, parseOptions);
    } catch (parseError) {
      console.error('CSV parsing error:', parseError.message);

      // If IBKR parsing fails, try alternative approach
      if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation' || broker === 'captrader') {
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
        const userId = context.userId;
        const hasProAccess = userId ? await currencyConverter.userHasProAccess(userId) : false;

        if (hasProAccess) {
          console.log(`[CURRENCY] User ${userId} has Pro access, currency conversion enabled`);
          // Store currency column info in context for broker parsers to use
          context.hasCurrencyColumn = true;
          context.currencyRecords = records; // Store original records with currency data
        } else {
          // Free tier: import the trades in their source currency rather than
          // hard-failing the entire CSV. We previously threw CURRENCY_REQUIRES_PRO
          // here, which blocked users from seeing any of their trades. The trade
          // model stores original_currency, and users can change their display
          // currency under settings to match.
          console.log('[CURRENCY] Non-USD currency detected but user is on free tier — importing without conversion');
          diagnostics.warnings.push(
            'Trades were imported in their original currency without USD conversion. ' +
            'Update your currency display preference in your settings to match, or upgrade to Pro to enable automatic conversion.'
          );
          // Leave context.hasCurrencyColumn unset so the per-trade conversion
          // block (line ~3812) doesn't fire. Broker parsers can still copy
          // the source currency onto the trade via the row-level Currency field.
        }
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

    if (['etrade', 'fidelity', 'projectx_orders'].includes(broker)) {
      console.log(`Starting normalized ${broker} transaction parsing`);
      const normalized = normalizeSupportedBrokerRows(records, broker);
      diagnostics.skippedRows += normalized.ignored.length;
      diagnostics.expected_skipped_rows += normalized.ignored.length;
      diagnostics.skippedReasons.push(...normalized.ignored);

      const result = await parseGenericTransactions(
        normalized.records,
        existingPositions,
        null,
        context
      );

      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      const finalTrades = tradeGroupingSettings.enabled && result.length > 0
        ? applyTradeGrouping(result, tradeGroupingSettings)
        : result;

      console.log(`Finished normalized ${broker} transaction parsing`);
      return wrapResultWithDiagnostics(finalTrades, diagnostics, [], userTimezone);
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

    if (broker === 'firstrade') {
      console.log('Starting Firstrade transaction parsing');
      const result = await parseFirstradeTransactions(records, existingPositions, context.userId, context);
      console.log('Finished Firstrade transaction parsing');

      // Firstrade parser already reconstructs trades from executions.
      console.log('[INFO] Skipping trade grouping for Firstrade (already grouped by round-trip logic)');

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

    if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation' || broker === 'captrader') {
      console.log(`Starting IBKR transaction parsing (${broker} format)`);
      const result = await parseIBKRRecords(records, context, broker, diagnostics);
      console.log('Finished IBKR transaction parsing');
      return result;
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
              fees: trade.fees,
              currency: trade.currency,
              notes: trade.notes,
              instrumentType: trade.instrumentType,
              strikePrice: trade.strikePrice,
              expirationDate: trade.expirationDate,
              optionType: trade.optionType,
              contractSize: trade.contractSize,
              pointValue: trade.pointValue,
              underlyingSymbol: trade.underlyingSymbol,
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
      const nearZeroResidualWarnings = new Set();

      for (const transaction of transactions) {
        if (!transactionsBySymbol[transaction.symbol]) {
          transactionsBySymbol[transaction.symbol] = [];
        }
        transactionsBySymbol[transaction.symbol].push(transaction);
      }

      Object.values(transactionsBySymbol).forEach(symbolTransactions => {
        symbolTransactions.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
      });

      // Process each symbol's transactions
      for (const [symbol, symbolTransactions] of Object.entries(transactionsBySymbol)) {
        const position = existingPositions[symbol] || { quantity: 0, trades: [] };
        if (!existingPositions[symbol] && symbolTransactions[0]?.action === 'sell') {
          diagnostics.warnings.push(
            `TradeStation history for ${symbol} starts with a Sell while no prior open position was found. This may be a true short trade, or the CSV may be missing earlier opening buys.`
          );
        }

        let currentPosition = normalizePositionQuantity(
          position.side === 'short' ? -position.quantity : position.quantity
        );

        for (const transaction of symbolTransactions) {
          const isBuy = transaction.action === 'buy';
          const prevPosition = currentPosition;
          const rawPosition = isBuy
            ? currentPosition + transaction.quantity
            : currentPosition - transaction.quantity;
          currentPosition = normalizePositionQuantity(rawPosition);
          if (rawPosition !== 0 && currentPosition === 0 && !nearZeroResidualWarnings.has(symbol)) {
            diagnostics.warnings.push(`Ignored near-zero residual position for ${symbol} after decimal quantity matching.`);
            nearZeroResidualWarnings.add(symbol);
          }

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
                fees: transaction.fees || 0,
                currency: transaction.currency,
                broker: 'tradestation',
                notes: transaction.notes,
                instrumentType: transaction.instrumentType,
                strikePrice: transaction.strikePrice,
                expirationDate: transaction.expirationDate,
                optionType: transaction.optionType,
                contractSize: transaction.contractSize,
                pointValue: transaction.pointValue,
                underlyingSymbol: transaction.underlyingSymbol
              });
          } else if ((prevPosition > 0 && currentPosition <= 0) || (prevPosition < 0 && currentPosition >= 0)) {
            // Closing or reversing position
            const lastTrade = completedTrades[completedTrades.length - 1];
            if (lastTrade && lastTrade.symbol === symbol && !lastTrade.exitTime) {
              lastTrade.exitTime = transaction.datetime;
              lastTrade.exitPrice = transaction.price;
              lastTrade.commission += transaction.commission || 0;
              lastTrade.fees += transaction.fees || 0;
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
      record['Entry Time'] && record['Exit Time'] && record['Entry price'] && record['Exit price'] ||
      record['Entry price'] && record['Closing price'] ||
      // MetaTrader 4/5 exports — each row is a completed trade with open/close
      record.opening_price && record.closing_price ||
      record.opening_time_utc && record.closing_time_utc
    ));

    // Generic parser - Use transaction-based processing for better position tracking
    // Check for user preference or use enhanced mode by default when context is available.
    // Custom mappings with exit/P&L columns represent completed trade rows; custom mappings
    // without those columns represent transaction rows that need buy/sell position matching.
    const useEnhancedMode = context.usePositionTracking !== false; // Default to true
    const customMappingUsesTransactionRows = Boolean(
      context.customMapping &&
      !context.customMapping.exit_price_column &&
      !context.customMapping.exit_date_column &&
      !context.customMapping.pnl_column
    );

    if (useEnhancedMode && (!context.customMapping || customMappingUsesTransactionRows) && !hasGenericCompletedTradeRows) {
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
    // Used when position tracking is disabled or when a custom mapping describes completed trade rows.
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
          commission: mapping.commission_column
            ? parseNumeric(row[mapping.commission_column])
            : (mapping.fees_column ? parseNumeric(row[mapping.fees_column]) : 0),
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
        let trade = broker === 'generic' ? parser(record, context) : parser(record);
        if (isValidTrade(trade)) {
          // Parse instrument data for futures/options detection
          if (trade.symbol) {
            const instrumentData = parseInstrumentData(trade.symbol);
            if (instrumentData.instrumentType === 'future' || instrumentData.instrumentType === 'option') {
              // Add instrument data to trade
              Object.assign(trade, instrumentData);
            }
          }

          // Check if this trade has a currency that needs conversion.
          // Gated on context.hasCurrencyColumn (only set when the user has
          // Pro access) so free-tier users keep their source-currency values
          // instead of getting USD conversion for free.
          if (context.hasCurrencyColumn) {
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
          diagnostics.skippedReasons.push({ row: rowIndex, reason: buildGenericValidationReason(trade, record, context) });
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

module.exports = {
  parseCSV,
  parseIBKRRecords,
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
