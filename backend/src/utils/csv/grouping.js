const { localToUTC } = require('../timezone');
const { getExecutionTimeBounds, POSITION_CLOSE_TOLERANCE, normalizePositionQuantity, parseInstrumentData } = require('./shared');


/**
 * Groups completed trades based on entry time proximity
 * Applies to all broker formats - merges trades for same symbol within time gap
 * @param {Array} trades - Array of parsed trades
 * @param {Object} settings - Grouping settings {enabled, timeGapMinutes}
 * @returns {Array} - Array of grouped trades
 */
function applyTradeGrouping(trades, settings) {
  if (!trades || trades.length === 0) return trades;

  console.log(`\n=== APPLYING TRADE GROUPING ===`);
  console.log(`Grouping ${trades.length} trades with ${settings.timeGapMinutes} minute time gap`);

  // Group by grouping key - for options, include strike/expiry/type to keep different contracts separate
  const tradesByGroupKey = {};
  trades.forEach(trade => {
    let groupKey;
    if (trade.instrumentType === 'option' && trade.strikePrice && trade.expirationDate && trade.optionType) {
      // For options: group by underlying + strike + expiration + call/put
      // This ensures different contracts on the same underlying are kept separate
      groupKey = `${trade.symbol}_${trade.strikePrice}_${trade.expirationDate}_${trade.optionType}`;
    } else {
      // For stocks and other instruments: group by symbol only
      groupKey = trade.symbol;
    }
    if (!tradesByGroupKey[groupKey]) {
      tradesByGroupKey[groupKey] = [];
    }
    tradesByGroupKey[groupKey].push(trade);
  });

  const groupedTrades = [];

  // Process each group separately
  for (const [groupKey, symbolTrades] of Object.entries(tradesByGroupKey)) {
    console.log(`\n[GROUPING] Processing ${symbolTrades.length} trades for ${groupKey}`);

    // Sort by entry time
    symbolTrades.sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));

    let currentGroup = null;
    let lastEntryTime = null;

    for (const trade of symbolTrades) {
      const entryTime = new Date(trade.entryTime);

      if (!currentGroup) {
        // Start new group - initialize with executionData array (matches Trade model)
        // For grouped trades, each execution represents a complete round-trip sub-trade
        // Handle both 'pnl' and 'profitLoss' field names (different parsers use different names)
        const tradePnlValue = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
        currentGroup = {
          ...trade,
          pnl: tradePnlValue, // Ensure pnl field is set
          profitLoss: tradePnlValue, // Set both for compatibility
          groupedTrades: 1,
          executionData: trade.executionData || trade.executions || [{
            entryTime: trade.entryTime,
            entryPrice: trade.entryPrice,
            exitTime: trade.exitTime,
            exitPrice: trade.exitPrice,
            quantity: trade.quantity,
            side: trade.side,
            commission: trade.commission || 0,
            fees: trade.fees || 0,
            pnl: tradePnlValue
          }]
        };
        lastEntryTime = entryTime;
        console.log(`  [GROUPING] Started new group at ${trade.entryTime}`);
      } else {
        // Check time gap
        const timeSinceLastEntry = (entryTime - lastEntryTime) / (1000 * 60); // minutes

        // Only group if same side and within time gap
        if (timeSinceLastEntry <= settings.timeGapMinutes && trade.side === currentGroup.side) {
          // Merge into current group
          console.log(`  [GROUPING] Merging trade: ${timeSinceLastEntry.toFixed(1)}min gap (${trade.side} ${trade.quantity}@${trade.entryPrice})`);

          // Add this trade's execution to the executionData array
          // For grouped trades, each execution represents a complete round-trip sub-trade
          // Handle both 'pnl' and 'profitLoss' field names
          const executionPnl = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
          const newExecution = {
            entryTime: trade.entryTime,
            entryPrice: trade.entryPrice,
            exitTime: trade.exitTime,
            exitPrice: trade.exitPrice,
            quantity: trade.quantity,
            side: trade.side,
            commission: trade.commission || 0,
            fees: trade.fees || 0,
            pnl: executionPnl
          };

          // If trade has its own executionData/executions array, merge those; otherwise add as single execution
          if ((trade.executionData || trade.executions) && Array.isArray(trade.executionData || trade.executions)) {
            currentGroup.executionData.push(...(trade.executionData || trade.executions));
          } else {
            currentGroup.executionData.push(newExecution);
          }

          // Calculate weighted average entry price
          const totalQuantity = currentGroup.quantity + trade.quantity;
          const totalEntryValue = (currentGroup.entryPrice * currentGroup.quantity) + (trade.entryPrice * trade.quantity);
          currentGroup.entryPrice = totalEntryValue / totalQuantity;

          // Combine quantities
          currentGroup.quantity = totalQuantity;

          // Combine costs
          currentGroup.commission = (currentGroup.commission || 0) + (trade.commission || 0);
          currentGroup.fees = (currentGroup.fees || 0) + (trade.fees || 0);
          currentGroup.entryCommission = (currentGroup.entryCommission || 0) + (trade.entryCommission || 0);
          currentGroup.exitCommission = (currentGroup.exitCommission || 0) + (trade.exitCommission || 0);
          const totalFees = (currentGroup.commission || 0) + (currentGroup.fees || 0);

          // Track grouped count
          currentGroup.groupedTrades = (currentGroup.groupedTrades || 1) + 1;

          // Calculate weighted average exit price if both have exit prices (do this before P&L calculation)
          if (trade.exitTime) {
            currentGroup.exitTime = trade.exitTime;
            if (currentGroup.exitPrice && trade.exitPrice) {
              const prevQuantity = currentGroup.quantity - trade.quantity;
              currentGroup.exitPrice = ((currentGroup.exitPrice * prevQuantity) + (trade.exitPrice * trade.quantity)) / totalQuantity;
            } else if (trade.exitPrice) {
              currentGroup.exitPrice = trade.exitPrice;
            }
          }

          // Preserve instrument type from trade if not already set in group
          if (!currentGroup.instrumentType && trade.instrumentType) {
            currentGroup.instrumentType = trade.instrumentType;
            if (trade.pointValue) {
              currentGroup.pointValue = trade.pointValue;
            }
            if (trade.contractSize !== undefined) {
              currentGroup.contractSize = trade.contractSize;
            }
          }

          // Recalculate P&L from combined entry/exit prices and total fees
          // This ensures consistency with the weighted average prices
          // Use the same calculation method as Trade.calculatePnL to ensure exact match
          if (currentGroup.exitPrice && currentGroup.side && currentGroup.entryPrice && currentGroup.quantity > 0) {
            // Determine multiplier using same logic as Trade.calculatePnL
            let multiplier;
            if (currentGroup.instrumentType === 'future') {
              multiplier = currentGroup.pointValue || 1;
            } else if (currentGroup.instrumentType === 'option') {
              multiplier = currentGroup.contractSize || 100;
            } else {
              multiplier = 1;
            }

            // Calculate P&L using exact same formula as Trade.calculatePnL
            let pnl;
            if (currentGroup.side === 'long') {
              pnl = (currentGroup.exitPrice - currentGroup.entryPrice) * currentGroup.quantity * multiplier;
            } else {
              pnl = (currentGroup.entryPrice - currentGroup.exitPrice) * currentGroup.quantity * multiplier;
            }

            // Subtract commission and fees (matches Trade.calculatePnL: totalPnL = pnl - commission - fees)
            currentGroup.pnl = pnl - (currentGroup.commission || 0) - (currentGroup.fees || 0);
            currentGroup.profitLoss = currentGroup.pnl; // Set both for compatibility

            // Recalculate PL% based on the recalculated P&L and entry value
            const entryValue = currentGroup.entryPrice * currentGroup.quantity * multiplier;
            if (entryValue > 0) {
              currentGroup.pnlPercent = (currentGroup.pnl / entryValue) * 100;
            } else {
              currentGroup.pnlPercent = 0;
            }
          } else {
            // If exit price not available, fall back to summing P&L (for open positions)
            const tradePnl = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
            const groupPnl = currentGroup.pnl !== undefined ? currentGroup.pnl : (currentGroup.profitLoss || 0);
            const totalPnl = groupPnl + tradePnl;
            currentGroup.pnl = totalPnl;
            currentGroup.profitLoss = totalPnl;

            // Recalculate PL% for open positions by summing entry values
            // Calculate entry value from the grouped trade
            let multiplier;
            if (currentGroup.instrumentType === 'future') {
              multiplier = currentGroup.pointValue || 1;
            } else if (currentGroup.instrumentType === 'option') {
              multiplier = currentGroup.contractSize || 100;
            } else {
              multiplier = 1;
            }
            const groupEntryValue = currentGroup.entryPrice * currentGroup.quantity * multiplier;

            // Calculate entry value for the trade being added
            let tradeMultiplier;
            if (trade.instrumentType === 'future') {
              tradeMultiplier = trade.pointValue || 1;
            } else if (trade.instrumentType === 'option') {
              tradeMultiplier = trade.contractSize || 100;
            } else {
              tradeMultiplier = 1;
            }
            const tradeEntryValue = trade.entryPrice * trade.quantity * tradeMultiplier;

            const totalEntryValue = groupEntryValue + tradeEntryValue;
            if (totalEntryValue > 0) {
              currentGroup.pnlPercent = (totalPnl / totalEntryValue) * 100;
            } else {
              currentGroup.pnlPercent = 0;
            }
          }

          // Keep original notes without merging
          if (!currentGroup.originalNotes) {
            currentGroup.originalNotes = currentGroup.notes;
          }
        } else {
          // Time gap exceeded or different side, save current group and start new one
          const reason = trade.side !== currentGroup.side ? 'different side' : `gap exceeded (${timeSinceLastEntry.toFixed(1)}min)`;
          console.log(`  [GROUPING] ${reason}, starting new group`);
          groupedTrades.push(currentGroup);
          // Handle both 'pnl' and 'profitLoss' field names
          const newGroupPnl = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
          currentGroup = {
            ...trade,
            pnl: newGroupPnl, // Ensure pnl field is set
            profitLoss: newGroupPnl, // Set both for compatibility
            groupedTrades: 1,
            executionData: trade.executionData || trade.executions || [{
              entryTime: trade.entryTime,
              entryPrice: trade.entryPrice,
              exitTime: trade.exitTime,
              exitPrice: trade.exitPrice,
              quantity: trade.quantity,
              side: trade.side,
              commission: trade.commission || 0,
              fees: trade.fees || 0,
              pnl: newGroupPnl
            }]
          };
          lastEntryTime = entryTime;
          console.log(`  [GROUPING] Started new group at ${trade.entryTime}`);
        }
      }
    }

    // Add final group for this symbol
    if (currentGroup) {
      groupedTrades.push(currentGroup);
    }
  }

  console.log(`[SUCCESS] Grouped ${trades.length} trades into ${groupedTrades.length} trades`);
  return groupedTrades;
}

