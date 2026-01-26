const db = require('./src/config/database');

/**
 * One-time script to recalculate R-Values for all trades
 *
 * R = Risk = Initial Stop (the distance from entry to stop loss)
 * R-Multiple = Profit Per Trade / R
 *
 * For Long: (exitPrice - entryPrice) / (entryPrice - stopLoss)
 * For Short: (entryPrice - exitPrice) / (stopLoss - entryPrice)
 *
 * Examples with a 2.0 pt initial stop (R = 2.0):
 *   - Lost 1.00 pt → R-Multiple = -1.00 / 2.0 = -0.5R
 *   - Won 2.00 pt → R-Multiple = 2.00 / 2.0 = 1.0R
 *   - Won 4.00 pt → R-Multiple = 4.00 / 2.0 = 2.0R
 */

// R-Value calculation function (matches Trade.js)
function calculateRValue(entryPrice, stopLoss, exitPrice, side) {
  if (!entryPrice || !stopLoss || !exitPrice || !side) {
    return null;
  }

  // Ensure all values are positive
  if (entryPrice <= 0 || stopLoss <= 0 || exitPrice <= 0) {
    return null;
  }

  let riskAmount; // R = Initial risk (distance from entry to stop)
  let actualProfit;

  if (side === 'long') {
    // For long: stop loss should be below entry
    if (stopLoss >= entryPrice) return null;
    riskAmount = entryPrice - stopLoss;
    actualProfit = exitPrice - entryPrice;
  } else if (side === 'short') {
    // For short: stop loss should be above entry
    if (stopLoss <= entryPrice) return null;
    riskAmount = stopLoss - entryPrice;
    actualProfit = entryPrice - exitPrice;
  } else {
    return null;
  }

  if (riskAmount <= 0) return null;

  const rMultiple = actualProfit / riskAmount;

  if (!isFinite(rMultiple)) return null;

  // Round to 2 decimal places
  return Math.round(rMultiple * 100) / 100;
}

async function recalculateRValues() {
  try {
    console.log('[START] Recalculating R-Values using stop loss (risk-based)...\n');

    // Find all closed trades with stop loss set
    const query = `
      SELECT id, symbol, side, entry_price, exit_price, stop_loss, executions, r_value
      FROM trades
      WHERE exit_price IS NOT NULL
    `;

    const result = await db.query(query);
    const trades = result.rows;

    console.log(`[INFO] Found ${trades.length} closed trades to process\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let clearedCount = 0;

    for (const trade of trades) {
      const executions = trade.executions || [];

      // First check trade-level stop_loss
      let stopLoss = trade.stop_loss ? parseFloat(trade.stop_loss) : null;
      let entryPrice = trade.entry_price ? parseFloat(trade.entry_price) : null;
      let exitPrice = trade.exit_price ? parseFloat(trade.exit_price) : null;

      // If no trade-level stop loss, check executions for stopLoss
      if (!stopLoss && executions.length > 0) {
        const executionsWithStopLoss = executions.filter(ex =>
          ex.stopLoss !== null && ex.stopLoss !== undefined
        );

        if (executionsWithStopLoss.length > 0) {
          // Calculate weighted average stop loss from executions
          const totalQty = executionsWithStopLoss.reduce((sum, ex) => sum + (ex.quantity || 0), 0);

          if (totalQty > 0) {
            const weightedEntry = executionsWithStopLoss.reduce((sum, ex) =>
              sum + ((ex.entryPrice || 0) * (ex.quantity || 0)), 0) / totalQty;
            const weightedStopLoss = executionsWithStopLoss.reduce((sum, ex) =>
              sum + ((ex.stopLoss || 0) * (ex.quantity || 0)), 0) / totalQty;
            const weightedExit = executionsWithStopLoss.reduce((sum, ex) =>
              sum + ((ex.exitPrice || 0) * (ex.quantity || 0)), 0) / totalQty;

            entryPrice = weightedEntry;
            stopLoss = weightedStopLoss;
            exitPrice = weightedExit || exitPrice;
          }
        }
      }

      // If still no stop loss, clear any existing r_value
      if (!stopLoss) {
        if (trade.r_value !== null) {
          await db.query('UPDATE trades SET r_value = NULL WHERE id = $1', [trade.id]);
          console.log(`[CLEAR] Trade ${trade.id} (${trade.symbol}) - no stop loss, cleared r_value`);
          clearedCount++;
        } else {
          console.log(`[SKIP] Trade ${trade.id} (${trade.symbol}) - no stop loss`);
          skippedCount++;
        }
        continue;
      }

      // Calculate R-Value
      const rValue = calculateRValue(entryPrice, stopLoss, exitPrice, trade.side);

      if (rValue === null) {
        if (trade.r_value !== null) {
          await db.query('UPDATE trades SET r_value = NULL WHERE id = $1', [trade.id]);
          console.log(`[CLEAR] Trade ${trade.id} (${trade.symbol}) - invalid calculation, cleared r_value`);
          console.log(`       Entry: ${entryPrice}, SL: ${stopLoss}, Exit: ${exitPrice}, Side: ${trade.side}`);
          clearedCount++;
        } else {
          console.log(`[SKIP] Trade ${trade.id} (${trade.symbol}) - could not calculate R-Value`);
          console.log(`       Entry: ${entryPrice}, SL: ${stopLoss}, Exit: ${exitPrice}, Side: ${trade.side}`);
          skippedCount++;
        }
        continue;
      }

      // Update the trade
      await db.query(
        'UPDATE trades SET r_value = $1 WHERE id = $2',
        [rValue, trade.id]
      );

      console.log(`[UPDATE] Trade ${trade.id} (${trade.symbol})`);
      console.log(`         Entry: ${entryPrice.toFixed(2)}, SL: ${stopLoss.toFixed(2)}, Exit: ${exitPrice.toFixed(2)}`);
      console.log(`         R-Value: ${rValue.toFixed(2)}R\n`);
      updatedCount++;
    }

    console.log(`\n[COMPLETE] R-Value recalculation finished`);
    console.log(`  - Updated: ${updatedCount} trades`);
    console.log(`  - Cleared: ${clearedCount} trades (no valid stop loss)`);
    console.log(`  - Skipped: ${skippedCount} trades`);
    console.log(`  - Total processed: ${trades.length} trades`);

    process.exit(0);
  } catch (error) {
    console.error('[ERROR] Failed to recalculate R-Values:', error);
    process.exit(1);
  }
}

recalculateRValues();
