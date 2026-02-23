const AggregateAnalytics = require('../models/AggregateAnalytics');
const cache = require('../utils/cache');
const aiService = require('../utils/aiService');

const CACHE_TTL = 20 * 60 * 1000; // 20 minutes
const AI_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const SHORT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function parseInstrumentTypes(query) {
  return query.instrumentTypes ? query.instrumentTypes.split(',') : undefined;
}

function cacheKey(category, period, instrumentTypes) {
  const instKey = instrumentTypes ? instrumentTypes.sort().join(',') : 'all';
  return `aggregate:${category}:${period || 'all'}:${instKey}`;
}

async function getCachedOrFetch(key, fetcher, ttl = CACHE_TTL) {
  const cached = cache.get(key);
  if (cached) {
    console.log(`[AGGREGATE] Cache hit: ${key}`);
    return cached;
  }
  console.log(`[AGGREGATE] Cache miss: ${key}`);
  const data = await fetcher();
  cache.set(key, data, ttl);
  return data;
}

// ---- Admin endpoints (full data with user counts) ----

exports.getAdminAll = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-all', period, instrumentTypes), () =>
      AggregateAnalytics.getAll(period, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin all:', error);
    res.status(500).json({ error: 'Failed to fetch aggregate analytics' });
  }
};

exports.getAdminSymbols = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-symbols', period, instrumentTypes), () =>
      AggregateAnalytics.getSymbolPerformance(period, 100, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin symbols:', error);
    res.status(500).json({ error: 'Failed to fetch symbol performance' });
  }
};

exports.getAdminTimeAnalysis = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-time', period, instrumentTypes), () =>
      AggregateAnalytics.getTimeOfDayAnalysis(period, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin time analysis:', error);
    res.status(500).json({ error: 'Failed to fetch time analysis' });
  }
};

exports.getAdminStrategies = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-strategies', period, instrumentTypes), () =>
      AggregateAnalytics.getStrategyAnalysis(period, 100, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin strategies:', error);
    res.status(500).json({ error: 'Failed to fetch strategy analysis' });
  }
};

exports.getAdminBehavioral = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-behavioral', period, instrumentTypes), () =>
      AggregateAnalytics.getBehavioralPatterns(period, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin behavioral:', error);
    res.status(500).json({ error: 'Failed to fetch behavioral patterns' });
  }
};

// ---- New admin endpoints ----

exports.getAdminHoldTime = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-hold-time', period, instrumentTypes), () =>
      AggregateAnalytics.getHoldTimeComparison(period, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin hold time:', error);
    res.status(500).json({ error: 'Failed to fetch hold time comparison' });
  }
};

exports.getAdminConsecutiveLoss = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-consecutive-loss', period, instrumentTypes), () =>
      AggregateAnalytics.getConsecutiveLossAnalysis(period, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin consecutive loss:', error);
    res.status(500).json({ error: 'Failed to fetch consecutive loss analysis' });
  }
};

exports.getAdminSentiment = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-sentiment', period, instrumentTypes), () =>
      AggregateAnalytics.getSentimentAnalysis(period, 50, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin sentiment:', error);
    res.status(500).json({ error: 'Failed to fetch sentiment analysis' });
  }
};

exports.getAdminMostTradedToday = async (req, res) => {
  try {
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-most-traded-today', 'today', instrumentTypes), () =>
      AggregateAnalytics.getMostTradedToday(options), SHORT_CACHE_TTL
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin most traded today:', error);
    res.status(500).json({ error: 'Failed to fetch most traded today' });
  }
};

exports.getAdminRevengeCost = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('admin-revenge-cost', period, instrumentTypes), () =>
      AggregateAnalytics.getRevengeTradingCost(period, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching admin revenge cost:', error);
    res.status(500).json({ error: 'Failed to fetch revenge trading cost' });
  }
};

// ---- Pro user endpoints (curated, no user counts) ----

exports.getCommunityAll = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-all', period, instrumentTypes), () =>
      AggregateAnalytics.getCommunityInsights(period, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community insights:', error);
    res.status(500).json({ error: 'Failed to fetch community insights' });
  }
};

exports.getCommunitySymbols = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-symbols', period, instrumentTypes), () =>
      AggregateAnalytics.getSymbolPerformance(period, 10, options).then(rows =>
        rows.map(({ user_count, ...rest }) => rest)
      )
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community symbols:', error);
    res.status(500).json({ error: 'Failed to fetch symbol performance' });
  }
};

exports.getCommunityTimeAnalysis = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-time', period, instrumentTypes), () =>
      AggregateAnalytics.getTimeOfDayAnalysis(period, options).then(data => ({
        hourly: data.hourly.map(({ user_count, ...rest }) => rest),
        day_of_week: data.day_of_week.map(({ user_count, ...rest }) => rest)
      }))
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community time analysis:', error);
    res.status(500).json({ error: 'Failed to fetch time analysis' });
  }
};

