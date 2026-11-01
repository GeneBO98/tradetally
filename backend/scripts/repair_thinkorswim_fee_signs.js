#!/usr/bin/env node

/**
 * Repair thinkorswim trades whose fees were stored with the wrong sign.
 *
 * Background: thinkorswim Account Statement exports write "Misc Fees" and
 * "Commissions & Fees" as negative numbers. Until the importer fix the parser
 * kept that sign, so every fee was added to P/L instead of subtracted, and the
 * trade row plus each stored execution carry negative costs.
 *
 * For every thinkorswim trade with a negative cost this script:
 *   1. flips negative commission/fees to positive on the row and each execution
 *   2. recomputes P/L as the old P/L minus twice the flipped cost (the fee was
 *      added once; it must be subtracted once)
 *   3. re-runs the canonical pnlEngine over the corrected executions; when the
 *      engine agrees with step 2 (within $0.05) its annotated executions and
 *      P/L % are written, otherwise the trade keeps its own numbers and only
 *      the sign flip is applied, and the trade is listed in the report
 *   4. leaves open trades' P/L alone (only signs are flipped)
 * Entry/exit prices, times, quantity and trade date are never changed.
 *
 * Modes:
 *   --dry-run (default)  report counts and a sample, no DB changes
 *   --apply              snapshot each row to thinkorswim_fee_repair_backup, then UPDATE
 *   --rollback           restore every snapshotted row from thinkorswim_fee_repair_backup
 *
 * Filters:
 *   --user-id <uuid>     one user only
 *   --limit N            stop after N candidate rows
 *   --sample N           rows to print in the report (default 10)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../src/config/database');
const { computeTradePnl } = require('../src/services/pnlEngine');
const { getUserTimezone } = require('../src/utils/timezone');
const AnalyticsCache = require('../src/services/analyticsCache');

const BROKER = 'thinkorswim';
const BACKUP_TABLE = 'thinkorswim_fee_repair_backup';
const ENGINE_AGREEMENT_TOLERANCE = 0.05;

function parseArgs(argv) {
  const args = { mode: 'dry-run', userId: null, limit: null, sample: 10 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.mode = 'apply';
    else if (a === '--dry-run') args.mode = 'dry-run';
    else if (a === '--rollback') args.mode = 'rollback';
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

function absOrNull(value) {
  const parsed = num(value);
  return parsed == null ? null : Math.abs(parsed);
}

function negativePart(value) {
  const parsed = num(value);
  return parsed != null && parsed < 0 ? Math.abs(parsed) : 0;
}

function flipExecutionCosts(executions) {
  return executions.map((execution) => {
    if (!execution || typeof execution !== 'object') return execution;
    const next = { ...execution };
    for (const key of ['fees', 'commission']) {
      const value = num(next[key]);
      if (value != null && value < 0) next[key] = Math.abs(value);
    }
    return next;
  });
}

function multiplierFor(trade) {
  const type = trade.instrument_type || 'stock';
  if (type === 'future') return num(trade.point_value) || null;
  if (type === 'option') return num(trade.contract_size) || 100;
  return 1;
}

function rescaledPnlPercent(trade, pnl) {
  const entryPrice = num(trade.entry_price);
  const quantity = num(trade.quantity);
  const multiplier = multiplierFor(trade);
  if (pnl == null || !entryPrice || entryPrice <= 0 || !quantity || quantity <= 0 || !multiplier) {
    return num(trade.pnl_percent);
  }
  return (pnl / (entryPrice * quantity * multiplier)) * 100;
}

async function ensureBackupTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
      trade_id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      pnl NUMERIC,
      pnl_percent NUMERIC,
      commission NUMERIC,
      fees NUMERIC,
      entry_commission NUMERIC,
      exit_commission NUMERIC,
      executions JSONB,
      backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadCandidates(args) {
  const params = [BROKER];
  let where = `
    WHERE t.broker = $1
      AND (
        COALESCE(t.commission, 0) < 0
        OR COALESCE(t.fees, 0) < 0
        OR COALESCE(t.entry_commission, 0) < 0
        OR COALESCE(t.exit_commission, 0) < 0
        OR (
          jsonb_typeof(t.executions) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(t.executions) e
            WHERE COALESCE((e->>'fees')::numeric, 0) < 0
               OR COALESCE((e->>'commission')::numeric, 0) < 0
          )
        )
      )`;
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
    SELECT t.id, t.user_id, t.symbol, t.side, t.instrument_type, t.contract_size, t.point_value,
           t.quantity, t.entry_price, t.exit_price,
           t.commission, t.fees, t.entry_commission, t.exit_commission, t.pnl, t.pnl_percent, t.executions
    FROM trades t
    ${where}
    ORDER BY t.user_id, t.created_at${limit}
  `, params);
  return result.rows;
}

function planRepair(trade, timezone) {
  const flippedExecutions = flipExecutionCosts(parseExecutions(trade.executions));
  const commission = absOrNull(trade.commission);
  const fees = absOrNull(trade.fees);
  const isClosed = trade.exit_price != null;

  const plan = {
    commission,
    fees,
    entryCommission: absOrNull(trade.entry_commission),
    exitCommission: absOrNull(trade.exit_commission),
    executions: flippedExecutions,
    pnl: num(trade.pnl),
    pnlPercent: num(trade.pnl_percent),
    source: isClosed ? 'arithmetic' : 'open'
  };

  if (!isClosed) return plan;

  // The fee was added to P/L once; subtracting it once more lands on gross - fee.
  const flippedCost = negativePart(trade.commission) + negativePart(trade.fees);
  const arithmeticPnl = plan.pnl != null ? plan.pnl - 2 * flippedCost : null;
  plan.pnl = arithmeticPnl;
  plan.pnlPercent = rescaledPnlPercent(trade, arithmeticPnl);

  let engine;
  try {
    engine = computeTradePnl({
      side: trade.side,
      instrumentType: trade.instrument_type || 'stock',
      contractSize: trade.contract_size,
      pointValue: trade.point_value,
      fallbackCommission: commission,
      fallbackFees: fees,
      executions: flippedExecutions,
      timezone,
      tradeId: trade.id
    });
  } catch (err) {
    plan.engineError = err.message;
    return plan;
  }

  const agg = engine.aggregate;
  if (agg.is_fully_closed && agg.pnl != null && arithmeticPnl != null
      && Math.abs(agg.pnl - arithmeticPnl) <= ENGINE_AGREEMENT_TOLERANCE) {
    plan.source = 'engine';
    plan.executions = engine.annotatedExecutions;
    plan.pnl = agg.pnl;
    plan.pnlPercent = agg.pnl_percent != null ? agg.pnl_percent : plan.pnlPercent;
  } else {
    plan.enginePnl = agg.pnl;
  }
  return plan;
}

async function runRepair(args) {
  const rows = await loadCandidates(args);
  console.log(`[REPAIR-TOS-FEES] Candidate rows (negative cost on trade or execution): ${rows.length}`);

  const stats = { candidates: rows.length, engine: 0, arithmetic: 0, open: 0 };
  const updates = [];
  const sample = [];
  const arithmeticOnly = [];
  const tzCache = new Map();
  let pnlDelta = 0;

  for (const trade of rows) {
    let tz = tzCache.get(trade.user_id);
    if (!tz) {
      tz = await getUserTimezone(trade.user_id);
      tzCache.set(trade.user_id, tz);
    }

    const plan = planRepair(trade, tz);
    stats[plan.source] += 1;
    const oldPnl = num(trade.pnl);
    if (oldPnl != null && plan.pnl != null) pnlDelta += plan.pnl - oldPnl;

    if (plan.source === 'arithmetic') {
      arithmeticOnly.push({
        id: trade.id,
        symbol: trade.symbol,
        oldPnl: fmt(trade.pnl),
        newPnl: fmt(plan.pnl),
        enginePnl: plan.engineError ? `error: ${plan.engineError}` : fmt(plan.enginePnl)
      });
    }
    if (sample.length < args.sample) {
      sample.push({
        id: trade.id,
        symbol: trade.symbol,
        type: trade.instrument_type || 'stock',
        source: plan.source,
        commission: `${fmt(trade.commission)} -> ${fmt(plan.commission)}`,
        fees: `${fmt(trade.fees)} -> ${fmt(plan.fees)}`,
        pnl: `${fmt(trade.pnl)} -> ${fmt(plan.pnl)}`
      });
    }
    updates.push({ trade, plan });
  }

  console.log('[REPAIR-TOS-FEES] Summary:', JSON.stringify(stats));
  console.log(`[REPAIR-TOS-FEES] Net P/L change across repaired trades: ${pnlDelta.toFixed(2)}`);
  if (sample.length) {
    console.log(`[REPAIR-TOS-FEES] Sample of ${sample.length} rows:`);
    console.table(sample);
  }
  if (arithmeticOnly.length) {
    console.log(`[REPAIR-TOS-FEES] ${arithmeticOnly.length} closed trades where the engine disagrees with the stored totals; sign flip only:`);
    console.table(arithmeticOnly);
  }

  if (args.mode !== 'apply') {
    console.log('[REPAIR-TOS-FEES] Dry run only. Re-run with --apply to write these rows.');
    return;
  }
  if (updates.length === 0) {
    console.log('[REPAIR-TOS-FEES] Nothing to apply.');
    return;
  }

  await ensureBackupTable();
  const client = await db.connect();
  const touchedUsers = new Set();
  try {
    await client.query('BEGIN');
    for (const { trade, plan } of updates) {
      await client.query(
        `INSERT INTO ${BACKUP_TABLE} (
           trade_id, user_id, pnl, pnl_percent, commission, fees, entry_commission, exit_commission, executions
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (trade_id) DO NOTHING`,
        [
          trade.id, trade.user_id, trade.pnl, trade.pnl_percent, trade.commission, trade.fees,
          trade.entry_commission, trade.exit_commission,
          trade.executions != null
            ? (typeof trade.executions === 'string' ? trade.executions : JSON.stringify(trade.executions))
            : null
        ]
      );
      await client.query(
        `UPDATE trades SET
           executions = $1::jsonb,
           commission = $2,
           fees = $3,
           entry_commission = $4,
           exit_commission = $5,
           pnl = $6,
           pnl_percent = $7,
           updated_at = NOW()
         WHERE id = $8 AND user_id = $9`,
        [
          JSON.stringify(plan.executions),
          plan.commission,
          plan.fees,
          plan.entryCommission,
          plan.exitCommission,
          plan.pnl,
          plan.pnlPercent,
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

  await invalidateCaches(touchedUsers);
  console.log(`[REPAIR-TOS-FEES] Updated ${updates.length} trades across ${touchedUsers.size} users (snapshots in ${BACKUP_TABLE}).`);
}

async function runRollback(args) {
  const params = [];
  let where = '';
  if (args.userId) {
    params.push(args.userId);
    where = ` WHERE user_id = $${params.length}`;
  }
  const result = await db.query(`SELECT * FROM ${BACKUP_TABLE}${where} ORDER BY backed_up_at`, params);
  console.log(`[REPAIR-TOS-FEES] Rolling back ${result.rows.length} snapshotted trades`);

  const client = await db.connect();
  const touchedUsers = new Set();
  try {
    await client.query('BEGIN');
    for (const row of result.rows) {
      await client.query(
        `UPDATE trades SET
           executions = $1::jsonb, commission = $2, fees = $3, entry_commission = $4,
           exit_commission = $5, pnl = $6, pnl_percent = $7, updated_at = NOW()
         WHERE id = $8 AND user_id = $9`,
        [
          row.executions != null ? JSON.stringify(row.executions) : null,
          row.commission, row.fees, row.entry_commission, row.exit_commission, row.pnl, row.pnl_percent,
          row.trade_id, row.user_id
        ]
      );
      touchedUsers.add(row.user_id);
    }
    await client.query(`DELETE FROM ${BACKUP_TABLE}${where}`, params);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await invalidateCaches(touchedUsers);
  console.log(`[REPAIR-TOS-FEES] Restored ${result.rows.length} trades across ${touchedUsers.size} users.`);
}

async function invalidateCaches(userIds) {
  for (const userId of userIds) {
    try {
      await AnalyticsCache.delete(userId);
    } catch (err) {
      console.warn(`[REPAIR-TOS-FEES] cache invalidation failed for ${userId}: ${err.message}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[REPAIR-TOS-FEES] Mode: ${args.mode.toUpperCase()}${args.userId ? `; user ${args.userId}` : ''}${args.limit ? `; limit ${args.limit}` : ''}`);
  if (args.mode === 'rollback') {
    await runRollback(args);
  } else {
    await runRepair(args);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[REPAIR-TOS-FEES] Failed:', err);
    process.exit(1);
  });
