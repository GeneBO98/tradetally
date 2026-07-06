const { isExecutionDuplicate } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { parseDate, parseDateTime, getExecutionTimeBounds, cleanString, parseInstrumentData, parseNumeric } = require('../shared');


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

  const parsePaperMoneyExpiration = (value) => {
    const raw = cleanString(value || '').toUpperCase();
    const match = raw.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})$/);
    if (!match) return null;

    const [, day, monthStr, yearStr] = match;
    const months = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const month = months[monthStr];
    if (!month) return null;

    const yearNum = parseInt(yearStr, 10);
    const fullYear = yearStr.length === 2
      ? (yearNum < 50 ? 2000 + yearNum : 1900 + yearNum)
      : yearNum;

    return `${fullYear}-${month}-${day.padStart(2, '0')}`;
  };

  const getPaperMoneyInstrumentData = (record, symbol) => {
    const type = cleanString(record.Type || record.TYPE || '').toLowerCase();
    if (type === 'call' || type === 'put') {
      const expirationDate = parsePaperMoneyExpiration(record.Exp);
      const strikePrice = parseNumeric(record.Strike, NaN);
      if (expirationDate && Number.isFinite(strikePrice)) {
        return {
          instrumentType: 'option',
          underlyingSymbol: symbol,
          strikePrice,
          expirationDate,
          optionType: type,
          contractSize: 100
        };
      }
    }

    return parseInstrumentData(symbol);
  };
  
  // First, parse all trade transactions from the filled orders
  for (const record of records) {
    try {
      const symbol = cleanString(record.Symbol);
      const side = record.Side ? record.Side.toLowerCase() : '';
      const quantity = Math.abs(parseNumeric(record.Qty, 0));
      const price = parseNumeric(record.Price ?? record.PRICE ?? record['Net Price'], NaN);
      const execTime = record['Exec Time'] || record['Time Placed'] || '';
      const posEffect = record['Pos Effect'] || '';
      const type = record.Type || 'STOCK';
      const status = cleanString(record.Status || '').toUpperCase();

      if (status && !['FILLED', 'EXECUTED'].includes(status)) {
        console.log(`Skipping PaperMoney order with non-filled status: ${status}`);
        continue;
      }
      
      // Skip if missing essential data
      if (!symbol || !side || quantity === 0 || !Number.isFinite(price) || price === 0 || !execTime) {
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
        instrumentData: getPaperMoneyInstrumentData(record, symbol),
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed PaperMoney transaction: ${side} ${quantity} ${symbol} @ $${price} (${posEffect})`);
    } catch (error) {
      console.error('Error parsing PaperMoney transaction:', error, record);
    }
  }
  
  // Group transactions by symbol or option contract before sorting.
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    const instrumentData = transaction.instrumentData || parseInstrumentData(transaction.symbol);
    transaction.groupKey = instrumentData.instrumentType === 'option'
      ? `${transaction.symbol}_${instrumentData.expirationDate}_${instrumentData.optionType}_${instrumentData.strikePrice}`
      : transaction.symbol;

    if (!transactionsBySymbol[transaction.groupKey]) {
      transactionsBySymbol[transaction.groupKey] = [];
    }
    transactionsBySymbol[transaction.groupKey].push(transaction);
  }

  // Sort each instrument's transactions by datetime.
  for (const groupKey of Object.keys(transactionsBySymbol)) {
    transactionsBySymbol[groupKey].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }

  console.log(`Parsed ${transactions.length} valid PaperMoney trade transactions`);
  
  // Process transactions using round-trip trade grouping
  for (const groupKey in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[groupKey];
    const symbol = symbolTransactions[0].symbol;
    const instrumentData = symbolTransactions[0].instrumentData || parseInstrumentData(symbol);
    const valueMultiplier = instrumentData.contractSize ||
                            (instrumentData.instrumentType === 'option' ? 100 :
                              instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1);

    console.log(`\n=== Processing ${symbolTransactions.length} PaperMoney transactions for ${symbol} ===`);
    
    // Track position and round-trip trades
    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[groupKey] || existingPositions[symbol];
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

module.exports = {
  parsePaperMoneyTransactions
};
