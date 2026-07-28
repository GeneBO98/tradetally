const { computeTradePnl } = require('../services/pnlEngine');

function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Returns YYYY-MM-DD for a timestamp candidate, interpreted in the given timezone.
// Used for the legacy fallback when a trade has no annotated executions.
function getExecutionDateString(timezone, ...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;

    const str = String(candidate);
    const dateOnly = str.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dateOnly) return dateOnly[1];

    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) continue;

    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(parsed);
      const part = (type) => parts.find((item) => item.type === type)?.value || '';
      return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
    } catch {
      return parsed.toISOString().split('T')[0];
    }
  }

  return null;
}

function getTradeValueMultiplier(trade) {
  if (trade.instrument_type === 'future') {
    const pointValue = parseNumericValue(trade.point_value);
    return pointValue != null && pointValue > 0 ? pointValue : 1;
  }

  if (trade.instrument_type === 'option') {
    const contractSize = parseNumericValue(trade.contract_size);
    return contractSize != null && contractSize > 0 ? contractSize : 100;
  }

  return 1;
}

function legacyExitEventFromExecution(execution, trade, timezone) {
  const date = getExecutionDateString(
    timezone,
    execution.exitTime,
    execution.exit_time,
    execution.datetime
  );
  if (!date) return null;

  const exitPrice = parseNumericValue(execution.exitPrice ?? execution.exit_price);
  const entryPrice = parseNumericValue(execution.entryPrice ?? execution.entry_price);
  const quantity = Math.abs(parseNumericValue(execution.quantity) || 0);
  const commission = parseNumericValue(execution.commission) || 0;
  const fees = parseNumericValue(execution.fees ?? execution.fee) || 0;
  const stored = parseNumericValue(execution.pnl ?? execution.p_l ?? execution.profit_loss);
  let grossPnl = null;

  if (exitPrice != null && entryPrice != null && quantity > 0) {
    const multiplier = getTradeValueMultiplier(trade);
    const side = execution.side || trade.side;
    grossPnl = side === 'short'
      ? (entryPrice - exitPrice) * quantity * multiplier
      : (exitPrice - entryPrice) * quantity * multiplier;
  }

  if (stored != null) {
    return {
      date,
      pnl: stored,
      gross_pnl: grossPnl ?? stored + commission + fees
    };
  }
  if (grossPnl == null) return null;

  return { date, pnl: grossPnl - commission - fees, gross_pnl: grossPnl };
}

function getExitEventFromExecution(execution, trade, timezone, computedExecution = null) {
  const realized = parseNumericValue(execution.realized_pnl);
  if (realized != null) {
    const date = execution.exit_date
      ? execution.exit_date
      : getExecutionDateString(
          timezone,
          execution.exitTime,
          execution.exit_time,
          execution.datetime
        );
    if (date) {
      const computedGross = parseNumericValue(computedExecution?.gross_realized_pnl);
      const storedGross = parseNumericValue(execution.gross_realized_pnl);
      const commission = parseNumericValue(execution.commission) || 0;
      const fees = parseNumericValue(execution.fees ?? execution.fee) || 0;
      return {
        date,
        pnl: realized,
        gross_pnl: storedGross ?? computedGross ?? realized + commission + fees
      };
    }
  }

  return legacyExitEventFromExecution(execution, trade, timezone);
}

// Returns one realized-P&L event per closing execution. Engine-stamped
// realized_pnl/exit_date values are authoritative; legacy rows are reconstructed
// with the canonical P&L engine until every installation has completed backfill.
function tradeExitEvents(trade, timezone) {
  const executions = Array.isArray(trade.executions) ? trade.executions.filter(Boolean) : [];
  if (executions.length === 0) return [];

  const hasStamped = executions.some((execution) =>
    execution && parseNumericValue(execution.realized_pnl) != null
  );
  if (hasStamped) {
    const engineResult = computeTradePnl({
      side: trade.side,
      instrumentType: trade.instrument_type || 'stock',
      contractSize: trade.contract_size,
      pointValue: trade.point_value,
      fallbackCommission: trade.commission != null ? parseNumericValue(trade.commission) : null,
      fallbackFees: trade.fees != null ? parseNumericValue(trade.fees) : null,
      executions,
      timezone,
      tradeId: trade.trade_id || trade.id
    });

    return executions
      .map((execution, index) => execution && getExitEventFromExecution(
        execution,
        trade,
        timezone,
        engineResult.annotatedExecutions[index]
      ))
      .filter(Boolean);
  }

  const engineResult = computeTradePnl({
    side: trade.side,
    instrumentType: trade.instrument_type || 'stock',
    contractSize: trade.contract_size,
    pointValue: trade.point_value,
    fallbackCommission: trade.commission != null ? parseNumericValue(trade.commission) : null,
    fallbackFees: trade.fees != null ? parseNumericValue(trade.fees) : null,
    executions,
    timezone,
    tradeId: trade.trade_id || trade.id
  });

  return engineResult.annotatedExecutions
    .filter((execution) =>
      parseNumericValue(execution.realized_pnl) != null && execution.exit_date
    )
    .map((execution) => ({
      date: execution.exit_date,
      pnl: parseNumericValue(execution.realized_pnl),
      gross_pnl: parseNumericValue(execution.gross_realized_pnl)
        ?? parseNumericValue(execution.realized_pnl)
    }));
}

