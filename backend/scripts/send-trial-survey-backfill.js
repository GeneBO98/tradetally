#!/usr/bin/env node
/**
 * One-off backfill: send the "what stopped you from subscribing?" trial-feedback
 * survey (embedded in the trial-conversion email) to users whose Pro trial
 * already expired without converting.
 *
 * The normal retentionEmailScheduler only targets trials that expired 3-7 days
 * ago. This backfill removes that time window so we can reach the existing
 * expired-trial population now that the survey endpoint is fixed.
 *
 * SAFE BY DEFAULT: with no flags it is a DRY RUN — it prints who would be
 * emailed and writes nothing.
 *
 * Usage:
 *   node scripts/send-trial-survey-backfill.js                # dry run (default)
 *   node scripts/send-trial-survey-backfill.js --test         # send ONE email to TEST_EMAIL, no DB writes
 *   node scripts/send-trial-survey-backfill.js --send=A       # real send to Segment A
 *   node scripts/send-trial-survey-backfill.js --send=B       # real send to Segment B
 *   node scripts/send-trial-survey-backfill.js --send=AB      # real send to both
 *   node scripts/send-trial-survey-backfill.js --send=A --limit=5
 *
 * Segments (all require: active user, marketing_consent=true, no active/trialing
 * subscription, no feedback already submitted):
 *   A = never received a conversion email (conversion_email_sent_at IS NULL)
 *   B = already received a conversion email, but with the broken survey link
 *       (conversion_email_sent_at IS NOT NULL) — i.e. the "we fixed it, re-ask" group
 */

const db = require('../src/config/database');
const EmailService = require('../src/services/emailService');

const TEST_EMAIL = process.env.TEST_EMAIL || 'gtsengineeringteam@gmail.com';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { test: false, send: null, limit: null };
  for (const a of args) {
    if (a === '--test') opts.test = true;
    else if (a.startsWith('--send=')) opts.send = a.slice('--send='.length).toUpperCase();
    else if (a.startsWith('--limit=')) opts.limit = parseInt(a.slice('--limit='.length), 10);
  }
  return opts;
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [u, d] = email.split('@');
  return `${u.slice(0, 2)}***@${d}`;
}

// Mirrors retentionEmailScheduler.sendTrialConversionEmails(), MINUS the 3-7 day
// window. `sentFilter` is the only segment-specific clause.
function buildQuery(sentFilter) {
  return `
    SELECT
      u.id AS user_id,
      u.email,
      u.username,
      u.full_name,
      tor.expires_at,
      tor.conversion_email_sent_at,
      EXTRACT(DAY FROM NOW() - tor.expires_at)::int AS days_since_expiry,
      tor.reason AS trial_type,
      COALESCE(stats.total_trades, 0)::int AS total_trades,
      COALESCE(stats.win_rate, 0)::double precision AS win_rate,
      COALESCE(stats.total_pnl, 0)::double precision AS total_pnl,
      stats.top_symbol,
      stats.brokers_used
    FROM tier_overrides tor
    INNER JOIN users u ON u.id = tor.user_id
      AND u.is_active = true
      AND u.marketing_consent = true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total_trades,
        CASE WHEN COUNT(*) > 0
          THEN (COUNT(*) FILTER (WHERE t.pnl > 0) * 100.0 / COUNT(*))
          ELSE 0
        END AS win_rate,
        COALESCE(SUM(t.pnl), 0) AS total_pnl,
        (SELECT t2.symbol FROM trades t2 WHERE t2.user_id = u.id GROUP BY t2.symbol ORDER BY COUNT(*) DESC LIMIT 1) AS top_symbol,
        STRING_AGG(DISTINCT t.broker, ', ') AS brokers_used
      FROM trades t
      WHERE t.user_id = u.id
    ) stats ON true
    WHERE tor.expires_at < NOW()
      AND tor.reason ILIKE '%trial%'
      AND ${sentFilter}
      AND NOT EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = u.id AND s.status IN ('active', 'trialing')
      )
      AND NOT EXISTS (
        SELECT 1 FROM trial_nonconversion_feedback f WHERE f.user_id = u.id
      )
    ORDER BY tor.expires_at DESC
  `;
}

function metricsFromRow(row) {
  return {
    totalTrades: row.total_trades,
    winRate: parseFloat(row.win_rate) || 0,
    totalPnL: parseFloat(row.total_pnl) || 0,
    topSymbol: row.top_symbol || null,
    brokersUsed: row.brokers_used || null,
    trialType: row.trial_type || 'trial',
    daysSinceExpiry: row.days_since_expiry || 0
  };
}

