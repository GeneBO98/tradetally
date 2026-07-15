const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('../../futuresUtils');
const { isExecutionDuplicateMultiKey, executionIdentityMatches } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { parseDate, parseDateTime, getExecutionTimeBounds, cleanString, parseInstrumentData, parseNumeric } = require('../shared');


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

function buildIBKRAmbiguousSellReviewItem({ transaction, symbol, conid, instrumentData, brokerTag, context }) {
  const quantity = Math.abs(parseFloat(transaction.quantity) || 0);
  const price = parseFloat(transaction.price);
  const accountIdentifier = transaction.accountIdentifier || context.selectedAccountId || null;
  const brokerConnectionId = context.brokerConnectionId || context.broker_connection_id || null;
  const sourceId = [
    brokerTag || 'ibkr',
    conid || transaction.conid || '',
    transaction.orderId || '',
    transaction.datetime || '',
    symbol || '',
    quantity,
    price
  ].join('|');

  return {
    id: sourceId,
    review_type: 'ambiguous_sell_only_stock',
    source: 'ibkr_sell_only_execution',
    broker: brokerTag || 'ibkr',
    broker_connection_id: brokerConnectionId,
    import_id: context.importId || context.import_id || null,
    symbol,
    conid: conid || transaction.conid || null,
    order_id: transaction.orderId || null,
    action: transaction.action,
    quantity,
    price,
    commission: transaction.fees || 0,
    fees: 0,
    datetime: transaction.datetime,
    trade_date: transaction.date,
    account_identifier: accountIdentifier,
    instrument_type: instrumentData.instrumentType || 'stock',
    reason: 'Sell execution has no matching opening buy or existing open position.',
    available_actions: ['import_as_short', 'import_as_close_only', 'import_as_gifted_shares', 'ignore']
  };
}

