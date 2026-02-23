const cron = require('node-cron');
const db = require('../config/database');
const AggregateAnalytics = require('../models/AggregateAnalytics');
const aiService = require('../utils/aiService');

/**
 * Community Insights Scheduler
 * Generates AI summaries daily and caches them in the database
 */
class CommunityInsightsScheduler {
  constructor() {
    this.job = null;
    this.adminUserId = null;
  }

  async initialize() {
    try {
      console.log('[COMMUNITY SCHEDULER] Initializing...');

      // Get first admin user for AI service calls
      const adminResult = await db.query(
        `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`
      );

      if (adminResult.rows.length === 0) {
        console.warn('[COMMUNITY SCHEDULER] No admin user found, AI summaries will not be generated');
        return;
      }

      this.adminUserId = adminResult.rows[0].id;

      // Run daily at 5 AM
      this.job = cron.schedule('0 5 * * *', () => {
        this.generateAllSummaries();
      });

      console.log('[COMMUNITY SCHEDULER] Initialized - daily AI summary generation at 5 AM');

      // Generate on startup if no summaries exist
      const existing = await db.query('SELECT COUNT(*) FROM community_ai_summaries');
      if (parseInt(existing.rows[0].count) === 0) {
        console.log('[COMMUNITY SCHEDULER] No cached summaries found, generating on startup...');
        this.generateAllSummaries();
      }
    } catch (error) {
      console.error('[COMMUNITY SCHEDULER] Error initializing:', error.message);
    }
  }

  async generateAllSummaries() {
    const periods = ['all', '30d', '90d'];

    for (const period of periods) {
      try {
        await this.generateSummary(period, 'all');
      } catch (error) {
        console.error(`[COMMUNITY SCHEDULER] Error generating summary for period=${period}:`, error.message);
      }
    }

    console.log('[COMMUNITY SCHEDULER] Finished generating all summaries');
  }

  async generateSummary(period, instrumentTypesKey) {
    try {
      console.log(`[COMMUNITY SCHEDULER] Generating summary for period=${period}, instruments=${instrumentTypesKey}`);

      const options = {};
      const insights = await AggregateAnalytics.getCommunityInsights(period, options);

      if (!insights || !insights.overview || insights.overview.total_trades < 10) {
        console.log(`[COMMUNITY SCHEDULER] Not enough data for period=${period}, skipping`);
        return;
      }

      const prompt = this.buildPrompt(insights, period);
      const summary = await aiService.generateResponse(this.adminUserId, prompt, { maxTokens: 16000 });

      if (!summary) {
        console.warn(`[COMMUNITY SCHEDULER] Empty AI response for period=${period}`);
        return;
      }

      // Upsert into database
      await db.query(
        `INSERT INTO community_ai_summaries (period, instrument_types, summary, generated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (period, instrument_types)
         DO UPDATE SET summary = $3, generated_at = NOW()`,
        [period, instrumentTypesKey, summary]
      );

      console.log(`[COMMUNITY SCHEDULER] Saved summary for period=${period}`);
    } catch (error) {
      console.error(`[COMMUNITY SCHEDULER] Failed to generate summary for period=${period}:`, error.message);
    }
  }

  buildPrompt(insights, period) {
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

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[COMMUNITY SCHEDULER] Stopped');
    }
  }
}

module.exports = new CommunityInsightsScheduler();
