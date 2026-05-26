/**
 * Canonical P&L Engine
 *
 * Single source of truth for per-execution and per-trade P&L. Every write path
 * (CSV import, broker sync, manual edit, addFill, restore) must run executions
 * through this engine before persisting. Every read path then consumes the
 * stored `realized_pnl` and `exit_date` fields written by this engine instead
 * of recomputing.
 *
 * Pure / stateless — no DB access, no I/O. Timezone is passed in.
 */

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAction(value) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function isBuyAction(action) {
  return /\b(buy|bot|long)\b/.test(action);
}

function isSellAction(action) {
  return /\b(sell|sold|short|sld)\b/.test(action);
}

function multiplierFor(instrumentType, contractSize, pointValue) {
  if (instrumentType === 'future') {
    const pv = parseNumeric(pointValue);
    return pv != null && pv > 0 ? pv : 1;
  }
  if (instrumentType === 'option') {
    const cs = parseNumeric(contractSize);
    return cs != null && cs > 0 ? cs : 100;
  }
  return 1;
}

function getExecutionTimestamp(execution) {
  return execution.datetime
      || execution.entryTime
      || execution.entry_time
      || execution.exitTime
      || execution.exit_time
      || null;
}

function parseTimestampMs(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

// Returns epoch ms for a parseable, plausibly-dated timestamp, or null otherwise.
// Use this (not parseTimestampMs) when choosing the earliest entry / latest exit:
//   - parseTimestampMs maps bad values to MAX_SAFE_INTEGER, which always wins the
//     "latest" comparison and would let an unparseable string (e.g. "24-03-12")
//     get written verbatim into a timestamp column.
//   - Date.parse accepts absurd years like a corrupted "0024-03-12" (a mangled
//     "2024"); selecting it would overwrite good data and, once formatted by
//     dateInTimezone, yields an out-of-range date string. Reject those here so a
//     corrupt timestamp is never chosen and COALESCE preserves the stored value.
const MIN_PLAUSIBLE_YEAR = 1900;
const MAX_PLAUSIBLE_YEAR = 9999;
function toEpochMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  const year = new Date(ms).getUTCFullYear();
  if (year < MIN_PLAUSIBLE_YEAR || year > MAX_PLAUSIBLE_YEAR) return null;
  return ms;
}

function dateInTimezone(value, timezone) {
  if (!value) return null;
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    // Intl's year:'numeric' does NOT zero-pad, so a low year (e.g. a corrupt
    // year-24 timestamp) would format as "24-03-12" — an out-of-range date when
    // cast to a DB date column. Build the parts and pad the year to 4 digits.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(parsed);
    const part = (type) => parts.find((p) => p.type === type)?.value || '';
    const year = part('year').padStart(4, '0');
    return `${year}-${part('month')}-${part('day')}`;
  } catch {
    return parsed.toISOString().split('T')[0];
  }
}

function hasGroupedShape(executions) {
  // True grouped only when EVERY execution carries entryPrice/entry_price
  // (Lightspeed round-trip records, broker-sync grouped legs). IBKR partial-close
  // importers decorate just the closing fill with entryPrice/exitPrice — those
  // arrays still have a plain opening fill, so they must run through fill-based
  // FIFO so the opening fill's commission gets matched correctly.
  if (executions.length === 0) return false;
  return executions.every((e) => e && (
    e.entryPrice !== undefined ||
    e.entry_price !== undefined
  ));
}

function deriveAction(execution, tradeSide) {
  const explicit = execution.action || execution.side;
  if (explicit) return normalizeAction(explicit);
  if (execution.type) {
    const t = String(execution.type).toLowerCase();
    if (t === 'entry') return tradeSide === 'short' ? 'sell' : 'buy';
    if (t === 'exit') return tradeSide === 'short' ? 'buy' : 'sell';
  }
  return '';
}

function isOpeningFill(action, tradeSide) {
  if (tradeSide === 'long') return isBuyAction(action);
  return isSellAction(action);
}

function computePnlPercent(entryPrice, exitPrice, side, pnl, quantity, instrumentType, pointValue) {
  if (exitPrice == null || entryPrice == null || entryPrice <= 0) return null;
  if (instrumentType === 'future' && pnl != null && quantity != null) {
    const pv = parseNumeric(pointValue) || 1;
    const notional = entryPrice * quantity * pv;
    if (notional <= 0) return null;
    return (pnl / notional) * 100;
  }
  if (side === 'long') {
    return ((exitPrice - entryPrice) / entryPrice) * 100;
  }
  return ((entryPrice - exitPrice) / entryPrice) * 100;
}