function realizedEventsForTrade(trade, timezone) {
  const exitEvents = tradeExitEvents(trade, timezone);
  if (exitEvents.length > 0) return exitEvents;

  const exactPnl = parseNumericValue(trade.pnl);
  const date = getExecutionDateString(timezone, trade.exit_time);
  const commission = parseNumericValue(trade.commission) || 0;
  const fees = parseNumericValue(trade.fees) || 0;
  return exactPnl != null && date
    ? [{ date, pnl: exactPnl, gross_pnl: exactPnl + commission + fees }]
    : [];
}

function buildCalendarOverviewRows(trades, startDateStr, endDateStr, timezone) {
  const byDate = new Map();

  const add = (tradeId, date, pnl, grossPnl) => {
    if (!date || pnl == null) return;
    let day = byDate.get(date);
    if (!day) {
      day = { tradeIds: new Set(), dailyPnl: 0, dailyGrossPnl: 0 };
      byDate.set(date, day);
    }
    day.tradeIds.add(tradeId);
    day.dailyPnl += pnl;
    day.dailyGrossPnl += grossPnl ?? pnl;
  };

  trades.forEach((trade) => {
    realizedEventsForTrade(trade, timezone).forEach((event) => {
      if (event.date >= startDateStr && event.date <= endDateStr) {
        add(trade.trade_id, event.date, event.pnl, event.gross_pnl);
      }
    });
  });

  return Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, data]) => ({
      trade_date: date,
      trades: data.tradeIds.size,
      daily_pnl: data.dailyPnl,
      daily_gross_pnl: data.dailyGrossPnl
    }));
}

// Build the Dashboard's daily series from the same exit-execution events as the
// full Calendar. A multi-day position therefore contributes only the P&L
// realized on each day instead of assigning the entire position to trade_date.
function buildExecutionDailyPnlRows(
  trades,
  timezone,
  { startDate, endDate, groupByPosition = false } = {}
) {
  const byDate = new Map();

  for (const trade of trades) {
    const events = realizedEventsForTrade(trade, timezone);
    if (events.length === 0) continue;

    const eventTotalPnl = events.reduce((sum, event) => sum + event.pnl, 0);
    const derivedRValue = parseNumericValue(trade.derived_r_value);
    const countKey = groupByPosition
      ? (trade.position_key || trade.trade_id)
      : trade.trade_id;

    for (const event of events) {
      if (startDate && event.date < startDate) continue;
      if (endDate && event.date > endDate) continue;

      let day = byDate.get(event.date);
      if (!day) {
        day = {
          dailyPnl: 0,
          dailyRValue: 0,
          countKeys: new Set()
        };
        byDate.set(event.date, day);
      }

      day.dailyPnl += event.pnl;
      day.countKeys.add(countKey);

      // derived_r_value is the whole position's net P&L divided by its risk.
      // Allocate it in the same proportion as realized P&L so multi-day exits
      // reconcile to the original total R without double-counting it.
      if (derivedRValue != null && eventTotalPnl !== 0) {
        day.dailyRValue += derivedRValue * (event.pnl / eventTotalPnl);
      }
    }
  }

  let cumulativePnl = 0;
  let cumulativeRValue = 0;
  return Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, day]) => {
      cumulativePnl += day.dailyPnl;
      cumulativeRValue += day.dailyRValue;
      return {
        trade_date: date,
        daily_pnl: day.dailyPnl,
        cumulative_pnl: cumulativePnl,
        r_value: day.dailyRValue,
        cumulative_r_value: cumulativeRValue,
        trade_count: day.countKeys.size
      };
    });
}

module.exports = {
  buildCalendarOverviewRows,
  buildExecutionDailyPnlRows,
  getExecutionDateString,
  parseNumericValue,
  tradeExitEvents
};
