const { isExecutionDuplicate } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { normalizeExecutionCollections } = require('../grouping');
const { parseDate, parseDateTime, getExecutionTimeBounds, cleanString, parseInstrumentData, parseNumeric } = require('../shared');


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
  let rowIndex = 0;
  for (const record of records) {
    rowIndex++;
    try {
      // Get symbol from Symbol column (full option symbol like SPY251114C00672000)
      const combinedSymbolAndName = cleanString(record['Symbol & Name']);
      const symbol = cleanString(record.Symbol || record.symbol || combinedSymbolAndName.split(/\s+/)[0]);
      // Support both formats: "Side" (old) and "B/S" (alternate)
      const sideRaw = cleanString(record.Side || record.side || record['B/S'] || record['b/s'] || record['Buy/Sell']);
      const side = sideRaw.toLowerCase();
      const status = cleanString(record.Status || record.status);
      // Support both "Filled" (old) and "Filled Qty" (alternate)
      const filled = Math.abs(parseNumeric(
        record.Filled || record.filled || record['Filled Qty'] || record['filled qty'] || record.Quantity || 0
      ));
      // Support both "Avg Price" (old) and "Filled Avg Price" / "Filled AVG Price" (alternate, may have $ prefix)
      const priceRaw = cleanString(record['Avg Price'] || record['avg price'] || record['Filled Avg Price'] || record['filled avg price'] || record['Filled AVG Price'] || record['Traded Price'] || record['Trade Price'] || record.Price || record.price || '0');
      const price = parseNumeric(priceRaw, 0);
      const rawTradeDateValue = cleanString(record['Trade Date']);
      const internationalDateMatch = rawTradeDateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const tradeDateValue = internationalDateMatch && record['Buy/Sell']
        ? `${internationalDateMatch[2].padStart(2, '0')}/${internationalDateMatch[1].padStart(2, '0')}/${internationalDateMatch[3]}`
        : rawTradeDateValue;
      const tradeTime = cleanString(record.Time);
      const filledTime = record['Filled Time'] || record['filled time'] || record['Fill Time'] || record['fill time'] ||
        (tradeDateValue ? `${tradeDateValue}${tradeTime ? ` ${tradeTime}` : ''}` : '');

      const diag = context.diagnostics;

      // Determine if this is the alternate format (no Status column, uses B/S + Side Type)
      const isAlternateFormat = !!(
        record['B/S'] || record['b/s'] || record['Side Type'] || record['side type'] ||
        record['Buy/Sell'] || record['Traded Price'] || record['Trade Price']
      );

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
        if (diag) {
          diag.invalidRows = (diag.invalidRows || 0) + 1;
          if (!Array.isArray(diag.skippedReasons)) diag.skippedReasons = [];
          diag.skippedReasons.push({ row: rowIndex, reason: `Invalid filled time: ${filledTime}` });
        }
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
      const feeRaw = cleanString(record.Fee || record.fee || record['Comm/Fee/Tax'] || '0');
      const platformFeeRaw = cleanString(record['Platform Fee'] || record['platform fee'] || '0');
      const gstRaw = cleanString(record.GST || record.gst || record.VAT || '0');
      const totalFees = Math.abs(parseNumeric(commissionRaw, 0)) + Math.abs(parseNumeric(feeRaw, 0))
        + Math.abs(parseNumeric(platformFeeRaw, 0)) + Math.abs(parseNumeric(gstRaw, 0));

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

module.exports = {
  parseWebullTransactions
};
