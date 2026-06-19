const db = require('../src/config/database');
const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('../src/utils/futuresUtils');

/**
 * One-time migration: fix MAE/MFE values that were stored without the
 * contract multiplier (point_value for futures, contract_size for options),
 * plus futures manual entries that were typed as points but stored as dollars.
 *
 * Background:
 *   Prior to the multiplier fix in maeEstimator.js, auto-calculated MAE/MFE
 *   for futures and options was stored as `priceMove * quantity`, omitting
 *   the dollar multiplier. For a MES trade (point_value = 5) that means the
 *   stored value is 1/5 of the correct dollar amount.
 *
 *   Manual entries cannot be reliably distinguished from auto-calc'd values,
 *   so this script only fixes rows where the stored value is mathematically
 *   inconsistent with realized/captured P&L.
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
    SELECT id, user_id, symbol, side, entry_price, exit_price, quantity, pnl, commission, fees,
           mae, mfe, post_exit_mae, post_exit_mfe,
           instrument_type, point_value, underlying_asset, contract_size
    FROM trades
    WHERE instrument_type IN ('future', 'option')
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
    const quantity = Math.abs(parseFloat(trade.quantity) || 0);
    if (multiplier <= 1 || quantity <= 0) {
      skipCount++;
      continue;
    }

    const pnl = parseFloat(trade.pnl);
    const commission = parseFloat(trade.commission) || 0;
    const fees = parseFloat(trade.fees) || 0;
    const grossPnl = pnl + commission + fees;
    const entry = parseFloat(trade.entry_price);
    const exit = parseFloat(trade.exit_price);
    const signedMove = trade.side === 'short' ? entry - exit : exit - entry;
    const capturedDollars = isFinite(signedMove) ? Math.max(0, signedMove * quantity * multiplier) : Math.max(0, grossPnl);

    if (!isFinite(pnl)) {
      skipCount++;
      continue;
    }

    const updates = {};
    const pickScaledValue = (value, minimumDollars) => {
      const numeric = parseFloat(value);
      if (!isFinite(numeric) || numeric <= 0 || !isFinite(minimumDollars) || minimumDollars <= 0) return null;
      if (numeric >= minimumDollars - 0.005) return null;

      const autoMissingMultiplier = numeric * multiplier;
      const manualPoints = numeric * quantity * multiplier;

      if (autoMissingMultiplier >= minimumDollars - 0.005) return autoMissingMultiplier;
      if (manualPoints >= minimumDollars - 0.005) return manualPoints;
      return null;
    };

    const maeMinimum = grossPnl < 0 ? Math.abs(grossPnl) : null;
    const mfeMinimum = capturedDollars > 0 ? capturedDollars : (grossPnl > 0 ? grossPnl : null);

    const newMae = pickScaledValue(trade.mae, maeMinimum);
    const newMfe = pickScaledValue(trade.mfe, mfeMinimum);
    const newPostExitMae = pickScaledValue(trade.post_exit_mae, maeMinimum);
    const newPostExitMfe = pickScaledValue(trade.post_exit_mfe, mfeMinimum);

    if (newMae != null) updates.mae = newMae;
    if (newMfe != null) updates.mfe = newMfe;
    if (newPostExitMae != null) updates.post_exit_mae = newPostExitMae;
    if (newPostExitMfe != null) updates.post_exit_mfe = newPostExitMfe;

    if (Object.keys(updates).length === 0) {
      skipCount++;
      continue;
    }

    console.log(`[FIX] Trade ${trade.id} ${trade.symbol} (${trade.instrument_type}, qty=${quantity}, x${multiplier})`);
    console.log(`      pnl=${pnl.toFixed(2)} gross=${grossPnl.toFixed(2)} captured=${capturedDollars.toFixed(2)}`);
    for (const [field, value] of Object.entries(updates)) {
      console.log(`      ${field}: ${parseFloat(trade[field]).toFixed(2)} -> ${value.toFixed(2)}`);
    }

    if (apply) {
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      const setSql = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
      await db.query(`UPDATE trades SET ${setSql} WHERE id = $${fields.length + 1}`, [...values, trade.id]);
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