async function getSegment(seg) {
  const filter = seg === 'A'
    ? 'tor.conversion_email_sent_at IS NULL'
    : 'tor.conversion_email_sent_at IS NOT NULL';
  const { rows } = await db.query(buildQuery(filter));
  return rows;
}

function printTable(label, rows) {
  console.log(`\n=== Segment ${label}: ${rows.length} recipient(s) ===`);
  if (!rows.length) return;
  console.log('  ' + ['email'.padEnd(26), 'username'.padEnd(18), 'd_exp', 'trades', 'prior_conv_email'].join('  '));
  for (const r of rows) {
    console.log('  ' + [
      maskEmail(r.email).padEnd(26),
      String(r.username || r.full_name || '').slice(0, 18).padEnd(18),
      String(r.days_since_expiry).padStart(5),
      String(r.total_trades).padStart(6),
      r.conversion_email_sent_at ? 'yes' : 'no'
    ].join('  '));
  }
}

async function sendToRows(rows, { dbWrite }) {
  let ok = 0, fail = 0;
  for (const row of rows) {
    try {
      await EmailService.sendTrialConversionEmail(
        row.email,
        row.username || row.full_name || 'there',
        metricsFromRow(row),
        row.user_id
      );
      if (dbWrite) {
        await db.query(
          'UPDATE tier_overrides SET conversion_email_sent_at = NOW() WHERE user_id = $1 AND reason ILIKE $2',
          [row.user_id, '%trial%']
        );
      }
      ok++;
      console.log(`  sent -> ${maskEmail(row.email)}`);
    } catch (err) {
      fail++;
      console.error(`  FAILED -> ${maskEmail(row.email)}: ${err.message}`);
    }
  }
  return { ok, fail };
}

(async () => {
  const opts = parseArgs();
  console.log('Email configured:', EmailService.isConfigured());

  const segA = await getSegment('A');
  const segB = await getSegment('B');

  // ---- TEST: one email to TEST_EMAIL, no DB writes ----
  if (opts.test) {
    const sample = segA[0] || segB[0];
    if (!sample) {
      console.log('No eligible rows to build a representative test email from.');
      process.exit(0);
    }
    console.log(`\n[TEST] Sending ONE conversion email to ${TEST_EMAIL} using sample data from ${maskEmail(sample.email)} (no DB writes).`);
    console.log('[TEST] Note: survey links in this email belong to that sample user — do not click "submit".');
    const r = await sendToRows([{ ...sample, email: TEST_EMAIL }], { dbWrite: false });
    console.log(`[TEST] done: ${r.ok} sent, ${r.fail} failed`);
    process.exit(0);
  }

  // ---- REAL SEND ----
  if (opts.send) {
    let rows = [];
    if (opts.send.includes('A')) rows = rows.concat(segA);
    if (opts.send.includes('B')) rows = rows.concat(segB);
    if (opts.limit && opts.limit > 0) rows = rows.slice(0, opts.limit);
    if (!EmailService.isConfigured()) {
      console.log('Email is NOT configured — sendTrialConversionEmail will no-op. Aborting real send.');
      process.exit(1);
    }
    console.log(`\n[SEND] Real send to ${rows.length} recipient(s) (segments=${opts.send}${opts.limit ? `, limit=${opts.limit}` : ''}).`);
    const r = await sendToRows(rows, { dbWrite: true });
    console.log(`\n[SEND] done: ${r.ok} sent, ${r.fail} failed. conversion_email_sent_at updated for successful sends.`);
    process.exit(r.fail ? 1 : 0);
  }

  // ---- DRY RUN (default) ----
  console.log('\n*** DRY RUN — no emails sent, no DB writes. ***');
  printTable('A (never got conversion email — clean new sends)', segA);
  printTable('B (got conversion email w/ broken survey — re-ask group)', segB);
  console.log(`\nTotals: A=${segA.length}, B=${segB.length}, A+B=${segA.length + segB.length}`);
  console.log('\nNext steps:');
  console.log('  node scripts/send-trial-survey-backfill.js --test       # preview one email to yourself');
  console.log('  node scripts/send-trial-survey-backfill.js --send=A     # send to Segment A only');
  console.log('  node scripts/send-trial-survey-backfill.js --send=AB    # send to both segments');
  process.exit(0);
})();
