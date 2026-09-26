const db = require('../config/database');
const cache = require('../utils/cache');
const AnalyticsCache = require('./analyticsCache');
const TradeQueries = require('./tradeQueries');
const Trade = require('../models/Trade');
const NewsService = require('./newsService');
const finnhub = require('../utils/finnhub');
const { groupTradesIntoPositions } = require('../utils/openPositionGrouping');
const { getDateInTimezone, getDayOfWeekInTimezone } = require('../utils/timezone');

const DASHBOARD_TTL_MS = 24 * 60 * 60 * 1000;
const NEWS_STALE_AFTER_MS = 75 * 60 * 1000;
const RECENT_NEWS_LIMIT = 5;
const MARKET_TIME_ZONE = 'America/New_York';
const QUOTE_FRESHNESS_MS = 2 * 60 * 1000;
const CLOSED_METRICS_TTL_MINUTES = 7 * 24 * 60;
const configuredQuoteTimeoutMs = parseInt(process.env.OPEN_POSITIONS_FINNHUB_TIMEOUT_MS || '', 10);
const QUOTE_TIMEOUT_MS = Number.isFinite(configuredQuoteTimeoutMs) && configuredQuoteTimeoutMs > 0
  ? configuredQuoteTimeoutMs
  : 3000;

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

