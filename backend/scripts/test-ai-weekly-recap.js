#!/usr/bin/env node
/**
 * Test the weekly digest AI recap end-to-end against a real AI provider.
 *
 * Seeds a single dedicated test user with synthetic trades matching one of the
 * highlight scenarios, runs the full pipeline (aggregates → highlight → AI
 * recap → render), prints the prompt and AI response, and saves the rendered
 * HTML to /tmp for manual preview.
 *
 * Usage:
 *   node scripts/test-ai-weekly-recap.js --scenario overtrading
 *   node scripts/test-ai-weekly-recap.js --scenario all
 *   node scripts/test-ai-weekly-recap.js --cleanup
 *
 * Flags:
 *   --scenario <name>  One of: overtrading, negative_broad, positive_week,
 *                      dominant_loser, short_holds
 *   --all              Run every scenario
 *   --cleanup          Remove the test user and all seeded trades
 *   --skip-ai          Skip the real AI call (still renders the email)
 *
 * The test user is idempotent: trades are deleted and reseeded each run.
 */
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');

const db = require('../src/config/database');
const weeklyInsights = require('../src/services/weeklyDigest/insights');
const aiRecap = require('../src/services/weeklyDigest/aiRecap');
const AIService = require('../src/utils/aiService');
const EmailService = require('../src/services/emailService');

const TEST_USER = {
  email: 'weekly-digest-test@tradetally.test',
  username: 'weekly_digest_test',
  fullName: 'Weekly Digest Test',
};

const OUT_DIR = '/tmp/weekly-digest-ai-tests';

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function isoDay(daysAgoFromEnd, endDate) {
  const d = new Date(endDate);
  d.setUTCDate(d.getUTCDate() - daysAgoFromEnd);
  return d.toISOString().split('T')[0];
}

function tradeAt(endDate, daysAgo, hour, minutes, exitMinutes) {
  const d = new Date(endDate);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minutes, 0, 0);
  const entry = new Date(d);
  const exit = new Date(d.getTime() + exitMinutes * 60 * 1000);
  return {
    tradeDate: entry.toISOString().split('T')[0],
    entryTime: entry.toISOString(),
    exitTime: exit.toISOString(),
  };
}

