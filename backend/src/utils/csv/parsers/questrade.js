const { isExecutionDuplicate } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { cleanString, parseDateTime, parseNumeric, parseInteger } = require('../shared');


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

    const sharedDateTime = parseDateTime(dateStr);
    if (sharedDateTime) return sharedDateTime;

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

module.exports = {
  parseQuestradeTransactions
};
