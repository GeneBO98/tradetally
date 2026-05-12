const db = require('../../config/database');
const AIService = require('../../utils/aiService');

const MAX_TRADES_IN_PROMPT = 50;

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return `**@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
}

async function fetchTradeSummariesForPrompt(userId, startDate, endDate) {
  const query = `
    SELECT
      symbol,
      side,
      pnl,
      pnl_percent,
      entry_time,
      exit_time,
      strategy
    FROM trades
    WHERE user_id = $1
      AND trade_date >= $2::date
      AND trade_date <= $3::date
    ORDER BY ABS(COALESCE(pnl, 0)) DESC
    LIMIT $4
  `;
  const { rows } = await db.query(query, [userId, startDate, endDate, MAX_TRADES_IN_PROMPT]);
  return rows;
}

function buildPrompt(agg, trades) {
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

  return `You are a trading coach. Write a concise, friendly 2-3 sentence summary of this trader's week. Be specific and reference the data. Do NOT give financial advice. Do NOT use bullet points. Do NOT use markdown. Plain prose only.

Week summary:
- Trades: ${agg.tradeCount}
- Total P&L: $${pnl}
- Win rate: ${winRate}%
- Profit factor: ${profitFactor}
- Avg hold time: ${avgHold}
- Best trade: ${agg.topWinSymbol ? `${agg.topWinSymbol} +$${(agg.topWinPnL || 0).toFixed(2)}` : 'none'}
- Worst trade: ${agg.worstTradeSymbol ? `${agg.worstTradeSymbol} $${(agg.worstTradePnL || 0).toFixed(2)}` : 'none'}
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
    const prompt = buildPrompt(agg, trades);
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
