const db = require('../config/database');
const cache = require('../utils/cache');
const AnalyticsCache = require('./analyticsCache');
const TradeQueries = require('./tradeQueries');
const Trade = require('../models/Trade');
const NewsService = require('./newsService');
const { groupTradesIntoPositions } = require('../utils/openPositionGrouping');
const { getDateInTimezone, getDayOfWeekInTimezone } = require('../utils/timezone');

const DASHBOARD_TTL_MS = 24 * 60 * 60 * 1000;

function currentTradingWeekRange(now, timezone) {
  const endDate = getDateInTimezone(now, timezone || 'UTC', false);
  const weekday = getDayOfWeekInTimezone(now, timezone || 'UTC');
  const daysFromMonday = (weekday + 6) % 7;
  const localDateAtNoonUTC = new Date(`${endDate}T12:00:00.000Z`);
  localDateAtNoonUTC.setUTCDate(localDateAtNoonUTC.getUTCDate() - daysFromMonday);
  return {
    startDate: localDateAtNoonUTC.toISOString().slice(0, 10),
    endDate
  };
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseExecutions(trade) {
  if (!trade.executions || Array.isArray(trade.executions)) return trade;
  try {
    return { ...trade, executions: JSON.parse(trade.executions) };
  } catch (_) {
    return { ...trade, executions: [] };
  }
}

function newsPublishedAt(item) {
  const numeric = Number(item?.datetime);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric < 1e12 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const candidate = new Date(item?.publishedAt || item?.published_at || item?.date || 0);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

async function loadAnalytics(user) {
  const filters = currentTradingWeekRange(new Date(), user.timezone || 'UTC');
  const cacheKey = TradeQueries.cacheKey(user.id, filters);
  let analytics = cache.get(cacheKey);
  if (!analytics) analytics = await AnalyticsCache.get(user.id, cacheKey);

  // Newly issued widget tokens can race the periodic warmer. Populate the
  // same canonical cache on that first miss; subsequent widget reads remain
  // cheap and trade mutations still invalidate it normally.
  if (!analytics) {
    analytics = await TradeQueries.getAnalytics(user.id, filters);
    cache.set(cacheKey, analytics, DASHBOARD_TTL_MS);
    await AnalyticsCache.set(user.id, cacheKey, analytics, 24 * 60);
  }
  return analytics;
}

async function loadOpenPositionMetrics(userId) {
  const trades = (await Trade.findOpenPositionsByUser(userId, { limit: 200 })).map(parseExecutions);
  const positions = Object.values(groupTradesIntoPositions(trades));
  const symbols = [...new Set(positions.map(position => String(position.symbol || '').trim().toUpperCase()).filter(Boolean))];

  if (symbols.length === 0) {
    return {
      openUnrealizedPnL: 0,
      openPositionsCount: 0,
      todayPnL: 0,
      winningOpenPositions: 0,
      symbols: []
    };
  }

  // Options are intentionally excluded: price_monitoring can contain the
  // underlying equity ticker for an option position, which is not a valid
  // contract quote. Futures remain eligible, but a missing/unsupported cached
  // quote is skipped below rather than guessed.
  const quoteSymbols = [...new Set(positions
    .filter(position => position.instrumentType !== 'option')
    .map(position => String(position.symbol || '').trim().toUpperCase())
    .filter(Boolean))];
  const quoteResult = quoteSymbols.length > 0
    ? await db.query(
        `SELECT UPPER(symbol) AS symbol, current_price, price_change
         FROM price_monitoring
         WHERE UPPER(symbol) = ANY($1::text[])`,
        [quoteSymbols]
      )
    : { rows: [] };
  const quotes = new Map(quoteResult.rows.map(row => [row.symbol, row]));

  let openUnrealizedPnL = 0;
  let todayPnL = 0;
  let winningOpenPositions = 0;

  for (const position of positions) {
    if (position.instrumentType === 'option') continue;
    const quote = quotes.get(String(position.symbol || '').trim().toUpperCase());
    const currentPrice = finiteNumber(quote?.current_price, NaN);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

    const quantity = finiteNumber(position.totalQuantity);
    const multiplier = position.instrumentType === 'option'
      ? finiteNumber(position.contractSize, 100)
      : (position.instrumentType === 'future' ? finiteNumber(position.pointValue, 1) : 1);
    const currentValue = currentPrice * quantity * multiplier;
    const unrealized = position.side === 'short'
      ? finiteNumber(position.totalCost) - currentValue
      : currentValue - finiteNumber(position.totalCost);

    openUnrealizedPnL += unrealized;
    if (unrealized > 0) winningOpenPositions += 1;

    const dayPriceChange = finiteNumber(quote?.price_change, NaN);
    if (Number.isFinite(dayPriceChange)) {
      const direction = position.side === 'short' ? -1 : 1;
      todayPnL += dayPriceChange * quantity * multiplier * direction;
    }
  }

  return {
    openUnrealizedPnL,
    openPositionsCount: positions.length,
    todayPnL,
    winningOpenPositions,
    symbols
  };
}

async function loadTopNews(symbols) {
  if (symbols.length === 0) return null;
  const rows = await NewsService.getCachedNews(symbols);
  const newest = rows
    .flatMap(row => {
      const items = Array.isArray(row.news_items) ? row.news_items : [];
      return items.map(item => ({ ...item, symbol: item.symbol || row.symbol }));
    })
    .map(item => ({ item, publishedAt: newsPublishedAt(item) }))
    .filter(candidate => candidate.publishedAt && candidate.item.headline)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[0];

  if (!newest) return null;
  return {
    headline: String(newest.item.headline),
    source: String(newest.item.source || ''),
    symbol: newest.item.symbol ? String(newest.item.symbol) : null,
    publishedAt: newest.publishedAt.toISOString()
  };
}

async function loadTopInsight(userId) {
  // Summary cache keys include filters and grouping settings. The dashboard
  // warmer writes the current summary each interval, so select its newest
  // still-valid entry without allowing the widget to supply filter input.
  const result = await db.query(
    `SELECT data
     FROM analytics_cache
     WHERE user_id = $1
       AND LEFT(cache_key, CHAR_LENGTH($2)) = $2
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, `ai_insight_summary_${userId}_`]
  );
  const data = result.rows[0]?.data;
  const insight = data?.summaries?.[0] || data?.summary || null;
  if (!insight?.headline || !insight?.body) return null;
  return {
    headline: String(insight.headline),
    body: String(insight.body),
    tone: insight.tone ? String(insight.tone) : null
  };
}

async function getSnapshot(user) {
  const [analytics, positionMetrics, topInsight] = await Promise.all([
    loadAnalytics(user),
    loadOpenPositionMetrics(user.id),
    loadTopInsight(user.id)
  ]);
  const topNews = await loadTopNews(positionMetrics.symbols);
  const summary = analytics?.summary || {};

  return {
    weekPnL: finiteNumber(summary.totalPnL),
    winRate: finiteNumber(summary.winRate),
    weekTrades: Math.max(0, Math.trunc(finiteNumber(summary.totalTrades))),
    openUnrealizedPnL: positionMetrics.openUnrealizedPnL,
    openPositionsCount: positionMetrics.openPositionsCount,
    todayPnL: positionMetrics.todayPnL,
    winningOpenPositions: positionMetrics.winningOpenPositions,
    topNews,
    topInsight,
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  currentTradingWeekRange,
  getSnapshot,
  loadTopNews
};
