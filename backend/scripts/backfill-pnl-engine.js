#!/usr/bin/env node

/**
 * Canonical pnlEngine backfill.
 *
 * Modes:
 *   --dry-run       diff only, writes /tmp/pnl_backfill_diff_<ts>.csv, no DB changes
 *   --apply         snapshot affected rows to pnl_engine_backfill_backup,
 *                   then UPDATE trades with engine output, then mark status row.
 *                   Idempotent — re-running after success is a no-op unless --force.
 *   --rollback      restore every backed-up row from pnl_engine_backfill_backup,
 *                   clear status row. Reverses --apply.
 *   --status        print whether the backfill has been applied to this DB.
 *
 * Optional flags:
 *   --user-id <uuid>   process only this user (applies to all modes except --status)
 *   --limit N          process at most N trades total
 *   --force            re-run --apply even if status table says already applied
 *
 * Migration table pnl_engine_backfill_backup keeps the pre-engine snapshot per
 * trade so rollback can restore exactly what was there before.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');
const { computeTradePnl } = require('../src/services/pnlEngine');
const { getUserTimezone } = require('../src/utils/timezone');
const AnalyticsCache = require('../src/services/analyticsCache');

function parseArgs(argv) {
  const args = {
    dryRun: false,
    apply: false,
    rollback: false,
    status: false,
    userId: null,
    limit: null,
    force: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--apply') args.apply = true;
    else if (a === '--rollback') args.rollback = true;
    else if (a === '--status') args.status = true;
    else if (a === '--force') args.force = true;
    else if (a === '--user-id') { args.userId = argv[i + 1]; i += 1; }
    else if (a === '--limit') { args.limit = parseInt(argv[i + 1], 10); i += 1; }
  }
  const modes = [args.dryRun, args.apply, args.rollback, args.status].filter(Boolean);
  if (modes.length === 0) {
    throw new Error('Specify one of: --dry-run, --apply, --rollback, --status');
  }
  if (modes.length > 1) {
    throw new Error('Specify only one mode at a time');
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

function detectShape(executions) {
  if (!Array.isArray(executions) || executions.length === 0) return 'empty';
  if (executions.some((e) => e && (e.entryPrice !== undefined || e.entry_price !== undefined || e.entryTime !== undefined || e.entry_time !== undefined))) {
    return 'grouped';
  }
  if (executions.some((e) => e && e.type)) return 'legacy';
  return 'fill';
}

function synthesizeFromAggregates(trade) {
  const qty = parseFloat(trade.quantity);
  const entryPrice = parseFloat(trade.entry_price);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(entryPrice)) return [];
  const synth = [{
    action: trade.side === 'short' ? 'sell' : 'buy',
    quantity: qty,
    price: entryPrice,
    datetime: trade.entry_time || trade.trade_date || null
  }];
  const exitPrice = parseFloat(trade.exit_price);
  if (Number.isFinite(exitPrice) && trade.exit_time) {
    synth.push({
      action: trade.side === 'short' ? 'buy' : 'sell',
      quantity: qty,
      price: exitPrice,
      datetime: trade.exit_time
    });
  }
  return synth;
}

async function getStatus() {
  try {
    const result = await db.query(
      `SELECT applied_at, trades_updated, notes FROM pnl_engine_backfill_status WHERE id = 1`
    );
    if (result.rows.length === 0) return { applied_at: null, trades_updated: 0 };
    return result.rows[0];
  } catch (err) {
    if (err.code === '42P01') {
      return { applied_at: null, trades_updated: 0, notes: 'status table not found (run migration 188 first)' };
    }
    throw err;
  }
}

async function markStatus(tradesUpdated, notes) {
  await db.query(
    `INSERT INTO pnl_engine_backfill_status (id, applied_at, trades_updated, notes)
     VALUES (1, NOW(), $1, $2)
     ON CONFLICT (id) DO UPDATE SET applied_at = NOW(), trades_updated = $1, notes = $2`,
    [tradesUpdated, notes]
  );
}

async function clearStatus() {
  await db.query(
    `UPDATE pnl_engine_backfill_status SET applied_at = NULL, trades_updated = 0, notes = 'rolled back' WHERE id = 1`
  );
}

async function processBatch(rows, args, tzCache, diffWriter, skipWriter, stats) {
  const updates = [];
  for (const trade of rows) {
    stats.processed += 1;
    let executions = parseExecutions(trade.executions);
    let shape = detectShape(executions);
    let synthesized = false;
    if (shape === 'empty') {
      executions = synthesizeFromAggregates(trade);
      if (executions.length === 0) {
        stats.skippedNoData += 1;
        if (skipWriter) {
          skipWriter.write(`${trade.user_id},${trade.id},${trade.symbol || ''},${trade.broker || ''},no_executions_and_no_aggregates\n`);
        }
        continue;
      }
      shape = 'synthesized';
      synthesized = true;
    }
    if (!trade.side) {
      stats.skippedNoData += 1;
      if (skipWriter) {
        skipWriter.write(`${trade.user_id},${trade.id},${trade.symbol || ''},${trade.broker || ''},missing_side\n`);
      }
      continue;
    }

    let tz = tzCache.get(trade.user_id);
    if (!tz) {
      tz = await getUserTimezone(trade.user_id);
      tzCache.set(trade.user_id, tz);
    }

    const result = computeTradePnl({
      side: trade.side,
      instrumentType: trade.instrument_type || 'stock',
      contractSize: trade.contract_size,
      pointValue: trade.point_value,
      fallbackCommission: trade.commission != null ? parseFloat(trade.commission) : null,
      fallbackFees: trade.fees != null ? parseFloat(trade.fees) : null,
      executions,
      timezone: tz,
      tradeId: trade.id
    });

    const agg = result.aggregate;
    const oldPnl = trade.pnl != null ? parseFloat(trade.pnl) : null;
    const newPnl = agg.pnl;
    const delta = (oldPnl != null && newPnl != null) ? Math.abs(newPnl - oldPnl)
                 : (oldPnl == null && newPnl == null) ? 0
                 : Infinity;
    const transitioned = (oldPnl == null && newPnl != null) || (oldPnl != null && newPnl == null);

    if (Math.abs(delta) > 0.05 || transitioned) {
      stats.outliers += 1;
      if (transitioned) stats.transitions += 1;
      if (diffWriter) {
        diffWriter.write([
          trade.user_id,
          trade.id,
          trade.symbol || '',
          trade.broker || '',
          oldPnl ?? '',
          newPnl ?? '',
          delta === Infinity ? 'transition' : delta.toFixed(4),
          shape,
          executions.length,
          oldPnl == null ? '1' : '0',
          synthesized ? '1' : '0'
        ].join(',') + '\n');
      }
    }

    if (args.apply) {
      updates.push({
        id: trade.id,
        user_id: trade.user_id,
        snapshot: {
          pnl: trade.pnl,
          pnl_percent: trade.pnl_percent,
          commission: trade.commission,
          fees: trade.fees,
          entry_price: trade.entry_price,
          exit_price: trade.exit_price,
          entry_time: trade.entry_time,
          exit_time: trade.exit_time,
          trade_date: trade.trade_date,
          quantity: trade.quantity,
          executions: trade.executions
        },
        engine: {
          executions: result.annotatedExecutions,
          agg
        }
      });
    }
  }

  if (args.apply && updates.length > 0) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const u of updates) {
        await client.query(
          `INSERT INTO pnl_engine_backfill_backup (
            trade_id, user_id, pnl, pnl_percent, commission, fees,
            entry_price, exit_price, entry_time, exit_time,
            trade_date, quantity, executions
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (trade_id) DO NOTHING`,
          [
            u.id, u.user_id,
            u.snapshot.pnl, u.snapshot.pnl_percent,
            u.snapshot.commission, u.snapshot.fees,
            u.snapshot.entry_price, u.snapshot.exit_price,
            u.snapshot.entry_time, u.snapshot.exit_time,
            u.snapshot.trade_date, u.snapshot.quantity,
            u.snapshot.executions != null
              ? (typeof u.snapshot.executions === 'string' ? u.snapshot.executions : JSON.stringify(u.snapshot.executions))
              : null
          ]
        );
        await client.query(
          `UPDATE trades SET
             executions = $1::jsonb,
             entry_price = COALESCE($2, entry_price),
             exit_price = $3,
             entry_time = COALESCE($4, entry_time),
             exit_time = $5,
             trade_date = COALESCE($6, trade_date),
             quantity = COALESCE($7, quantity),
             commission = $8,
             fees = $9,
             pnl = $10,
             pnl_percent = $11,
             updated_at = NOW()
           WHERE id = $12 AND user_id = $13`,
          [
            JSON.stringify(u.engine.executions),
            u.engine.agg.entry_price,
            u.engine.agg.is_fully_closed ? u.engine.agg.exit_price : null,
            u.engine.agg.entry_time,
            u.engine.agg.is_fully_closed ? u.engine.agg.exit_time : null,
            u.engine.agg.trade_date,
            u.engine.agg.quantity > 0 ? u.engine.agg.quantity : null,
            u.engine.agg.commission,
            u.engine.agg.fees,
            u.engine.agg.pnl,
            u.engine.agg.pnl_percent,
            u.id,
            u.user_id
          ]
        );
        stats.updated += 1;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function runApplyOrDryRun(args) {
  const status = await getStatus();
  if (args.apply && status.applied_at && !args.force) {
    console.log(`[BACKFILL] Already applied at ${status.applied_at} (${status.trades_updated} trades). Use --force to re-run.`);
    return;
  }

  const mode = args.dryRun ? 'DRY-RUN' : 'APPLY';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const diffPath = path.join('/tmp', `pnl_backfill_diff_${ts}.csv`);
  const skipPath = path.join('/tmp', `pnl_backfill_skipped_${ts}.csv`);
  const diffWriter = fs.createWriteStream(diffPath);
  const skipWriter = fs.createWriteStream(skipPath);
  diffWriter.write('user_id,trade_id,symbol,broker,old_pnl,new_pnl,delta,exec_shape,exec_count,was_null,synthesized\n');
  skipWriter.write('user_id,trade_id,symbol,broker,reason\n');

  console.log(`[BACKFILL] Mode: ${mode}`);
  if (args.userId) console.log(`[BACKFILL] User filter: ${args.userId}`);
  if (args.limit) console.log(`[BACKFILL] Limit: ${args.limit}`);
  console.log(`[BACKFILL] Diff CSV:    ${diffPath}`);
  console.log(`[BACKFILL] Skipped CSV: ${skipPath}`);

  const stats = { processed: 0, outliers: 0, transitions: 0, updated: 0, skippedNoData: 0, invalidatedUsers: 0 };
  const tzCache = new Map();
  const userIdsTouched = new Set();

  const whereClauses = [];
  const params = [];
  if (args.userId) {
    params.push(args.userId);
    whereClauses.push(`user_id = $${params.length}`);
  }
  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const batchSize = 500;
  let offset = 0;
  while (true) {
    if (args.limit && stats.processed >= args.limit) break;
    const remaining = args.limit ? args.limit - stats.processed : null;
    const limitClause = `LIMIT ${remaining != null ? Math.min(batchSize, remaining) : batchSize}`;

    const result = await db.query(
      `SELECT id, user_id, symbol, broker, side, instrument_type, contract_size, point_value,
              entry_price, exit_price, entry_time, exit_time, trade_date, quantity,
              commission, fees, pnl, pnl_percent, executions
       FROM trades
       ${where}
       ORDER BY user_id, id
       ${limitClause} OFFSET ${offset}`,
      params
    );

    if (result.rows.length === 0) break;
    await processBatch(result.rows, args, tzCache, diffWriter, skipWriter, stats);
    for (const r of result.rows) userIdsTouched.add(r.user_id);
    offset += result.rows.length;

    if (stats.processed % 5000 < batchSize) {
      console.log(`[BACKFILL] Processed ${stats.processed}, outliers ${stats.outliers}, updated ${stats.updated}`);
    }
    if (result.rows.length < batchSize) break;
  }

  if (args.apply && userIdsTouched.size > 0) {
    console.log(`[BACKFILL] Invalidating analytics cache for ${userIdsTouched.size} users...`);
    for (const uid of userIdsTouched) {
      try {
        await AnalyticsCache.invalidate(uid);
        stats.invalidatedUsers += 1;
      } catch (err) {
        console.warn(`[BACKFILL] Cache invalidate failed for ${uid}: ${err.message}`);
      }
    }
  }

  if (args.apply) {
    await markStatus(stats.updated, args.userId ? `user_id=${args.userId}` : 'all_users');
  }

  diffWriter.end();
  skipWriter.end();

  console.log('---');
  console.log(`[BACKFILL] Mode:           ${mode}`);
  console.log(`[BACKFILL] Processed:      ${stats.processed}`);
  console.log(`[BACKFILL] Outliers:       ${stats.outliers}`);
  console.log(`[BACKFILL] Null transitions: ${stats.transitions}`);
  console.log(`[BACKFILL] Updated:        ${stats.updated}`);
  console.log(`[BACKFILL] Skipped:        ${stats.skippedNoData}`);
  console.log(`[BACKFILL] Caches busted:  ${stats.invalidatedUsers}`);
  console.log(`[BACKFILL] Diff CSV:       ${diffPath}`);
  console.log(`[BACKFILL] Skipped CSV:    ${skipPath}`);
}

async function runRollback(args) {
  const whereClauses = [];
  const params = [];
  if (args.userId) {
    params.push(args.userId);
    whereClauses.push(`b.user_id = $${params.length}`);
  }
  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const limit = args.limit ? `LIMIT ${args.limit}` : '';

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM pnl_engine_backfill_backup b ${where}`,
    params
  );
  const total = countResult.rows[0].cnt;
  if (total === 0) {
    console.log('[BACKFILL] No rows in pnl_engine_backfill_backup — nothing to roll back.');
    return;
  }
  console.log(`[BACKFILL] Rolling back ${total}${args.userId ? ` (user ${args.userId})` : ''} trades from backup...`);

  const client = await db.connect();
  let restored = 0;
  const userIdsTouched = new Set();
  try {
    await client.query('BEGIN');
    const batchSize = 500;
    let offset = 0;
    while (true) {
      const result = await client.query(
        `SELECT b.trade_id, b.user_id, b.pnl, b.pnl_percent, b.commission, b.fees,
                b.entry_price, b.exit_price, b.entry_time, b.exit_time,
                b.trade_date, b.quantity, b.executions
         FROM pnl_engine_backfill_backup b
         ${where}
         ORDER BY b.trade_id
         LIMIT ${batchSize} OFFSET ${offset}`,
        params
      );
      if (result.rows.length === 0) break;

      for (const row of result.rows) {
        await client.query(
          `UPDATE trades SET
             pnl = $1,
             pnl_percent = $2,
             commission = $3,
             fees = $4,
             entry_price = $5,
             exit_price = $6,
             entry_time = $7,
             exit_time = $8,
             trade_date = $9,
             quantity = $10,
             executions = $11::jsonb,
             updated_at = NOW()
           WHERE id = $12 AND user_id = $13`,
          [
            row.pnl, row.pnl_percent,
            row.commission, row.fees,
            row.entry_price, row.exit_price,
            row.entry_time, row.exit_time,
            row.trade_date, row.quantity,
            row.executions != null
              ? (typeof row.executions === 'string' ? row.executions : JSON.stringify(row.executions))
              : null,
            row.trade_id, row.user_id
          ]
        );
        restored += 1;
        userIdsTouched.add(row.user_id);
        if (args.limit && restored >= args.limit) break;
      }

      offset += result.rows.length;
      if (args.limit && restored >= args.limit) break;
      if (result.rows.length < batchSize) break;
    }

    await client.query(
      `DELETE FROM pnl_engine_backfill_backup ${where}`,
      params
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  for (const uid of userIdsTouched) {
    try { await AnalyticsCache.invalidate(uid); } catch {}
  }

  if (!args.userId) {
    await clearStatus();
  }

  console.log(`[BACKFILL] Restored ${restored} trades. Status cleared${args.userId ? ' for filtered user only' : ''}.`);
}

async function runStatusCheck() {
  const status = await getStatus();
  if (status.applied_at) {
    console.log(`[BACKFILL] Applied at:    ${status.applied_at}`);
    console.log(`[BACKFILL] Trades updated: ${status.trades_updated}`);
    if (status.notes) console.log(`[BACKFILL] Notes:         ${status.notes}`);
  } else {
    console.log('[BACKFILL] Not yet applied.');
    if (status.notes) console.log(`[BACKFILL] Notes: ${status.notes}`);
  }
  const backup = await db.query('SELECT COUNT(*)::int AS cnt FROM pnl_engine_backfill_backup');
  console.log(`[BACKFILL] Backup rows:    ${backup.rows[0].cnt}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.status) {
    await runStatusCheck();
    return;
  }
  if (args.rollback) {
    await runRollback(args);
    return;
  }
  await runApplyOrDryRun(args);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[BACKFILL] Fatal error:', err);
    process.exit(1);
  });