exports.getCommunityStrategies = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-strategies', period, instrumentTypes), () =>
      AggregateAnalytics.getStrategyAnalysis(period, 10, options).then(rows =>
        rows.map(({ user_count, ...rest }) => rest)
      )
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community strategies:', error);
    res.status(500).json({ error: 'Failed to fetch strategy analysis' });
  }
};

exports.getCommunityBehavioral = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-behavioral', period, instrumentTypes), () =>
      AggregateAnalytics.getBehavioralPatterns(period, options).then(data => ({
        patterns: data.patterns.map(({ affected_users, ...rest }) => rest),
        revenge_trading: data.revenge_trading ? (() => {
          const { affected_users, ...rest } = data.revenge_trading;
          return rest;
        })() : null
      }))
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community behavioral:', error);
    res.status(500).json({ error: 'Failed to fetch behavioral patterns' });
  }
};

// ---- New community endpoints ----

exports.getCommunityHoldTime = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-hold-time', period, instrumentTypes), () =>
      AggregateAnalytics.getHoldTimeComparison(period, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community hold time:', error);
    res.status(500).json({ error: 'Failed to fetch hold time comparison' });
  }
};

exports.getCommunityConsecutiveLoss = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-consecutive-loss', period, instrumentTypes), () =>
      AggregateAnalytics.getConsecutiveLossAnalysis(period, options).then(rows =>
        rows.map(({ user_count, ...rest }) => rest)
      )
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community consecutive loss:', error);
    res.status(500).json({ error: 'Failed to fetch consecutive loss analysis' });
  }
};

exports.getCommunitySentiment = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-sentiment', period, instrumentTypes), () =>
      AggregateAnalytics.getSentimentAnalysis(period, 20, options).then(rows =>
        rows.map(({ user_count, ...rest }) => rest)
      )
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community sentiment:', error);
    res.status(500).json({ error: 'Failed to fetch sentiment analysis' });
  }
};

exports.getCommunityMostTradedToday = async (req, res) => {
  try {
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-most-traded-today', 'today', instrumentTypes), () =>
      AggregateAnalytics.getMostTradedToday(options).then(rows =>
        rows.map(({ user_count, ...rest }) => rest)
      ), SHORT_CACHE_TTL
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community most traded today:', error);
    res.status(500).json({ error: 'Failed to fetch most traded today' });
  }
};

exports.getCommunityRevengeCost = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const data = await getCachedOrFetch(cacheKey('community-revenge-cost', period, instrumentTypes), () =>
      AggregateAnalytics.getRevengeTradingCost(period, options).then(d => {
        if (!d) return null;
        const { affected_users, ...rest } = d;
        return rest;
      })
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching community revenge cost:', error);
    res.status(500).json({ error: 'Failed to fetch revenge trading cost' });
  }
};

// ---- Percentile endpoint (Pro users) ----