async function parseIBKRTransactions(records, existingPositions = {}, tradeGroupingSettings = { enabled: true, timeGapMinutes: 60 }, context = {}) {
  if (!Array.isArray(context.manualReviewItems)) {
    context.manualReviewItems = [];
  }

  // Allow callers (e.g. CapTrader) to override the broker label written onto
  // completed trades. Defaults to `ibkr` for backwards compatibility.
  const brokerTag = context.brokerTag || 'ibkr';
  console.log(`\n=== IBKR TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} IBKR transaction records (broker tag: ${brokerTag})`);
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
  const diagnostics = context.diagnostics;
  const noteSkippedRow = (row, reason) => {
    if (!diagnostics) return;
    diagnostics.skippedRows += 1;
    diagnostics.skippedReasons.push({ row, reason });
  };

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
        // Activity Statement format (original) \u2014 includes:
        //   - IBKR Flex Query exports
        //   - IBKR Activity Statement Trades section (`T. Price`, `Comm/Fee`)
        //   - CapTrader Transaction History (Date-only, Transaction Type column)
        symbol = cleanString(record.Symbol);
        quantity = parseNumeric(record.Quantity, NaN);
        absQuantity = Math.abs(quantity);
        // `T. Price` is the trade price column in Activity Statement Trades sections
        price = parseNumeric(record.Price ?? record['T. Price'] ?? record['T.Price'], NaN);
        // IBKR commission: negative = fee paid, positive = rebate received
        // Convert to our convention: positive = fee paid, negative = rebate (credit)
        // `Comm/Fee` is the column name in Activity Statement Trades sections
        commission = -(parseNumeric(record.Commission ?? record['Comm/Fee'] ?? record.IBCommission ?? 0, 0));
        // Handle "DateTime", "Date/Time", or just "Date" (CapTrader Transaction History)
        // Clean DateTime - remove leading and trailing apostrophes/quotes if present
        const rawDateTime = (record.DateTime || record['Date/Time'] || record.Date || record.Datum || '').toString();
        dateTime = rawDateTime.replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();
        // Prefer explicit `Transaction Type` (CapTrader Transaction History) over
        // sign-of-quantity inference, since some Transaction History rows use a
        // signed quantity that already reflects the action.
        const txType = cleanString(record['Transaction Type'] || '').toLowerCase();
        if (txType === 'buy') {
          action = 'buy';
        } else if (txType === 'sell') {
          action = 'sell';
        } else {
          action = quantity > 0 ? 'buy' : 'sell';
        }
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
        noteSkippedRow(rowIndex, `Unsupported trade detail level: ${levelOfDetail}`);
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
        noteSkippedRow(rowIndex, 'Row did not contain a trade execution');
        continue;
      }

      const assetClass = cleanString(record.AssetClass || record['Asset Class'] || record['Asset Category'] || '').toUpperCase();
      const supportedAssetClasses = new Set(['', 'STK', 'STOCK', 'STOCKS', 'OPT', 'OPTION', 'OPTIONS', 'FUT', 'FUTURE', 'FUTURES']);
      if (!supportedAssetClasses.has(assetClass)) {
        noteSkippedRow(rowIndex, `Unsupported IBKR asset class: ${assetClass}`);
        continue;
      }

      // Skip if missing essential data
      // Note: price === 0 is valid for expired options (Code contains "Ep" or "Ex" or "A" or "C")
      // Also valid when Code is 'C' (close) for options with price=0 (worthless expiration)
      const isOptionAssetClass = ['OPT', 'OPTION', 'OPTIONS'].includes(assetClass);
      const isOptionSymbol = symbol && (isOptionAssetClass || symbol.includes(' ') || /\d{6}[PC]\d{8}/.test(symbol));
      const isExpirationCode = code && (code.includes('EP') || code.includes('EX') || code.includes('A'));
      const isOptionClose = code && code.includes('C') && isOptionSymbol;
      const isExpiration = isExpirationCode || (price === 0 && isOptionClose);
      const invalidQuantity = !isFinite(absQuantity) || absQuantity <= 0;
      const invalidPrice = !isFinite(price) || (price === 0 && !isExpiration);
      if (!symbol || invalidQuantity || invalidPrice || !dateTime) {
        console.log(`[IBKR] Skipping row ${rowIndex} because required execution data was missing`);
        noteSkippedRow(rowIndex, 'Missing required symbol, quantity, price, or date/time');
        continue;
      }

      // Parse the datetime
      const tradeDate = parseDate(dateTime);
      const entryTime = parseDateTime(dateTime);

      if (!tradeDate || !entryTime) {
        console.log(`Skipping IBKR record with invalid date: ${dateTime}`);
        noteSkippedRow(rowIndex, `Invalid execution date/time: ${dateTime}`);
        continue;
      }

      // For options, IBKR Activity Statement already reports quantity in contracts
      let processedQuantity = absQuantity;
      const instrumentData = isOptionAssetClass
        ? parseIBKRTradeConfirmationInstrumentData(record, symbol)
        : parseInstrumentData(symbol);
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
        record.IBOrderID ||
        record.ibOrderID ||
        record.orderId ||
        record['OrderId'] ||
        record['Trade ID'] ||
        record.TradeID ||
        ''
      );
      const executionId = cleanString(
        record.IBExecID || record['IB Exec ID'] || record.ExecutionID || record.execution_id || ''
      );
      const tradeId = cleanString(
        record.TradeID || record['Trade ID'] || record.trade_id || ''
      );
      const currency = cleanString(record.Currency || record.CurrencyPrimary || 'USD') || 'USD';

      transactions.push({
        symbol,
        conid, // Contract ID for reliable options grouping
        orderId,
        executionId,
        tradeId,
        currency,
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
      console.error(`[IBKR] Error parsing transaction row ${rowIndex}:`, error.message);
      noteSkippedRow(rowIndex, `Parse error: ${error.message}`);
    }
  }

  if (diagnostics?.skippedRows > 0) {
    diagnostics.warnings.push(`${diagnostics.skippedRows} IBKR trade row${diagnostics.skippedRows === 1 ? '' : 's'} were skipped during parsing.`);
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
        // Clone the array so new executions added during this parse do not
        // mutate the duplicate-detection context mid-import.
        executions: existingExecutions.map(exec => ({ ...exec })),
        // Use recalculated values from executions for accurate P&L
        totalQuantity: recalcEntryQty,  // Total entry quantity, not remaining
        totalFees: recalcFees,
        entryValue: recalcEntryValue,
        exitValue: recalcExitValue,  // Include partial close exit value!
        broker: existingPosition.broker || brokerTag,
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
        const isExplicitCloseOnly = transactionCode && transactionCode.includes('C') &&
                           !transactionCode.includes('O') && !hasPartialCode;
        const hasOpeningExecutionInImport = symbolTransactions.some(tx => tx.action === 'buy');
        const isUnpairedStockSell = transaction.action === 'sell' &&
                           instrumentData.instrumentType === 'stock' &&
                           !existingPosition &&
                           !hasOpeningExecutionInImport &&
                           !(transactionCode && transactionCode.includes('O'));
        if (isUnpairedStockSell) {
          const reviewItem = buildIBKRAmbiguousSellReviewItem({
            transaction,
            symbol,
            conid,
            instrumentData,
            brokerTag,
            context
          });
          context.manualReviewItems.push(reviewItem);
          console.log(`  → [MANUAL REVIEW] Sell-only stock execution for ${symbol} requires user confirmation before import`);
          continue;
        }

        const isCloseOnly = isExplicitCloseOnly;

        if (isCloseOnly) {
          // Code='C' or 'A;C' indicates this should close an existing position, but we don't have one loaded
          // Instead of creating an incorrect open position, create a completed "close-only" trade
          // This represents a position that was opened outside this import and is now being closed
          const closeOnlyReason = `Code='${transactionCode}' is a closing transaction without existing position`;
          console.log(`  → [CLOSE-ONLY] ${closeOnlyReason}`);
          console.log(`  → Creating completed close-only trade for: ${transaction.action} ${qty} ${symbol} @ $${transaction.price}`);

          // For close-only transactions, determine the original trade direction:
          // - If we're BUYING to close (action='buy'), the original was a SHORT position
          // - If we're SELLING to close (action='sell'), the original was a LONG position
          const originalSide = transaction.action === 'buy' ? 'short' : 'long';

          // Calculate P&L: For close-only, we only have the exit value and commission
          // The entry value is unknown, so we use the close price as entry (P&L = -commission only)
          // This is a best-effort approach when the opening transaction is missing
          const pnl = -(transaction.fees || 0); // Only commission loss since we don't know entry
          const syntheticOpeningExecution = {
            action: originalSide === 'short' ? 'sell' : 'buy',
            quantity: qty,
            price: transaction.price,
            datetime: transaction.datetime,
            fees: 0,
            conid: transaction.conid,
            orderId: transaction.orderId ? `${transaction.orderId}-synthetic-open` : null,
            order_id: transaction.orderId ? `${transaction.orderId}-synthetic-open` : null,
            synthetic: true,
            synthetic_reason: 'missing_opening_execution'
          };
          const closingExecution = {
            action: transaction.action,
            quantity: qty,
            price: transaction.price,
            datetime: transaction.datetime,
            fees: transaction.fees || 0,
            conid: transaction.conid,
            orderId: transaction.orderId || null,
            order_id: transaction.orderId || null,
            execution_id: transaction.executionId || null,
            trade_id: transaction.tradeId || null
          };

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
            broker: brokerTag,
            accountIdentifier: transaction.accountIdentifier,
            originalCurrency: transaction.currency,
            executions: [syntheticOpeningExecution, closingExecution],
            executionData: [syntheticOpeningExecution, closingExecution],
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
            broker: brokerTag,
            accountIdentifier: transaction.accountIdentifier,
            originalCurrency: transaction.currency
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
          order_id: transaction.orderId || null,
          execution_id: transaction.executionId || null,
          trade_id: transaction.tradeId || null,
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

        // An IBKR order can produce multiple fills. Execution/trade IDs identify
        // fills; order ID alone is only a grouping hint.
        const hasStableFillId = Boolean(newExecution.execution_id || newExecution.trade_id);
        const executionExists = existsGlobally || (hasStableFillId &&
          currentTrade.executions.some(exec => executionIdentityMatches(exec, newExecution)));

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

module.exports = {
  parseIBKRTradeConfirmationInstrumentData,
  buildIBKRAmbiguousSellReviewItem,
  parseIBKRTransactions
};
