const db = require('../../config/database');

const THRESHOLDS = {
  // Fraction of total losses concentrated in a single symbol to call it "dominant".
  DOMINANT_LOSER_PCT: 0.5,
  // Trade count above which a low win rate gets flagged as overtrading.
  OVERTRADING_TRADE_COUNT: 20,
  OVERTRADING_WIN_RATE: 0.40,
  // Avg hold time below which a losing high-volume week gets flagged as impulsive.
  SCALPING_HOLD_MINUTES: 5,
  SCALPING_MIN_TRADES: 10,
};

async function fetchWeeklyAggregates(startDate, endDate, { bypassMarketingConsent = false } = {}) {
  const consentFilter = bypassMarketingConsent ? '' : 'AND u.marketing_consent = true';
  const query = `
    WITH weekly_trades AS (
      SELECT
        t.user_id,
        t.symbol,
        t.pnl,
        t.entry_time,
        t.exit_time,
        u.email,
        u.username,
        u.full_name
      FROM trades t
      INNER JOIN users u
        ON u.id = t.user_id
       AND u.is_active = true
       ${consentFilter}
      WHERE t.trade_date >= $1::date
        AND t.trade_date <= $2::date
    ),
    per_user AS (
      SELECT
        user_id,
        email,
        username,
        full_name,
        COUNT(*)::int AS trade_count,
        COALESCE(SUM(pnl), 0)::double precision AS total_pnl,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)::int AS win_count,
        SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END)::int AS loss_count,
        COALESCE(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END), 0)::double precision AS gross_wins,
        COALESCE(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END), 0)::double precision AS gross_losses,
        AVG(
          CASE
            WHEN entry_time IS NOT NULL AND exit_time IS NOT NULL
            THEN EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60.0
          END
        )::double precision AS avg_hold_minutes
      FROM weekly_trades
      GROUP BY user_id, email, username, full_name
    ),
    worst_trade AS (
      SELECT DISTINCT ON (user_id)
        user_id,
        symbol AS worst_trade_symbol,
        pnl AS worst_trade_pnl
      FROM weekly_trades
      WHERE pnl IS NOT NULL
      ORDER BY user_id, pnl ASC
    ),
    symbol_losses AS (
      SELECT
        user_id,
        symbol,
        SUM(pnl)::double precision AS symbol_pnl,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY SUM(pnl) ASC) AS rn
      FROM weekly_trades
      WHERE pnl < 0
      GROUP BY user_id, symbol
    ),
    top_loser_symbol AS (
      SELECT user_id, symbol AS top_loss_symbol, symbol_pnl AS top_loss_pnl
      FROM symbol_losses
      WHERE rn = 1
    ),
    symbol_wins AS (
      SELECT
        user_id,
        symbol,
        SUM(pnl)::double precision AS symbol_pnl,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY SUM(pnl) DESC) AS rn
      FROM weekly_trades
      WHERE pnl > 0
      GROUP BY user_id, symbol
    ),
    top_winner_symbol AS (
      SELECT user_id, symbol AS top_win_symbol, symbol_pnl AS top_win_pnl
      FROM symbol_wins
      WHERE rn = 1
    )
    SELECT
      pu.*,
      wt.worst_trade_symbol,
      wt.worst_trade_pnl,
      tls.top_loss_symbol,
      tls.top_loss_pnl,
      tws.top_win_symbol,
      tws.top_win_pnl
    FROM per_user pu
    LEFT JOIN worst_trade wt ON wt.user_id = pu.user_id
    LEFT JOIN top_loser_symbol tls ON tls.user_id = pu.user_id
    LEFT JOIN top_winner_symbol tws ON tws.user_id = pu.user_id
    WHERE pu.trade_count > 0
  `;
  const { rows } = await db.query(query, [startDate, endDate]);
  return rows.map(normalizeRow);
}