exports.getPercentile = async (req, res) => {
  try {
    const userId = req.user.id;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const instKey = instrumentTypes ? instrumentTypes.sort().join(',') : 'all';
    const data = await getCachedOrFetch(`aggregate:percentile:${userId}:${instKey}`, () =>
      AggregateAnalytics.getUserPercentiles(userId, options)
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching percentile:', error);
    res.status(500).json({ error: 'Failed to fetch percentile data' });
  }
};

// ---- Public Pulse (no auth) ----

exports.getPublicPulse = async (req, res) => {
  try {
    const data = await getCachedOrFetch('aggregate:public-pulse', () =>
      AggregateAnalytics.getPublicPulse(), SHORT_CACHE_TTL
    );
    res.json(data);
  } catch (error) {
    console.error('[AGGREGATE] Error fetching public pulse:', error);
    res.status(500).json({ error: 'Failed to fetch public pulse' });
  }
};

// ---- AI Summary (Pro users) ----

exports.getAISummary = async (req, res) => {
  try {
    const { period } = req.query;
    const instrumentTypes = parseInstrumentTypes(req.query);
    const options = { instrumentTypes };
    const instKey = instrumentTypes ? instrumentTypes.sort().join(',') : 'all';
    const periodKey = period || 'all';
    const userId = req.user.id;

    // Check if user has their own AI provider configured
    const db = require('../config/database');
    const userSettingsResult = await db.query(
      'SELECT ai_provider FROM user_settings WHERE user_id = $1',
      [userId]
    );
    const hasUserProvider = userSettingsResult.rows.length > 0 && userSettingsResult.rows[0].ai_provider;

    if (hasUserProvider) {
      // User has their own AI provider - generate on-the-fly with per-user cache
      const userCacheKey = `ai-summary:user_${userId}:${periodKey}:${instKey}`;
      const cached = cache.get(userCacheKey);
      if (cached) {
        console.log('[AGGREGATE] User AI summary cache hit');
        return res.json(cached);
      }

      const insights = await getCachedOrFetch(cacheKey('community-all', period, instrumentTypes), () =>
        AggregateAnalytics.getCommunityInsights(period, options)
      );

      const prompt = buildAISummaryPrompt(insights, period);
      const summary = await aiService.generateResponse(userId, prompt, { maxTokens: 16000 });

      const data = { summary, generated_at: new Date().toISOString(), source: 'user' };
      cache.set(userCacheKey, data, AI_CACHE_TTL);
      return res.json(data);
    }

    // No user provider - return cached admin-generated summary
    const dbCacheKey = cacheKey('ai-summary-db', period, instrumentTypes);
    const cached = cache.get(dbCacheKey);
    if (cached) {
      console.log('[AGGREGATE] DB AI summary cache hit');
      return res.json(cached);
    }

    const result = await db.query(
      'SELECT summary, generated_at FROM community_ai_summaries WHERE period = $1 AND instrument_types = $2',
      [periodKey, instKey]
    );

    if (result.rows.length > 0) {
      const data = { summary: result.rows[0].summary, generated_at: result.rows[0].generated_at, source: 'admin' };
      cache.set(dbCacheKey, data, AI_CACHE_TTL);
      return res.json(data);
    }

    // No cached summary available
    res.json({ summary: null, message: 'AI summary is being generated. Check back soon.' });
  } catch (error) {
    console.error('[AGGREGATE] Error generating AI summary:', error);
    if (error.message && error.message.includes('not properly configured')) {
      return res.status(400).json({ error: 'AI provider is not configured. Please set up an AI provider in Settings.' });
    }
    if (error.message && (error.message.includes('not found') || error.message.includes('connection failed') || error.message.includes('Cannot connect'))) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to generate AI summary' });
  }
};

function buildAISummaryPrompt(insights, period) {
  const periodLabel = period === '30d' ? 'last 30 days' : period === '90d' ? 'last 90 days' : 'all time';

  return `You are a trading analytics expert. Analyze the following anonymized community trading data (${periodLabel}) and provide actionable insights. Keep your response concise and focused on patterns that can help traders improve.

## Community Overview
- Total trades analyzed: ${insights.overview.total_trades}
- Symbols traded: ${insights.overview.symbols_traded}
- Overall win rate: ${insights.overview.overall_win_rate}%
- Average P&L per trade: $${insights.overview.avg_pnl_per_trade}
- Average hold time: ${insights.overview.avg_hold_time_minutes} minutes

## Top Performing Symbols (by avg P&L)
${insights.symbols.slice(0, 5).map(s => `- ${s.symbol}: Avg P&L $${s.avg_pnl}, Win Rate ${s.win_rate}%, ${s.trade_count} trades`).join('\n')}

## Time-of-Day Performance
### Best/Worst Hours
${insights.time_analysis.hourly.slice(0, 5).map(h => `- ${h.hour}:00: Avg P&L $${h.avg_pnl}, Win Rate ${h.win_rate}%`).join('\n')}

## Strategy Performance
${insights.strategies.slice(0, 5).map(s => `- ${s.strategy}: Avg P&L $${s.avg_pnl}, Win Rate ${s.win_rate}%, Profit Factor ${s.profit_factor}`).join('\n')}

## Hold Time Analysis
${insights.hold_time ? `- Winners: Avg hold ${insights.hold_time.winner?.avg_hold_minutes || 'N/A'} min\n- Losers: Avg hold ${insights.hold_time.loser?.avg_hold_minutes || 'N/A'} min` : 'No hold time data available'}

## Consecutive Loss Recovery
${insights.consecutive_loss && insights.consecutive_loss.length > 0 ? insights.consecutive_loss.slice(0, 3).map(c => `- After ${c.streak_length} consecutive losses: Next trade avg P&L $${c.avg_next_trade_pnl}, Win Rate ${c.next_trade_win_rate}%`).join('\n') : 'Not enough consecutive loss data'}

## Behavioral Patterns
${insights.behavioral.patterns.length > 0 ? insights.behavioral.patterns.map(p => `- ${p.pattern_type} (${p.severity}): ${p.occurrence_count} occurrences`).join('\n') : 'No significant behavioral patterns detected.'}
${insights.behavioral.revenge_trading ? `\nRevenge Trading: ${insights.behavioral.revenge_trading.total_events} events, avg additional loss $${insights.behavioral.revenge_trading.avg_additional_loss}` : ''}

Provide 3-5 key insights with specific, actionable recommendations. Format with markdown headers and bullet points.`;
}

