const db = require('./src/config/database');

/**
 * One-time script to recalculate R-Values for all trades
 * R-Multiple is now calculated using takeProfit (target achievement) instead of stopLoss (risk)
 *
 * R-Multiple = Actual Profit / Target Profit
 *
 * For Long: (exitPrice - entryPrice) / (takeProfit - entryPrice)
 * For Short: (entryPrice - exitPrice) / (entryPrice - takeProfit)
 */

// R-Value calculation function (matches Trade.js)
function calculateRValue(entryPrice, takeProfit, exitPrice, side) {
  if (!entryPrice || !takeProfit || !exitPrice || !side) {
    return null;
  }

  // Ensure all values are positive
  if (entryPrice <= 0 || takeProfit <= 0 || exitPrice <= 0) {
    return null;
  }

  let targetProfit;
  let actualProfit;

  if (side === 'long') {
    // For long: TP should be above entry
    if (takeProfit <= entryPrice) return null;
    targetProfit = takeProfit - entryPrice;
    actualProfit = exitPrice - entryPrice;
  } else if (side === 'short') {
    // For short: TP should be below entry
    if (takeProfit >= entryPrice) return null;
    targetProfit = entryPrice - takeProfit;
    actualProfit = entryPrice - exitPrice;
  } else {
    return null;
  }

  if (targetProfit <= 0) return null;

  const rMultiple = actualProfit / targetProfit;

  if (!isFinite(rMultiple)) return null;

  // Round to 2 decimal places
  return Math.round(rMultiple * 100) / 100;
}

async function recalculateRValues() {
  try {
    console.log('[START] Recalculating R-Values using take profit (target achievement)...\n');

    // Find all closed trades with take profit set
    const query = `
      SELECT id, symbol, side, entry_price, exit_price, take_profit, executions, r_value
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

      // First check trade-level take_profit
      let takeProfit = trade.take_profit ? parseFloat(trade.take_profit) : null;
      let entryPrice = trade.entry_price ? parseFloat(trade.entry_price) : null;
      let exitPrice = trade.exit_price ? parseFloat(trade.exit_price) : null;

      // If no trade-level take profit, check executions for takeProfit
      if (!takeProfit && executions.length > 0) {
        const executionsWithTakeProfit = executions.filter(ex =>
          ex.takeProfit !== null && ex.takeProfit !== undefined
        );

        if (executionsWithTakeProfit.length > 0) {
          // Calculate weighted average take profit from executions
          const totalQty = executionsWithTakeProfit.reduce((sum, ex) => sum + (ex.quantity || 0), 0);

          if (totalQty > 0) {
            const weightedEntry = executionsWithTakeProfit.reduce((sum, ex) =>
              sum + ((ex.entryPrice || 0) * (ex.quantity || 0)), 0) / totalQty;
            const weightedTakeProfit = executionsWithTakeProfit.reduce((sum, ex) =>
              sum + ((ex.takeProfit || 0) * (ex.quantity || 0)), 0) / totalQty;
            const weightedExit = executionsWithTakeProfit.reduce((sum, ex) =>
              sum + ((ex.exitPrice || 0) * (ex.quantity || 0)), 0) / totalQty;

            entryPrice = weightedEntry;
            takeProfit = weightedTakeProfit;
            exitPrice = weightedExit || exitPrice;
          }
        }
      }

      // If still no take profit, clear any existing r_value
      if (!takeProfit) {
        if (trade.r_value !== null) {
          await db.query('UPDATE trades SET r_value = NULL WHERE id = $1', [trade.id]);
          console.log(`[CLEAR] Trade ${trade.id} (${trade.symbol}) - no take profit, cleared r_value`);
          clearedCount++;
        } else {
          console.log(`[SKIP] Trade ${trade.id} (${trade.symbol}) - no take profit`);
          skippedCount++;
        }
        continue;
      }

      // Calculate R-Value
      const rValue = calculateRValue(entryPrice, takeProfit, exitPrice, trade.side);

      if (rValue === null) {
        if (trade.r_value !== null) {
          await db.query('UPDATE trades SET r_value = NULL WHERE id = $1', [trade.id]);
          console.log(`[CLEAR] Trade ${trade.id} (${trade.symbol}) - invalid calculation, cleared r_value`);
          console.log(`       Entry: ${entryPrice}, TP: ${takeProfit}, Exit: ${exitPrice}, Side: ${trade.side}`);
          clearedCount++;
        } else {
          console.log(`[SKIP] Trade ${trade.id} (${trade.symbol}) - could not calculate R-Value`);
          console.log(`       Entry: ${entryPrice}, TP: ${takeProfit}, Exit: ${exitPrice}, Side: ${trade.side}`);
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
      console.log(`         Entry: ${entryPrice.toFixed(2)}, TP: ${takeProfit.toFixed(2)}, Exit: ${exitPrice.toFixed(2)}`);
      console.log(`         R-Value: ${rValue.toFixed(2)}R (${(rValue * 100).toFixed(0)}% of target)\n`);
      updatedCount++;
    }

    console.log(`\n[COMPLETE] R-Value recalculation finished`);
    console.log(`  - Updated: ${updatedCount} trades`);
    console.log(`  - Cleared: ${clearedCount} trades (no valid take profit)`);
    console.log(`  - Skipped: ${skippedCount} trades`);
    console.log(`  - Total processed: ${trades.length} trades`);

    process.exit(0);
  } catch (error) {
    console.error('[ERROR] Failed to recalculate R-Values:', error);
    process.exit(1);
  }
}

recalculateRValues();
