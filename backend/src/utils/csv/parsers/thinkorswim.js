const { isExecutionDuplicateMultiKey } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { parseDate, parseDateTime, getExecutionTimeBounds } = require('../shared');


async function parseThinkorswimTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} thinkorswim transaction records`);

  const transactions = [];
  const completedTrades = [];

  function buildThinkorswimOptionPositionKey(symbol, instrumentData) {
    if (!instrumentData || instrumentData.instrumentType !== 'option') {
      return symbol;
    }

    if (!symbol || !instrumentData.strikePrice || !instrumentData.expirationDate || !instrumentData.optionType) {
      return symbol;
    }

    const strike = parseFloat(instrumentData.strikePrice);
    const expDate = String(instrumentData.expirationDate).split('T')[0];
    const optionType = String(instrumentData.optionType).toLowerCase();
    return `${symbol}_${strike}_${expDate}_${optionType}`;
  }

  function findThinkorswimExistingPosition(symbol, groupKey, instrumentData) {
    if (instrumentData?.instrumentType === 'option') {
      const positionKey = buildThinkorswimOptionPositionKey(symbol, instrumentData);
      return existingPositions[positionKey] || existingPositions[groupKey] || null;
    }

    return existingPositions[symbol] || null;
  }

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

      // Detect multi-leg option spreads (VERTICAL, IRON CONDOR, BUTTERFLY, etc.).
      // ThinkOrSwim emits these as a single row describing the whole spread, but
      // TradeTally's data model represents trades as single instruments. Skip
      // them with a clear diagnostic rather than truncating into a bogus symbol.
      const spreadMatch = symbolPart.match(/^(VERTICAL|DIAGONAL|CALENDAR|BUTTERFLY|CONDOR|IRON\s+CONDOR|IRON\s+BUTTERFLY|STRADDLE|STRANGLE|COVERED|COLLAR|RATIO|BACK\s+RATIO)\b/i);
      if (spreadMatch) {
        const spreadType = spreadMatch[1].toUpperCase();
        console.log(`[TOS] Skipping multi-leg spread (${spreadType}): ${description}`);
        if (diagnostics) {
          diagnostics.skippedRows++;
          diagnostics.skippedReasons.push({
            row: rowIndex,
            reason: `Multi-leg option spread (${spreadType}) not supported - import individual legs from a different export or skip these rows`
          });
        }
        continue;
      }

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

      // Defense-in-depth: the trades table caps symbol at varchar(30). If anything
      // unexpected slips through (e.g. an unrecognized exotic instrument description),
      // skip it cleanly instead of letting the DB INSERT fail.
      if (!symbol || symbol.length > 30) {
        console.log(`[TOS] Skipping row with invalid symbol length (${symbol?.length || 0}): ${description}`);
        if (diagnostics) {
          diagnostics.skippedRows++;
          diagnostics.skippedReasons.push({
            row: rowIndex,
            reason: `Unrecognized instrument format: "${(description || '').substring(0, 60)}" - symbol could not be extracted`
          });
        }
        continue;
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
    const existingPosition = findThinkorswimExistingPosition(symbol, groupKey, instrumentData);
    const duplicateLookupKeys = [groupKey, symbol];
    if (isOption) {
      duplicateLookupKeys.unshift(buildThinkorswimOptionPositionKey(symbol, instrumentData));
    }
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
        const existsGlobally = isExecutionDuplicateMultiKey(newExecution, duplicateLookupKeys, context);

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

module.exports = {
  parseThinkorswimTransactions
};
