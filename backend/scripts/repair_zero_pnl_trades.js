#!/usr/bin/env node

/**
 * Repair closed trades that carry an exit price but no P&L.
 *
 * Background: pnlEngine used to let an execution's `side` (long/short) win
 * over its `type` (entry/exit). Schwab broker sync wrote the position side on
 * closing legs, so those exits were treated as extra opening fills and the
 * trade was saved with pnl NULL, a doubled quantity and an entry price that
 * averaged in the exit. The engine now prefers the leg type; this script
 * re-runs it over the affected rows and writes the corrected aggregates.
 *
 * Modes:
 *   --dry-run (default)  report counts and a sample, no DB changes
 *   --apply              snapshot each row to pnl_engine_backfill_backup, then UPDATE
 *
 * Filters:
 *   --broker a,b         brokers to scan (default: schwab,Questrade)
 *   --user-id <uuid>     one user only
 *   --limit N            stop after N candidate rows
 *   --sample N           rows to print in the report (default 10)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../src/config/database');
const { computeTradePnl } = require('../src/services/pnlEngine');
const { getUserTimezone } = require('../src/utils/timezone');
const AnalyticsCache = require('../src/services/analyticsCache');

function parseArgs(argv) {
  const args = { apply: false, brokers: ['schwab', 'Questrade'], userId: null, limit: null, sample: 10 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--broker') { args.brokers = argv[i + 1].split(',').map((b) => b.trim()).filter(Boolean); i += 1; }
    else if (a === '--user-id') { args.userId = argv[i + 1]; i += 1; }
    else if (a === '--limit') { args.limit = parseInt(argv[i + 1], 10); i += 1; }
    else if (a === '--sample') { args.sample = parseInt(argv[i + 1], 10); i += 1; }
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function parseExecutions(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

function num(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value) {
  return value == null ? 'null' : Number(value).toFixed(4);
}

async function loadCandidates(args) {
  const params = [args.brokers];
  let where = `
    WHERE t.broker = ANY($1::text[])
      AND t.exit_price IS NOT NULL
      AND COALESCE(t.pnl, 0) = 0
      AND t.executions IS NOT NULL
      AND jsonb_typeof(t.executions) = 'array'
      AND jsonb_array_length(t.executions) > 0`;
  if (args.userId) {
    params.push(args.userId);
    where += ` AND t.user_id = $${params.length}`;
  }
  let limit = '';
  if (args.limit) {
    params.push(args.limit);
    limit = ` LIMIT $${params.length}`;
  }
  const result = await db.query(`
    SELECT t.id, t.user_id, t.symbol, t.broker, t.side, t.instrument_type, t.contract_size, t.point_value,
           t.quantity, t.entry_price, t.exit_price, t.entry_time, t.exit_time, t.trade_date,
           t.commission, t.fees, t.pnl, t.pnl_percent, t.executions
    FROM trades t
    ${where}
    ORDER BY t.user_id, t.created_at${limit}
  `, params);
  return result.rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`[REPAIR-PNL] Mode: ${mode}; brokers: ${args.brokers.join(', ')}${args.userId ? `; user ${args.userId}` : ''}${args.limit ? `; limit ${args.limit}` : ''}`);

  const rows = await loadCandidates(args);
  console.log(`[REPAIR-PNL] Candidate rows (exit price set, pnl null/0, executions present): ${rows.length}`);

  const stats = {
    candidates: rows.length,
    computed: 0,          // engine produced a non-null pnl
    stillOpen: 0,         // engine says the legs do not net out (partial / exit-only)
    engineNull: 0,        // closed per engine but pnl still null
    unchangedZero: 0,     // engine agrees the P&L is genuinely 0
    errors: 0
  };
  const byBroker = {};
  const updates = [];
  const sample = [];
  const tzCache = new Map();

  for (const trade of rows) {
    const key = `${trade.broker}/${trade.instrument_type || 'stock'}`;
    byBroker[key] = byBroker[key] || { candidates: 0, fixable: 0 };
    byBroker[key].candidates += 1;

    let tz = tzCache.get(trade.user_id);
    if (!tz) {
      tz = await getUserTimezone(trade.user_id);
      tzCache.set(trade.user_id, tz);
    }

    let result;
    try {
      result = computeTradePnl({
        side: trade.side,
        instrumentType: trade.instrument_type || 'stock',
        contractSize: trade.contract_size,
        pointValue: trade.point_value,
        fallbackCommission: num(trade.commission),
        fallbackFees: num(trade.fees),
        executions: parseExecutions(trade.executions),
        timezone: tz,
        tradeId: trade.id
      });
    } catch (err) {
      stats.errors += 1;
      console.warn(`[REPAIR-PNL] engine error on ${trade.id} (${trade.symbol}): ${err.message}`);
      continue;
    }

    const agg = result.aggregate;
    if (!agg.is_fully_closed) {
      stats.stillOpen += 1;
      continue;
    }
    if (agg.pnl == null) {
      stats.engineNull += 1;
      continue;
    }
    const oldPnl = num(trade.pnl);
    if (oldPnl != null && Math.abs(agg.pnl - oldPnl) < 0.005) {
      stats.unchangedZero += 1;
      continue;
    }

    stats.computed += 1;
    byBroker[key].fixable += 1;
    if (sample.length < args.sample) {
      sample.push({
        id: trade.id,
        symbol: trade.symbol,
        broker: trade.broker,
        type: trade.instrument_type,
        side: trade.side,
        qty: `${fmt(trade.quantity)} -> ${fmt(agg.quantity)}`,
        entry: `${fmt(trade.entry_price)} -> ${fmt(agg.entry_price)}`,
        exit: `${fmt(trade.exit_price)} -> ${fmt(agg.exit_price)}`,
        pnl: `${fmt(trade.pnl)} -> ${fmt(agg.pnl)}`
      });
    }
    updates.push({ trade, agg, executions: result.annotatedExecutions });
  }

  console.log('[REPAIR-PNL] Summary:', JSON.stringify(stats));
  console.log('[REPAIR-PNL] By broker/instrument:', JSON.stringify(byBroker));
  if (sample.length) {
    console.log(`[REPAIR-PNL] Sample of ${sample.length} fixable rows:`);
    console.table(sample);
  }

  if (!args.apply) {
    console.log('[REPAIR-PNL] Dry run only. Re-run with --apply to write these rows.');
    return;
  }
  if (updates.length === 0) {
    console.log('[REPAIR-PNL] Nothing to apply.');
    return;
  }

  const client = await db.connect();
  const touchedUsers = new Set();
  try {
    await client.query('BEGIN');
    for (const { trade, agg, executions } of updates) {
      await client.query(
        `INSERT INTO pnl_engine_backfill_backup (
           trade_id, user_id, pnl, pnl_percent, commission, fees,
           entry_price, exit_price, entry_time, exit_time, trade_date, quantity, executions
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (trade_id) DO NOTHING`,
        [
          trade.id, trade.user_id, trade.pnl, trade.pnl_percent, trade.commission, trade.fees,
          trade.entry_price, trade.exit_price, trade.entry_time, trade.exit_time, trade.trade_date,
          trade.quantity,
          trade.executions != null
            ? (typeof trade.executions === 'string' ? trade.executions : JSON.stringify(trade.executions))
            : null
        ]
      );
      await client.query(
        `UPDATE trades SET
           executions = $1::jsonb,
           entry_price = COALESCE($2, entry_price),
           exit_price = COALESCE($3, exit_price),
           entry_time = COALESCE($4, entry_time),
           exit_time = COALESCE($5, exit_time),
           trade_date = COALESCE($6, trade_date),
           quantity = COALESCE($7, quantity),
           commission = $8,
           fees = $9,
           pnl = $10,
           pnl_percent = $11,
           updated_at = NOW()
         WHERE id = $12 AND user_id = $13`,
        [
          JSON.stringify(executions),
          agg.entry_price,
          agg.exit_price,
          agg.entry_time,
          agg.exit_time,
          agg.trade_date,
          agg.quantity > 0 ? agg.quantity : null,
          agg.commission,
          agg.fees,
          agg.pnl,
          agg.pnl_percent,
          trade.id,
          trade.user_id
        ]
      );
      touchedUsers.add(trade.user_id);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  for (const userId of touchedUsers) {
    try {
      await AnalyticsCache.invalidate(userId);
    } catch (err) {
      console.warn(`[REPAIR-PNL] cache invalidation failed for ${userId}: ${err.message}`);
    }
  }
  console.log(`[REPAIR-PNL] Updated ${updates.length} trades across ${touchedUsers.size} users (snapshots in pnl_engine_backfill_backup).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[REPAIR-PNL] Failed:', err);
    process.exit(1);
  });