/**
 * Helper to wrap parsing results with diagnostics
 * @param {Array} trades - Parsed trades array
 * @param {Object} diagnostics - Diagnostics object
 * @param {Array} unresolvedCusips - Optional unresolved CUSIPs
 * @returns {Object} - { trades, diagnostics, unresolvedCusips }
 */
/**
 * Convert all naive datetime fields in trades to UTC using the user's timezone.
 * Fields that already have a Z suffix or timezone offset are left unchanged.
 * Also converts datetime fields inside execution arrays.
 *
 * @param {Array} trades - Array of trade objects
 * @param {string} timezone - IANA timezone (e.g., "America/New_York")
 * @returns {Array} trades with datetime fields converted to UTC
 */
function convertTradeDatetimesToUTC(trades, timezone) {
  if (!timezone || timezone === 'UTC' || !trades || trades.length === 0) {
    return trades;
  }

  const datetimeFields = ['entryTime', 'exitTime', 'entry_time', 'exit_time'];
  const executionDatetimeFields = ['datetime', 'time', 'entry_time', 'exit_time', 'entryTime', 'exitTime'];
  const executionFields = ['executions', 'executionData', 'execution'];

  for (const trade of trades) {
    for (const field of datetimeFields) {
      if (trade[field] && typeof trade[field] === 'string') {
        trade[field] = localToUTC(trade[field], timezone);
      }
    }

    // Also convert execution datetimes if present
    for (const executionField of executionFields) {
      const executions = trade[executionField];
      if (Array.isArray(executions)) {
        for (const exec of executions) {
          for (const field of executionDatetimeFields) {
            if (exec[field] && typeof exec[field] === 'string') {
              exec[field] = localToUTC(exec[field], timezone);
            }
          }
        }
      }
    }
  }

  return trades;
}

