/**
 * Tax lots: turns one stored trade into the lots it opened and the
 * dispositions (closing fills matched to those lots, first in first out) that
 * a tax form reports one line at a time.
 *
 * Pure: no database access. Amounts are in the trade's stored currency.
 *
 * A long trade's lots are purchases and its dispositions are sales. A short
 * trade is the mirror image: its lots are the short sales that opened it and
 * each disposition is a purchase that closed part of it.
 */

const { multiplierFor, normalizeAction, isBuyAction, isSellAction, dateInTimezone } = require('../pnlEngine');

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toMs = (value) => {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

// Whole days since the epoch for a YYYY-MM-DD date, for calendar-day windows.
function dayNumber(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
}

function executionTime(execution) {
  return execution.datetime
    || execution.entryTime
    || execution.entry_time
    || execution.exitTime
    || execution.exit_time
    || null;
}

// Same precedence the P&L engine uses: a real buy/sell wins, an entry/exit
// leg type beats an ambiguous long/short word.
function fillAction(execution, tradeSide) {
  const explicit = normalizeAction(execution.action || execution.side || '');
  const legType = String(execution.type || '').toLowerCase();
  let typeAction = '';
  if (legType === 'entry') typeAction = tradeSide === 'short' ? 'sell' : 'buy';
  if (legType === 'exit') typeAction = tradeSide === 'short' ? 'buy' : 'sell';
  const positionWordOnly = /\b(long|short)\b/.test(explicit) && !/\b(buy|bot|sell|sold|sld)\b/.test(explicit);
  if (explicit && !(typeAction && positionWordOnly)) return explicit;
  return typeAction;
}

// Per-execution commission + fees. When no execution carries a cost, the
// trade-level totals are spread by quantity (the P&L engine's rule).
function executionCosts(executions, trade) {
  const totalQty = executions.reduce((sum, e) => sum + Math.abs(num(e?.quantity) || 0), 0);
  const anyCost = executions.some((e) => (num(e?.commission) || 0) !== 0 || (num(e?.fees) || 0) !== 0);
  const fallback = (num(trade.commission) || 0) + (num(trade.fees) || 0);
  return executions.map((e) => {
    if (anyCost) return (num(e.commission) || 0) + (num(e.fees) || 0);
    const qty = Math.abs(num(e?.quantity) || 0);
    return totalQty > 0 ? fallback * (qty / totalQty) : 0;
  });
}

/**
 * Identifies "the same security" for wash-sale matching: the ticker for
 * stocks, the exact contract for options.
 */
function securityKey(trade) {
  const symbol = String(trade.symbol || '').toUpperCase();
  if (trade.instrument_type === 'option') {
    const expiry = trade.expiration_date ? dateInTimezone(trade.expiration_date, 'UTC') : '';
    const underlying = String(trade.underlying_symbol || symbol).toUpperCase();
    return `option:${underlying}:${expiry}:${num(trade.strike_price) ?? ''}:${String(trade.option_type || '').toLowerCase()}`;
  }
  return `${trade.instrument_type || 'stock'}:${symbol}`;
}

function isGroupedShape(executions) {
  return executions.length > 0 && executions.every((e) => e && (e.entryPrice !== undefined || e.entry_price !== undefined));
}

function createBuilder(trade, timezone, multiplier) {
  const side = trade.side === 'short' ? 'short' : 'long';
  const lots = [];
  const dispositions = [];
  const key = securityKey(trade);

  const openLot = (quantity, price, cost, openedMs) => {
    const openedDate = dateInTimezone(new Date(openedMs).toISOString(), timezone);
    const lot = {
      id: `${trade.id}:${lots.length}`,
      tradeId: trade.id,
      securityKey: key,
      direction: side,
      quantity,
      remaining: quantity,
      price,
      costPerUnit: quantity > 0 ? cost / quantity : 0,
      openedMs,
      openedDate,
      openedDay: dayNumber(openedDate)
    };
    lots.push(lot);
    return lot;
  };

  const closeFromLot = (lot, quantity, price, cost, closedMs, approximate = false) => {
    const openingValue = quantity * lot.price * multiplier;
    const closingValue = quantity * price * multiplier;
    const openingCost = lot.costPerUnit * quantity;
    const closedDate = dateInTimezone(new Date(closedMs).toISOString(), timezone);
    // A stored entry time later than the exit is a data error. A tax line
    // cannot be acquired after it was sold, so report it as a same-day sale
    // and mark the line as estimated.
    const datesReversed = lot.openedMs > closedMs;
    lot.remaining -= quantity;
    dispositions.push({
      tradeId: trade.id,
      lot,
      quantity,
      // Long: bought then sold. Short: sold short (proceeds), bought to cover (basis).
      proceeds: side === 'long' ? closingValue - cost : openingValue - openingCost,
      basis: side === 'long' ? openingValue + openingCost : closingValue + cost,
      openedMs: datesReversed ? closedMs : lot.openedMs,
      openedDate: datesReversed ? closedDate : lot.openedDate,
      closedMs,
      closedDate,
      closedDay: dayNumber(closedDate),
      approximate: approximate || datesReversed
    });
  };

  return { side, lots, dispositions, openLot, closeFromLot };
}

function buildFromFills(trade, executions, builder) {
  const costs = executionCosts(executions, trade);
  const entryMs = toMs(trade.entry_time);
  const exitMs = toMs(trade.exit_time);
  const fills = executions
    .map((execution, index) => {
      const action = fillAction(execution, builder.side);
      const opening = builder.side === 'long' ? isBuyAction(action) : isSellAction(action);
      const closing = builder.side === 'long' ? isSellAction(action) : isBuyAction(action);
      return {
        index,
        opening,
        closing,
        quantity: Math.abs(num(execution.quantity) || 0),
        price: num(execution.price),
        cost: costs[index],
        ms: toMs(executionTime(execution)) ?? (opening ? entryMs : exitMs)
      };
    })
    .filter((fill) => (fill.opening || fill.closing) && fill.quantity > 0 && fill.price !== null && fill.ms !== null)
    .sort((a, b) => a.ms - b.ms || a.index - b.index);

  let unmatched = 0;
  for (const fill of fills) {
    if (fill.opening) {
      builder.openLot(fill.quantity, fill.price, fill.cost, fill.ms);
      continue;
    }
    let left = fill.quantity;
    for (const lot of builder.lots) {
      if (left <= 1e-9) break;
      if (lot.remaining <= 1e-9) continue;
      const take = Math.min(lot.remaining, left);
      builder.closeFromLot(lot, take, fill.price, fill.cost * (take / fill.quantity), fill.ms);
      left -= take;
    }
    if (left > 1e-9) unmatched += left;
  }
  return unmatched;
}

function buildFromGrouped(trade, executions, builder) {
  const costs = executionCosts(executions, trade);
  executions.forEach((execution, index) => {
    const quantity = Math.abs(num(execution.quantity) || 0);
    const entryPrice = num(execution.entryPrice ?? execution.entry_price);
    const exitPrice = num(execution.exitPrice ?? execution.exit_price);
    const openedMs = toMs(execution.entryTime ?? execution.entry_time) ?? toMs(trade.entry_time);
    if (quantity <= 0 || entryPrice === null || openedMs === null) return;
    // A grouped leg carries one cost figure for the round trip; it goes on the opening side.
    const lot = builder.openLot(quantity, entryPrice, costs[index], openedMs);
    const closedMs = toMs(execution.exitTime ?? execution.exit_time) ?? toMs(trade.exit_time);
    if (exitPrice !== null && closedMs !== null) {
      builder.closeFromLot(lot, quantity, exitPrice, 0, closedMs);
    }
  });
}

// One lot and one disposition from the trade's own totals, forced to agree
// with the stored P&L. Used when there are no usable fills, or when the fills
// do not add up to the P&L the rest of the app reports.
function buildFromTradeTotals(trade, builder, multiplier, approximate) {
  const quantity = Math.abs(num(trade.quantity) || 0);
  const entryPrice = num(trade.entry_price);
  const exitPrice = num(trade.exit_price);
  const openedMs = toMs(trade.entry_time) ?? toMs(trade.trade_date);
  const closedMs = toMs(trade.exit_time);
  if (quantity <= 0 || entryPrice === null || exitPrice === null || openedMs === null || closedMs === null) return false;

  const costs = (num(trade.commission) || 0) + (num(trade.fees) || 0);
  const lot = builder.openLot(quantity, entryPrice, 0, openedMs);
  builder.closeFromLot(lot, quantity, exitPrice, 0, closedMs, approximate);
  const disposition = builder.dispositions[builder.dispositions.length - 1];
  const pnl = num(trade.pnl);
  const gain = pnl !== null ? pnl : (disposition.proceeds - disposition.basis) - costs;
  // Keep the opening-side figure and derive the other so the line nets to the P&L.
  if (builder.side === 'long') disposition.proceeds = disposition.basis + gain;
  else disposition.basis = disposition.proceeds - gain;
  return true;
}

/**
 * @param {object} trade - a row of the trades table
 * @param {string} timezone - IANA zone used to turn timestamps into tax dates
 * @returns {{lots: Array, dispositions: Array, issue: string|null}}
 *   issue is null, 'approximated' (totals used instead of fills),
 *   'missing_multiplier' or 'unusable' (nothing could be built).
 */
function buildTradeLots(trade, timezone = 'UTC') {
  let multiplier;
  try {
    multiplier = multiplierFor(trade.instrument_type, trade.contract_size, trade.point_value);
  } catch (_) {
    return { lots: [], dispositions: [], issue: 'missing_multiplier' };
  }

  const executions = Array.isArray(trade.executions) ? trade.executions.filter(Boolean) : [];
  const closed = !!trade.exit_time;
  const storedPnl = num(trade.pnl);

  if (executions.length > 0) {
    const builder = createBuilder(trade, timezone, multiplier);
    let unmatched = 0;
    if (isGroupedShape(executions)) buildFromGrouped(trade, executions, builder);
    else unmatched = buildFromFills(trade, executions, builder);

    const gain = builder.dispositions.reduce((sum, d) => sum + d.proceeds - d.basis, 0);
    const tolerance = Math.max(0.05, Math.abs(storedPnl || 0) * 0.001);
    const reconciles = !closed || storedPnl === null || Math.abs(gain - storedPnl) <= tolerance;
    if (builder.lots.length > 0 && unmatched <= 1e-9 && reconciles) {
      return { lots: builder.lots, dispositions: builder.dispositions, issue: null };
    }
    if (!closed && builder.lots.length > 0 && unmatched <= 1e-9) {
      return { lots: builder.lots, dispositions: builder.dispositions, issue: null };
    }
  }

  if (!closed) return { lots: [], dispositions: [], issue: executions.length > 0 ? 'unusable' : null };

  const fallback = createBuilder(trade, timezone, multiplier);
  if (!buildFromTradeTotals(trade, fallback, multiplier, executions.length > 0)) {
    return { lots: [], dispositions: [], issue: 'unusable' };
  }
  return {
    lots: fallback.lots,
    dispositions: fallback.dispositions,
    issue: executions.length > 0 ? 'approximated' : null
  };
}

module.exports = { buildTradeLots, securityKey, dayNumber };