function resolvePerExecCosts(executions, fallbackCommission, fallbackFees) {
  const totalQty = executions.reduce((sum, e) => sum + Math.abs(parseNumeric(e?.quantity) || 0), 0);

  // If ANY execution carries ANY cost field (commission or fees), treat per-exec
  // as authoritative and do NOT also apply trade-level fallbacks. Some importers
  // (notably IBKR) record the broker commission in both `trade.commission` AND
  // `execution.fees` — applying both would double-count.
  // Only prorate trade-level totals when executions carry no cost info at all.
  const hasAnyExecCost = executions.some((e) =>
    parseNumeric(e?.commission) !== null || parseNumeric(e?.fees) !== null
  );

  return executions.map((execution) => {
    const qty = Math.abs(parseNumeric(execution?.quantity) || 0);
    const proportion = totalQty > 0 ? qty / totalQty : 0;

    let commission;
    let fees;

    if (hasAnyExecCost) {
      commission = parseNumeric(execution.commission) ?? 0;
      fees = parseNumeric(execution.fees) ?? 0;
    } else {
      commission = (parseNumeric(fallbackCommission) ?? 0) * proportion;
      fees = (parseNumeric(fallbackFees) ?? 0) * proportion;
    }

    return { commission, fees };
  });
}

function processGrouped(input, executions, timezone) {
  const { side, instrumentType, contractSize, pointValue, fallbackCommission, fallbackFees } = input;
  const multiplier = multiplierFor(instrumentType, contractSize, pointValue);
  const costs = resolvePerExecCosts(executions, fallbackCommission, fallbackFees);

  let totalEntryQty = 0;
  let totalEntryNotional = 0;
  let totalExitQty = 0;
  let totalExitNotional = 0;
  let totalCommission = 0;
  let totalFees = 0;
  let totalRealizedPnl = 0;
  let anyClosed = false;
  let allClosed = true;
  let earliestEntryMs = Number.MAX_SAFE_INTEGER;
  let earliestEntryTs = null;
  let latestExitMs = -Number.MAX_SAFE_INTEGER;
  let latestExitTs = null;

  const annotated = executions.map((execution, index) => {
    const qty = Math.abs(parseNumeric(execution.quantity) || 0);
    const entryPrice = parseNumeric(execution.entryPrice ?? execution.entry_price);
    const exitPrice = parseNumeric(execution.exitPrice ?? execution.exit_price);
    const legSide = execution.side || side;
    const { commission, fees } = costs[index];
    const totalCost = commission + fees;
    const entryTime = execution.entryTime ?? execution.entry_time ?? null;
    const exitTime = execution.exitTime ?? execution.exit_time ?? null;

    if (entryPrice != null && qty > 0) {
      totalEntryQty += qty;
      totalEntryNotional += qty * entryPrice;
    }

    if (entryTime) {
      const ms = toEpochMs(entryTime);
      if (ms != null && ms < earliestEntryMs) {
        earliestEntryMs = ms;
        earliestEntryTs = entryTime;
      }
    }

    totalCommission += commission;
    totalFees += fees;

    let realizedPnl = null;
    let exitDate = null;

    if (exitPrice != null && qty > 0 && entryPrice != null) {
      const gross = legSide === 'short'
        ? (entryPrice - exitPrice) * qty * multiplier
        : (exitPrice - entryPrice) * qty * multiplier;
      realizedPnl = gross - totalCost;
      totalRealizedPnl += realizedPnl;
      totalExitQty += qty;
      totalExitNotional += qty * exitPrice;
      anyClosed = true;
      exitDate = dateInTimezone(exitTime, timezone);
      if (exitTime) {
        const ms = toEpochMs(exitTime);
        if (ms != null && ms > latestExitMs) {
          latestExitMs = ms;
          latestExitTs = exitTime;
        }
      }
    } else {
      allClosed = false;
    }

    return {
      ...execution,
      commission,
      fees,
      realized_pnl: realizedPnl,
      exit_date: exitDate
    };
  });

  const isFullyClosed = anyClosed && allClosed && totalExitQty >= totalEntryQty;
  const entryPriceAvg = totalEntryQty > 0 ? totalEntryNotional / totalEntryQty : null;
  const exitPriceAvg = isFullyClosed && totalExitQty > 0 ? totalExitNotional / totalExitQty : null;
  const pnl = anyClosed ? totalRealizedPnl : null;
  const pnlPercent = pnl != null && entryPriceAvg != null
    ? computePnlPercent(entryPriceAvg, exitPriceAvg ?? (totalExitQty > 0 ? totalExitNotional / totalExitQty : null), side, pnl, totalEntryQty || totalExitQty, instrumentType, pointValue)
    : null;
  const tradeDate = earliestEntryTs ? dateInTimezone(earliestEntryTs, timezone) : null;

  return {
    annotatedExecutions: annotated,
    aggregate: {
      entry_price: entryPriceAvg,
      exit_price: exitPriceAvg,
      entry_time: earliestEntryTs,
      exit_time: isFullyClosed ? latestExitTs : null,
      trade_date: tradeDate,
      quantity: totalEntryQty || totalExitQty,
      commission: totalCommission,
      fees: totalFees,
      pnl,
      pnl_percent: pnlPercent,
      is_fully_closed: isFullyClosed
    }
  };
}

