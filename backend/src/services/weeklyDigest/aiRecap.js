const db = require('../../config/database');
const AIService = require('../../utils/aiService');
const { fxUsd } = require('../../utils/tradeFx');
const maskEmail = require('../../utils/maskEmail');

const MAX_TRADES_IN_PROMPT = 50;

async function fetchTradeSummariesForPrompt(userId, startDate, endDate) {
  const query = `
    SELECT
      t.symbol,
      t.side,
      ${fxUsd('pnl', 't')} AS pnl,
      t.pnl_percent,
      t.entry_time,
      t.exit_time,
      t.strategy
    FROM trades t
    WHERE t.user_id = $1
      AND t.trade_date >= $2::date
      AND t.trade_date <= $3::date
      AND t.exit_price IS NOT NULL
      AND t.pnl IS NOT NULL
      AND NOT COALESCE('sample' = ANY(t.tags), false)
    ORDER BY ABS(COALESCE(${fxUsd('pnl', 't')}, 0)) DESC
    LIMIT $4
  `;
  const { rows } = await db.query(query, [userId, startDate, endDate, MAX_TRADES_IN_PROMPT]);
  return rows;
}

function formatSignedUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
}

function buildPrompt(agg, trades, dossierText = '') {
  const pnl = agg.totalPnL.toFixed(2);
  const winRate = agg.tradeCount > 0
    ? Math.round((agg.winCount / agg.tradeCount) * 100)
    : 0;
  const profitFactor = agg.grossLosses < 0
    ? (agg.grossWins / Math.abs(agg.grossLosses)).toFixed(2)
    : 'n/a';
  const avgHold = agg.avgHoldMinutes != null
    ? `${Math.round(agg.avgHoldMinutes)} min`
    : 'unknown';

  const tradeLines = trades.map((t) => {
    const pnlVal = t.pnl != null ? Number(t.pnl).toFixed(2) : 'n/a';
    const pnlPct = t.pnl_percent != null ? `${Number(t.pnl_percent).toFixed(2)}%` : 'n/a';
    let hold = 'n/a';
    if (t.entry_time && t.exit_time) {
      const mins = Math.round((new Date(t.exit_time) - new Date(t.entry_time)) / 60000);
      hold = `${mins}m`;
    }
    const strat = t.strategy ? ` strategy=${t.strategy}` : '';
    return `- ${t.symbol} ${t.side} pnl=${pnlVal} (${pnlPct}) hold=${hold}${strat}`;
  }).join('\n');

  const dossierSection = dossierText
    ? `\nAbout this trader (use for tone and to connect the week to their goals or a known tendency; the week's numbers come only from the summary below):\n${dossierText}\n`
    : '';

  const bestTradeLabel = agg.bestTradeSymbol && Number.isFinite(Number(agg.bestTradePnL))
    ? `${agg.bestTradeSymbol} ${formatSignedUsd(agg.bestTradePnL)}`
    : 'none';
  const worstTradeLabel = agg.worstTradeSymbol && Number.isFinite(Number(agg.worstTradePnL))
    ? `${agg.worstTradeSymbol} ${formatSignedUsd(agg.worstTradePnL)}`
    : 'none';

  return `You are a trading coach. Write a concise, friendly 2-3 sentence summary of this trader's week. Be specific and reference the data. Do NOT give financial advice. Do NOT use bullet points. Do NOT use markdown. Plain prose only.
${dossierSection}
Week summary:
- Trades: ${agg.tradeCount}
- Total P&L: $${pnl}
- Win rate: ${winRate}%
- Profit factor: ${profitFactor}
- Avg hold time: ${avgHold}
- Best trade: ${bestTradeLabel}
- Worst trade: ${worstTradeLabel}
- Most concentrated losing symbol: ${agg.topLossSymbol ? `${agg.topLossSymbol} ($${(agg.topLossPnL || 0).toFixed(2)})` : 'none'}

Top trades by absolute P&L (up to ${MAX_TRADES_IN_PROMPT}):
${tradeLines || '(no trades)'}

Write the summary now. 2-3 sentences. End with one specific observation or question, not a generic platitude.`;
}

async function generateRecap(userId, agg, startDate, endDate) {
  try {
    const settings = await AIService.getUserSettings(userId);
    if (!AIService.isProviderConfigured(settings)) {
      return null;
    }
    const trades = await fetchTradeSummariesForPrompt(userId, startDate, endDate);
    const AITraderContext = require('../aiTraderContext');
    // Persisted behavioral tables lack per-row sample-trade provenance (signup
    // runs analyzers over sample trades), so only include the declared profile
    // alongside the real-only weekly numbers and trades fetched above.
    const dossierText = await AITraderContext.render(userId, { sections: ['profile'] });
    const prompt = buildPrompt(agg, trades, dossierText);
    const text = await AIService.generateResponse(userId, prompt, {
      maxTokens: 220,
    });
    if (typeof text !== 'string' || !text.trim()) return null;
    return text.trim();
  } catch (error) {
    console.error(
      `[WEEKLY_DIGEST] AI recap failed for ${maskEmail(agg.email)}:`,
      error.message
    );
    return null;
  }
}

module.exports = {
  generateRecap,
  // exported for tests
  buildPrompt,
  fetchTradeSummariesForPrompt,
};
