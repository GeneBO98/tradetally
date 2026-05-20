/**
 * One-off seed: submits playbook reviews for the 5 sample trades created by
 * seed-playbook-example.js, so the Adherence Analytics panel populates.
 *
 * Usage: node backend/scripts/seed-playbook-reviews.js [email]
 * Defaults to demo@example.com.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../src/config/database');
const { generateToken } = require('../src/middleware/auth');

const API_BASE = process.env.SEED_API_BASE || 'http://localhost:3030/api';
const EMAIL = process.argv[2] || 'demo@example.com';
const PLAYBOOK_NAME = 'ORB Long — Small Cap Gappers';

async function put(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
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
    const err = new Error(`PUT ${path} -> ${res.status}: ${JSON.stringify(json)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Per-trade checklist plans, keyed by label index in playbook (0..7):
//   0: Float < 50M shares
//   1: Premarket volume > 100k
//   2: Catalyst identified
//   3: Entry within first 30 min of open
//   4: Stop placed under ORB low before entry
//   5: Position size = 1% account risk
//   6: Took partial at 1R or 2R
//   7: No averaging down
const reviewPlans = {
  TXTB: { followedPlan: true,  checked: [0,1,2,3,4,5,6,7], notes: 'Clean ORB break with catalyst. Hit 2R, no rule violations.' },
  GLXG: { followedPlan: true,  checked: [0,1,2,3,4,5,7],   notes: 'Followed plan, stopped near breakeven. Partial not applicable.' },
  SPY:  { followedPlan: false, checked: [3,5,6,7],         notes: 'Off-playbook scalp on a large cap. Wrong setup/strategy/tags.' },
  KAVL: { followedPlan: false, checked: [0,1,2,3,6,7],     notes: 'Skipped the stop and sizing rules — biggest plan break.' },
  NVDA: { followedPlan: false, checked: [0,1,2,3,4,5,6,7], notes: 'Checklist was clean but wrong side & swing hold violated the playbook.' }
};

async function main() {
  const userRes = await db.query('SELECT id, email, tier, role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [EMAIL]);
  if (userRes.rows.length === 0) throw new Error(`No user found for ${EMAIL}`);
  const user = userRes.rows[0];
  console.log(`[INFO] User: ${user.email} (id=${user.id})`);

  const playbookRes = await db.query(
    `SELECT p.id, p.name,
       (SELECT json_agg(json_build_object('id', pci.id, 'label', pci.label, 'item_order', pci.item_order) ORDER BY pci.item_order)
        FROM playbook_checklist_items pci WHERE pci.playbook_id = p.id) AS items
     FROM playbooks p WHERE p.user_id = $1 AND p.name = $2 LIMIT 1`,
    [user.id, PLAYBOOK_NAME]
  );
  if (playbookRes.rows.length === 0) throw new Error(`Playbook "${PLAYBOOK_NAME}" not found for user`);
  const playbook = playbookRes.rows[0];
  const items = playbook.items || [];
  console.log(`[INFO] Playbook: ${playbook.id} (${items.length} checklist items)`);

  const symbols = Object.keys(reviewPlans);
  const tradeRes = await db.query(
    `SELECT DISTINCT ON (symbol) id, symbol, entry_time
     FROM trades
     WHERE user_id = $1 AND symbol = ANY($2::text[])
     ORDER BY symbol, entry_time DESC`,
    [user.id, symbols]
  );
  const tradesBySymbol = Object.fromEntries(tradeRes.rows.map(t => [t.symbol, t]));
  for (const sym of symbols) {
    if (!tradesBySymbol[sym]) console.warn(`[WARN] No trade found for ${sym} — skipping`);
  }

  const token = generateToken(user);

  for (const sym of symbols) {
    const trade = tradesBySymbol[sym];
    if (!trade) continue;
    const plan = reviewPlans[sym];
    const checkedSet = new Set(plan.checked);
    const checklistResponses = items.map((item, idx) => ({
      checklistItemId: item.id,
      checked: checkedSet.has(idx)
    }));

    const payload = {
      playbookId: playbook.id,
      checklistResponses,
      followedPlan: plan.followedPlan,
      reviewNotes: plan.notes
    };

    console.log(`[INFO] Reviewing ${sym} (${trade.id})...`);
    try {
      const result = await put(`/playbooks/trades/${trade.id}/review`, payload, token);
      const review = result?.review || result;
      console.log(`[SUCCESS]   adherence=${review.adherence_score} checklist=${review.checklist_score} followedPlan=${review.followed_plan}`);
    } catch (err) {
      console.error(`[ERROR]   ${sym}: ${err.message}`);
    }
  }

  console.log('\n[DONE] Reviews submitted.');
  try { await db.pool?.end?.(); } catch {}
}

main().catch(async err => {
  console.error('[FATAL]', err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  try { await db.pool?.end?.(); } catch {}
  process.exit(1);
});
