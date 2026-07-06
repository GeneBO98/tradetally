const cache = require('../../cache');
const cusipQueue = require('../../cusipQueue');
const db = require('../../../config/database');
const { localToUTC } = require('../../timezone');
const { isExecutionDuplicate } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { parseDate, getExecutionTimeBounds, cleanString, parseInstrumentData, parseNumeric, parseInteger } = require('../shared');


// Lightspeed-specific datetime parser that handles Central Time
function parseLightspeedDateTime(dateTimeStr) {
  if (!dateTimeStr) return null;

  try {
    // Lightspeed exports execution times in Eastern Time (America/New_York).
    // A previous version applied a fixed +4h offset (correct only during
    // daylight saving), which stored every EST-season trade an hour early —
    // convert via localToUTC so DST is handled properly.
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
    const seconds = parseInt(timeParts[2]) || 0;

    if (!year || !month || !day || !Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

    const pad = (n) => String(n).padStart(2, '0');
    const naive = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    const utc = localToUTC(naive, 'America/New_York');

    console.log(`Lightspeed time conversion: ${dateTimeStr} (Eastern) -> ${utc} (UTC)`);

    return utc;
  } catch (error) {
    console.warn('Error parsing Lightspeed datetime:', dateTimeStr, error.message);
    return null;
  }
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

module.exports = {
  parseLightspeedDateTime,
  parseLightspeedSide,
  calculateLightspeedFees,
  parseLightspeedTransactions
};
