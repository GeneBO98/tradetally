const db = require('./src/config/database');

/**
 * One-time script to recalculate R-Values for trades with stopLoss in executions
 */

// R-Value calculation function (copied from Trade.js)
function calculateRValue(entryPrice, stopLoss, exitPrice, side) {
  if (!entryPrice || !stopLoss || !exitPrice || !side) {
    return null;
  }

  const initialRisk = side === 'long'
    ? Math.abs(entryPrice - stopLoss)
    : Math.abs(stopLoss - entryPrice);

  if (initialRisk === 0) return null;

  const actualPnl = side === 'long'
    ? exitPrice - entryPrice
    : entryPrice - exitPrice;

  return actualPnl / initialRisk;
}

async function recalculateRValues() {
  try {
    console.log('[START] Recalculating R-Values for trades with stopLoss in executions...\n');

    // Find all trades with executions that contain stopLoss values but have NULL r_value
    const query = `
      SELECT id, symbol, side, entry_price, exit_price, stop_loss, executions, r_value
      FROM trades
      WHERE executions IS NOT NULL
        AND jsonb_array_length(executions) > 0
        AND r_value IS NULL
    `;

    const result = await db.query(query);
    const trades = result.rows;

    console.log(`[INFO] Found ${trades.length} trades with executions and NULL r_value\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const trade of trades) {
      const executions = trade.executions || [];

      // Check if any execution has stopLoss
      const executionsWithStopLoss = executions.filter(ex =>
        ex.stopLoss !== null && ex.stopLoss !== undefined
      );

      if (executionsWithStopLoss.length === 0) {
        console.log(`[SKIP] Trade ${trade.id} (${trade.symbol}) - no stopLoss in executions`);
        skippedCount++;
        continue;
      }

      // Calculate weighted averages from executions
      const totalQty = executionsWithStopLoss.reduce((sum, ex) => sum + (ex.quantity || 0), 0);

      if (totalQty === 0) {
        console.log(`[SKIP] Trade ${trade.id} (${trade.symbol}) - zero total quantity`);
        skippedCount++;
        continue;
      }

      const weightedEntry = executionsWithStopLoss.reduce((sum, ex) =>
        sum + ((ex.entryPrice || 0) * (ex.quantity || 0)), 0) / totalQty;
      const weightedStopLoss = executionsWithStopLoss.reduce((sum, ex) =>
        sum + ((ex.stopLoss || 0) * (ex.quantity || 0)), 0) / totalQty;
      const weightedExit = executionsWithStopLoss.reduce((sum, ex) =>
        sum + ((ex.exitPrice || 0) * (ex.quantity || 0)), 0) / totalQty;

      // Calculate R-Value
      const rValue = calculateRValue(weightedEntry, weightedStopLoss, weightedExit, trade.side);

      if (rValue === null) {
        console.log(`[SKIP] Trade ${trade.id} (${trade.symbol}) - could not calculate R-Value`);
        console.log(`       Entry: ${weightedEntry}, Stop: ${weightedStopLoss}, Exit: ${weightedExit}, Side: ${trade.side}`);
        skippedCount++;
        continue;
      }

      // Update the trade
      await db.query(
        'UPDATE trades SET r_value = $1 WHERE id = $2',
        [rValue, trade.id]
      );

      console.log(`[UPDATE] Trade ${trade.id} (${trade.symbol})`);
      console.log(`         Weighted Entry: ${weightedEntry.toFixed(2)}, Stop: ${weightedStopLoss.toFixed(2)}, Exit: ${weightedExit.toFixed(2)}`);
      console.log(`         R-Value: ${rValue.toFixed(2)}R\n`);
      updatedCount++;
    }

    console.log(`\n[COMPLETE] R-Value recalculation finished`);
    console.log(`  - Updated: ${updatedCount} trades`);
    console.log(`  - Skipped: ${skippedCount} trades`);
    console.log(`  - Total processed: ${trades.length} trades`);

    process.exit(0);
  } catch (error) {
    console.error('[ERROR] Failed to recalculate R-Values:', error);
    process.exit(1);
  }
}

recalculateRValues();
