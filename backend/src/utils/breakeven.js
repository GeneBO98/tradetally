/**
 * Breakeven classification by GROSS P&L (price only, excluding commissions/fees).
 *
 * A trade is "breakeven" when its gross P&L is within either a fixed dollar
 * amount of zero or a `tolerance` number of ticks scaled per instrument:
 *
 *     ABS(gross) <= tolerance * tick_size * point_value * quantity
 *
 * Tick mode supports a default plus optional per-underlying overrides (e.g.
 * 2 ticks on ES but 5 on NQ). Dollar mode compares gross P&L directly with the
 * fixed amount and therefore works across stocks, options, futures, and grouped
 * multi-leg positions. A zero tolerance reduces to exact gross breakeven.
 *
 * Wins/losses are then decided by NET P&L among the non-breakeven trades.
 */

function normalizeTolerance(value) {
  const tol = Number(value);
  return Number.isFinite(tol) && tol > 0 ? tol : 0;
}

function normalizeMode(value) {
  return String(value || '').toLowerCase() === 'dollars' ? 'dollars' : 'ticks';
}

/**
 * Normalize a tolerance config into
 * { mode: 'ticks'|'dollars', default: number>=0, byUnderlying: {KEY: number>=0} }.
 * Accepts a plain number (treated as the default with no overrides) or an object
 * with `mode`, `default`, and `byUnderlying`. Legacy configs without a mode are
 * tick-based. Underlying keys are upper-cased and must be alphanumeric; values
 * must be finite and >= 0. Anything else is dropped. This sanitization is what
 * makes it safe to interpolate the values into SQL.
 */
function normalizeConfig(config) {
  if (config == null) return { mode: 'ticks', default: 0, byUnderlying: {} };
  if (typeof config === 'number' || typeof config === 'string') {
    return { mode: 'ticks', default: normalizeTolerance(config), byUnderlying: {} };
  }

  const mode = normalizeMode(config.mode ?? config.unit);
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

  return { mode, default: def, byUnderlying };
}

/**
 * Convert a user_settings row into the active tolerance config. Both stored
 * values are retained independently, so switching modes does not discard the
 * user's previous tick or dollar amount.
 */
function configFromSettings(settings) {
  const mode = normalizeMode(
    settings?.breakeven_tolerance_mode ?? settings?.breakevenToleranceMode
  );
  const defaultValue = mode === 'dollars'
    ? settings?.breakeven_tolerance_dollars ?? settings?.breakevenToleranceDollars
    : settings?.breakeven_tolerance_ticks ?? settings?.breakevenToleranceTicks;

  return normalizeConfig({
    mode,
    default: defaultValue,
    byUnderlying:
      settings?.breakeven_tolerance_ticks_by_underlying ??
      settings?.breakevenToleranceTicksByUnderlying
  });
}

/**
 * Read a user's breakeven tolerance config (mode + default + per-underlying overrides).
 * Missing or invalid values fall back to tick mode with a zero tolerance.
 */
async function getBreakevenToleranceConfig(userId) {
  try {
    const User = require('../models/User');
    const settings = await User.getSettings(userId);
    return configFromSettings(settings);
  } catch (error) {
    return { mode: 'ticks', default: 0, byUnderlying: {} };
  }
}

/**
 * Back-compat: read just the default tolerance scalar.
 */
async function getBreakevenToleranceTicks(userId) {
  try {
    const User = require('../models/User');
    const settings = await User.getSettings(userId);
    return normalizeTolerance(
      settings?.breakeven_tolerance_ticks ?? settings?.breakevenToleranceTicks
    );
  } catch (error) {
    return 0;
  }
}

/**
 * Stable string for cache keys that captures the effective tolerance config.
 */
function toleranceCacheKey(config) {
  const { mode, default: def, byUnderlying } = normalizeConfig(config);
  const parts = Object.keys(byUnderlying).sort().map(k => `${k}:${byUnderlying[k]}`);
  return `${mode}|${def}|${parts.join(',')}`;
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
 * @param {number|object} config - tolerance scalar or { mode, default, byUnderlying }
 * @returns {{is: string, isNot: string}} SQL predicates. `is` is true for
 *          breakeven trades; `isNot` is its negation (decisive trades).
 */
function breakevenPredicate(cols, config) {
  const { mode, default: def, byUnderlying } = normalizeConfig(config);

  if (mode === 'dollars') {
    if (def <= 0) {
      return { is: `${cols.gross} = 0`, isNot: `${cols.gross} <> 0` };
    }
    return {
      is: `ABS(${cols.gross}) <= (${def})`,
      isNot: `ABS(${cols.gross}) > (${def})`
    };
  }

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

/**
 * Grouped multi-leg positions cannot use a per-leg tick tolerance. Preserve
 * their historical exact-net behavior in tick mode, but apply a fixed-dollar
 * tolerance to the combined gross P&L when dollar mode is selected.
 */
function groupedBreakevenPredicate(cols, config) {
  const normalized = normalizeConfig(config);
  if (normalized.mode === 'dollars') {
    return breakevenPredicate({ gross: cols.gross }, normalized);
  }

  return {
    is: `(ROUND(${cols.net}::numeric, 2) = 0)`,
    isNot: `(ROUND(${cols.net}::numeric, 2) <> 0)`
  };
}

function isBreakevenGrossPnl(grossPnl, config) {
  const gross = Number(grossPnl);
  if (!Number.isFinite(gross)) return false;

  const normalized = normalizeConfig(config);
  if (normalized.mode === 'dollars') {
    return Math.abs(gross) <= normalized.default;
  }
  return gross === 0;
}

module.exports = {
  getBreakevenToleranceConfig,
  getBreakevenToleranceTicks,
  breakevenPredicate,
  groupedBreakevenPredicate,
  isBreakevenGrossPnl,
  normalizeTolerance,
  normalizeMode,
  normalizeConfig,
  configFromSettings,
  toleranceCacheKey
};
