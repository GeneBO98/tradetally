/**
 * One-off seed: creates the "ORB Long — Small Cap Gappers" example playbook
 * and five sample trades (2 adherent, 3 violating) on the user's account.
 *
 * Usage: node backend/scripts/seed-playbook-example.js [email]
 * Defaults to gtsengineeringteam@gmail.com.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../src/config/database');
const { generateToken } = require('../src/middleware/auth');

const API_BASE = process.env.SEED_API_BASE || 'http://localhost:3030/api';
const EMAIL = process.argv[2] || 'gtsengineeringteam@gmail.com';

async function post(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`POST ${path} -> ${res.status}: ${JSON.stringify(json)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

const playbookPayload = {
  name: 'ORB Long — Small Cap Gappers',
  description: 'Long the 5-minute opening range high on small-cap gappers (price $2–$20, gap >= 5%, premarket volume > 100k). Stop under ORB low. First target 2R, runner to VWAP reclaim failure or EOD.',
  market: 'Small caps',
  timeframe: 'day_trading',
  side: 'long',
  requiredStrategy: 'Breakout',
  requiredSetup: 'ORB',
  requiredTags: ['gapper', 'smallcap'],
  requireStopLoss: true,
  minimumTargetR: 2.0,
  checklistItems: [
    { label: 'Float < 50M shares', weight: 1, isRequired: true },
    { label: 'Premarket volume > 100k', weight: 1, isRequired: true },
    { label: 'Catalyst identified (news/PR/earnings)', weight: 1.5, isRequired: true },
    { label: 'Entry within first 30 min of open', weight: 1, isRequired: true },
    { label: 'Stop placed under ORB low before entry', weight: 2, isRequired: true },
    { label: 'Position size = 1% account risk', weight: 2, isRequired: true },
    { label: 'Took partial at 1R or 2R', weight: 1, isRequired: false },
    { label: 'No averaging down', weight: 1.5, isRequired: true }
  ]
};

const trades = [
  {
    label: 'A — TXTB (in-plan winner)',
    payload: {
      symbol: 'TXTB',
      side: 'long',
      quantity: 400,
      entryPrice: 4.12,
      exitPrice: 4.55,
      entryTime: '2026-05-12T13:38:00.000Z',
      exitTime: '2026-05-12T14:15:00.000Z',
      stopLoss: 3.88,
      takeProfit: 4.60,
      strategy: 'Breakout',
      setup: 'ORB',
      tags: ['gapper', 'smallcap', 'news-catalyst'],
      notes: 'Clean ORB break with news catalyst. Took 2R at first target.',
      broker: 'manual'
    }
  },
  {
    label: 'B — GLXG (in-plan stop-out)',
    payload: {
      symbol: 'GLXG',
      side: 'long',
      quantity: 200,
      entryPrice: 7.20,
      exitPrice: 7.10,
      entryTime: '2026-05-13T13:42:00.000Z',
      exitTime: '2026-05-13T15:20:00.000Z',
      stopLoss: 6.85,
      takeProfit: 7.95,
      strategy: 'Breakout',
      setup: 'ORB',
      tags: ['gapper', 'smallcap'],
      notes: 'Followed the plan, stopped out near breakeven after failed breakout.',
      broker: 'manual'
    }
  },
  {
    label: 'C — SPY (wrong market/setup/tags)',
    payload: {
      symbol: 'SPY',
      side: 'long',
      quantity: 50,
      entryPrice: 510.00,
      exitPrice: 512.00,
      entryTime: '2026-05-14T13:45:00.000Z',
      exitTime: '2026-05-14T14:30:00.000Z',
      stopLoss: 508.00,
      takeProfit: 512.00,
      strategy: 'Mean Reversion',
      setup: 'VWAP Bounce',
      tags: ['largecap'],
      notes: 'Off-playbook scalp on SPY. Should not have taken this against the ORB plan.',
      broker: 'manual'
    }
  },
  {
    label: 'D — KAVL (no stop loss)',
    payload: {
      symbol: 'KAVL',
      side: 'long',
      quantity: 300,
      entryPrice: 3.50,
      exitPrice: 3.20,
      entryTime: '2026-05-15T13:35:00.000Z',
      exitTime: '2026-05-15T13:55:00.000Z',
      // intentionally omit stopLoss to trigger the rule violation
      takeProfit: 4.20,
      strategy: 'Breakout',
      setup: 'ORB',
      tags: ['gapper', 'smallcap'],
      notes: 'Took the setup without a hard stop, hoped it would work.',
      broker: 'manual'
    }
  },
  {
    label: 'E — NVDA (wrong side & timeframe)',
    payload: {
      symbol: 'NVDA',
      side: 'short',
      quantity: 30,
      entryPrice: 920.00,
      exitPrice: 905.00,
      entryTime: '2026-05-04T14:00:00.000Z', // Mon
      exitTime: '2026-05-06T18:00:00.000Z',  // Wed -> swing
      stopLoss: 935.00,
      takeProfit: 882.50, // ~2.5R short
      strategy: 'Breakout',
      setup: 'ORB',
      tags: ['gapper', 'smallcap'],
      notes: 'Swing short on a large cap. Setup/strategy labels match but side and timeframe break the playbook.',
      broker: 'manual'
    }
  }
];

async function main() {
  const userRes = await db.query('SELECT id, email, tier, role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [EMAIL]);
  if (userRes.rows.length === 0) {
    throw new Error(`No user found for email ${EMAIL}`);
  }
  const user = userRes.rows[0];
  console.log(`[INFO] User: ${user.email} (id=${user.id}, tier=${user.tier}, role=${user.role})`);

  const token = generateToken(user);

  console.log('[INFO] Creating playbook...');
  const playbook = await post('/playbooks', playbookPayload, token);
  const playbookId = playbook?.playbook?.id || playbook?.id;
  console.log(`[SUCCESS] Playbook created: ${playbookId}`);

  const createdTrades = [];
  for (const t of trades) {
    console.log(`[INFO] Creating trade ${t.label}...`);
    try {
      const result = await post('/trades', t.payload, token);
      const tradeId = result?.trade?.id || result?.id;
      createdTrades.push({ label: t.label, id: tradeId, symbol: t.payload.symbol });
      console.log(`[SUCCESS]   ${t.payload.symbol} -> ${tradeId}`);
    } catch (err) {
      console.error(`[ERROR]   ${t.label}: ${err.message}`);
    }
  }

  console.log('\n[DONE] Summary');
  console.log(`  Playbook id: ${playbookId}`);
  for (const t of createdTrades) {
    console.log(`  ${t.symbol.padEnd(6)} ${t.id}  (${t.label})`);
  }

  await db.end();
}

main().catch(async err => {
  console.error('[FATAL]', err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  try { await db.end(); } catch {}
  process.exit(1);
});
