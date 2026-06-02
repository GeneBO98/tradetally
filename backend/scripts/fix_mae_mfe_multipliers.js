const db = require('../src/config/database');
const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('../src/utils/futuresUtils');

/**
 * One-time migration: fix MAE/MFE values that were stored without the
 * contract multiplier (point_value for futures, contract_size for options).
 *
 * Background:
 *   Prior to the multiplier fix in maeEstimator.js, auto-calculated MAE/MFE
 *   for futures and options was stored as `priceMove * quantity`, omitting
 *   the dollar multiplier. For a MES trade (point_value = 5) that means the
 *   stored value is 1/5 of the correct dollar amount.
 *
 *   Manual entries cannot be reliably distinguished from auto-calc'd values,
 *   so this script only fixes rows where the stored value is *mathematically
 *   impossible* — MAE must be at least the realized loss in dollars, and MFE
 *   must be at least the realized gain. Anything that fails that check was
 *   produced by the buggy estimator.
 *
 * Usage:
 *   node scripts/fix_mae_mfe_multipliers.js           # dry-run (default)
 *   node scripts/fix_mae_mfe_multipliers.js --apply   # write changes
 *   node scripts/fix_mae_mfe_multipliers.js --user <userId> --apply
 */

function resolveMultiplier(trade) {
  const instrumentType = trade.instrument_type || 'stock';

  if (instrumentType === 'future') {
    const stored = parseFloat(trade.point_value);
    if (isFinite(stored) && stored > 0) return stored;
    const underlying = trade.underlying_asset || extractUnderlyingFromFuturesSymbol(trade.symbol);
    return getFuturesPointValue(underlying);
  }

  if (instrumentType === 'option') {
    const size = parseFloat(trade.contract_size);
    return isFinite(size) && size > 0 ? size : 100;
  }

  return 1;
}

async function run() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const userIdx = args.indexOf('--user');
  const userId = userIdx >= 0 ? args[userIdx + 1] : null;

  console.log(`[START] MAE/MFE multiplier migration (${apply ? 'APPLY' : 'DRY-RUN'})`);
  if (userId) console.log(`[INFO] Scoped to user_id = ${userId}`);

  const params = [];
  let userClause = '';
  if (userId) {
    params.push(userId);
    userClause = `AND user_id = $${params.length}`;
  }

  const query = `
    SELECT id, user_id, symbol, side, pnl, mae, mfe,
           instrument_type, point_value, underlying_asset, contract_size
    FROM trades
    WHERE instrument_type IN ('future', 'option')
      AND mae IS NOT NULL
      AND mfe IS NOT NULL
      AND pnl IS NOT NULL
      ${userClause}
  `;

  const result = await db.query(query, params);
  const trades = result.rows;

  console.log(`[INFO] Found ${trades.length} futures/options trades with stored MAE/MFE\n`);

  let updateCount = 0;
  let skipCount = 0;

  for (const trade of trades) {
    const multiplier = resolveMultiplier(trade);
    if (multiplier <= 1) {
      skipCount++;
      continue;
    }

    const mae = parseFloat(trade.mae);
    const mfe = parseFloat(trade.mfe);
    const pnl = parseFloat(trade.pnl);

    if (!isFinite(mae) || !isFinite(mfe) || !isFinite(pnl)) {
      skipCount++;
      continue;
    }

    // A correctly-stored MAE must satisfy: mae >= |min(pnl, 0)| (at least the realized loss).
    // A correctly-stored MFE must satisfy: mfe >= max(pnl, 0)    (at least the realized gain).
    // Either failing => the value is in "points * qty" units, not dollars.
    const maeImpossible = pnl < 0 && mae < Math.abs(pnl) - 0.005;
    const mfeImpossible = pnl > 0 && mfe < pnl - 0.005;

    if (!maeImpossible && !mfeImpossible) {
      skipCount++;
      continue;
    }

    const newMae = mae * multiplier;
    const newMfe = mfe * multiplier;

    console.log(`[FIX] Trade ${trade.id} ${trade.symbol} (${trade.instrument_type}, x${multiplier})`);
    console.log(`      pnl=${pnl.toFixed(2)}  mae: ${mae.toFixed(2)} -> ${newMae.toFixed(2)}  mfe: ${mfe.toFixed(2)} -> ${newMfe.toFixed(2)}`);

    if (apply) {
      await db.query('UPDATE trades SET mae = $1, mfe = $2 WHERE id = $3', [newMae, newMfe, trade.id]);
    }
    updateCount++;
  }

  console.log(`\n[${apply ? 'COMPLETE' : 'DRY-RUN'}] Reviewed ${trades.length} trades`);
  console.log(`  - ${apply ? 'Updated' : 'Would update'}: ${updateCount}`);
  console.log(`  - Skipped (already correct or non-scaled): ${skipCount}`);

  if (apply && updateCount > 0) {
    console.log(`\n[INFO] Invalidating analytics cache for affected users...`);
    const affectedUsers = await db.query(`
      SELECT DISTINCT user_id FROM trades WHERE instrument_type IN ('future', 'option')
    `);
    const AnalyticsCache = require('../src/services/analyticsCache');
    for (const row of affectedUsers.rows) {
      await AnalyticsCache.invalidate(row.user_id);
    }
    console.log(`[INFO] Cache invalidated for ${affectedUsers.rows.length} users`);
  } else if (!apply) {
    console.log(`\n[NEXT] Re-run with --apply to commit these changes.`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
