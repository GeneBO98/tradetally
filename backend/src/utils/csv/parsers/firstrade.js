const cache = require('../../cache');
const cusipQueue = require('../../cusipQueue');
const db = require('../../../config/database');
const { extractAccountFromRecord } = require('../detect');
const { normalizeExecutionCollections } = require('../grouping');
const { parseDate, getExecutionTimeBounds, cleanString, parseInstrumentData, parseNumeric } = require('../shared');


async function parseFirstradeTransactions(records, existingPositions = {}, userId = null, context = {}) {
  console.log(`\n=== FIRSTRADE TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} Firstrade transaction records`);

  const diagnostics = context.diagnostics;
  const transactions = [];
  const completedTrades = [];

  function parseFirstradeOptionDescription(description) {
    if (!description) return null;

    const match = String(description).match(/\b(PUT|CALL)\s+([A-Z.\-]+)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d+(?:\.\d+)?)/i);
    if (!match) return null;

    const [, type, underlying, expirationRaw, strike] = match;
    const [month, day, year] = expirationRaw.split('/');
    const fullYear = parseInt(year, 10) < 50 ? `20${year}` : `19${year}`;

    return {
      symbol: underlying,
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: parseFloat(strike),
      expirationDate: `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      optionType: type.toLowerCase(),
      contractSize: 100
    };
  }

  function buildIndexedDateTime(tradeDate, rowIndex) {
    if (!tradeDate) return null;
    const base = new Date(`${tradeDate}T09:30:00`);
    if (Number.isNaN(base.getTime())) return null;
    base.setSeconds(base.getSeconds() + rowIndex);
    return base.toISOString().slice(0, 19);
  }

  // Firstrade tucks one or more "EXEC TIME: YYYY-MM-DD HH:MM:SS" hints into the
  // Description column for orders that didn't fill at the row's settle time.
  // Use the earliest stamp when present so trades reconstruct in real order.
  function extractExecTime(description) {
    if (!description) return null;
    const matches = String(description).match(/EXEC TIME:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/gi);
    if (!matches || matches.length === 0) return null;
    let earliest = null;
    for (const raw of matches) {
      const m = raw.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
      if (!m) continue;
      const stamp = `${m[1]}T${m[2]}`;
      if (!earliest || stamp < earliest) earliest = stamp;
    }
    return earliest;
  }

  // CUSIPs starting with 9128 are US Treasury notes/bonds; description fallback
  // catches non-standard rows. Treasuries are quoted as % of face value, so
  // qty * price gives a wildly inflated cash basis. Use the CSV Amount column
  // (the actual cash flow) instead.
  function isTreasuryInstrument(cusip, description) {
    if (cusip && /^9128/.test(cusip)) return true;
    if (description && /TREASURY (NOTE|BOND|BILL)|T-BILL|TREASURY INFLATION/i.test(description)) return true;
    return false;
  }

  // Firstrade leaves the Symbol column blank for treasuries. Parse the
  // maturity and coupon out of the description (Bloomberg-style "T 4.25
  // 12/31/26") so the trade isn't tagged with the raw 9-char CUSIP.
  function parseTreasurySymbol(description, cusip) {
    if (description) {
      const match = String(description).match(/TREASURY\s+(?:NOTE|BOND|BILL)\s+DUE\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d+(?:\.\d+)?)/i);
      if (match) {
        const [, mm, dd, yyyy, rate] = match;
        const cleanRate = parseFloat(rate).toString();
        return `T ${cleanRate} ${mm.padStart(2, '0')}/${dd.padStart(2, '0')}/${yyyy.slice(2)}`;
      }
    }
    return cusip ? `UST-${cusip}` : null;
  }

  // Firstrade records option assignment, exercise, and expiration as
  // RecordType=Financial rows (not BUY/SELL). Without synthetic close
  // transactions, the underlying option position stays "open" in the parser
  // output even though it no longer exists in the user's account.
  function extractOptionLifecycleEvents(records) {
    const events = [];
    let recIndex = 0;
    for (const record of records) {
      recIndex++;
      const recordType = cleanString(record.RecordType).toLowerCase();
      if (recordType !== 'financial') continue;

      const description = cleanString(record.Description);
      if (!/\b(ASSIGNED|EXPIRED|EXERCISED)\b/i.test(description)) continue;

      const optionData = parseFirstradeOptionDescription(description);
      if (!optionData) continue;

      const tradeDate = parseDate(record.TradeDate || record['Trade Date']);
      if (!tradeDate) continue;

      const groupKey = `${optionData.underlyingSymbol || optionData.symbol}_${optionData.expirationDate}_${optionData.optionType}_${optionData.strikePrice}`;
      events.push({
        groupKey,
        date: tradeDate,
        description,
        instrumentData: optionData,
        sourceRowIndex: recIndex
      });
    }
    return events;
  }

  const cusipsToResolve = new Set();
  for (const record of records) {
    const cusip = cleanString(record.CUSIP);
    if (cusip && cusip.length === 9 && /^[0-9A-Z]{8}[0-9]$/.test(cusip)) {
      cusipsToResolve.add(cusip);
    }
  }

  const cusipToTickerMap = {};
  const unresolvedCusips = [];

  for (const cusip of cusipsToResolve) {
    let resolved = false;

    try {
      const result = await db.query('SELECT * FROM get_cusip_mapping($1, $2)', [cusip, userId]);
      if (result.rows.length > 0) {
        cusipToTickerMap[cusip] = result.rows[0].ticker;
        resolved = true;
      }
    } catch (error) {
      console.warn(`[FIRSTRADE][CUSIP] Failed to check database for ${cusip}:`, error.message);
    }

    if (!resolved) {
      try {
        const cached = await cache.get('cusip_resolution', cusip);
        if (cached) {
          cusipToTickerMap[cusip] = cached;
          resolved = true;
        }
      } catch (error) {
        console.warn(`[FIRSTRADE][CUSIP] Failed to check cache for ${cusip}:`, error.message);
      }
    }

    if (!resolved) {
      unresolvedCusips.push(cusip);
    }
  }

  if (unresolvedCusips.length > 0) {
    await cusipQueue.addToQueue(unresolvedCusips, 2);
  }

  let rowIndex = 0;
  for (const record of records) {
    rowIndex++;

    try {
      const recordType = cleanString(record.RecordType).toLowerCase();
      const action = cleanString(record.Action).toUpperCase();
      const description = cleanString(record.Description);

      if (recordType !== 'trade') {
        if (diagnostics) diagnostics.skippedRows++;
        continue;
      }

      if (action !== 'BUY' && action !== 'SELL') {
        if (diagnostics) diagnostics.skippedRows++;
        continue;
      }

      const optionData = parseFirstradeOptionDescription(description);
      const rawCusip = cleanString(record.CUSIP);
      const rawSymbol = cleanString(record.Symbol);
      const resolvedCusipSymbol = rawCusip ? cusipToTickerMap[rawCusip] : null;
      const treasury = isTreasuryInstrument(rawCusip, description);
      const treasurySymbol = treasury ? parseTreasurySymbol(description, rawCusip) : null;
      const resolvedSymbol = rawSymbol || optionData?.symbol || resolvedCusipSymbol || treasurySymbol || rawCusip;

      const quantity = Math.abs(parseNumeric(record.Quantity, 0));
      const rawPrice = parseNumeric(record.Price, 0);
      const rawAmount = parseNumeric(record.Amount, 0);
      const tradeDate = parseDate(record.TradeDate || record['Trade Date']);
      const execTime = extractExecTime(description);
      const datetime = execTime || buildIndexedDateTime(tradeDate, rowIndex);

      // For treasuries, derive a synthetic per-share price from the CSV Amount
      // column so qty * price equals the actual cash flow.
      const price = treasury && quantity > 0 && rawAmount !== 0
        ? Math.abs(rawAmount) / quantity
        : rawPrice;

      if (!resolvedSymbol || !tradeDate || !datetime || quantity <= 0 || price < 0) {
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: rowIndex, reason: 'Missing required Firstrade trade fields' });
        }
        continue;
      }

      // Option rows from Firstrade roll exchange/regulatory fees into Amount
      // without itemising them in the Fee column. Derive the row's total
      // commission+fees from the cash-flow gap (gross premium vs Amount), then
      // split it: explicit Commission stays as commission, everything else is
      // fees. This makes the realised P&L match the user's actual cash flow.
      let rowCommission = Math.abs(parseNumeric(record.Commission, 0));
      let rowFees = Math.abs(parseNumeric(record.Fee, 0));
      if (optionData && quantity > 0 && rawAmount !== 0) {
        const grossValue = quantity * rawPrice * 100;
        const totalFromCash = Math.abs(Math.abs(rawAmount) - grossValue);
        rowFees = Math.max(rowFees, totalFromCash - rowCommission);
      }

      const instrumentData = optionData || parseInstrumentData(resolvedSymbol);
      const groupingSymbol = instrumentData.instrumentType === 'option'
        ? (instrumentData.underlyingSymbol || resolvedSymbol)
        : resolvedSymbol;
      const contractKey = instrumentData.instrumentType === 'option'
        ? `${groupingSymbol}_${instrumentData.expirationDate}_${instrumentData.optionType}_${instrumentData.strikePrice}`
        : groupingSymbol;
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol: groupingSymbol,
        groupKey: contractKey,
        date: tradeDate,
        datetime,
        hasExplicitTime: !!execTime,
        action: action === 'BUY' ? 'buy' : 'sell',
        quantity,
        price,
        commission: rowCommission,
        fees: rowFees,
        description,
        accountIdentifier,
        instrumentData,
        rowIndex
      });
    } catch (error) {
      console.error('Error parsing Firstrade transaction:', error, record);
      if (diagnostics) {
        diagnostics.invalidRows++;
        diagnostics.skippedReasons.push({ row: rowIndex, reason: `Parse error: ${error.message}` });
      }
    }
  }

  // Inject synthetic close transactions for option assignment/exercise/expiry
  // recorded as Financial rows. The Quantity column on those rows is unreliable
  // (sometimes signed, sometimes magnitude), so close whatever net option
  // position exists for that contract at price=0. Existing-position carryovers
  // are folded into the net so a previously open contract can also be closed.
  const lifecycleEvents = extractOptionLifecycleEvents(records);
  if (lifecycleEvents.length > 0) {
    const netByGroup = {};
    for (const t of transactions) {
      netByGroup[t.groupKey] = (netByGroup[t.groupKey] || 0) + (t.action === 'buy' ? t.quantity : -t.quantity);
    }
    for (const [key, pos] of Object.entries(existingPositions || {})) {
      if (!pos || pos.instrumentType !== 'option') continue;
      const signed = pos.side === 'short' ? -Math.abs(pos.quantity || 0) : Math.abs(pos.quantity || 0);
      netByGroup[key] = (netByGroup[key] || 0) + signed;
    }

    let synthIdx = 0;
    for (const event of lifecycleEvents) {
      const net = netByGroup[event.groupKey] || 0;
      if (net === 0) continue;
      const closeAction = net > 0 ? 'sell' : 'buy';
      const closeQty = Math.abs(net);
      transactions.push({
        symbol: event.instrumentData.underlyingSymbol || event.instrumentData.symbol,
        groupKey: event.groupKey,
        date: event.date,
        datetime: `${event.date}T16:00:0${Math.min(synthIdx, 9)}`,
        hasExplicitTime: false,
        action: closeAction,
        quantity: closeQty,
        price: 0,
        commission: 0,
        fees: 0,
        description: `[Auto-close: ${event.description.slice(0, 80)}]`,
        accountIdentifier: null,
        instrumentData: event.instrumentData,
        rowIndex: 1_000_000 + event.sourceRowIndex,
        isSyntheticClose: true
      });
      netByGroup[event.groupKey] = 0;
      synthIdx++;
    }
  }

  // Firstrade CSVs don't preserve execution order. Within a same-day, same-group
  // bucket, infer ordering from the day's net flow: long-net days process BUYs
  // before SELLs (and the reverse for short-net days). Otherwise an existing
  // long position closing via SELL gets misclassified as opening a short.
  const netFlowByGroupDate = {};
  for (const t of transactions) {
    const key = `${t.groupKey}|${t.date}`;
    if (!(key in netFlowByGroupDate)) netFlowByGroupDate[key] = 0;
    netFlowByGroupDate[key] += t.action === 'buy' ? t.quantity : -t.quantity;
  }

  transactions.sort((a, b) => {
    if (a.groupKey !== b.groupKey) return a.groupKey.localeCompare(b.groupKey);
    if (a.date !== b.date) return a.date.localeCompare(b.date);

    if (a.action !== b.action) {
      const netFlow = netFlowByGroupDate[`${a.groupKey}|${a.date}`] || 0;
      if (netFlow > 0) return a.action === 'buy' ? -1 : 1;
      if (netFlow < 0) return a.action === 'sell' ? -1 : 1;
    }

    if (a.datetime !== b.datetime) return a.datetime.localeCompare(b.datetime);
    return a.rowIndex - b.rowIndex;
  });

  // Rewrite datetimes monotonically within each group so that the downstream
  // execution-level sort (normalizeExecutionCollections) preserves this order
  // instead of undoing it. Real EXEC TIMEs are kept when they don't break
  // monotonicity; everything else gets bumped by a second from the previous.
  const lastDatetimeByGroup = {};
  for (const t of transactions) {
    const last = lastDatetimeByGroup[t.groupKey];
    if (last && t.datetime <= last) {
      const d = new Date(`${last}Z`);
      d.setUTCSeconds(d.getUTCSeconds() + 1);
      t.datetime = d.toISOString().slice(0, 19);
    }
    lastDatetimeByGroup[t.groupKey] = t.datetime;
  }

  const transactionsByGroup = {};
  for (const transaction of transactions) {
    if (!transactionsByGroup[transaction.groupKey]) {
      transactionsByGroup[transaction.groupKey] = [];
    }
    transactionsByGroup[transaction.groupKey].push(transaction);
  }

  function startTrade(transaction, existingPosition = null) {
    const valueMultiplier = transaction.instrumentData.contractSize || (transaction.instrumentData.instrumentType === 'option' ? 100 : 1);
    const existingExecutions = normalizeExecutionCollections([{
      executions: Array.isArray(existingPosition?.executions)
        ? existingPosition.executions
        : (existingPosition?.executions ? JSON.parse(existingPosition.executions) : [])
    }])[0].executions;

    return {
      symbol: transaction.symbol,
      tradeDate: existingPosition?.tradeDate || transaction.date,
      entryTime: existingPosition?.entryTime || transaction.datetime,
      side: existingPosition?.side || (transaction.action === 'buy' ? 'long' : 'short'),
      executions: existingExecutions,
      totalQuantity: existingPosition?.quantity || 0,
      totalCommission: existingPosition?.commission || 0,
      totalFees: existingPosition?.fees || 0,
      entryValue: (existingPosition?.quantity || 0) * (existingPosition?.entryPrice || 0) * valueMultiplier,
      exitValue: 0,
      broker: existingPosition?.broker || 'firstrade',
      accountIdentifier: transaction.accountIdentifier || existingPosition?.accountIdentifier || null,
      isExistingPosition: !!existingPosition,
      existingTradeId: existingPosition?.id,
      newExecutionsAdded: 0,
      instrumentData: transaction.instrumentData
    };
  }

  function appendExecution(trade, transaction, quantityPortion, commissionPortion, feePortion) {
    trade.executions.push({
      action: transaction.action,
      quantity: quantityPortion,
      price: transaction.price,
      datetime: transaction.datetime,
      commission: commissionPortion,
      fees: feePortion
    });
    trade.totalCommission += commissionPortion;
    trade.totalFees += feePortion;
    if (trade.isExistingPosition) {
      trade.newExecutionsAdded++;
    }
  }

  function finalizeTrade(trade) {
    const instrumentData = trade.instrumentData;
    const valueMultiplier = instrumentData.contractSize || (instrumentData.instrumentType === 'option' ? 100 : 1);

    if (trade.totalQuantity <= 0) {
      return null;
    }

    const totalCost = trade.totalCommission + trade.totalFees;
    trade.entryPrice = trade.entryValue / (trade.totalQuantity * valueMultiplier);
    trade.exitPrice = trade.exitValue / (trade.totalQuantity * valueMultiplier);
    trade.quantity = trade.totalQuantity;
    trade.commission = trade.totalCommission;
    trade.fees = trade.totalFees;
    trade.pnl = trade.side === 'long'
      ? trade.exitValue - trade.entryValue - totalCost
      : trade.entryValue - trade.exitValue - totalCost;
    trade.pnlPercent = trade.entryValue ? (trade.pnl / trade.entryValue) * 100 : 0;

    const { entryTime, exitTime } = getExecutionTimeBounds(trade.executions);
    if (entryTime) trade.entryTime = entryTime;
    if (exitTime) trade.exitTime = exitTime;

    trade.executionData = trade.executions;
    Object.assign(trade, instrumentData);

    if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
      trade.symbol = instrumentData.underlyingSymbol;
    }

    if (trade.isExistingPosition) {
      trade.isUpdate = trade.newExecutionsAdded > 0;
    }

    delete trade.instrumentData;
    return trade;
  }

  for (const groupKey of Object.keys(transactionsByGroup)) {
    const groupTransactions = transactionsByGroup[groupKey];
    const firstTransaction = groupTransactions[0];
    const instrumentData = firstTransaction.instrumentData;
    const valueMultiplier = instrumentData.contractSize || (instrumentData.instrumentType === 'option' ? 100 : 1);

    let existingPosition = existingPositions[groupKey] || existingPositions[firstTransaction.symbol];
    if (!existingPosition && instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
      existingPosition = existingPositions[instrumentData.underlyingSymbol];
    }

    let currentPosition = existingPosition
      ? (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity)
      : 0;
    let currentTrade = existingPosition ? startTrade(firstTransaction, existingPosition) : null;

    for (const transaction of groupTransactions) {
      let remainingQty = transaction.quantity;
      let remainingCommission = transaction.commission;
      let remainingFees = transaction.fees;

      while (remainingQty > 0) {
        if (currentPosition === 0 || !currentTrade) {
          currentTrade = startTrade(transaction);
        }

        const sameDirection = (currentPosition >= 0 && transaction.action === 'buy') ||
          (currentPosition <= 0 && transaction.action === 'sell');

        const consumeQty = sameDirection ? remainingQty : Math.min(Math.abs(currentPosition), remainingQty);
        const isFinalPortion = remainingQty === consumeQty;
        const ratio = isFinalPortion ? 1 : (consumeQty / remainingQty);
        const commissionPortion = isFinalPortion ? remainingCommission : remainingCommission * ratio;
        const feePortion = isFinalPortion ? remainingFees : remainingFees * ratio;

        appendExecution(currentTrade, transaction, consumeQty, commissionPortion, feePortion);

        if (transaction.action === 'buy') {
          currentPosition += consumeQty;
          if (currentTrade.side === 'long') {
            currentTrade.entryValue += consumeQty * transaction.price * valueMultiplier;
            currentTrade.totalQuantity += consumeQty;
          } else {
            currentTrade.exitValue += consumeQty * transaction.price * valueMultiplier;
          }
        } else {
          currentPosition -= consumeQty;
          if (currentTrade.side === 'short') {
            currentTrade.entryValue += consumeQty * transaction.price * valueMultiplier;
            currentTrade.totalQuantity += consumeQty;
          } else {
            currentTrade.exitValue += consumeQty * transaction.price * valueMultiplier;
          }
        }

        remainingQty -= consumeQty;
        remainingCommission -= commissionPortion;
        remainingFees -= feePortion;

        if (currentPosition === 0) {
          const finalized = finalizeTrade(currentTrade);
          if (finalized && finalized.executions.length > 0) {
            completedTrades.push(finalized);
          }
          currentTrade = null;
        }
      }
    }

    if (currentTrade && Math.abs(currentPosition) > 0) {
      currentTrade.entryPrice = currentTrade.totalQuantity > 0
        ? currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier)
        : 0;
      currentTrade.exitPrice = null;
      currentTrade.exitTime = null;
      currentTrade.quantity = Math.abs(currentPosition);
      currentTrade.totalQuantity = Math.abs(currentPosition);
      currentTrade.commission = currentTrade.totalCommission;
      currentTrade.fees = currentTrade.totalFees;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      currentTrade.side = currentPosition > 0 ? 'long' : 'short';
      currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      currentTrade.executionData = currentTrade.executions;
      Object.assign(currentTrade, instrumentData);

      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      if (currentTrade.isExistingPosition) {
        currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
      }

      delete currentTrade.instrumentData;
      completedTrades.push(currentTrade);
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} Firstrade transactions`);
  return completedTrades;
}

module.exports = {
  parseFirstradeTransactions
};
