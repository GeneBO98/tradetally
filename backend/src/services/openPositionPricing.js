const db = require('../config/database');
const finnhub = require('../utils/finnhub');

function getPositiveIntEnv(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const QUOTE_TIMEOUT_MS = getPositiveIntEnv('OPEN_POSITIONS_FINNHUB_TIMEOUT_MS', 3000);

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Best-effort current price for a single open stock/futures position, using the
// same sources as the dashboard Open Positions table: the price_monitoring cache
// (kept warm by the price monitor) first, then a single Finnhub quote. Never
// throws - callers just fall back to "no price" if a quote isn't available.
async function fetchCurrentPriceForSymbol(symbol, userId) {
  if (!symbol) return null;
  try {
    const cached = await db.query(
      `SELECT current_price FROM price_monitoring
       WHERE symbol = $1 AND last_updated > NOW() - INTERVAL '2 minutes'
       LIMIT 1`,
      [symbol]
    );
    const cachedPrice = cached.rows[0] ? parseFloat(cached.rows[0].current_price) : null;
    if (Number.isFinite(cachedPrice) && cachedPrice > 0) return cachedPrice;

    if (!finnhub.isConfigured()) return null;
    const quote = await withTimeout(
      finnhub.getQuote(symbol, { source: 'share_card', priority: 0, userId }),
      QUOTE_TIMEOUT_MS,
      'Share card Finnhub quote'
    );
    const price = quote && Number.isFinite(Number(quote.c)) ? Number(quote.c) : null;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch (error) {
    console.warn('[OPEN-POSITION-PRICING] current price lookup failed for', symbol, '-', error.message);
    return null;
  }
}

function getMultiplier(trade) {
  if (trade.instrument_type === 'option') return Number(trade.contract_size) || 100;
  if (trade.instrument_type === 'future' || trade.instrument_type === 'futures') {
    return Number(trade.point_value ?? trade.pointValue) || 1;
  }
  return 1;
}

// Unrealized P&L for an open position given a live current price. Returns nulls
// when the inputs aren't sufficient to compute a meaningful number.
function computeUnrealized(trade, currentPrice) {
  const entry = Number(trade.entry_price);
  const qty = Number(trade.quantity);
  if (!Number.isFinite(currentPrice) || !Number.isFinite(entry) || entry <= 0 || !Number.isFinite(qty) || qty <= 0) {
    return { unrealizedPnl: null, unrealizedPnlPercent: null };
  }
  const multiplier = getMultiplier(trade);
  const direction = String(trade.side || '').toLowerCase() === 'short' ? -1 : 1;
  const unrealizedPnl = (currentPrice - entry) * qty * multiplier * direction;
  const costBasis = entry * qty * multiplier;
  return {
    unrealizedPnl,
    unrealizedPnlPercent: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : null
  };
}

module.exports = { fetchCurrentPriceForSymbol, computeUnrealized };