// Each builder returns an array of trade specs. trade_date must land within the
// last 7 days so the production fetchWeeklyAggregates sees it.
const SCENARIO_BUILDERS = {
  // 8 trades, TSLA dominates losses (~71% of loss bucket)
  dominant_loser: (endDate) => [
    { symbol: 'TSLA', side: 'long', pnl: -250, ...tradeAt(endDate, 6, 14, 30, 45) },
    { symbol: 'TSLA', side: 'long', pnl: -180, ...tradeAt(endDate, 5, 13, 45, 30) },
    { symbol: 'TSLA', side: 'short', pnl: -70, ...tradeAt(endDate, 4, 15, 10, 25) },
    { symbol: 'AAPL', side: 'long', pnl: 80, ...tradeAt(endDate, 4, 14, 0, 90) },
    { symbol: 'AAPL', side: 'long', pnl: 60, ...tradeAt(endDate, 3, 13, 30, 60), strategy: 'breakout' },
    { symbol: 'NVDA', side: 'long', pnl: 80, ...tradeAt(endDate, 2, 14, 0, 75) },
    { symbol: 'AMD', side: 'long', pnl: -80, ...tradeAt(endDate, 2, 15, 30, 40) },
    { symbol: 'SPY', side: 'short', pnl: -120, ...tradeAt(endDate, 1, 14, 0, 35) },
  ],
  // 30 trades, 27% win rate, lots of revenge-trade SPY
  overtrading: (endDate) => {
    const trades = [];
    const days = 5;
    for (let d = 0; d < days; d++) {
      for (let i = 0; i < 6; i++) {
        const winning = (d * 6 + i) % 4 === 0;
        const symbol = i % 2 === 0 ? 'SPY' : (i % 3 === 0 ? 'NVDA' : 'TSLA');
        trades.push({
          symbol,
          side: i % 2 === 0 ? 'long' : 'short',
          pnl: winning ? 50 : -25,
          strategy: winning ? 'breakout' : null,
          ...tradeAt(endDate, d, 13 + (i % 3), i * 10, 5 + (i % 6) * 4),
        });
      }
    }
    return trades;
  },
  // 15 short-hold trades, avg ~3 min, slight loss
  short_holds: (endDate) => {
    const trades = [];
    const symbols = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AMD'];
    for (let i = 0; i < 15; i++) {
      trades.push({
        symbol: symbols[i % symbols.length],
        side: i % 2 === 0 ? 'long' : 'short',
        pnl: i % 3 === 0 ? 15 : -10,
        ...tradeAt(endDate, i % 5, 13 + (i % 3), i * 7, 2 + (i % 3)),
      });
    }
    return trades;
  },
  // 8 trades, losses spread evenly, no dominant ticker
  negative_broad: (endDate) => [
    { symbol: 'AMD', side: 'long', pnl: -90, ...tradeAt(endDate, 6, 14, 0, 45) },
    { symbol: 'TSLA', side: 'short', pnl: -80, ...tradeAt(endDate, 5, 13, 30, 50) },
    { symbol: 'NVDA', side: 'long', pnl: -75, ...tradeAt(endDate, 4, 15, 0, 30) },
    { symbol: 'SPY', side: 'long', pnl: -60, ...tradeAt(endDate, 3, 14, 0, 60), strategy: 'pullback' },
    { symbol: 'QQQ', side: 'short', pnl: -55, ...tradeAt(endDate, 3, 15, 30, 45) },
    { symbol: 'AAPL', side: 'long', pnl: 70, ...tradeAt(endDate, 2, 14, 0, 90) },
    { symbol: 'MSFT', side: 'long', pnl: 60, ...tradeAt(endDate, 1, 13, 30, 75), strategy: 'breakout' },
    { symbol: 'GOOGL', side: 'long', pnl: 90, ...tradeAt(endDate, 1, 14, 30, 110) },
  ],
  // 5 trades, 80% win rate, AAPL dominates wins, $500 net
  positive_week: (endDate) => [
    { symbol: 'AAPL', side: 'long', pnl: 220, strategy: 'breakout', ...tradeAt(endDate, 5, 14, 0, 75) },
    { symbol: 'AAPL', side: 'long', pnl: 180, strategy: 'breakout', ...tradeAt(endDate, 4, 13, 30, 90) },
    { symbol: 'NVDA', side: 'long', pnl: 120, strategy: 'pullback', ...tradeAt(endDate, 3, 14, 0, 60) },
    { symbol: 'MSFT', side: 'long', pnl: 80, ...tradeAt(endDate, 2, 13, 45, 45) },
    { symbol: 'AMD', side: 'long', pnl: -100, ...tradeAt(endDate, 1, 14, 30, 30) },
  ],
};

