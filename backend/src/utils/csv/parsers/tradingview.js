const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('../../futuresUtils');
const { isExecutionDuplicate } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { parseDate, parseDateTime, getExecutionTimeBounds, normalizePositionQuantity, cleanString, parseNumeric, parseInteger } = require('../shared');


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

  const standardMatch = contractSymbol.match(/^([A-Z][A-Z0-9]*?)([FGHJKMNQUVXZ])(\d{1,4})$/);
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

function hasTradingViewOrderHistoryHeaders(headers = []) {
  const normalizedHeaders = headers.map(header => String(header || '').toLowerCase().trim());
  return normalizedHeaders.includes('symbol') &&
    normalizedHeaders.includes('side') &&
    normalizedHeaders.includes('status') &&
    normalizedHeaders.includes('order id') &&
    normalizedHeaders.includes('quantity') &&
    normalizedHeaders.includes('closing time') &&
    (normalizedHeaders.includes('fill price') || normalizedHeaders.includes('avg fill price'));
}

async function parseTradingViewTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} TradingView transaction records`);

  const transactions = [];
  const completedTrades = [];
  const lastTradeEndTime = {};
  const nearZeroResidualWarnings = new Set();

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
      const quantity = Math.abs(parseNumeric(
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
          diagnostics.expected_skipped_rows = (diagnostics.expected_skipped_rows || 0) + 1;
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
      const futuresMatch = rawContract.match(/^([A-Z][A-Z0-9]*?)([FGHJKMNQUVXZ])(\d{2,4})$/);
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
    if (!existingPosition && symbolTransactions[0]?.action === 'sell' && diagnostics) {
      diagnostics.warnings.push(
        `TradingView order history for ${symbol} starts with a Sell while no prior open position was found. This may be a true short trade, or the CSV may be missing earlier opening buys.`
      );
    }

    let currentPosition = normalizePositionQuantity(existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0);
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
        const rawPosition = currentPosition + qty;
        currentPosition = normalizePositionQuantity(rawPosition);
        if (rawPosition !== 0 && currentPosition === 0 && diagnostics && !nearZeroResidualWarnings.has(symbol)) {
          diagnostics.warnings.push(`Ignored near-zero residual position for ${symbol} after decimal quantity matching.`);
          nearZeroResidualWarnings.add(symbol);
        }

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      } else if (transaction.action === 'sell') {
        const rawPosition = currentPosition - qty;
        currentPosition = normalizePositionQuantity(rawPosition);
        if (rawPosition !== 0 && currentPosition === 0 && diagnostics && !nearZeroResidualWarnings.has(symbol)) {
          diagnostics.warnings.push(`Ignored near-zero residual position for ${symbol} after decimal quantity matching.`);
          nearZeroResidualWarnings.add(symbol);
        }

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

module.exports = {
  getTradingViewFuturesInstrumentData,
  hasTradingViewOrderHistoryHeaders,
  parseTradingViewTransactions,
  parseTradingViewPaperTrades
};
