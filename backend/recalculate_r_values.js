const db = require('./src/config/database');
const TargetHitAnalysisService = require('./src/services/targetHitAnalysisService');

/**
 * One-time script to recalculate R-Values and Management R for all trades
 *
 * R = Risk = Initial Stop (the distance from entry to stop loss)
 * R-Multiple = Profit Per Trade / R
 *
 * For Long: (exitPrice - entryPrice) / (entryPrice - stopLoss)
 * For Short: (entryPrice - exitPrice) / (stopLoss - entryPrice)
 *
 * Management R = Actual R - Planned R
 * - If SL Hit First: Planned R = -1 (stop out)
 * - If TP Hit First: Planned R = Target R
 */

// R-Value calculation function (matches calculateTradeR in tradeManagement.controller.js)
function calculateRValue(trade) {
  const { entry_price, exit_price, stop_loss, take_profit, take_profit_targets, side, risk_level_history, quantity } = trade;

  if (!entry_price || !exit_price || !stop_loss || !side) {
    return null;
  }

  const entryPrice = parseFloat(entry_price);
  const exitPrice = parseFloat(exit_price);

  // Ensure all values are positive
  if (entryPrice <= 0 || exitPrice <= 0) {
    return null;
  }

  // Get the original stop loss from risk_level_history if available
  // R value should be calculated based on the original risk, not the current (moved) stop loss
  let originalStopLoss = parseFloat(stop_loss);
  if (risk_level_history && Array.isArray(risk_level_history) && risk_level_history.length > 0) {
    const stopLossEntries = risk_level_history
      .filter(entry => entry.type === 'stop_loss' && entry.old_value !== null && entry.old_value !== undefined)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (stopLossEntries.length > 0) {
      const parsedOldValue = parseFloat(stopLossEntries[0].old_value);
      if (!isNaN(parsedOldValue)) {
        originalStopLoss = parsedOldValue;
      }
    }
  }

  const stopLoss = originalStopLoss;
  if (stopLoss <= 0) {
    return null;
  }

  let risk, actualR, targetR;

  if (side === 'long') {
    // For long: stop loss should be below entry
    if (stopLoss >= entryPrice) return null;
    risk = entryPrice - stopLoss;
    if (risk <= 0) return null;
    actualR = (exitPrice - entryPrice) / risk;
  } else if (side === 'short') {
    // For short: stop loss should be above entry
    if (stopLoss <= entryPrice) return null;
    risk = stopLoss - entryPrice;
    if (risk <= 0) return null;
    actualR = (entryPrice - exitPrice) / risk;
  } else {
    return null;
  }

  if (!isFinite(actualR)) return null;

  // Calculate target R if take profit exists
  // Priority: take_profit_targets (first target) > take_profit
  let takeProfit = null;
  const targets = take_profit_targets;
  if (targets && Array.isArray(targets) && targets.length > 0) {
    const firstTarget = targets[0];
    if (firstTarget && firstTarget.price) {
      takeProfit = parseFloat(firstTarget.price);
    }
  }
  if (!takeProfit && take_profit) {
    takeProfit = parseFloat(take_profit);
  }

  if (takeProfit) {
    if (side === 'long') {
      targetR = (takeProfit - entryPrice) / risk;
    } else {
      targetR = (entryPrice - takeProfit) / risk;
    }
    // Cap at 10R
    if (targetR > 10) targetR = 10;
  }

  // Calculate weighted target R for multiple targets
  let weightedTargetR = null;
  const hasTargetsArray = targets && Array.isArray(targets) && targets.length > 0;
  const hasPrimaryTp = !!take_profit;
  const totalTargetCount = (hasPrimaryTp ? 1 : 0) + (hasTargetsArray ? targets.length : 0);

  if (hasTargetsArray && totalTargetCount > 1 && risk > 0) {
    const isLong = side === 'long';
    let totalShares = 0;
    let weightedSum = 0;

    const specifiedShares = targets.reduce((sum, t) => sum + (parseFloat(t.shares || t.quantity) || 0), 0);
    const totalQuantity = parseFloat(quantity) || 1;

    // Add TP1 from take_profit field if it exists
    if (hasPrimaryTp) {
      const tp1Price = parseFloat(take_profit);
      const tp1R = isLong ? (tp1Price - entryPrice) / risk : (entryPrice - tp1Price) / risk;
      const tp1Shares = specifiedShares > 0
        ? Math.max(0, totalQuantity - specifiedShares)
        : totalQuantity / (targets.length + 1);

      if (tp1Shares > 0 && isFinite(tp1R)) {
        totalShares += tp1Shares;
        weightedSum += tp1R * tp1Shares;
      }
    }

    // Add additional targets
    for (const target of targets) {
      if (target.price) {
        const tpPrice = parseFloat(target.price);
        const tpR = isLong ? (tpPrice - entryPrice) / risk : (entryPrice - tpPrice) / risk;
        const tpShares = parseFloat(target.shares || target.quantity) || 1;

        if (isFinite(tpR)) {
          totalShares += tpShares;
          weightedSum += tpR * tpShares;
        }
      }
    }

    if (totalShares > 0) {
      weightedTargetR = weightedSum / totalShares;
    }
  }

  return {
    actual_r: Math.round(actualR * 100) / 100,
    target_r: targetR !== undefined ? Math.round(targetR * 100) / 100 : null,
    weighted_target_r: weightedTargetR !== null ? Math.round(weightedTargetR * 100) / 100 : null
  };
}

