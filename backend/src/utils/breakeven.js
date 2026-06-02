/**
 * Breakeven classification by GROSS P&L (price only, excluding commissions/fees).
 *
 * A trade is "breakeven" when its gross P&L is within +/- `tolerance` ticks of
 * zero, scaled per-instrument by tick_size * point_value * quantity:
 *
 *     ABS(gross) <= tolerance * tick_size * point_value * quantity
 *
 * The tolerance can be a single default (applied to every instrument) plus
 * optional per-underlying overrides (e.g. 2 ticks on ES but 5 on NQ). With a
 * default of 0 and no overrides -- or when an instrument has no tick_size/
 * point_value (e.g. stocks) -- this reduces to exact gross breakeven
 * (gross = 0), so existing behavior is unchanged unless the user opts in.
 *
 * Wins/losses are then decided by NET P&L among the non-breakeven trades.
 */

function normalizeTolerance(value) {
  const tol = Number(value);
  return Number.isFinite(tol) && tol > 0 ? tol : 0;
}

/**
 * Normalize a tolerance config into { default: number>=0, byUnderlying: {KEY: number>=0} }.
 * Accepts a plain number (treated as the default with no overrides) or an object
 * with `default` and `byUnderlying`. Underlying keys are upper-cased and must be
 * alphanumeric; values must be finite and >= 0. Anything else is dropped. This
 * sanitization is what makes it safe to interpolate the map into SQL.
 */
function normalizeConfig(config) {
  if (config == null) return { default: 0, byUnderlying: {} };
  if (typeof config === 'number' || typeof config === 'string') {
    return { default: normalizeTolerance(config), byUnderlying: {} };
  }

  const def = normalizeTolerance(config.default);

  let rawMap = config.byUnderlying;
  if (typeof rawMap === 'string') {
    try { rawMap = JSON.parse(rawMap); } catch (e) { rawMap = null; }
  }

  const byUnderlying = {};
  if (rawMap && typeof rawMap === 'object') {
    for (const [k, v] of Object.entries(rawMap)) {
      const key = String(k).toUpperCase();
      if (!/^[A-Z0-9]+$/.test(key)) continue;       // futures underlyings only (ES, NQ, M2K, ZB...)
      const val = Number(v);
      if (!Number.isFinite(val) || val < 0) continue; // 0 is a valid explicit override
      byUnderlying[key] = val;
    }
  }

  return { default: def, byUnderlying };
}

/**
 * Read a user's breakeven tolerance config (default + per-underlying overrides).
 * Returns { default, byUnderlying }; any missing/invalid value falls back to 0/{}.
 */
async function getBreakevenToleranceConfig(userId) {
  try {
    const User = require('../models/User');
    const settings = await User.getSettings(userId);
    return normalizeConfig({
      default: settings?.breakeven_tolerance_ticks,
      byUnderlying: settings?.breakeven_tolerance_ticks_by_underlying
    });
  } catch (error) {
    return { default: 0, byUnderlying: {} };
  }
}

/**
 * Back-compat: read just the default tolerance scalar.
 */
async function getBreakevenToleranceTicks(userId) {
  const { default: def } = await getBreakevenToleranceConfig(userId);
  return def;
}

/**
 * Stable string for cache keys that captures the effective tolerance config.
 */
function toleranceCacheKey(config) {
  const { default: def, byUnderlying } = normalizeConfig(config);
  const parts = Object.keys(byUnderlying).sort().map(k => `${k}:${byUnderlying[k]}`);
  return `${def}|${parts.join(',')}`;
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
 * @param {string} [cols.underlying] - underlying_asset column expression (required
 *        for per-underlying overrides; without it only the default is used)
 * @param {number|object} config - tolerance scalar or { default, byUnderlying }
 * @returns {{is: string, isNot: string}} SQL predicates. `is` is true for
 *          breakeven trades; `isNot` is its negation (decisive trades).
 */
function breakevenPredicate(cols, config) {
  const { default: def, byUnderlying } = normalizeConfig(config);

  const overrides = cols.underlying ? Object.entries(byUnderlying) : [];
  const anyNonZero = def > 0 || overrides.some(([, v]) => v > 0);

  // Keep the simple, exact form when nothing widens breakeven. This also keeps
  // the generated SQL identical to the pre-tolerance behavior (characterization).
  if (!anyNonZero) {
    return { is: `${cols.gross} = 0`, isNot: `${cols.gross} <> 0` };
  }

  let toleranceExpr;
  if (overrides.length > 0) {
    const whens = overrides.map(([k, v]) => `WHEN '${k}' THEN ${v}`).join(' ');
    toleranceExpr = `CASE UPPER(${cols.underlying}) ${whens} ELSE ${def} END`;
  } else {
    toleranceExpr = `${def}`;
  }

  const bound = `(${toleranceExpr}) * COALESCE(${cols.tickSize}, 0) * COALESCE(${cols.pointValue}, 0) * COALESCE(${cols.quantity}, 0)`;
  return {
    is: `ABS(${cols.gross}) <= ${bound}`,
    isNot: `ABS(${cols.gross}) > ${bound}`
  };
}

module.exports = {
  getBreakevenToleranceConfig,
  getBreakevenToleranceTicks,
  breakevenPredicate,
  normalizeTolerance,
  normalizeConfig,
  toleranceCacheKey
};