function normalizeRow(row) {
  return {
    userId: row.user_id,
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    tradeCount: row.trade_count,
    totalPnL: parseFloat(row.total_pnl) || 0,
    winCount: row.win_count || 0,
    lossCount: row.loss_count || 0,
    grossWins: parseFloat(row.gross_wins) || 0,
    grossLosses: parseFloat(row.gross_losses) || 0,
    avgHoldMinutes: row.avg_hold_minutes != null ? parseFloat(row.avg_hold_minutes) : null,
    worstTradeSymbol: row.worst_trade_symbol,
    worstTradePnL: row.worst_trade_pnl != null ? parseFloat(row.worst_trade_pnl) : null,
    topLossSymbol: row.top_loss_symbol,
    topLossPnL: row.top_loss_pnl != null ? parseFloat(row.top_loss_pnl) : null,
    topWinSymbol: row.top_win_symbol,
    topWinPnL: row.top_win_pnl != null ? parseFloat(row.top_win_pnl) : null,
  };
}

function pickHighlight(agg, { startDate, endDate, frontendUrl }) {
  const base = frontendUrl || 'https://tradetally.io';
  const datedTrades = (extra = '') =>
    `${base}/trades?startDate=${startDate}&endDate=${endDate}${extra}`;

  const winRate = agg.tradeCount > 0 ? agg.winCount / agg.tradeCount : 0;
  const isNegative = agg.totalPnL < 0;
  const isPositive = agg.totalPnL > 0;

  if (isNegative && agg.topLossSymbol && agg.grossLosses < 0) {
    const dominance = Math.abs(agg.topLossPnL) / Math.abs(agg.grossLosses);
    if (dominance >= THRESHOLDS.DOMINANT_LOSER_PCT) {
      const pct = Math.round(dominance * 100);
      return {
        type: 'dominant_loser',
        headline: `${pct}% of your losses came from ${agg.topLossSymbol}`,
        body: `Drill into your ${agg.topLossSymbol} trades this week to spot the pattern — entry timing, hold duration, or position sizing is likely the culprit.`,
        ctaText: `Review ${agg.topLossSymbol} trades`,
        ctaUrl: datedTrades(`&symbol=${encodeURIComponent(agg.topLossSymbol)}`),
      };
    }
  }

  if (
    agg.tradeCount >= THRESHOLDS.OVERTRADING_TRADE_COUNT &&
    winRate < THRESHOLDS.OVERTRADING_WIN_RATE
  ) {
    return {
      type: 'overtrading',
      headline: `${agg.tradeCount} trades, ${Math.round(winRate * 100)}% win rate`,
      body: 'High volume with a low win rate often points to overtrading. Behavioral metrics can show whether revenge trading or chasing setups is driving it.',
      ctaText: 'Review behavior metrics',
      ctaUrl: `${base}/metrics/behavioral`,
    };
  }

  if (
    agg.avgHoldMinutes != null &&
    agg.avgHoldMinutes < THRESHOLDS.SCALPING_HOLD_MINUTES &&
    agg.tradeCount >= THRESHOLDS.SCALPING_MIN_TRADES &&
    isNegative
  ) {
    return {
      type: 'short_holds',
      headline: `Average hold time: ${Math.round(agg.avgHoldMinutes)} min`,
      body: 'Quick entries and exits can signal impulsive trading. Check whether your shortest-held trades are also your biggest losers.',
      ctaText: 'Review behavior metrics',
      ctaUrl: `${base}/metrics/behavioral`,
    };
  }

  if (isNegative) {
    return {
      type: 'negative_broad',
      headline: 'Tough week — let’s find what to fix',
      body: 'Losses spread across multiple trades usually point to a behavioral pattern, not a single bad call. Your behavior metrics surface the cause.',
      ctaText: 'Review behavior metrics',
      ctaUrl: `${base}/metrics/behavioral`,
    };
  }

  if (isPositive && agg.winCount > agg.lossCount) {
    return {
      type: 'positive_week',
      headline: 'Strong week — keep what worked',
      body: 'Your stats are up. Reviewing winners by strategy or tag helps you double down on what is actually working.',
      ctaText: 'Review your metrics',
      ctaUrl: `${base}/metrics`,
    };
  }

  return {
    type: 'default',
    headline: 'Your trading week',
    body: 'Take a look at the dashboard for the full picture of how the week played out.',
    ctaText: 'View Dashboard',
    ctaUrl: `${base}/dashboard`,
  };
}

module.exports = {
  THRESHOLDS,
  fetchWeeklyAggregates,
  pickHighlight,
};