function normalizeExecutionCollections(trades) {
  if (!Array.isArray(trades) || trades.length === 0) {
    return trades;
  }

  const executionFields = ['executions', 'executionData', 'execution'];
  const compareExecutionOrderIds = (left, right) => {
    if (!left || !right) return 0;
    const leftOrderId = left.orderId ?? left.orderID ?? left.tradeId ?? left.tradeID ?? '';
    const rightOrderId = right.orderId ?? right.orderID ?? right.tradeId ?? right.tradeID ?? '';
    if (!leftOrderId || !rightOrderId) return 0;

    return String(leftOrderId).localeCompare(String(rightOrderId), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  };

  for (const trade of trades) {
    for (const field of executionFields) {
      if (!Array.isArray(trade[field])) continue;

      const seen = new Set();
      trade[field] = trade[field]
        .filter(Boolean)
        .sort((left, right) => {
          const leftTime = new Date(left.datetime || left.entryTime || left.entry_time || 0).getTime();
          const rightTime = new Date(right.datetime || right.entryTime || right.entry_time || 0).getTime();
          if (leftTime !== rightTime) {
            return leftTime - rightTime;
          }

          const orderDiff = compareExecutionOrderIds(left, right);
          if (orderDiff !== 0) {
            return orderDiff;
          }

          const leftSourceIndex = Number(left.sourceIndex ?? left.source_index ?? 0);
          const rightSourceIndex = Number(right.sourceIndex ?? right.source_index ?? 0);
          if (leftSourceIndex !== rightSourceIndex) {
            return leftSourceIndex - rightSourceIndex;
          }

          return 0;
        })
        .filter((execution) => {
          // An IBKR order can contain multiple fills. Only fill-level identifiers
          // are safe for collapsing execution rows; an order ID alone is not.
          const identifierKey =
            execution.execution_id ??
            execution.executionId ??
            execution.ibExecID ??
            execution.ib_exec_id ??
            execution.sequenceNumber ??
            execution.sequence_number ??
            execution.trade_id ??
            execution.tradeId ??
            execution.tradeID ??
            null;

          if (identifierKey === null || identifierKey === undefined || identifierKey === '') {
            return true;
          }

          const dedupeKey = String(identifierKey);

          if (seen.has(dedupeKey)) {
            return false;
          }

          seen.add(dedupeKey);
          return true;
        });
    }
  }

  return trades;
}

function getExecutionSignedQuantity(execution) {
  const action = String(execution.action || execution.side || '').toLowerCase();
  const quantity = Number(execution.quantity || 0);
  if (!quantity) return 0;
  if (action === 'buy' || action === 'cover') return quantity;
  if (action === 'sell' || action === 'short') return -quantity;
  return 0;
}

function getTradeValueMultiplier(trade) {
  if (trade?.instrumentType === 'future' || trade?.instrument_type === 'future') {
    return Number(trade.pointValue || trade.point_value || 1);
  }
  if (trade?.instrumentType === 'option' || trade?.instrument_type === 'option') {
    return Number(trade.contractSize || trade.contract_size || 100);
  }
  return 1;
}

function normalizeParsedTradeInstrumentData(trade) {
  if (!trade || !trade.symbol) return trade;

  const parsed = parseInstrumentData(trade.symbol);
  const currentType = trade.instrumentType || trade.instrument_type;
  const currentContractSize = trade.contractSize ?? trade.contract_size;
  const currentPointValue = trade.pointValue ?? trade.point_value;

  // Only promote a stock to futures when we have the fields the DB requires
  // (contract_month, contract_year, underlying_asset). Promoting without them
  // would violate the check_futures_fields constraint and fail the import.
  const canPromoteToFuture = parsed.instrumentType === 'future' &&
    parsed.underlyingAsset && parsed.contractMonth != null && parsed.contractYear != null;
  const canPromote = parsed.instrumentType === 'option' || canPromoteToFuture;

  if ((!currentType || currentType === 'stock') && canPromote) {
    trade.instrumentType = parsed.instrumentType;
    if (parsed.underlyingSymbol && !trade.underlyingSymbol && !trade.underlying_symbol) {
      trade.underlyingSymbol = parsed.underlyingSymbol;
    }
    if (parsed.strikePrice != null && trade.strikePrice == null && trade.strike_price == null) {
      trade.strikePrice = parsed.strikePrice;
    }
    if (parsed.expirationDate && !trade.expirationDate && !trade.expiration_date) {
      trade.expirationDate = parsed.expirationDate;
    }
    if (parsed.optionType && !trade.optionType && !trade.option_type) {
      trade.optionType = parsed.optionType;
    }
    if (parsed.instrumentType === 'future') {
      if (!trade.underlyingAsset && !trade.underlying_asset) {
        trade.underlyingAsset = parsed.underlyingAsset;
      }
      if (trade.contractMonth == null && trade.contract_month == null) {
        trade.contractMonth = parsed.contractMonth;
      }
      if (trade.contractYear == null && trade.contract_year == null) {
        trade.contractYear = parsed.contractYear;
      }
      if ((trade.pointValue == null && trade.point_value == null) && parsed.pointValue != null) {
        trade.pointValue = parsed.pointValue;
      }
    }
  }

  const normalizedType = trade.instrumentType || trade.instrument_type;
  if (normalizedType === 'option' && (currentContractSize == null || Number(currentContractSize) <= 0)) {
    trade.contractSize = Number(parsed.contractSize || 100);
  } else if (normalizedType === 'future' && (currentPointValue == null || Number(currentPointValue) <= 0) && parsed.pointValue) {
    trade.pointValue = Number(parsed.pointValue);
  }

  return trade;
}

function cloneTradeMetadata(trade) {
  return {
    symbol: trade.symbol,
    tradeDate: trade.tradeDate || trade.trade_date,
    broker: trade.broker,
    accountIdentifier: trade.accountIdentifier || trade.account_identifier,
    instrumentType: trade.instrumentType || trade.instrument_type,
    strikePrice: trade.strikePrice || trade.strike_price,
    expirationDate: trade.expirationDate || trade.expiration_date,
    optionType: trade.optionType || trade.option_type,
    contractSize: trade.contractSize || trade.contract_size,
    pointValue: trade.pointValue || trade.point_value,
    underlyingSymbol: trade.underlyingSymbol || trade.underlying_symbol,
    contractMonth: trade.contractMonth || trade.contract_month,
    contractYear: trade.contractYear || trade.contract_year,
    tickSize: trade.tickSize || trade.tick_size,
    underlyingAsset: trade.underlyingAsset || trade.underlying_asset,
    brokerConnectionId: trade.brokerConnectionId || trade.broker_connection_id
  };
}

function finalizeRepairedTrade(trade, valueMultiplier) {
  if (!trade) return null;

  trade.entryPrice = trade.totalQuantity > 0
    ? trade.entryValue / (trade.totalQuantity * valueMultiplier)
    : null;
  trade.quantity = trade.currentPosition === 0 ? trade.totalQuantity : Math.abs(trade.currentPosition);
  trade.commission = trade.totalFees;
  trade.fees = 0;
  trade.executionData = trade.executions;

  let entryCommission = 0;
  let exitCommission = 0;
  trade.executions.forEach((exec) => {
    if ((trade.side === 'long' && exec.action === 'buy') || (trade.side === 'short' && exec.action === 'sell')) {
      entryCommission += Number(exec.fees || exec.commission || 0);
    } else {
      exitCommission += Number(exec.fees || exec.commission || 0);
    }
  });
  trade.entryCommission = entryCommission;
  trade.exitCommission = exitCommission;

  const { entryTime, exitTime } = getExecutionTimeBounds(trade.executions);
  trade.entryTime = entryTime || trade.entryTime;

  if (trade.currentPosition === 0) {
    trade.exitPrice = trade.totalQuantity > 0
      ? trade.exitValue / (trade.totalQuantity * valueMultiplier)
      : null;
    trade.exitTime = exitTime || trade.exitTime;
    trade.pnl = trade.side === 'long'
      ? trade.exitValue - trade.entryValue - trade.totalFees
      : trade.entryValue - trade.exitValue - trade.totalFees;
    trade.pnlPercent = trade.entryValue > 0 ? (trade.pnl / trade.entryValue) * 100 : 0;
    trade.notes = trade.notes || `Round trip: ${trade.executions.length} executions`;
  } else {
    trade.exitPrice = null;
    trade.exitTime = null;
    trade.pnl = 0;
    trade.pnlPercent = 0;
    trade.notes = trade.notes || `Open position: ${trade.executions.length} executions`;
  }

  delete trade.currentPosition;
  delete trade.entryValue;
  delete trade.exitValue;
  delete trade.totalFees;
  delete trade.totalQuantity;
  return trade;
}

function rebuildTradeFromExecutions(trade) {
  const executions = Array.isArray(trade.executions) ? trade.executions.filter(Boolean) : [];
  if (executions.length === 0) {
    return [trade];
  }

  const valueMultiplier = getTradeValueMultiplier(trade);
  const metadata = cloneTradeMetadata(trade);
  const rebuilt = [];
  let current = null;
  let currentPosition = 0;

  const startTrade = (execution, signedQty, feePortion, explicitQuantity = null) => {
    const quantity = explicitQuantity ?? Math.abs(signedQty);
    current = {
      ...metadata,
      side: signedQty > 0 ? 'long' : 'short',
      tradeDate: trade.tradeDate || trade.trade_date || (execution.datetime || execution.entryTime || '').split('T')[0],
      entryTime: execution.datetime || execution.entryTime || execution.entry_time || null,
      executions: [{
        ...execution,
        quantity,
        fees: feePortion
      }],
      totalQuantity: quantity,
      totalFees: feePortion,
      entryValue: quantity * Number(execution.price ?? execution.entryPrice ?? 0) * valueMultiplier,
      exitValue: 0,
      currentPosition: signedQty > 0 ? quantity : -quantity
    };
    currentPosition = current.currentPosition;
  };

  for (const execution of executions) {
    const signedQty = getExecutionSignedQuantity(execution);
    if (!signedQty) continue;

    const execPrice = Number(execution.price ?? execution.entryPrice ?? execution.exitPrice ?? 0);
    const execFees = Number(execution.fees ?? execution.commission ?? 0);

    if (!current || currentPosition === 0) {
      startTrade(execution, signedQty, execFees);
      continue;
    }

    const sameDirection = (currentPosition > 0 && signedQty > 0) || (currentPosition < 0 && signedQty < 0);
    if (sameDirection) {
      current.executions.push({ ...execution, fees: execFees });
      current.totalFees += execFees;
      current.totalQuantity += Math.abs(signedQty);
      current.entryValue += Math.abs(signedQty) * execPrice * valueMultiplier;
      currentPosition = normalizePositionQuantity(currentPosition + signedQty);
      current.currentPosition = currentPosition;
      continue;
    }

    const closeQty = Math.min(Math.abs(currentPosition), Math.abs(signedQty));
    const reversalQty = Math.abs(signedQty) - closeQty;
    const closeFee = Math.abs(signedQty) > 0 ? execFees * (closeQty / Math.abs(signedQty)) : 0;
    const openFee = execFees - closeFee;
    const closeAction = current.side === 'long' ? 'sell' : 'buy';

    current.executions.push({
      ...execution,
      action: closeAction,
      quantity: closeQty,
      fees: closeFee
    });
    current.totalFees += closeFee;
    current.exitValue += closeQty * execPrice * valueMultiplier;
    currentPosition = normalizePositionQuantity(currentPosition + (signedQty > 0 ? closeQty : -closeQty));
    current.currentPosition = currentPosition;

    if (currentPosition === 0) {
      rebuilt.push(finalizeRepairedTrade(current, valueMultiplier));
      current = null;
    }

    if (reversalQty > 0) {
      const reversalSignedQty = signedQty > 0 ? reversalQty : -reversalQty;
      startTrade(execution, reversalSignedQty, openFee, reversalQty);
    }
  }

  if (current) {
    rebuilt.push(finalizeRepairedTrade(current, valueMultiplier));
  }

  return rebuilt.length > 0 ? rebuilt : [trade];
}

function repairTradeReversals(trades, diagnostics) {
  if (!Array.isArray(trades) || trades.length === 0) {
    return trades;
  }

  const repairedTrades = [];

  for (const trade of trades) {
    const executions = Array.isArray(trade.executions) ? trade.executions : [];
    if (executions.length === 0) {
      repairedTrades.push(trade);
      continue;
    }

    let position = 0;
    let sawFlip = false;
    for (const execution of executions) {
      const signedQty = getExecutionSignedQuantity(execution);
      if (!signedQty) continue;
      const previous = position;
      position = normalizePositionQuantity(position + signedQty);
      if (previous !== 0 && position !== 0 && Math.sign(previous) !== Math.sign(position)) {
        sawFlip = true;
        break;
      }
    }

    const storedQuantity = Number(trade.quantity || 0);
    const storedSide = String(trade.side || '').toLowerCase();
    const isStoredOpen = !trade.exitPrice && !trade.exit_price && !trade.exitTime && !trade.exit_time;
    const netQuantity = Math.abs(position);
    const sideMismatch =
      position !== 0 &&
      storedSide &&
      ((position > 0 && storedSide !== 'long') || (position < 0 && storedSide !== 'short'));
    const quantityMismatch =
      position !== 0 &&
      storedQuantity > 0 &&
      Math.abs(netQuantity - storedQuantity) > POSITION_CLOSE_TOLERANCE;
    const statusMismatch =
      (position === 0 && isStoredOpen) ||
      (position !== 0 && !isStoredOpen);

    if (!sawFlip && !sideMismatch && !quantityMismatch && !statusMismatch) {
      repairedTrades.push(trade);
      continue;
    }

    const rebuilt = rebuildTradeFromExecutions(trade);
    const reasons = [];
    if (sawFlip) reasons.push('reversal');
    if (sideMismatch) reasons.push('side mismatch');
    if (quantityMismatch) reasons.push('quantity mismatch');
    if (statusMismatch) reasons.push('status mismatch');
    diagnostics.warnings.push(`Repaired inconsistent trade for ${trade.symbol} into ${rebuilt.length} trades (${reasons.join(', ')})`);
    repairedTrades.push(...rebuilt);
  }

  return repairedTrades;
}

module.exports = {
  applyTradeGrouping,
  convertTradeDatetimesToUTC,
  normalizeExecutionCollections,
  getExecutionSignedQuantity,
  getTradeValueMultiplier,
  normalizeParsedTradeInstrumentData,
  cloneTradeMetadata,
  finalizeRepairedTrade,
  rebuildTradeFromExecutions,
  repairTradeReversals
};
