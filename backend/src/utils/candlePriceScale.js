function closeAtTime(candles, time) {
  let candidate = candles[0];
  for (const bar of candles) {
    if (bar.time > time) break;
    candidate = bar;
  }
  return candidate ? Number(candidate.close) : null;
}

/**
 * Detect an integer stock-split mismatch between provider candles and raw fills.
 * Returns the factor by which candle prices should be divided.
 */
function resolvePriceScale(candles, fills) {
  if (candles.length === 0 || fills.length === 0) return 1;
  const ratios = fills
    .map((fill) => {
      const barClose = closeAtTime(candles, fill.time);
      return barClose && fill.price > 0 ? barClose / fill.price : null;
    })
    .filter((ratio) => ratio !== null && Number.isFinite(ratio))
    .sort((left, right) => left - right);
  if (ratios.length === 0) return 1;

  const median = ratios[Math.floor(ratios.length / 2)];
  if (median >= 1.5) {
    const rounded = Math.round(median);
    if (rounded >= 2 && Math.abs(median - rounded) / rounded <= 0.1) return rounded;
  } else if (median <= 0.67 && median > 0) {
    const inverse = Math.round(1 / median);
    if (inverse >= 2 && Math.abs(1 / median - inverse) / inverse <= 0.1) return 1 / inverse;
  }

  return 1;
}

function applyPriceScale(candles, scale) {
  if (scale === 1) return candles;
  return candles.map((bar) => ({
    ...bar,
    open: Number(bar.open) / scale,
    high: Number(bar.high) / scale,
    low: Number(bar.low) / scale,
    close: Number(bar.close) / scale,
    volume: bar.volume === null || bar.volume === undefined
      ? null
      : Number(bar.volume) * scale
  }));
}

module.exports = {
  resolvePriceScale,
  applyPriceScale
};