function previousWeekday(dateString) {
  const cursor = new Date(`${dateString}T12:00:00.000Z`);
  do {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
  return cursor.toISOString().slice(0, 10);
}

function equityMarketState(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const part = type => parts.find(candidate => candidate.type === type)?.value;
  const value = type => Number(part(type) || 0);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
  const minutesAfterMidnight = value('hour') * 60 + value('minute');
  const isWeekday = weekday >= 1 && weekday <= 5;
  const isOpen = isWeekday && minutesAfterMidnight >= 9 * 60 + 30 && minutesAfterMidnight < 16 * 60;
  let sessionDate = `${part('year')}-${part('month')}-${part('day')}`;

  if (!isWeekday || minutesAfterMidnight < 9 * 60 + 30) {
    sessionDate = previousWeekday(sessionDate);
  }

  return { isOpen, sessionDate };
}

function openPositionSignature(positions) {
  return positions
    .map(position => [
      String(position.symbol || '').trim().toUpperCase(),
      position.instrumentType || 'stock',
      String(position.side || '').toLowerCase(),
      finiteNumber(position.totalQuantity),
      finiteNumber(position.pointValue, 1)
    ].join(':'))
    .sort()
    .join('|');
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

async function loadOpenPositionMetrics(userId, now = new Date()) {
  const trades = (await Trade.findOpenPositionsByUser(userId, { limit: 200 })).map(parseExecutions);
  const positions = Object.values(groupTradesIntoPositions(trades));
  const market = equityMarketState(now);
  const positionSignature = openPositionSignature(positions);
  const closeCacheKey = `widget_today_pnl_${market.sessionDate}`;
  const cachedClose = market.isOpen
    ? null
    : await AnalyticsCache.get(userId, closeCacheKey);
  const matchingCachedClose = cachedClose?.positionSignature === positionSignature
    ? cachedClose
    : null;
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
  // Read all rows once. During the session only two-minute rows are live; after
  // the close the latest persisted row is the stable official-session fallback.
  const quoteResult = quoteSymbols.length > 0 && finnhub.isConfigured()
    ? await db.query(
        `SELECT UPPER(symbol) AS symbol, current_price, price_change, last_updated
         FROM price_monitoring
         WHERE UPPER(symbol) = ANY($1::text[])`,
        [quoteSymbols]
      )
    : { rows: [] };
  const quotes = new Map(quoteResult.rows
    .filter(row => {
      if (!market.isOpen || !row.last_updated) return true;
      const updatedAt = new Date(row.last_updated).getTime();
      return Number.isFinite(updatedAt) && now.getTime() - updatedAt <= QUOTE_FRESHNESS_MS;
    })
    .map(row => [row.symbol, row]));

  const hasUsableDayQuote = quote => {
    const currentPrice = finiteNumber(quote?.current_price, NaN);
    const dayChange = finiteNumber(quote?.price_change, NaN);
    return Number.isFinite(currentPrice) && currentPrice > 0 && Number.isFinite(dayChange);
  };
  const uncachedSymbols = quoteSymbols.filter(symbol => !hasUsableDayQuote(quotes.get(symbol)));
  if (uncachedSymbols.length > 0 && finnhub.isConfigured() && (market.isOpen || !matchingCachedClose)) {
    let timeoutId;
    try {
      const freshQuotes = await Promise.race([
        finnhub.getBatchQuotes(uncachedSymbols, {
          source: 'open_positions',
          priority: 0,
          userId,
          maxQueueWaitMs: QUOTE_TIMEOUT_MS
        }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Widget quote fetch timed out')), QUOTE_TIMEOUT_MS);
        })
      ]);
      for (const symbol of uncachedSymbols) {
        const quote = freshQuotes?.[symbol];
        if (quote) quotes.set(symbol, { current_price: quote.c, price_change: quote.d });
      }
    } catch (error) {
      // Keep any fresh cache rows while treating unresolved positions as
      // unquoted, just as the dashboard does when its provider call fails.
      console.warn('[WIDGET] Open-position quote refresh unavailable:', error.message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let openUnrealizedPnL = 0;
  let computedTodayPnL = 0;
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
      computedTodayPnL += dayPriceChange * quantity * multiplier * direction;
    }
  }

  const hasCompleteQuoteSet = quoteSymbols.every(symbol => hasUsableDayQuote(quotes.get(symbol)));
  let todayPnL = matchingCachedClose
    ? finiteNumber(matchingCachedClose.todayPnL)
    : computedTodayPnL;

  // Continuously seed the session close while the market is open. Once closed,
  // the first complete calculation is persisted and every widget refresh uses
  // that same total instead of publishing whichever quote subset resolved.
  if (hasCompleteQuoteSet && (!matchingCachedClose || market.isOpen)) {
    await AnalyticsCache.set(userId, closeCacheKey, {
      positionSignature,
      todayPnL: computedTodayPnL,
      sessionDate: market.sessionDate
    }, CLOSED_METRICS_TTL_MINUTES);
    todayPnL = computedTodayPnL;
  }

  return {
    openUnrealizedPnL,
    openPositionsCount: positions.length,
    todayPnL,
    winningOpenPositions,
    symbols
  };
}

async function loadNewsSnapshot(symbols, now = new Date()) {
  if (symbols.length === 0) {
    return { topNews: null, recentNews: [], newsFetchedAt: null };
  }
  const normalizedSymbols = [...new Set(symbols.map(symbol => String(symbol).trim().toUpperCase()).filter(Boolean))];
  const rows = await NewsService.getCachedNews(symbols);
  const cachedSymbols = new Set(rows.map(row => String(row.symbol || '').trim().toUpperCase()));
  const staleSymbols = normalizedSymbols.filter(symbol => {
    const row = rows.find(candidate => String(candidate.symbol || '').trim().toUpperCase() === symbol);
    if (!row?.fetched_at) return true;
    const fetchedAt = new Date(row.fetched_at);
    return Number.isNaN(fetchedAt.getTime()) || now.getTime() - fetchedAt.getTime() > NEWS_STALE_AFTER_MS;
  });

  // Never make the WidgetKit request wait on the market-data provider. The
  // scheduler/service drain deduplicates this with concurrent widget reads and
  // with an already-running hourly refresh.
  if (staleSymbols.length > 0 || cachedSymbols.size < normalizedSymbols.length) {
    NewsService.requestBackgroundRefresh(staleSymbols, { reason: 'widget_snapshot_stale' });
  }

  const cacheDates = rows
    .map(row => new Date(row.fetched_at))
    .filter(date => !Number.isNaN(date.getTime()));
  const newsFetchedAt = cacheDates.length > 0
    ? new Date(Math.max(...cacheDates.map(date => date.getTime()))).toISOString()
    : null;

  const candidates = rows
    .flatMap(row => {
      const items = Array.isArray(row.news_items) ? row.news_items : [];
      return items.map(item => ({ ...item, symbol: item.symbol || row.symbol }));
    })
    .map(item => ({ item, publishedAt: newsPublishedAt(item) }))
    .filter(candidate => candidate.publishedAt && candidate.item.headline)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const seen = new Set();
  const recentNews = [];
  for (const candidate of candidates) {
    const key = candidate.item.id || candidate.item.url ||
      `${candidate.item.headline}|${candidate.publishedAt.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recentNews.push({
      headline: String(candidate.item.headline),
      source: String(candidate.item.source || ''),
      symbol: candidate.item.symbol ? String(candidate.item.symbol) : null,
      publishedAt: candidate.publishedAt.toISOString(),
      url: candidate.item.url ? String(candidate.item.url) : null
    });
    if (recentNews.length === RECENT_NEWS_LIMIT) break;
  }

  return { topNews: recentNews[0] || null, recentNews, newsFetchedAt };
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

async function getSnapshot(user, now = new Date()) {
  const [analytics, positionMetrics, topInsight] = await Promise.all([
    loadAnalytics(user),
    loadOpenPositionMetrics(user.id, now),
    loadTopInsight(user.id)
  ]);
  const news = await loadNewsSnapshot(positionMetrics.symbols);
  const summary = analytics?.summary || {};

  return {
    weekPnL: finiteNumber(summary.totalPnL),
    winRate: finiteNumber(summary.winRate),
    weekTrades: Math.max(0, Math.trunc(finiteNumber(summary.totalTrades))),
    openUnrealizedPnL: positionMetrics.openUnrealizedPnL,
    openPositionsCount: positionMetrics.openPositionsCount,
    todayPnL: positionMetrics.todayPnL,
    winningOpenPositions: positionMetrics.winningOpenPositions,
    topNews: news.topNews,
    recentNews: news.recentNews,
    newsFetchedAt: news.newsFetchedAt,
    topInsight,
    updatedAt: now.toISOString()
  };
}

module.exports = {
  currentTradingWeekRange,
  equityMarketState,
  getSnapshot,
  loadNewsSnapshot,
  NEWS_STALE_AFTER_MS
};
