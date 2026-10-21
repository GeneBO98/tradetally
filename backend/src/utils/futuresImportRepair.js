const { computeTradePnl } = require('../services/pnlEngine');
const { getFuturesPointValue, getFuturesTickSize, extractUnderlyingFromFuturesSymbol } = require('./futuresUtils');

/** Only reconstruct costs when the import provenance establishes the bug. */
function planFuturesImportRepair(trade, importLog, timezone = 'UTC') {
  const skip = reason => ({ id: trade.id, skipped: reason });
  if (trade.instrument_type !== 'future') return skip('not_future');
  if (trade.economics_edited_at || trade.manual_override) return skip('edited_trade');
  if (trade.import_id !== importLog?.id) return skip('import_mismatch');
  const diagnostics = importLog.error_details?.diagnostics;
  const fallback = diagnostics?.broker_fallback || diagnostics?.brokerFallback;
  const genericFallback = fallback?.usedBroker === 'generic' && fallback?.selectedBroker === 'tradovate';
  const directTradovate = !fallback && diagnostics?.detectedBroker === 'tradovate' &&
    diagnostics?.selectedBroker === 'tradovate' && diagnostics?.headerAnalysis?.recognizedAs === 'tradovate';
  if (importLog.broker !== 'tradovate' || (!genericFallback && !directTradovate)) {
    return skip('not_verified_tradovate_generic_fallback');
  }
  if ((trade.original_currency && trade.original_currency !== 'USD') || Number(trade.exchange_rate || 1) !== 1) {
    return skip('non_usd_economics');
  }
  const root = extractUnderlyingFromFuturesSymbol(trade.symbol);
  const pointValue = getFuturesPointValue(root);
  if (pointValue == null) return skip('unknown_contract');
  const oldPointValue = Number(trade.point_value);
  if (oldPointValue !== 50 && oldPointValue !== pointValue) return skip('custom_or_unexplained_multiplier');
  const executions = trade.executions;
  if (!Array.isArray(executions) || executions.length === 0 || executions.some(e => !e.action || !(Number(e.quantity) > 0))) {
    return skip('incomplete_execution_history');
  }

  const headers = (diagnostics.headerAnalysis?.foundHeaders || []).map(value => String(value).trim().toLowerCase());
  // Direct Tradovate imports can carry the legacy $50 default, but their
  // separately allocated costs must never use the generic-parser cost repair.
  const commissionOnly = genericFallback && headers.includes('commission') && !headers.some(header => /fee/.test(header));
  // Generic reversal repair prorated execution.fees but retained the whole
  // fill commission on each split leg. The fees field is the allocated cost.
  const duplicatedCosts = commissionOnly && executions.some(e => Number(e.fees) > 0) && executions.every(e =>
    Number.isFinite(Number(e.commission)) && Number.isFinite(Number(e.fees)) &&
    Number(e.fees) >= 0 && Number(e.commission) + 1e-8 >= Number(e.fees)
  );
  if (commissionOnly && !duplicatedCosts && executions.some(e => Number(e.fees) > 0)) return skip('ambiguous_execution_costs');
  if (oldPointValue === pointValue && !duplicatedCosts) return skip('already_correct');

  const inputExecutions = executions.map(e => duplicatedCosts ? { ...e, commission: Number(e.fees), fees: 0 } : { ...e });
  const result = computeTradePnl({
    side: trade.side, instrumentType: 'future', pointValue, executions: inputExecutions, timezone
  });
  const annotated = result.annotatedExecutions.map(e => Object.prototype.hasOwnProperty.call(e, 'pnl')
    ? { ...e, pnl: e.realized_pnl } : e);
  const aggregate = result.aggregate;
  const entryAction = trade.side === 'short' ? 'sell' : 'buy';
  const entryCommission = annotated.filter(e => e.action === entryAction).reduce((sum, e) => sum + Number(e.commission || 0), 0);
  const stop = Number(trade.stop_loss);
  const riskPerUnit = trade.side === 'short' ? stop - aggregate.entry_price : aggregate.entry_price - stop;
  const risk = trade.stop_loss != null && riskPerUnit > 0 ? riskPerUnit * aggregate.quantity * pointValue : null;
  return {
    id: trade.id, symbol: trade.symbol, multiplierChanged: oldPointValue !== pointValue, costsRepaired: duplicatedCosts,
    before: { pointValue: oldPointValue, pnl: trade.pnl == null ? null : Number(trade.pnl), commission: Number(trade.commission), fees: Number(trade.fees) },
    after: {
      pointValue, tickSize: getFuturesTickSize(root), executions: annotated,
      pnl: aggregate.pnl, pnlPercent: aggregate.pnl_percent,
      commission: aggregate.commission, fees: aggregate.fees,
      entryCommission, exitCommission: aggregate.commission - entryCommission,
      rValue: risk > 0 && aggregate.pnl != null ? aggregate.pnl / risk : null
    }
  };
}

module.exports = { planFuturesImportRepair };
