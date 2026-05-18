#!/usr/bin/env node
/**
 * Render every weekly-digest highlight scenario to HTML files in /tmp.
 *
 * Output:
 *   /tmp/weekly-digest-scenarios/<key>.html — full HTML body
 *   /tmp/weekly-digest-scenarios/manifest.json — [{ key, subject, label, html, text }]
 *
 * Uses synthetic aggregates; no DB or AI calls. Pro+AI variants include a
 * canned AI recap so the layout can be validated end-to-end.
 */
const fs = require('fs');
const path = require('path');

const EmailService = require('../src/services/emailService');
const { pickHighlight } = require('../src/services/weeklyDigest/insights');

const OUT_DIR = '/tmp/weekly-digest-scenarios';
const RECIPIENT = process.env.TEST_RECIPIENT || 'boverton@tradetally.io';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tradetally.io';

// Synthetic week window (used only for CTA deep-links).
const START = '2026-05-04';
const END = '2026-05-11';

// Canned AI recaps so we don't burn real API calls testing layout.
const SAMPLE_AI = {
  overtrading: 'You traded 30 times this week for a 27% win rate — that volume rarely lines up with patient setup-selection. Your worst stretch was midweek after the SPY drawdown; consider whether the second-half trades were planned or revenge-driven.',
  negative_broad: 'A rough seven-day stretch: -$340 across eight trades with no single ticker dragging the rest down. Profit factor of 0.39 suggests winners are getting cut early or losers held too long — which side does that feel like to you?',
  positive_week: 'Strong week — $500 across five trades at an 80% win rate, almost entirely from AAPL longs. Your average hold of an hour is well above your usual pattern; if that paid off, it is worth journaling exactly what made you stay in the trade.',
};

const SCENARIOS = [
  {
    key: 'dominant_loser_free',
    label: 'Dominant losing symbol (Free user → Pro teaser)',
    isPro: false,
    aiRecap: null,
    agg: {
      tradeCount: 8,
      totalPnL: -500,
      winCount: 3,
      lossCount: 5,
      grossWins: 200,
      grossLosses: -700,
      avgHoldMinutes: 60,
      topLossSymbol: 'TSLA',
      topLossPnL: -500,
      topWinSymbol: 'AAPL',
      topWinPnL: 120,
      worstTradeSymbol: 'TSLA',
      worstTradePnL: -310,
    },
  },
  {
    key: 'overtrading_pro_with_ai',
    label: 'Overtrading (Pro user with AI recap)',
    isPro: true,
    aiRecap: SAMPLE_AI.overtrading,
    agg: {
      tradeCount: 30,
      totalPnL: -100,
      winCount: 8,
      lossCount: 22,
      grossWins: 400,
      grossLosses: -500,
      avgHoldMinutes: 28,
      topLossSymbol: 'SPY',
      topLossPnL: -180,
      topWinSymbol: 'NVDA',
      topWinPnL: 90,
      worstTradeSymbol: 'SPY',
      worstTradePnL: -120,
    },
  },
  {
    key: 'short_holds_free',
    label: 'Short hold times (Free user → Pro teaser)',
    isPro: false,
    aiRecap: null,
    agg: {
      tradeCount: 15,
      totalPnL: -50,
      winCount: 5,
      lossCount: 10,
      grossWins: 100,
      grossLosses: -150,
      avgHoldMinutes: 3,
      topLossSymbol: 'SPY',
      topLossPnL: -50,
      topWinSymbol: 'QQQ',
      topWinPnL: 40,
      worstTradeSymbol: 'SPY',
      worstTradePnL: -25,
    },
  },
  {
    key: 'negative_broad_pro_with_ai',
    label: 'Broadly negative week (Pro user with AI recap)',
    isPro: true,
    aiRecap: SAMPLE_AI.negative_broad,
    agg: {
      tradeCount: 8,
      totalPnL: -340.5,
      winCount: 3,
      lossCount: 5,
      grossWins: 220,
      grossLosses: -560.5,
      avgHoldMinutes: 45,
      topLossSymbol: 'AMD',
      topLossPnL: -90,
      topWinSymbol: 'AAPL',
      topWinPnL: 120,
      worstTradeSymbol: 'AMD',
      worstTradePnL: -90,
    },
  },
  {
    key: 'positive_week_free',
    label: 'Positive week (Free user → Pro teaser)',
    isPro: false,
    aiRecap: null,
    agg: {
      tradeCount: 5,
      totalPnL: 500,
      winCount: 4,
      lossCount: 1,
      grossWins: 600,
      grossLosses: -100,
      avgHoldMinutes: 60,
      topLossSymbol: 'AMD',
      topLossPnL: -100,
      topWinSymbol: 'AAPL',
      topWinPnL: 400,
      worstTradeSymbol: 'AMD',
      worstTradePnL: -100,
    },
  },
  {
    key: 'positive_week_pro_with_ai',
    label: 'Positive week (Pro user with AI recap)',
    isPro: true,
    aiRecap: SAMPLE_AI.positive_week,
    agg: {
      tradeCount: 5,
      totalPnL: 500,
      winCount: 4,
      lossCount: 1,
      grossWins: 600,
      grossLosses: -100,
      avgHoldMinutes: 60,
      topLossSymbol: 'AMD',
      topLossPnL: -100,
      topWinSymbol: 'AAPL',
      topWinPnL: 400,
      worstTradeSymbol: 'AMD',
      worstTradePnL: -100,
    },
  },
  {
    key: 'default_flat_free',
    label: 'Flat week / fallback (Free user → Pro teaser)',
    isPro: false,
    aiRecap: null,
    agg: {
      tradeCount: 3,
      totalPnL: 0,
      winCount: 1,
      lossCount: 1,
      grossWins: 100,
      grossLosses: -100,
      avgHoldMinutes: 60,
      topLossSymbol: null,
      topLossPnL: null,
      topWinSymbol: null,
      topWinPnL: null,
      worstTradeSymbol: null,
      worstTradePnL: null,
    },
  },
];

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];

  for (const scenario of SCENARIOS) {
    const highlight = pickHighlight(scenario.agg, {
      startDate: START,
      endDate: END,
      frontendUrl: FRONTEND_URL,
    });

    const { subject, html, text } = EmailService.buildWeeklyDigestEmail(
      'Brennon (test)',
      {
        tradeCount: scenario.agg.tradeCount,
        totalPnL: scenario.agg.totalPnL,
        dashboardUrl: `${FRONTEND_URL}/dashboard`,
        highlight,
        aiRecap: scenario.aiRecap,
        isPro: scenario.isPro,
      },
      `${FRONTEND_URL}/unsubscribe?token=test-${scenario.key}`
    );

    const taggedSubject = `[TEST: ${scenario.key}] ${subject}`;
    const htmlPath = path.join(OUT_DIR, `${scenario.key}.html`);
    fs.writeFileSync(htmlPath, html);

    manifest.push({
      key: scenario.key,
      label: scenario.label,
      highlightType: highlight.type,
      isPro: scenario.isPro,
      hasAiRecap: !!scenario.aiRecap,
      recipient: RECIPIENT,
      subject: taggedSubject,
      htmlPath,
      text,
    });

    console.log(`[OK] ${scenario.key} → ${highlight.type} → ${htmlPath}`);
  }

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${manifestPath}`);
}

main();
