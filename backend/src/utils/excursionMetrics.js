const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('./futuresUtils');
const { normalizeConfig } = require('./breakeven');

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveMultiplier(trade) {
  const instrumentType = trade.instrument_type || trade.instrumentType || 'stock';

  if (instrumentType === 'future') {
    const stored = parseNumeric(trade.point_value ?? trade.pointValue);
    if (stored != null && stored > 0) return stored;
    const underlying = trade.underlying_asset || trade.underlyingAsset || extractUnderlyingFromFuturesSymbol(trade.symbol);
    return getFuturesPointValue(underlying);
  }

  if (instrumentType === 'option') {
    const contractSize = parseNumeric(trade.contract_size ?? trade.contractSize);
    return contractSize != null && contractSize > 0 ? contractSize : 100;
  }

  return 1;
}

function resolvePointValue(trade) {
  if ((trade.instrument_type || trade.instrumentType) !== 'future') return null;
  const stored = parseNumeric(trade.point_value ?? trade.pointValue);
  if (stored != null && stored > 0) return stored;
  const underlying = trade.underlying_asset || trade.underlyingAsset || extractUnderlyingFromFuturesSymbol(trade.symbol);
  return getFuturesPointValue(underlying);
}

function signedPriceMove(entryPrice, exitPrice, side) {
  const entry = parseNumeric(entryPrice);
  const exit = parseNumeric(exitPrice);
  if (entry == null || exit == null) return null;
  if (side === 'short' || side === 'sell') return entry - exit;
  return exit - entry;
}

function capturedMoveDollars(trade) {
  const quantity = Math.abs(parseNumeric(trade.quantity) || 0);
  if (quantity <= 0) return null;

  const move = signedPriceMove(trade.entry_price ?? trade.entryPrice, trade.exit_price ?? trade.exitPrice, trade.side);
  if (move == null) return null;

  return Math.max(0, move * quantity * resolveMultiplier(trade));
}

function toFuturesPoints(value, trade) {
  const dollars = parseNumeric(value);
  if (dollars == null) return null;
  const quantity = Math.abs(parseNumeric(trade.quantity) || 0);
  const pointValue = resolvePointValue(trade);
  if (quantity <= 0 || pointValue == null || pointValue <= 0) return null;
  return dollars / (quantity * pointValue);
}

function toR(value, riskAmount) {
  const dollars = parseNumeric(value);
  const risk = parseNumeric(riskAmount);
  if (dollars == null || risk == null || risk <= 0) return null;
  return dollars / risk;
}

function isLegacyFuturesPointExcursion(trade, capturedMove = capturedMoveDollars(trade)) {
  const instrumentType = trade.instrument_type || trade.instrumentType || 'stock';
  if (instrumentType !== 'future') return false;

  const quantity = Math.abs(parseNumeric(trade.quantity) || 0);
  const pointValue = resolvePointValue(trade);
  const scale = quantity * (pointValue || 0);
  if (quantity <= 0 || !pointValue || pointValue <= 0 || scale <= 1 || !capturedMove || capturedMove <= 0) {
    return false;
  }

  const candidates = [
    parseNumeric(trade.mfe),
    parseNumeric(trade.post_exit_mfe ?? trade.postExitMfe)
  ].filter(value => value != null && value > 0);

  return candidates.some(value =>
    value < capturedMove - 0.005 &&
    value * scale >= capturedMove - 0.005
  );
}

function normalizeExcursionValue(value, trade, legacyPointUnits = isLegacyFuturesPointExcursion(trade)) {
  const numeric = parseNumeric(value);
  if (numeric == null) return null;
  if (!legacyPointUnits) return numeric;

  const quantity = Math.abs(parseNumeric(trade.quantity) || 0);
  const pointValue = resolvePointValue(trade);
  if (quantity <= 0 || !pointValue || pointValue <= 0) return numeric;

  return numeric * quantity * pointValue;
}

function breakevenToleranceDollars(trade, breakevenConfig) {
  const config = normalizeConfig(breakevenConfig);
  const underlying = String(trade.underlying_asset || trade.underlyingAsset || '').toUpperCase();
  const toleranceTicks = Object.prototype.hasOwnProperty.call(config.byUnderlying, underlying)
    ? config.byUnderlying[underlying]
    : config.default;

  if (toleranceTicks <= 0) return 0;

  const tickSize = parseNumeric(trade.tick_size ?? trade.tickSize);
  const quantity = Math.abs(parseNumeric(trade.quantity) || 0);
  const pointValue = resolvePointValue(trade);
  if (tickSize == null || tickSize <= 0 || quantity <= 0 || pointValue == null || pointValue <= 0) {
    return 0;
  }

  return toleranceTicks * tickSize * pointValue * quantity;
}

