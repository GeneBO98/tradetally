/**
 * Breakeven classification by GROSS P&L (price only, excluding commissions/fees).
 *
 * A trade is "breakeven" when its gross P&L is within +/- `tolerance` ticks of
 * zero, scaled per-instrument by tick_size * point_value * quantity:
 *
 *     ABS(gross) <= tolerance * tick_size * point_value * quantity
 *
 * With tolerance 0 -- or when the instrument has no tick_size/point_value
 * (e.g. stocks) -- this reduces to exact gross breakeven (gross = 0), so the
 * existing behavior is unchanged unless the user opts in.
 *
 * Wins/losses are then decided by NET P&L among the non-breakeven trades.
 */

/**
 * Read a user's configured breakeven tolerance (in ticks). Returns a finite
 * number >= 0; any missing/invalid value falls back to 0.
 */
async function getBreakevenToleranceTicks(userId) {
  try {
    const User = require('../models/User');
    const settings = await User.getSettings(userId);
    return normalizeTolerance(settings?.breakeven_tolerance_ticks);
  } catch (error) {
    return 0;
  }
}

function normalizeTolerance(value) {
  const tol = Number(value);
  return Number.isFinite(tol) && tol > 0 ? tol : 0;
}

/**
 * Build the SQL boolean expressions used to classify a trade as breakeven.
 *
 * @param {object} cols - SQL column/expression strings for this query context.
 * @param {string} cols.gross - gross P&L expression, e.g.
 *        '(pnl + COALESCE(commission, 0) + COALESCE(fees, 0))'
 * @param {string} cols.tickSize - tick_size column expression
 * @param {string} cols.pointValue - point_value column expression
 * @param {string} cols.quantity - quantity column expression
 * @param {number} tolerance - tolerance in ticks (>= 0)
 * @returns {{is: string, isNot: string}} SQL predicates. `is` is true for
 *          breakeven trades; `isNot` is its negation (decisive trades).
 */
function breakevenPredicate(cols, tolerance) {
  const tol = normalizeTolerance(tolerance);
  if (tol === 0) {
    return { is: `${cols.gross} = 0`, isNot: `${cols.gross} <> 0` };
  }
  const bound = `${tol} * COALESCE(${cols.tickSize}, 0) * COALESCE(${cols.pointValue}, 0) * COALESCE(${cols.quantity}, 0)`;
  return {
    is: `ABS(${cols.gross}) <= ${bound}`,
    isNot: `ABS(${cols.gross}) > ${bound}`
  };
}

module.exports = { getBreakevenToleranceTicks, breakevenPredicate, normalizeTolerance };