async function findOrCreateTestUser() {
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [TEST_USER.email]);
  if (existing.rows.length > 0) {
    // Make sure tier is pro and consent fields are right.
    await db.query(
      `UPDATE users SET tier = 'pro', marketing_consent = true, is_active = true WHERE id = $1`,
      [existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const passwordHash = crypto.randomBytes(32).toString('hex'); // unusable, never logged in
  const { rows } = await db.query(
    `INSERT INTO users (email, username, password_hash, full_name, is_verified, is_active, role, tier, marketing_consent)
     VALUES ($1, $2, $3, $4, true, true, 'user', 'pro', true)
     RETURNING id`,
    [TEST_USER.email, TEST_USER.username, passwordHash, TEST_USER.fullName]
  );
  return rows[0].id;
}

async function deleteTestUserTrades(userId) {
  await db.query('DELETE FROM trades WHERE user_id = $1', [userId]);
}

async function seedTrades(userId, trades) {
  for (const t of trades) {
    await db.query(
      `INSERT INTO trades (user_id, symbol, trade_date, entry_time, exit_time, side, quantity, entry_price, exit_price, pnl, pnl_percent, strategy, commission, fees)
       VALUES ($1, $2, $3::date, $4::timestamptz, $5::timestamptz, $6, 100, 100, 100, $7, 1, $8, 0, 0)`,
      [userId, t.symbol, t.tradeDate, t.entryTime, t.exitTime, t.side, t.pnl, t.strategy || null]
    );
  }
}

async function cleanup() {
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [TEST_USER.email]);
  if (rows.length === 0) {
    console.log('No test user to clean up');
    return;
  }
  const userId = rows[0].id;
  const tradeRes = await db.query('DELETE FROM trades WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  console.log(`[CLEANUP] Removed test user ${TEST_USER.email} and ${tradeRes.rowCount} trades`);
}

async function runScenario(scenarioName, { skipAi }) {
  const builder = SCENARIO_BUILDERS[scenarioName];
  if (!builder) {
    throw new Error(`Unknown scenario: ${scenarioName}. Valid: ${Object.keys(SCENARIO_BUILDERS).join(', ')}`);
  }
  const userId = await findOrCreateTestUser();
  await deleteTestUserTrades(userId);
  const endDate = new Date();
  const trades = builder(endDate);
  await seedTrades(userId, trades);
  console.log(`[SEED] ${trades.length} trades for scenario ${scenarioName}`);

  const startStr = isoDay(7, endDate);
  const endStr = endDate.toISOString().split('T')[0];

  const aggregates = await weeklyInsights.fetchWeeklyAggregates(startStr, endStr, {
    bypassMarketingConsent: false, // test user has marketing_consent = true anyway
  });
  const agg = aggregates.find(a => a.userId === userId);
  if (!agg) throw new Error(`Aggregates missing for test user — check trade dates / consent`);

  console.log(`[AGG] trades=${agg.tradeCount} pnl=$${agg.totalPnL.toFixed(2)} W/L=${agg.winCount}/${agg.lossCount} avgHold=${agg.avgHoldMinutes ? Math.round(agg.avgHoldMinutes)+'m' : 'n/a'}`);
  console.log(`      topLoss=${agg.topLossSymbol || '(none)'} ($${agg.topLossPnL?.toFixed(2) || '0'}) topWin=${agg.topWinSymbol || '(none)'} ($${agg.topWinPnL?.toFixed(2) || '0'})`);

  const frontendUrl = process.env.FRONTEND_URL || 'https://tradetally.io';
  const highlight = weeklyInsights.pickHighlight(agg, { startDate: startStr, endDate: endStr, frontendUrl });
  console.log(`[HIGHLIGHT] type=${highlight.type} headline="${highlight.headline}"`);

  let recap = null;
  if (!skipAi) {
    const settings = await AIService.getUserSettings(userId);
    console.log(`[AI] provider=${settings.provider} model=${settings.model || 'default'} configured=${AIService.isProviderConfigured(settings)}`);
    if (AIService.isProviderConfigured(settings)) {
      const t0 = Date.now();
      console.log(`[AI] generating recap...`);
      recap = await aiRecap.generateRecap(userId, agg, startStr, endStr);
      const dt = Date.now() - t0;
      console.log(`[AI] response (${dt}ms):\n---\n${recap || '(null — see error logs)'}\n---`);
    } else {
      console.log('[AI] skipped — provider not configured for this user (admin defaults missing too)');
    }
  }

  const { subject, html } = EmailService.buildWeeklyDigestEmail(
    TEST_USER.fullName,
    {
      tradeCount: agg.tradeCount,
      totalPnL: agg.totalPnL,
      dashboardUrl: `${frontendUrl}/dashboard`,
      highlight,
      aiRecap: recap,
      isPro: true,
    },
    `${frontendUrl}/unsubscribe?token=test-ai-${scenarioName}`
  );

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = `${OUT_DIR}/${scenarioName}.html`;
  fs.writeFileSync(htmlPath, html);
  console.log(`[OUT] subject="${subject}"`);
  console.log(`[OUT] html=${htmlPath}\n`);

  return { scenarioName, subject, html, htmlPath, recap, highlight, agg };
}

async function main() {
  const args = parseArgs();

  if (args.cleanup) {
    await cleanup();
    return;
  }

  const scenarios = args.all
    ? Object.keys(SCENARIO_BUILDERS)
    : (args.scenario ? [args.scenario] : null);
  if (!scenarios) {
    console.error('Usage:');
    console.error('  --scenario <name>     One of: ' + Object.keys(SCENARIO_BUILDERS).join(', '));
    console.error('  --all                 Run every scenario');
    console.error('  --cleanup             Remove test user');
    console.error('  --skip-ai             Render without calling AI');
    process.exit(1);
  }

  for (const name of scenarios) {
    console.log(`\n=== Scenario: ${name} ===`);
    await runScenario(name, { skipAi: !!args['skip-ai'] });
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[FAIL]', err);
    process.exit(1);
  });