function grossPnl(trade) {
  const pnl = parseNumeric(trade.pnl) || 0;
  const commission = parseNumeric(trade.commission) || 0;
  const fees = parseNumeric(trade.fees) || 0;
  return pnl + commission + fees;
}

function classifyOutcome(trade, breakevenConfig = { default: 0, byUnderlying: {} }) {
  const gross = grossPnl(trade);
  const tolerance = breakevenToleranceDollars(trade, breakevenConfig);
  const isScratch = tolerance > 0 ? Math.abs(gross) <= tolerance : gross === 0;
  if (isScratch) return 'scratch';

  const net = parseNumeric(trade.pnl) || 0;
  if (net <= 0) return 'loser';

  const executions = Array.isArray(trade.executions) ? trade.executions : [];
  const exitAction = trade.side === 'short' ? 'buy' : 'sell';
  const exitFills = executions.filter(exec => String(exec.action || exec.side || '').toLowerCase() === exitAction);
  return exitFills.length > 1 ? 'partial_winner' : 'winner';
}

function buildExcursionMetrics(trade, riskAmount, breakevenConfig = { default: 0, byUnderlying: {} }) {
  const capturedMove = capturedMoveDollars(trade);
  const legacyPointUnits = isLegacyFuturesPointExcursion(trade, capturedMove);
  const mae = normalizeExcursionValue(trade.mae, trade, legacyPointUnits);
  const mfe = normalizeExcursionValue(trade.mfe, trade, legacyPointUnits);
  const postExitMae = normalizeExcursionValue(trade.post_exit_mae ?? trade.postExitMae, trade, legacyPointUnits);
  const postExitMfe = normalizeExcursionValue(trade.post_exit_mfe ?? trade.postExitMfe, trade, legacyPointUnits);
  const bestMfe = Math.max(
    mfe || 0,
    postExitMfe || 0,
    capturedMove || 0
  );
  const hasBestMfe = bestMfe > 0;
  const continuationBaseline = Math.max(mfe || 0, capturedMove || 0);
  const postExitMfeDelta = postExitMfe != null ? Math.max(0, postExitMfe - continuationBaseline) : null;
  const missedAfterExit = postExitMfe != null && capturedMove != null ? Math.max(0, postExitMfe - capturedMove) : null;
  const exitEfficiency = hasBestMfe && capturedMove != null
    ? Math.min(100, (capturedMove / bestMfe) * 100)
    : null;
  const outcome = classifyOutcome(trade, breakevenConfig);

  return {
    mae,
    mfe,
    post_exit_mae: postExitMae,
    post_exit_mfe: postExitMfe,
    captured_move: capturedMove,
    best_mfe: hasBestMfe ? bestMfe : null,
    post_exit_mfe_delta: postExitMfeDelta,
    missed_after_exit: missedAfterExit,
    exit_efficiency: exitEfficiency,
    gross_pnl: grossPnl(trade),
    legacy_point_units: legacyPointUnits,
    outcome,
    is_winner: outcome === 'winner' || outcome === 'partial_winner',
    mae_points: toFuturesPoints(mae, trade),
    mfe_points: toFuturesPoints(mfe, trade),
    post_exit_mae_points: toFuturesPoints(postExitMae, trade),
    post_exit_mfe_points: toFuturesPoints(postExitMfe, trade),
    captured_move_points: toFuturesPoints(capturedMove, trade),
    best_mfe_points: toFuturesPoints(hasBestMfe ? bestMfe : null, trade),
    post_exit_mfe_delta_points: toFuturesPoints(postExitMfeDelta, trade),
    missed_after_exit_points: toFuturesPoints(missedAfterExit, trade),
    mae_r: toR(mae, riskAmount),
    mfe_r: toR(mfe, riskAmount),
    post_exit_mae_r: toR(postExitMae, riskAmount),
    post_exit_mfe_r: toR(postExitMfe, riskAmount),
    captured_move_r: toR(capturedMove, riskAmount),
    best_mfe_r: toR(hasBestMfe ? bestMfe : null, riskAmount),
    post_exit_mfe_delta_r: toR(postExitMfeDelta, riskAmount),
    missed_after_exit_r: toR(missedAfterExit, riskAmount)
  };
}

module.exports = {
  buildExcursionMetrics,
  capturedMoveDollars,
  classifyOutcome,
  grossPnl,
  isLegacyFuturesPointExcursion,
  normalizeExcursionValue,
  parseNumeric,
  resolveMultiplier,
  resolvePointValue,
  toFuturesPoints,
  toR
};
