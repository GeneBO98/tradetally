const { brokerParsers } = require('../brokerParsers');
const { isExecutionDuplicate } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { buildGenericValidationReason } = require('../diagnostics');
const { parseDate, parseDateTime, getExecutionTimeBounds, parseSide, parseInstrumentData, parseNumeric } = require('../shared');


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
            commission: mapping.commission_column
              ? parseNumeric(row[mapping.commission_column])
              : (mapping.fees_column ? parseNumeric(row[mapping.fees_column]) : 0),
            fees: mapping.fees_column ? parseNumeric(row[mapping.fees_column]) : 0,
            stopLoss: mapping.stop_loss_column ? parseNumeric(row[mapping.stop_loss_column]) : null,
            takeProfit: mapping.take_profit_column ? parseNumeric(row[mapping.take_profit_column]) : null,
            broker: 'custom'
          };
        };
      } else {
        parser = brokerParsers.generic;
      }

      const trade = parser(record, context);
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
            reason: buildGenericValidationReason(trade, record, context)
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

    // Determine the contract multiplier for this symbol so futures P&L is valued
    // per point (e.g. ES = $50/pt) instead of dollar-for-dollar. Without this a
    // 1-point ES move would be recorded as $1 rather than $50. parseInstrumentData
    // recognizes broker display formats like "ES JUN26" (NinjaTrader) and "ESM26".
    const symbolInstrumentData = parseInstrumentData(symbol);
    const contractMultiplier = symbolInstrumentData.instrumentType === 'future'
      ? (symbolInstrumentData.pointValue || 1)
      : 1;
    // Fields to stamp onto completed futures trades so the Trade model, charts,
    // and analytics treat them as futures (not stocks).
    const futuresTradeFields = symbolInstrumentData.instrumentType === 'future'
      ? {
          instrumentType: 'future',
          underlyingAsset: symbolInstrumentData.underlyingAsset,
          contractMonth: symbolInstrumentData.contractMonth,
          contractYear: symbolInstrumentData.contractYear,
          pointValue: symbolInstrumentData.pointValue
        }
      : null;

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
      totalCommission: existingPosition.commission || 0,
      totalFees: existingPosition.fees || 0,
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
          totalCommission: 0,
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
          commission: transaction.commission,
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

        currentTrade.totalCommission += transaction.commission;
        currentTrade.totalFees += transaction.fees;
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
              const partialPnl = (avgEntryPrice - transaction.price) * qty * contractMultiplier;
              // Prorate commission for partial close
              const partialCommission = ((currentTrade.totalCommission + currentTrade.totalFees) / currentTrade.totalQuantity) * qty;
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
              const partialPnl = (transaction.price - avgEntryPrice) * qty * contractMultiplier;
              // Prorate commission for partial close
              const partialCommission = ((currentTrade.totalCommission + currentTrade.totalFees) / currentTrade.totalQuantity) * qty;
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

        // Calculate P&L. entryValue/exitValue are raw price*qty (so entryPrice/
        // exitPrice stay per-contract); the contract multiplier is applied to the
        // gross gain/loss so futures are valued per point (e.g. ES = $50/pt).
        const totalCosts = currentTrade.totalCommission + currentTrade.totalFees;
        if (currentTrade.side === 'long') {
          currentTrade.pnl = (currentTrade.exitValue - currentTrade.entryValue) * contractMultiplier - totalCosts;
        } else {
          currentTrade.pnl = (currentTrade.entryValue - currentTrade.exitValue) * contractMultiplier - totalCosts;
        }

        const grossEntryValue = currentTrade.entryValue * contractMultiplier;
        currentTrade.pnlPercent = grossEntryValue > 0 ? (currentTrade.pnl / grossEntryValue) * 100 : 0;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalCommission;
        currentTrade.fees = currentTrade.totalFees;

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

        if (futuresTradeFields) {
          Object.assign(currentTrade, futuresTradeFields);
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
      currentTrade.commission = currentTrade.totalCommission;
      currentTrade.fees = currentTrade.totalFees;
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

      if (futuresTradeFields) {
        Object.assign(currentTrade, futuresTradeFields);
      }

      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} transactions`);
  return completedTrades;
}

module.exports = {
  parseGenericTransactions
};