function processFillBased(input, executions, timezone, tradeId) {
  const { side, instrumentType, contractSize, pointValue, fallbackCommission, fallbackFees } = input;
  const multiplier = multiplierFor(instrumentType, contractSize, pointValue);
  const costs = resolvePerExecCosts(executions, fallbackCommission, fallbackFees);

  const annotated = executions.map((execution, index) => {
    const { commission, fees } = costs[index];
    return {
      ...execution,
      commission,
      fees,
      realized_pnl: null,
      exit_date: null,
      _originalIndex: index
    };
  });

  const sorted = [...annotated].sort((a, b) => {
    const aMs = parseTimestampMs(getExecutionTimestamp(a));
    const bMs = parseTimestampMs(getExecutionTimestamp(b));
    if (aMs !== bMs) return aMs - bMs;
    const aAction = deriveAction(a, side);
    const bAction = deriveAction(b, side);
    const aOpening = isOpeningFill(aAction, side);
    const bOpening = isOpeningFill(bAction, side);
    if (aOpening && !bOpening) return -1;
    if (!aOpening && bOpening) return 1;
    return a._originalIndex - b._originalIndex;
  });

  const entryQueue = [];
  let totalEntryQty = 0;
  let totalEntryNotional = 0;
  let totalExitQty = 0;
  let totalExitNotional = 0;
  let totalCommission = 0;
  let totalFees = 0;
  let totalRealizedPnl = 0;
  let anyClosed = false;
  let earliestEntryMs = Number.MAX_SAFE_INTEGER;
  let earliestEntryTs = null;
  let latestExitMs = -Number.MAX_SAFE_INTEGER;
  let latestExitTs = null;

  for (const execution of sorted) {
    const qty = Math.abs(parseNumeric(execution.quantity) || 0);
    const price = parseNumeric(
      execution.price ??
      execution.entryPrice ??
      execution.entry_price ??
      execution.exitPrice ??
      execution.exit_price
    );
    const action = deriveAction(execution, side);
    const commission = parseNumeric(execution.commission) || 0;
    const fees = parseNumeric(execution.fees) || 0;
    const totalCost = commission + fees;
    const timestamp = getExecutionTimestamp(execution);
    const opening = isOpeningFill(action, side);

    totalCommission += commission;
    totalFees += fees;

    if (opening) {
      if (qty > 0 && price != null) {
        entryQueue.push({
          originalQty: qty,
          remainingQty: qty,
          price,
          totalCost
        });
        totalEntryQty += qty;
        totalEntryNotional += qty * price;
        if (timestamp) {
          const ms = toEpochMs(timestamp);
          if (ms != null && ms < earliestEntryMs) {
            earliestEntryMs = ms;
            earliestEntryTs = timestamp;
          }
        }
      }
      continue;
    }

    if (qty <= 0 || price == null) {
      execution.realized_pnl = parseNumeric(execution.pnl ?? execution.p_l ?? execution.profit_loss);
      execution.exit_date = dateInTimezone(timestamp, timezone);
      if (execution.realized_pnl != null) {
        totalRealizedPnl += execution.realized_pnl;
        anyClosed = true;
      }
      continue;
    }

    let remainingExit = qty;
    let matchedNotional = 0;
    let matchedQty = 0;
    let matchedEntryCost = 0;

    while (remainingExit > 0 && entryQueue.length > 0) {
      const entry = entryQueue[0];
      const take = Math.min(remainingExit, entry.remainingQty);
      matchedNotional += take * entry.price;
      matchedQty += take;
      if (entry.originalQty > 0) {
        matchedEntryCost += (entry.totalCost * take) / entry.originalQty;
      }
      remainingExit -= take;
      entry.remainingQty -= take;
      if (entry.remainingQty <= 1e-9) {
        entryQueue.shift();
      }
    }

    if (matchedQty > 0) {
      const matchedAvgEntry = matchedNotional / matchedQty;
      const gross = side === 'short'
        ? (matchedAvgEntry - price) * matchedQty * multiplier
        : (price - matchedAvgEntry) * matchedQty * multiplier;
      const realized = gross - totalCost - matchedEntryCost;
      execution.realized_pnl = realized;
      execution.exit_date = dateInTimezone(timestamp, timezone);
      totalRealizedPnl += realized;
      anyClosed = true;
      totalExitQty += matchedQty;
      totalExitNotional += matchedQty * price;
      if (timestamp) {
        const ms = toEpochMs(timestamp);
        if (ms != null && ms > latestExitMs) {
          latestExitMs = ms;
          latestExitTs = timestamp;
        }
      }
    } else {
      execution.realized_pnl = null;
      execution.exit_date = dateInTimezone(timestamp, timezone);
      const symbol = tradeId ? ` on trade ${tradeId}` : '';
      console.warn(`[PNL_ENGINE] Unmatched exit fill${symbol}: qty=${qty} price=${price} timestamp=${timestamp}`);
    }

    if (remainingExit > 0) {
      const symbol = tradeId ? ` on trade ${tradeId}` : '';
      console.warn(`[PNL_ENGINE] Exit fill exceeded available entries${symbol}: remaining qty=${remainingExit}`);
    }
  }

  for (const exec of annotated) {
    delete exec._originalIndex;
  }

  const isFullyClosed = totalEntryQty > 0 && totalExitQty >= totalEntryQty;
  const entryPriceAvg = totalEntryQty > 0 ? totalEntryNotional / totalEntryQty : null;
  const exitPriceAvg = isFullyClosed && totalExitQty > 0 ? totalExitNotional / totalExitQty : null;
  const pnl = anyClosed ? totalRealizedPnl : null;
  const pnlPercent = pnl != null && entryPriceAvg != null
    ? computePnlPercent(entryPriceAvg, exitPriceAvg ?? (totalExitQty > 0 ? totalExitNotional / totalExitQty : null), side, pnl, totalEntryQty || totalExitQty, instrumentType, pointValue)
    : null;
  const tradeDate = earliestEntryTs ? dateInTimezone(earliestEntryTs, timezone) : null;

  return {
    annotatedExecutions: annotated,
    aggregate: {
      entry_price: entryPriceAvg,
      exit_price: exitPriceAvg,
      entry_time: earliestEntryTs,
      exit_time: isFullyClosed ? latestExitTs : null,
      trade_date: tradeDate,
      quantity: totalEntryQty || totalExitQty,
      commission: totalCommission,
      fees: totalFees,
      pnl,
      pnl_percent: pnlPercent,
      is_fully_closed: isFullyClosed
    }
  };
}

