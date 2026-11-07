const AppError = require('./AppError');
const { parseNumeric, resolveMultiplier, normalizeExcursionValue } = require('./excursionMetrics');

const excursion_fields = ['mae', 'mfe', 'post_exit_mae', 'post_exit_mfe'];
const legacy_fields = { post_exit_mae: 'postExitMae', post_exit_mfe: 'postExitMfe' };

// Excursions measure price movement, before commissions and fees. R uses the
// current stop, matching the MAE/MFE analytics risk denominator.
function getExcursionScale(trade, unit) {
  if (unit === 'dollars') return 1;
  const quantity = parseNumeric(trade.quantity);
  const multiplier = resolveMultiplier(trade);
  if (quantity == null || quantity <= 0 || multiplier == null || multiplier <= 0) return null;
  const scale = quantity * multiplier;
  if (unit === 'points') return scale;
  if (unit !== 'r') return null;
  const entry = parseNumeric(trade.entry_price ?? trade.entryPrice);
  const stop = parseNumeric(trade.stop_loss ?? trade.stopLoss);
  if (entry == null || stop == null) return null;
  const distance = ['short', 'sell'].includes(trade.side) ? stop - entry
    : ['long', 'buy'].includes(trade.side) ? entry - stop : null;
  return distance != null && distance > 0 ? distance * scale : null;
}

function convertExcursionInputs(data, trade) {
  const unit = data.excursion_unit ?? 'dollars';
  if (!['dollars', 'points', 'r'].includes(unit)) {
    throw new AppError(400, { error: 'excursion_unit must be dollars, points, or r' });
  }
  const converted = {};
  for (const field of excursion_fields) {
    const key = data[field] !== undefined ? field : legacy_fields[field];
    if (!key || data[key] === undefined) continue;
    const value = parseNumeric(data[key]);
    if (value == null) {
      converted[key] = null;
      continue;
    }
    const scale = getExcursionScale(trade, unit);
    if (scale == null) {
      throw new AppError(400, { error: unit === 'r'
        ? 'MAE/MFE in R requires an entry price, positive quantity, and a stop loss defining positive risk'
        : 'MAE/MFE in points requires positive quantity and a valid instrument multiplier' });
    }
    converted[key] = value * scale;
  }
  return converted;
}

function buildExcursionUnitValues(trade, native_rate = 1) {
  const points_scale = getExcursionScale(trade, 'points');
  const risk_scale = getExcursionScale(trade, 'r');
  const values = {};
  for (const field of excursion_fields) {
    const dollars = normalizeExcursionValue(trade[field] ?? trade[legacy_fields[field]], trade);
    values[`${field}_points`] = dollars != null && points_scale != null ? dollars / points_scale * native_rate : null;
    values[`${field}_r`] = dollars != null && risk_scale != null ? dollars / risk_scale : null;
  }
  return values;
}

module.exports = { getExcursionScale, convertExcursionInputs, buildExcursionUnitValues };