async function recalculateRValues() {
  try {
    console.log('[START] Recalculating R-Values and Management R...\n');

    // Find all closed trades
    const query = `
      SELECT id, symbol, side, entry_price, exit_price, stop_loss, take_profit,
             take_profit_targets, quantity, manual_target_hit_first, r_value,
             management_r, risk_level_history
      FROM trades
      WHERE exit_price IS NOT NULL
    `;

    const result = await db.query(query);
    const trades = result.rows;

    console.log(`[INFO] Found ${trades.length} closed trades to process\n`);

    let rValueUpdatedCount = 0;
    let managementRUpdatedCount = 0;
    let skippedCount = 0;
    let clearedCount = 0;

    for (const trade of trades) {
      const rValues = calculateRValue(trade);

      // If no valid R calculation possible, only clear r_value (preserve management_r for legacy data)
      if (!rValues) {
        if (trade.r_value !== null) {
          await db.query(
            'UPDATE trades SET r_value = NULL WHERE id = $1',
            [trade.id]
          );
          console.log(`[CLEAR] Trade ${trade.id} (${trade.symbol}) - no valid stop loss, cleared r_value`);
          clearedCount++;
        } else {
          skippedCount++;
        }
        continue;
      }

      // Calculate management R using the service (matches individual trade analysis)
      // Only recalculate if manual_target_hit_first is set; preserve existing values otherwise
      let newManagementR = null;
      if (trade.manual_target_hit_first) {
        const managementR = TargetHitAnalysisService.calculateManagementR(trade);
        newManagementR = managementR !== null ? Math.round(managementR * 100) / 100 : null;
      } else {
        // Preserve existing management_r for legacy data without manual_target_hit_first
        newManagementR = trade.management_r !== null ? parseFloat(trade.management_r) : null;
      }

      // Check if values changed
      const currentRValue = trade.r_value !== null ? parseFloat(trade.r_value) : null;
      const currentManagementR = trade.management_r !== null ? parseFloat(trade.management_r) : null;
      const newRValue = rValues.actual_r;

      // Use tolerance for float comparison
      const rValueChanged = currentRValue === null ? newRValue !== null : Math.abs(currentRValue - newRValue) > 0.001;
      const managementRChanged = trade.manual_target_hit_first &&
        (currentManagementR === null ? newManagementR !== null :
         newManagementR === null ? true : Math.abs(currentManagementR - newManagementR) > 0.001);

      if (rValueChanged || managementRChanged) {
        if (managementRChanged) {
          await db.query(
            'UPDATE trades SET r_value = $1, management_r = $2 WHERE id = $3',
            [newRValue, newManagementR, trade.id]
          );
        } else {
          await db.query(
            'UPDATE trades SET r_value = $1 WHERE id = $2',
            [newRValue, trade.id]
          );
        }

        if (rValueChanged) {
          console.log(`[UPDATE] Trade ${trade.id} (${trade.symbol})`);
          console.log(`         r_value: ${currentRValue} -> ${newRValue}`);
          rValueUpdatedCount++;
        }

        if (managementRChanged) {
          console.log(`[UPDATE] Trade ${trade.id} (${trade.symbol})`);
          console.log(`         management_r: ${currentManagementR} -> ${newManagementR}`);
          console.log(`         (manual_target_hit_first: ${trade.manual_target_hit_first || 'not set'})`);
          managementRUpdatedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    console.log(`\n[COMPLETE] R-Value recalculation finished`);
    console.log(`  - r_value updated: ${rValueUpdatedCount} trades`);
    console.log(`  - management_r updated: ${managementRUpdatedCount} trades`);
    console.log(`  - Cleared: ${clearedCount} trades (no valid stop loss)`);
    console.log(`  - Skipped (no change): ${skippedCount} trades`);
    console.log(`  - Total processed: ${trades.length} trades`);

    process.exit(0);
  } catch (error) {
    console.error('[ERROR] Failed to recalculate R-Values:', error);
    process.exit(1);
  }
}

recalculateRValues();