function emptyResult() {
  return {
    annotatedExecutions: [],
    aggregate: {
      entry_price: null,
      exit_price: null,
      entry_time: null,
      exit_time: null,
      trade_date: null,
      quantity: 0,
      commission: 0,
      fees: 0,
      pnl: null,
      pnl_percent: null,
      is_fully_closed: false
    }
  };
}

/**
 * Compute per-execution P&L and trade-level aggregates from raw executions.
 *
 * @param {Object} input
 * @param {('long'|'short')} input.side
 * @param {('stock'|'option'|'future')} input.instrumentType
 * @param {number|null} [input.contractSize]
 * @param {number|null} [input.pointValue]
 * @param {number|null} [input.fallbackCommission] used only when NO execution carries a commission value
 * @param {number|null} [input.fallbackFees]
 * @param {Array<Object>} input.executions one of: fill-based, grouped, or legacy shapes
 * @param {string} [input.timezone] IANA TZ for computing exit_date (default UTC)
 * @param {string} [input.tradeId] optional, only used for diagnostic logging
 * @returns {{ annotatedExecutions: Array, aggregate: Object }}
 */
function computeTradePnl(input) {
  const executions = Array.isArray(input.executions) ? input.executions.filter(Boolean) : [];
  if (executions.length === 0) return emptyResult();

  const timezone = input.timezone || 'UTC';
  const tradeId = input.tradeId || null;

  if (hasGroupedShape(executions)) {
    return processGrouped(input, executions, timezone);
  }
  return processFillBased(input, executions, timezone, tradeId);
}

module.exports = {
  computeTradePnl,
  multiplierFor,
  dateInTimezone,
  isBuyAction,
  isSellAction,
  normalizeAction
};
