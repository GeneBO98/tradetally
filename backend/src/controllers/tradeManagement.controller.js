/**
 * Trade Management Controller
 * Handles R-Multiple analysis for individual trades
 */

const db = require('../config/database');
const Trade = require('../models/Trade');
const logger = require('../utils/logger');
const TargetHitAnalysisService = require('../services/targetHitAnalysisService');
const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('../utils/futuresUtils');
const { v4: uuidv4 } = require('uuid');

/**
 * Calculate R-Multiple values for a trade
 * @param {Object} trade - Trade object with entry_price, exit_price, stop_loss, take_profit, take_profit_targets, side
 * @returns {Object} R-Multiple analysis results
 */
function calculateRMultiples(trade) {
  const { entry_price, exit_price, stop_loss, take_profit, take_profit_targets, side, pnl, quantity, manual_target_hit_first, instrument_type, contract_size, point_value, risk_level_history } = trade;

  // Cap potential R at 10R to prevent unrealistic values from distorting charts
  const MAX_POTENTIAL_R = 10;

  logger.debug('[R-CALC] ========== calculateRMultiples START ==========');
  logger.debug('[R-CALC] Input trade data:', {
    id: trade.id,
    symbol: trade.symbol,
    side,
    entry_price,
    exit_price,
    stop_loss,
    take_profit,
    take_profit_targets: take_profit_targets ? JSON.stringify(take_profit_targets) : null,
    quantity,
    pnl,
    manual_target_hit_first,
    instrument_type: instrument_type || 'stock',
    contract_size,
    point_value,
    has_risk_history: !!(risk_level_history && Array.isArray(risk_level_history) && risk_level_history.length > 0)
  });

  // Validate required fields
  if (!entry_price || !exit_price || !stop_loss) {
    logger.debug('[R-CALC] Missing required fields - returning error');
    return {
      error: 'Missing required fields for R-Multiple calculation',
      has_stop_loss: !!stop_loss,
      has_take_profit: !!take_profit || (take_profit_targets && take_profit_targets.length > 0)
    };
  }

  const entryPrice = parseFloat(entry_price);
  const exitPrice = parseFloat(exit_price);
  
  // Validate that stop_loss is a valid number
  if (isNaN(parseFloat(stop_loss)) || stop_loss === null || stop_loss === undefined) {
    logger.debug('[R-CALC] Invalid stop_loss value:', stop_loss);
    return {
      error: 'Invalid stop loss value for R-Multiple calculation',
      has_stop_loss: false
    };
  }
  
  // Get the original stop loss from risk_level_history if available
  // R value should be calculated based on the original risk, not the current (moved) stop loss
  // This ensures R value reflects performance relative to the initial risk taken
  let originalStopLoss = parseFloat(stop_loss);
  if (risk_level_history && Array.isArray(risk_level_history) && risk_level_history.length > 0) {
    // Find all stop_loss entries and get the one with the earliest timestamp
    // The first stop_loss change will have old_value = original stop loss
    const stopLossEntries = risk_level_history
      .filter(entry => entry.type === 'stop_loss' && entry.old_value !== null && entry.old_value !== undefined)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (stopLossEntries.length > 0) {
      const firstStopLossEntry = stopLossEntries[0];
      const parsedOldValue = parseFloat(firstStopLossEntry.old_value);
      if (!isNaN(parsedOldValue)) {
        originalStopLoss = parsedOldValue;
        logger.debug('[R-CALC] Found original stop loss in history:', { 
          originalStopLoss, 
          currentStopLoss: stop_loss,
          historyEntry: firstStopLossEntry,
          totalStopLossChanges: stopLossEntries.length
        });
      } else {
        logger.warn('[R-CALC] Invalid old_value in stop loss history entry, using current stop loss');
      }
    } else {
      logger.debug('[R-CALC] No stop loss history entries found, using current stop loss as original');
    }
  } else {
    logger.debug('[R-CALC] No risk level history, using current stop loss as original');
  }
  
  const stopLoss = originalStopLoss;
  
  // Validate parsed values
  if (isNaN(entryPrice) || isNaN(exitPrice) || isNaN(stopLoss)) {
    logger.debug('[R-CALC] Invalid parsed prices:', { entryPrice, exitPrice, stopLoss });
    return {
      error: 'Invalid price values for R-Multiple calculation',
      entryPrice: isNaN(entryPrice),
      exitPrice: isNaN(exitPrice),
      stopLoss: isNaN(stopLoss)
    };
  }
  
  logger.debug('[R-CALC] Parsed prices:', { entryPrice, exitPrice, stopLoss: stopLoss, originalStopLoss, currentStopLoss: stop_loss, instrument_type: instrument_type || 'stock' });

  // Determine the take profit price to use for single-target analysis
  // Priority: take_profit_targets (first/primary target) > take_profit
  let takeProfit = null;
  const targets = take_profit_targets;
  logger.debug('[R-CALC] Processing take profit targets:', {
    hasTargetsArray: !!(targets && Array.isArray(targets)),
    targetsCount: targets && Array.isArray(targets) ? targets.length : 0,
    hasSingleTakeProfit: !!take_profit
  });

  if (targets && Array.isArray(targets) && targets.length > 0) {
    const firstTarget = targets[0];
    logger.debug('[R-CALC] First target from array:', JSON.stringify(firstTarget));
    if (firstTarget && firstTarget.price) {
      takeProfit = parseFloat(firstTarget.price);
      logger.debug('[R-CALC] Using first target price as takeProfit:', takeProfit);
    }
  }
  if (!takeProfit && take_profit) {
    takeProfit = parseFloat(take_profit);
    logger.debug('[R-CALC] Using single take_profit field:', takeProfit);
  }

  // Calculate weighted average target R for multiple targets
  // Include TP1 from take_profit field + all targets from take_profit_targets array
  // This matches the frontend logic for "planned R"
  // Frontend requires: targets.length > 0 (at least one target in array), then includes TP1 if exists
  let weightedTargetR = null;
  const hasTargetsArray = targets && Array.isArray(targets) && targets.length > 0;
  const hasPrimaryTp = !!take_profit;
  
  // Calculate weighted average if we have at least one target in array (matches frontend logic)
  // We'll include TP1 if it exists, and only return weighted average if we have at least 2 targets total
  if (hasTargetsArray) {
    logger.debug('[R-CALC] Calculating weighted average R for multiple targets (including TP1 from take_profit field)');
    const isLong = side === 'long';
    const risk = isLong ? entryPrice - stopLoss : stopLoss - entryPrice;
    logger.debug('[R-CALC] Risk calculation:', { isLong, risk });

    if (risk > 0) {
      let totalShares = 0;
      let weightedSum = 0;

      // Calculate total shares from targets array to determine remaining shares for TP1
      const specifiedShares = targets.reduce((sum, t) => sum + (parseFloat(t.shares || t.quantity) || 0), 0);
      const totalQuantity = parseFloat(quantity) || 1;

      // Add TP1 from take_profit field if it exists
      if (hasPrimaryTp) {
        const tp1Price = parseFloat(take_profit);
        const tp1R = isLong ? (tp1Price - entryPrice) / risk : (entryPrice - tp1Price) / risk;
        
        // Calculate shares for TP1: remaining shares after accounting for targets array
        const tp1Shares = specifiedShares > 0 
          ? Math.max(0, totalQuantity - specifiedShares) 
          : (hasTargetsArray ? totalQuantity / (targets.length + 1) : totalQuantity);
        
        if (tp1Shares > 0) {
          weightedSum += tp1R * tp1Shares;
          totalShares += tp1Shares;
          logger.debug('[R-CALC] TP1 (from take_profit field) contribution:', { tp1Price, tp1R: tp1R.toFixed(2), shares: tp1Shares });
        }
      }

      // Process all targets from the array
      if (hasTargetsArray) {
        targets.forEach((t, index) => {
          if (t.price) {
            const tpPrice = parseFloat(t.price);
            const tpR = isLong ? (tpPrice - entryPrice) / risk : (entryPrice - tpPrice) / risk;

            let shares;
            if (t.shares || t.quantity) {
              // Target has specified shares
              shares = parseFloat(t.shares || t.quantity);
            } else if (specifiedShares === 0) {
              // No targets have shares specified - distribute equally (including TP1)
              shares = totalQuantity / (hasPrimaryTp ? targets.length + 1 : targets.length);
            } else {
              // Default to 1 share
              shares = 1;
            }

            weightedSum += tpR * shares;
            totalShares += shares;
            logger.debug(`[R-CALC] Target ${index + 1} (TP${index + 2}) contribution:`, { tpPrice, tpR: tpR.toFixed(2), shares });
          }
        });
      }

      // Only return weighted average if we have at least 2 targets total (matches frontend: allTargets.length > 1)
      // Count: TP1 (if exists) + targets in array
      const totalTargetCount = (hasPrimaryTp ? 1 : 0) + (hasTargetsArray ? targets.length : 0);
      if (totalShares > 0 && totalTargetCount > 1) {
        weightedTargetR = weightedSum / totalShares;
        logger.debug('[R-CALC] Weighted average calculation:', { 
          weightedSum: weightedSum.toFixed(2), 
          totalShares, 
          weightedTargetR: weightedTargetR.toFixed(2),
          totalTargetCount
        });
      } else if (totalTargetCount <= 1) {
        logger.debug('[R-CALC] Only one target total, skipping weighted average (use single target_r instead)');
      }
    } else {
      logger.debug('[R-CALC] Risk is not positive, skipping weighted calculation');
    }
  }

  let risk, actualPL, targetPL, actualR, targetR, rLost;

  logger.debug('[R-CALC] ========== R-Value Calculation ==========');
  if (side === 'long') {
    // For long positions: risk is entry - stop loss
    risk = entryPrice - stopLoss;
    logger.debug('[R-CALC] LONG trade - risk per share:', risk);

    if (risk <= 0) {
      logger.debug('[R-CALC] Invalid risk (<=0) for long trade');
      return { error: 'Invalid stop loss position for long trade (stop loss must be below entry)' };
    }

    // Actual P&L per share
    actualPL = exitPrice - entryPrice;

    // Calculate actual R
    actualR = actualPL / risk;
    
    // Validate R value is finite
    if (!isFinite(actualR)) {
      logger.error('[R-CALC] Invalid actualR calculated (NaN or Infinity):', { actualPL, risk, actualR });
      return { error: 'Invalid R value calculation - check entry, exit, and stop loss prices' };
    }
    
    logger.debug('[R-CALC] LONG actualPL and actualR:', { actualPL: actualPL.toFixed(2), actualR: actualR.toFixed(2) });

    // Calculate target R if take profit exists
    if (takeProfit) {
      targetPL = takeProfit - entryPrice;
      targetR = targetPL / risk;

      // Validate target R is finite
      if (!isFinite(targetR)) {
        logger.warn('[R-CALC] Invalid targetR calculated, setting to null:', { targetPL, risk, targetR });
        targetR = undefined;
      } else {
      // R lost is how much potential R was left on the table
      // Positive means exited early, negative means exceeded target
      rLost = targetR - actualR;
      logger.debug('[R-CALC] LONG targetR and rLost:', { targetPL: targetPL.toFixed(2), targetR: targetR.toFixed(2), rLost: rLost.toFixed(2) });
      }
    }
  } else {
    // For short positions: risk is stop loss - entry
    risk = stopLoss - entryPrice;
    logger.debug('[R-CALC] SHORT trade - risk per share:', risk);

    if (risk <= 0) {
      logger.debug('[R-CALC] Invalid risk (<=0) for short trade');
      return { error: 'Invalid stop loss position for short trade (stop loss must be above entry)' };
    }

    // Actual P&L per share (inverted for shorts)
    actualPL = entryPrice - exitPrice;

    // Calculate actual R
    actualR = actualPL / risk;
    
    // Validate R value is finite
    if (!isFinite(actualR)) {
      logger.error('[R-CALC] Invalid actualR calculated (NaN or Infinity):', { actualPL, risk, actualR });
      return { error: 'Invalid R value calculation - check entry, exit, and stop loss prices' };
    }
    
    logger.debug('[R-CALC] SHORT actualPL and actualR:', { actualPL: actualPL.toFixed(2), actualR: actualR.toFixed(2) });

    // Calculate target R if take profit exists
    if (takeProfit) {
      targetPL = entryPrice - takeProfit;
      targetR = targetPL / risk;

      // Validate target R is finite
      if (!isFinite(targetR)) {
        logger.warn('[R-CALC] Invalid targetR calculated, setting to null:', { targetPL, risk, targetR });
        targetR = undefined;
      } else {
      // R lost is how much potential R was left on the table
      rLost = targetR - actualR;
      logger.debug('[R-CALC] SHORT targetR and rLost:', { targetPL: targetPL.toFixed(2), targetR: targetR.toFixed(2), rLost: rLost.toFixed(2) });
      }
    }
  }

  // If weighted average exists, use it for target_r to match "planned R" in frontend
  // This ensures target_r matches the weighted average when multiple targets exist
  if (weightedTargetR !== null) {
    // Use weighted average for target_r
    targetR = weightedTargetR;
    // Recalculate rLost with weighted average
    if (targetR !== undefined) {
      rLost = targetR - actualR;
    }
    logger.debug('[R-CALC] Using weighted average for target_r:', { weightedTargetR: weightedTargetR.toFixed(2), targetR: targetR.toFixed(2) });
  }

  // Calculate multiplier based on instrument type (same logic as Trade.calculatePnL)
  // IMPORTANT: R values are ratios and should NOT use multipliers - they're calculated in price units
  // Multipliers are only used for dollar amount calculations (riskAmount, actualPLAmount, etc.)
  // For options: use contract_size (typically 100 shares per contract)
  // For futures: use point_value (e.g., $50 per point for ES, $20 per point for NQ)
  // For stocks: no multiplier (1 share = 1 share)
  let multiplier = 1;
  const instrumentType = instrument_type || 'stock';
  if (instrumentType === 'future') {
    // For futures, point_value converts price points to dollars
    // Example: ES has point_value = 50, so 1 point = $50
    let finalPointValue = point_value ? parseFloat(point_value) : null;
    
    // If point_value is missing or invalid, try to look it up
    if (!finalPointValue || isNaN(finalPointValue) || finalPointValue <= 0) {
      const underlyingAsset = trade.underlying_asset || trade.underlyingAsset;
      const symbol = trade.symbol;
      
      // Try to extract underlying from symbol if not provided
      let underlying = underlyingAsset;
      if (!underlying && symbol) {
        underlying = extractUnderlyingFromFuturesSymbol(symbol);
      }
      
      if (underlying) {
        finalPointValue = getFuturesPointValue(underlying);
        logger.info(`[R-CALC] Auto-looked up point_value for ${symbol} (${underlying}): $${finalPointValue} per point`);
      } else {
        logger.warn(`[R-CALC] Could not determine point_value for futures trade ${trade.symbol}, defaulting to 50`);
        finalPointValue = 50; // Default to $50 per point (common for many futures)
      }
    }
    
    multiplier = finalPointValue;
    logger.debug('[R-CALC] Futures multiplier:', { point_value: point_value, finalPointValue: multiplier, symbol: trade.symbol });
  } else if (instrumentType === 'option') {
    // For options, contract_size is typically 100 shares per contract
    multiplier = contract_size ? parseFloat(contract_size) : 100;
    if (isNaN(multiplier) || multiplier <= 0) {
      logger.warn('[R-CALC] Invalid contract_size for options, defaulting to 100:', contract_size);
      multiplier = 100;
    }
  }

  logger.debug('[R-CALC] Instrument multiplier:', { 
    instrumentType, 
    multiplier, 
    contract_size, 
    point_value,
    note: 'R values are ratios (no multiplier), multipliers only for dollar amounts'
  });

  // Calculate dollar amounts (accounting for contract multipliers for options/futures)
  // Note: risk, actualPL, and targetPL are in price units (points for futures, dollars per share for stocks/options)
  // Multiply by quantity and multiplier to get total dollar amounts
  let tradeQuantity = parseFloat(quantity || 1);
  if (isNaN(tradeQuantity) || tradeQuantity <= 0) {
    logger.warn('[R-CALC] Invalid quantity, defaulting to 1:', quantity);
    tradeQuantity = 1;
  }
  
  const riskAmount = risk * tradeQuantity * multiplier;
  const actualPLAmount = actualPL * tradeQuantity * multiplier;
  
  // Calculate target_pl_amount consistently:
  // - If weighted average exists, use: weighted_target_r * risk_amount (ensures consistency with displayed target R)
  // - Otherwise, use: targetPL * quantity * multiplier (traditional calculation)
  let targetPLAmount = null;
  if (weightedTargetR !== null) {
    // Use weighted average R * risk amount for consistency
    targetPLAmount = weightedTargetR * riskAmount;
    logger.debug('[R-CALC] Using weighted average for target_pl_amount:', { 
      weightedTargetR: weightedTargetR.toFixed(2), 
      riskAmount: riskAmount.toFixed(2),
      targetPLAmount: targetPLAmount.toFixed(2)
    });
  } else if (takeProfit) {
    // Traditional calculation for single TP
    targetPLAmount = targetPL * tradeQuantity * multiplier;
  }
  
  // Validate risk amount is reasonable (safeguard against calculation errors)
  // For futures, a very large risk amount might indicate incorrect point_value
  if (instrumentType === 'future' && riskAmount > 1000000) {
    logger.warn('[R-CALC] Risk amount seems unreasonably large for futures trade:', {
      riskAmount: riskAmount.toFixed(2),
      risk,
      tradeQuantity,
      multiplier,
      point_value,
      symbol: trade.symbol,
      entryPrice,
      stopLoss,
      note: 'Check if point_value is correct (should be $50 for ES, $20 for NQ, etc.)'
    });
  }
  
  logger.debug('[R-CALC] Dollar amounts:', {
    risk,
    tradeQuantity,
    multiplier,
    riskAmount: riskAmount.toFixed(2),
    actualPLAmount: actualPLAmount.toFixed(2),
    targetPLAmount: targetPLAmount?.toFixed(2) || null,
    instrumentType,
    point_value: point_value || 'not set',
    contract_size: contract_size || 'not set'
  });

  // Use weighted average target R if available (for multiple targets)
  const effectiveTargetR = weightedTargetR !== null ? weightedTargetR : targetR;
  const effectiveRLost = effectiveTargetR !== undefined ? effectiveTargetR - actualR : rLost;
  logger.debug('[R-CALC] Effective values:', {
    effectiveTargetR: effectiveTargetR?.toFixed(2) ?? null,
    effectiveRLost: effectiveRLost?.toFixed(2) ?? null,
    usingWeightedAverage: weightedTargetR !== null
  });

  // Calculate Management R based on which target was hit first
  // Management R = Actual R - Planned R
  //
  // The "Planned R" depends on which target was hit first:
  // - If SL Hit First: Planned R = -1 (the trade was supposed to stop out)
  // - If TP Hit First: Planned R = Target R (the trade was supposed to hit take profit)
  //
  // Examples:
  // - SL Hit First, Actual R = -2: Management R = -2 - (-1) = -1 (bad: lost more than planned)
  // - SL Hit First, Actual R = -0.5: Management R = -0.5 - (-1) = +0.5 (good: lost less than planned)
  // - TP Hit First, Actual R = 1.5, Target R = 2: Management R = 1.5 - 2 = -0.5 (bad: made less than planned)
  // - TP Hit First, Actual R = 3, Target R = 2: Management R = 3 - 2 = +1 (good: made more than planned)
  logger.debug('[R-CALC] ========== Management R Calculation ==========');
  logger.debug('[R-CALC] manual_target_hit_first:', manual_target_hit_first);

  let managementR = null;
  let plannedR = null;

  if (manual_target_hit_first === 'stop_loss') {
    // SL Hit First: The plan was to stop out at -1R
    plannedR = -1;
    managementR = actualR - plannedR;
    logger.debug('[R-CALC] SL Hit First - Planned R = -1 (stop loss)');
    logger.info(`[R-CALC] Management R = ${actualR.toFixed(2)} - (${plannedR}) = ${managementR.toFixed(2)}R`);
  } else if (manual_target_hit_first === 'take_profit') {
    // TP Hit First: The plan was to hit take profit at Target R
    const managementTargetR = weightedTargetR !== null ? weightedTargetR : targetR;

    if (managementTargetR !== null && managementTargetR !== undefined) {
      plannedR = managementTargetR;
      managementR = actualR - plannedR;
      logger.debug('[R-CALC] TP Hit First - Planned R = Target R:', plannedR.toFixed(2));
      logger.info(`[R-CALC] Management R = ${actualR.toFixed(2)} - ${plannedR.toFixed(2)} = ${managementR.toFixed(2)}R`);
    } else {
      logger.debug('[R-CALC] TP Hit First but no target R available - cannot calculate management R');
    }
  } else {
    logger.debug('[R-CALC] No target hit selection - cannot calculate management R');
  }

  logger.debug('[R-CALC] ========== Final Results ==========');
  logger.debug('[R-CALC] Final values:', {
    actual_r: Math.round(actualR * 100) / 100,
    target_r: targetR !== undefined ? Math.round(targetR * 100) / 100 : null,
    r_lost: rLost !== undefined ? Math.round(rLost * 100) / 100 : null,
    weighted_target_r: weightedTargetR !== null ? Math.round(weightedTargetR * 100) / 100 : null,
    effective_r_lost: effectiveRLost !== undefined ? Math.round(effectiveRLost * 100) / 100 : null,
    management_r: managementR !== null ? Math.round(managementR * 100) / 100 : null,
    risk_amount: Math.round(riskAmount * 100) / 100,
    multiplier: multiplier,
    instrument_type: instrumentType
  });

  return {
    // R-Multiple values
    actual_r: Math.round(actualR * 100) / 100,
    target_r: targetR !== undefined ? Math.round(targetR * 100) / 100 : null,
    r_lost: rLost !== undefined ? Math.round(rLost * 100) / 100 : null,

    // Weighted average values (for multiple TP targets)
    weighted_target_r: weightedTargetR !== null ? Math.round(weightedTargetR * 100) / 100 : null,
    effective_r_lost: effectiveRLost !== undefined ? Math.round(effectiveRLost * 100) / 100 : null,

    // Management R = Actual R - Target R (simplified formula)
    management_r: managementR !== null ? Math.round(managementR * 100) / 100 : null,

    // Dollar amounts
    risk_per_share: Math.round(risk * 100) / 100,
    risk_amount: Math.round(riskAmount * 100) / 100,
    actual_pl_per_share: Math.round(actualPL * 100) / 100,
    actual_pl_amount: pnl ? parseFloat(pnl) : Math.round(actualPLAmount * 100) / 100,
    target_pl_per_share: targetPL !== undefined ? Math.round(targetPL * 100) / 100 : null,
    target_pl_amount: targetPLAmount !== null ? Math.round(targetPLAmount * 100) / 100 : null,

    // Trade management assessment
    management_score: calculateManagementScore(actualR, targetR, rLost),

    // Data completeness
    has_stop_loss: true,
    has_take_profit: !!takeProfit
  };
}

/**
 * Calculate a management score based on R-Multiple performance
 * @param {number} actualR - Actual R achieved
 * @param {number} targetR - Target R (if take profit set)
 * @param {number} rLost - R left on the table
 * @returns {Object} Management score and assessment
 */
function calculateManagementScore(actualR, targetR, rLost) {
  // If no take profit, we can only assess based on actual R
  if (targetR === undefined || targetR === null) {
    if (actualR >= 2) return { score: 'excellent', label: 'Excellent Exit', color: 'green' };
    if (actualR >= 1) return { score: 'good', label: 'Good Exit', color: 'green' };
    if (actualR >= 0) return { score: 'breakeven', label: 'Breakeven', color: 'yellow' };
    // Use -1.01 tolerance for floating-point precision (e.g., -1.001R from exact stop loss exit)
    if (actualR >= -1.01) return { score: 'stopped_out', label: 'Stopped Out', color: 'red' };
    return { score: 'loss', label: 'Loss Beyond Stop', color: 'red' };
  }

  // With take profit, assess relative to target
  const captureRatio = actualR / targetR;

  if (actualR >= targetR) {
    return { score: 'exceeded', label: 'Exceeded Target', color: 'green' };
  }
  if (captureRatio >= 0.8) {
    return { score: 'near_target', label: 'Near Target', color: 'green' };
  }
  if (captureRatio >= 0.5) {
    return { score: 'partial', label: 'Partial Capture', color: 'yellow' };
  }
  if (actualR >= 0) {
    return { score: 'early_exit', label: 'Early Exit', color: 'yellow' };
  }
  return { score: 'loss', label: 'Loss', color: 'red' };
}

/**
 * Calculate R-Multiple for a single trade (for batch processing)
 * Returns null if required data is missing
 *
 * For potential R calculation:
 * - Uses take_profit_targets if available (weighted average or first target)
 * - Falls back to single take_profit field
 * - Caps potential R at 10R to prevent chart scale distortion
 */
function calculateTradeR(trade) {
  const { entry_price, exit_price, stop_loss, take_profit, take_profit_targets, side, risk_level_history } = trade;

  logger.debug('[R-BATCH] calculateTradeR for trade:', { id: trade.id, symbol: trade.symbol, side });

  if (!entry_price || !exit_price || !stop_loss) {
    logger.debug('[R-BATCH] Missing required fields, returning null');
    return null;
  }

  const entryPrice = parseFloat(entry_price);
  const exitPrice = parseFloat(exit_price);
  
  // Get the original stop loss from risk_level_history if available
  // R value should be calculated based on the original risk, not the current (moved) stop loss
  let originalStopLoss = parseFloat(stop_loss);
  if (risk_level_history && Array.isArray(risk_level_history) && risk_level_history.length > 0) {
    const stopLossEntries = risk_level_history
      .filter(entry => entry.type === 'stop_loss' && entry.old_value !== null && entry.old_value !== undefined)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (stopLossEntries.length > 0) {
      originalStopLoss = parseFloat(stopLossEntries[0].old_value);
      logger.debug('[R-BATCH] Using original stop loss from history:', { originalStopLoss, currentStopLoss: stop_loss });
    }
  }
  
  const stopLoss = originalStopLoss;

  // Determine the take profit price to use for potential R
  // Priority: take_profit_targets (first/primary target) > take_profit
  let takeProfit = null;

  // Check for take_profit_targets array
  const targets = take_profit_targets;
  if (targets && Array.isArray(targets) && targets.length > 0) {
    // Use the first target (primary) for potential R calculation
    const firstTarget = targets[0];
    if (firstTarget && firstTarget.price) {
      takeProfit = parseFloat(firstTarget.price);
      logger.debug('[R-BATCH] Using first target price:', takeProfit);
    }
  }

  // Fall back to single take_profit if no targets
  if (!takeProfit && take_profit) {
    takeProfit = parseFloat(take_profit);
    logger.debug('[R-BATCH] Using single take_profit:', takeProfit);
  }

  let risk, actualR, targetR;

  if (side === 'long') {
    risk = entryPrice - stopLoss;
    if (risk <= 0) {
      logger.debug('[R-BATCH] Invalid risk for long trade');
      return null;
    }
    actualR = (exitPrice - entryPrice) / risk;
    if (takeProfit) {
      targetR = (takeProfit - entryPrice) / risk;
    }
    logger.debug('[R-BATCH] LONG calculated:', { risk: risk.toFixed(2), actualR: actualR.toFixed(2), targetR: targetR?.toFixed(2) });
  } else {
    risk = stopLoss - entryPrice;
    if (risk <= 0) {
      logger.debug('[R-BATCH] Invalid risk for short trade');
      return null;
    }
    actualR = (entryPrice - exitPrice) / risk;
    if (takeProfit) {
      targetR = (entryPrice - takeProfit) / risk;
    }
    logger.debug('[R-BATCH] SHORT calculated:', { risk: risk.toFixed(2), actualR: actualR.toFixed(2), targetR: targetR?.toFixed(2) });
  }

  // Cap potential R at 10R to prevent unrealistic values from distorting charts
  // A 10R target is already an excellent trade; anything beyond is usually a data entry error
  const MAX_POTENTIAL_R = 10;
  if (targetR !== undefined && targetR > MAX_POTENTIAL_R) {
    logger.debug(`[R-BATCH] Capping potential R from ${targetR.toFixed(2)} to ${MAX_POTENTIAL_R}`);
    logger.info(`[R-CALC] Capping potential R from ${targetR.toFixed(2)} to ${MAX_POTENTIAL_R} for trade ${trade.id}`);
    targetR = MAX_POTENTIAL_R;
  }

  const result = {
    actual_r: Math.round(actualR * 100) / 100,
    target_r: targetR !== undefined ? Math.round(targetR * 100) / 100 : null
  };
  logger.debug('[R-BATCH] Final result:', result);
  return result;
}

const tradeManagementController = {
  /**
   * Get trades for selection with filters
   */
  async getTradesForSelection(req, res) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, symbol, limit = 100, offset = 0, accounts } = req.query;

      logger.info('[TRADE-MGMT] getTradesForSelection called', { userId, symbol, startDate, endDate, limit, offset, accounts });

      // Use a CTE to calculate trade_number for trades with stop_loss
      // This matches the R-Performance chart numbering (chronological order for trades with SL)
      let query = `
        WITH numbered_trades AS (
          SELECT
            id,
            ROW_NUMBER() OVER (ORDER BY trade_date ASC, id ASC) as trade_number
          FROM trades
          WHERE user_id = $1
            AND exit_price IS NOT NULL
            AND stop_loss IS NOT NULL
        )
        SELECT
          t.id, t.symbol, t.trade_date, t.entry_time, t.entry_price, t.exit_price,
          t.quantity, t.side, t.pnl, t.pnl_percent,
          t.stop_loss, t.take_profit, t.r_value,
          t.strategy, t.broker, t.instrument_type,
          t.manual_target_hit_first, t.target_hit_analysis,
          nt.trade_number
        FROM trades t
        LEFT JOIN numbered_trades nt ON t.id = nt.id
        WHERE t.user_id = $1
          AND t.exit_price IS NOT NULL
      `;
      const values = [userId];
      let paramCount = 2;

      if (startDate) {
        query += ` AND t.trade_date >= $${paramCount}`;
        values.push(startDate);
        paramCount++;
      }

      if (endDate) {
        query += ` AND t.trade_date <= $${paramCount}`;
        values.push(endDate);
        paramCount++;
      }

      if (symbol && symbol.trim()) {
        const searchSymbol = symbol.trim();
        query += ` AND UPPER(t.symbol) LIKE UPPER($${paramCount})`;
        values.push(`%${searchSymbol}%`);
        paramCount++;
        logger.info('[TRADE-MGMT] Searching for symbol:', searchSymbol);
      }

      if (accounts) {
        const accountsArray = accounts.split(',');
        const placeholders = accountsArray.map((_, index) => `$${paramCount + index}`).join(',');
        query += ` AND t.account_identifier IN (${placeholders})`;
        accountsArray.forEach(account => values.push(account));
        paramCount += accountsArray.length;
      }

      query += ` ORDER BY t.trade_date DESC, t.entry_time DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(parseInt(limit), parseInt(offset));

      const result = await db.query(query, values);
      logger.info('[TRADE-MGMT] Query returned', result.rows.length, 'trades');

      // Add flags for missing data
      const trades = result.rows.map(trade => ({
        ...trade,
        needs_stop_loss: !trade.stop_loss,
        needs_take_profit: !trade.take_profit,
        can_analyze: !!trade.stop_loss,
        has_target_hit_data: !!trade.manual_target_hit_first || !!trade.target_hit_analysis
      }));

      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM trades
        WHERE user_id = $1
          AND exit_price IS NOT NULL
      `;
      const countValues = [userId];
      let countParamCount = 2;

      if (startDate) {
        countQuery += ` AND trade_date >= $${countParamCount}`;
        countValues.push(startDate);
        countParamCount++;
      }

      if (endDate) {
        countQuery += ` AND trade_date <= $${countParamCount}`;
        countValues.push(endDate);
        countParamCount++;
      }

      if (symbol && symbol.trim()) {
        const searchSymbol = symbol.trim();
        countQuery += ` AND UPPER(symbol) LIKE UPPER($${countParamCount})`;
        countValues.push(`%${searchSymbol}%`);
        countParamCount++;
      }

      if (accounts) {
        const accountsArray = accounts.split(',');
        const placeholders = accountsArray.map((_, index) => `$${countParamCount + index}`).join(',');
        countQuery += ` AND account_identifier IN (${placeholders})`;
        accountsArray.forEach(account => countValues.push(account));
      }

      const countResult = await db.query(countQuery, countValues);
      const total = parseInt(countResult.rows[0].total);

      res.json({
        trades,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          has_more: parseInt(offset) + trades.length < total
        }
      });
    } catch (error) {
      logger.error('Error fetching trades for selection:', error);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  },

  /**
   * Get R-Multiple analysis for a specific trade
   */
  async getRMultipleAnalysis(req, res) {
    try {
      const userId = req.user.id;
      const { tradeId } = req.params;

      logger.debug('[R-ANALYSIS] ========================================');
      logger.debug('[R-ANALYSIS] getRMultipleAnalysis called:', { userId, tradeId });

      // Fetch the trade
      const result = await db.query(
        `SELECT * FROM trades WHERE id = $1 AND user_id = $2`,
        [tradeId, userId]
      );

      if (result.rows.length === 0) {
        logger.debug('[R-ANALYSIS] Trade not found');
        return res.status(404).json({ error: 'Trade not found' });
      }

      const trade = result.rows[0];
      logger.debug('[R-ANALYSIS] Trade loaded from DB:', {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        entry_price: trade.entry_price,
        exit_price: trade.exit_price,
        stop_loss: trade.stop_loss,
        take_profit: trade.take_profit,
        take_profit_targets: trade.take_profit_targets ? JSON.stringify(trade.take_profit_targets) : null,
        manual_target_hit_first: trade.manual_target_hit_first,
        target_hit_analysis: trade.target_hit_analysis ? 'exists' : null
      });

      // Check if trade is closed
      if (!trade.exit_price) {
        logger.debug('[R-ANALYSIS] Trade not closed (no exit_price)');
        return res.status(400).json({
          error: 'Trade must be closed for R-Multiple analysis',
          trade_status: 'open'
        });
      }

      // Check if stop loss is set
      if (!trade.stop_loss) {
        logger.debug('[R-ANALYSIS] Stop loss not set');
        return res.status(400).json({
          error: 'Stop loss must be set for R-Multiple analysis',
          needs_stop_loss: true,
          needs_take_profit: !trade.take_profit
        });
      }

      logger.debug('[R-ANALYSIS] Calling calculateRMultiples...');
      // Calculate R-Multiples
      const analysis = calculateRMultiples(trade);
      logger.debug('[R-ANALYSIS] Analysis result:', JSON.stringify(analysis));

      if (analysis.error) {
        return res.status(400).json({ error: analysis.error });
      }

      // Fetch charts for this trade (ordered by upload time, oldest first = Chart 1)
      const chartsResult = await db.query(
        `SELECT id, chart_url, chart_title, uploaded_at
         FROM trade_charts
         WHERE trade_id = $1
         ORDER BY uploaded_at ASC`,
        [tradeId]
      );

      // Convert charts to camelCase for frontend
      const charts = chartsResult.rows.map(chart => ({
        id: chart.id,
        chartUrl: chart.chart_url,
        chartTitle: chart.chart_title,
        uploadedAt: chart.uploaded_at
      }));

      // Log what we're returning for debugging
      logger.debug('[R-ANALYSIS] ========== Response Summary ==========');
      logger.debug('[R-ANALYSIS] Trade data being returned:', {
        id: trade.id,
        symbol: trade.symbol,
        take_profit_targets: trade.take_profit_targets ? JSON.stringify(trade.take_profit_targets) : null,
        manual_target_hit_first: trade.manual_target_hit_first
      });
      logger.debug('[R-ANALYSIS] Analysis data being returned:', {
        actual_r: analysis.actual_r,
        target_r: analysis.target_r,
        weighted_target_r: analysis.weighted_target_r,
        management_r: analysis.management_r,
        effective_r_lost: analysis.effective_r_lost
      });
      logger.info(`[TRADE-MGMT] Returning trade ${trade.id} with take_profit_targets:`, JSON.stringify(trade.take_profit_targets));

      res.json({
        trade: {
          id: trade.id,
          symbol: trade.symbol,
          trade_date: trade.trade_date,
          side: trade.side,
          quantity: trade.quantity,
          entry_price: trade.entry_price,
          exit_price: trade.exit_price,
          stop_loss: trade.stop_loss,
          take_profit: trade.take_profit,
          take_profit_targets: trade.take_profit_targets,
          pnl: trade.pnl,
          pnl_percent: trade.pnl_percent,
          entry_time: trade.entry_time,
          exit_time: trade.exit_time,
          instrument_type: trade.instrument_type,
          charts: charts,
          manual_target_hit_first: trade.manual_target_hit_first,
          target_hit_analysis: trade.target_hit_analysis
        },
        analysis
      });
    } catch (error) {
      logger.error('Error calculating R-Multiple analysis:', error);
      res.status(500).json({ error: 'Failed to calculate analysis' });
    }
  },

  /**
   * Update stop_loss and take_profit for a trade
   * Supports both single take_profit and multiple take_profit_targets
   */
  async updateTradeLevels(req, res) {
    try {
      const userId = req.user.id;
      const { tradeId } = req.params;
      const { stop_loss, take_profit, take_profit_targets, adjustment_reason, manual_target_hit_first } = req.body;

      // Fetch the trade first to validate
      const result = await db.query(
        `SELECT * FROM trades WHERE id = $1 AND user_id = $2`,
        [tradeId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const trade = result.rows[0];
      const entryPrice = parseFloat(trade.entry_price);
      const isLong = trade.side === 'long';

      // Validate stop loss position based on side
      if (stop_loss !== undefined && stop_loss !== null) {
        const stopLossValue = parseFloat(stop_loss);
        if (isLong && stopLossValue >= entryPrice) {
          return res.status(400).json({
            error: 'Stop loss must be below entry price for long trades'
          });
        }
        if (!isLong && stopLossValue <= entryPrice) {
          return res.status(400).json({
            error: 'Stop loss must be above entry price for short trades'
          });
        }
      }

      // Validate single take profit position based on side
      if (take_profit !== undefined && take_profit !== null) {
        const takeProfitValue = parseFloat(take_profit);
        if (isLong && takeProfitValue <= entryPrice) {
          return res.status(400).json({
            error: 'Take profit must be above entry price for long trades'
          });
        }
        if (!isLong && takeProfitValue >= entryPrice) {
          return res.status(400).json({
            error: 'Take profit must be below entry price for short trades'
          });
        }
      }

      // Validate and process multiple take profit targets
      let processedTargets = null;
      if (take_profit_targets !== undefined && Array.isArray(take_profit_targets)) {
        // Empty array means clear all targets
        if (take_profit_targets.length === 0) {
          processedTargets = [];
        } else {
          processedTargets = [];
          let totalQuantity = 0;

          for (let i = 0; i < take_profit_targets.length; i++) {
            const target = take_profit_targets[i];
            const tpPrice = parseFloat(target.price);

            // Validate price position
            if (isLong && tpPrice <= entryPrice) {
              return res.status(400).json({
                error: `Take profit target ${i + 1} must be above entry price for long trades`
              });
            }
            if (!isLong && tpPrice >= entryPrice) {
              return res.status(400).json({
                error: `Take profit target ${i + 1} must be below entry price for short trades`
              });
            }

            // Accept both 'shares' and 'quantity' for backwards compatibility
            const shares = target.shares || target.quantity;
            const quantity = shares ? parseInt(shares) : null;
            if (quantity) totalQuantity += quantity;

            processedTargets.push({
              id: target.id || uuidv4(),
              price: tpPrice,
              shares: quantity,
              percentage: target.percentage || null,
              quantity: quantity,
              order: target.order || i + 1,
              status: target.status || 'pending',
              hit_at: target.hit_at || null,
              hit_price: target.hit_price || null,
              created_at: target.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }

          // Validate total quantity if quantities are specified
          if (totalQuantity > 0 && trade.quantity) {
            const tradeQuantity = parseFloat(trade.quantity);
            if (Math.abs(totalQuantity - tradeQuantity) > 0.001) {
              logger.warn(`[TRADE-MANAGEMENT] TP target quantities (${totalQuantity}) differ from trade quantity (${tradeQuantity})`);
            }
          }

          // Sort by order
          processedTargets.sort((a, b) => a.order - b.order);
        }
      }

      // Validate manual_target_hit_first value
      const validManualTargetValues = ['take_profit', 'stop_loss', null];
      if (manual_target_hit_first !== undefined && !validManualTargetValues.includes(manual_target_hit_first)) {
        return res.status(400).json({
          error: 'Invalid manual_target_hit_first value. Must be: take_profit, stop_loss, or null'
        });
      }

      // Build history entries for tracking changes
      const historyEntries = [];
      const existingHistory = trade.risk_level_history || [];

      if (stop_loss !== undefined && stop_loss !== trade.stop_loss) {
        historyEntries.push(
          TargetHitAnalysisService.createHistoryEntry(
            trade,
            'stop_loss',
            trade.stop_loss ? parseFloat(trade.stop_loss) : null,
            stop_loss !== null ? parseFloat(stop_loss) : null,
            adjustment_reason
          )
        );
      }

      if (take_profit !== undefined && take_profit !== trade.take_profit) {
        historyEntries.push(
          TargetHitAnalysisService.createHistoryEntry(
            trade,
            'take_profit',
            trade.take_profit ? parseFloat(trade.take_profit) : null,
            take_profit !== null ? parseFloat(take_profit) : null,
            adjustment_reason
          )
        );
      }

      // Build update query
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (stop_loss !== undefined) {
        updates.push(`stop_loss = $${paramCount}`);
        values.push(stop_loss === null ? null : parseFloat(stop_loss));
        paramCount++;
      }

      if (take_profit !== undefined) {
        updates.push(`take_profit = $${paramCount}`);
        values.push(take_profit === null ? null : parseFloat(take_profit));
        paramCount++;
      }

      if (processedTargets !== null) {
        updates.push(`take_profit_targets = $${paramCount}`);
        values.push(JSON.stringify(processedTargets));
        paramCount++;
      }

      // Handle manual_target_hit_first
      if (manual_target_hit_first !== undefined) {
        updates.push(`manual_target_hit_first = $${paramCount}`);
        values.push(manual_target_hit_first);
        paramCount++;

        // If setting a manual value, clear the automated analysis to avoid confusion
        if (manual_target_hit_first !== null) {
          updates.push(`target_hit_analysis = NULL`);
          logger.info(`[TRADE-MANAGEMENT] Clearing automated target_hit_analysis due to manual override`);
        }
      }

      // Update history if there are new entries
      if (historyEntries.length > 0) {
        const updatedHistory = [...existingHistory, ...historyEntries];
        updates.push(`risk_level_history = $${paramCount}`);
        values.push(JSON.stringify(updatedHistory));
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(tradeId, userId);

      const updateQuery = `
        UPDATE trades
        SET ${updates.join(', ')}
        WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
        RETURNING *
      `;

      const updateResult = await db.query(updateQuery, values);
      const updatedTrade = updateResult.rows[0];

      // Recalculate R-value if we have stop loss and exit price
      // R-Multiple = Profit / Risk (where Risk = distance from entry to stop loss)
      if (updatedTrade.stop_loss && updatedTrade.exit_price) {
        const rValue = Trade.calculateRValue(
          parseFloat(updatedTrade.entry_price),
          parseFloat(updatedTrade.stop_loss),
          parseFloat(updatedTrade.exit_price),
          updatedTrade.side
        );

        if (rValue !== null) {
          await db.query(
            `UPDATE trades SET r_value = $1 WHERE id = $2`,
            [rValue, tradeId]
          );
          updatedTrade.r_value = rValue;
        }
      }

      // Calculate and store management R
      const managementR = TargetHitAnalysisService.calculateManagementR(updatedTrade);
      if (managementR !== null) {
        await db.query(
          `UPDATE trades SET management_r = $1 WHERE id = $2`,
          [managementR, tradeId]
        );
        updatedTrade.management_r = managementR;
      }

      logger.info(`[TRADE-MANAGEMENT] Updated trade ${tradeId} levels for user ${userId}`);

      res.json({
        success: true,
        trade: updatedTrade
      });
    } catch (error) {
      logger.error('Error updating trade levels:', error);
      res.status(500).json({ error: 'Failed to update trade levels' });
    }
  },

  /**
   * Get R-Multiple performance data for charting
   * Returns cumulative R performance over time
   * Now includes management_r for the third chart line
   */
  async getRPerformance(req, res) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, symbol, limit = 2000, accounts } = req.query;

      logger.info('[TRADE-MGMT] getRPerformance called', { userId, symbol, startDate, endDate, limit, accounts });

      // Get trades with stop_loss set (required for R calculation)
      // Now also fetch management_r and take_profit_targets
      let query = `
        SELECT
          id, symbol, trade_date, entry_price, exit_price,
          quantity, side, pnl, stop_loss, take_profit,
          take_profit_targets, management_r, risk_level_history
        FROM trades
        WHERE user_id = $1
          AND exit_price IS NOT NULL
          AND stop_loss IS NOT NULL
      `;
      const values = [userId];
      let paramCount = 2;

      if (startDate) {
        query += ` AND trade_date >= $${paramCount}`;
        values.push(startDate);
        paramCount++;
      }

      if (endDate) {
        query += ` AND trade_date <= $${paramCount}`;
        values.push(endDate);
        paramCount++;
      }

      if (symbol && symbol.trim()) {
        query += ` AND UPPER(symbol) LIKE UPPER($${paramCount})`;
        values.push(`%${symbol.trim()}%`);
        paramCount++;
      }

      if (accounts) {
        const accountsArray = accounts.split(',');
        const placeholders = accountsArray.map((_, index) => `$${paramCount + index}`).join(',');
        query += ` AND account_identifier IN (${placeholders})`;
        accountsArray.forEach(account => values.push(account));
        paramCount += accountsArray.length;
      }

      query += ` ORDER BY trade_date ASC, id ASC LIMIT $${paramCount}`;
      values.push(parseInt(limit));

      const result = await db.query(query, values);
      logger.info('[TRADE-MGMT] Found', result.rows.length, 'trades with stop_loss for R analysis');

      // Calculate R values and build cumulative data
      let cumulativeActualR = 0;
      let cumulativePotentialR = 0;
      let cumulativeManagementR = 0;
      let tradesWithTarget = 0;
      let tradesWithManagementR = 0;

      const chartData = [];
      const tradeDetails = [];

      result.rows.forEach((trade, index) => {
        const rValues = calculateTradeR(trade);

        if (rValues) {
          cumulativeActualR += rValues.actual_r;

          // For potential R, use target_r if available, otherwise use actual_r
          if (rValues.target_r !== null) {
            cumulativePotentialR += rValues.target_r;
            tradesWithTarget++;
          } else {
            cumulativePotentialR += rValues.actual_r;
          }

          // Track management R
          const tradeManagementR = trade.management_r ? parseFloat(trade.management_r) : 0;
          if (trade.management_r !== null) {
            tradesWithManagementR++;
          }
          cumulativeManagementR += tradeManagementR;

          chartData.push({
            trade_number: index + 1,
            trade_id: trade.id,
            symbol: trade.symbol,
            trade_date: trade.trade_date,
            actual_r: rValues.actual_r,
            target_r: rValues.target_r,
            management_r: Math.round(tradeManagementR * 100) / 100,
            cumulative_actual_r: Math.round(cumulativeActualR * 100) / 100,
            cumulative_potential_r: Math.round(cumulativePotentialR * 100) / 100,
            cumulative_management_r: Math.round(cumulativeManagementR * 100) / 100,
            has_multiple_targets: !!(trade.take_profit_targets && trade.take_profit_targets.length > 0),
            has_adjustments: !!(trade.risk_level_history && trade.risk_level_history.length > 0)
          });

          tradeDetails.push({
            id: trade.id,
            symbol: trade.symbol,
            trade_date: trade.trade_date,
            side: trade.side,
            pnl: trade.pnl,
            actual_r: rValues.actual_r,
            target_r: rValues.target_r,
            management_r: tradeManagementR
          });
        }
      });

      // Calculate summary statistics
      const totalTrades = chartData.length;
      const totalActualR = Math.round(cumulativeActualR * 100) / 100;
      const totalPotentialR = Math.round(cumulativePotentialR * 100) / 100;
      const totalManagementR = Math.round(cumulativeManagementR * 100) / 100;
      const rEfficiency = totalPotentialR > 0
        ? Math.round((totalActualR / totalPotentialR) * 100)
        : (totalActualR >= 0 ? 100 : 0);
      const rLeftOnTable = Math.round((totalPotentialR - totalActualR) * 100) / 100;

      // Calculate win rate and average R
      const winningTrades = tradeDetails.filter(t => t.actual_r > 0);
      const losingTrades = tradeDetails.filter(t => t.actual_r < 0);
      const winRate = totalTrades > 0 ? Math.round((winningTrades.length / totalTrades) * 100) : 0;
      const avgWinR = winningTrades.length > 0
        ? Math.round((winningTrades.reduce((sum, t) => sum + t.actual_r, 0) / winningTrades.length) * 100) / 100
        : 0;
      const avgLossR = losingTrades.length > 0
        ? Math.round((losingTrades.reduce((sum, t) => sum + t.actual_r, 0) / losingTrades.length) * 100) / 100
        : 0;

      // Calculate average management R
      const avgManagementR = tradesWithManagementR > 0
        ? Math.round((totalManagementR / tradesWithManagementR) * 100) / 100
        : 0;

      res.json({
        chart_data: chartData,
        summary: {
          total_trades: totalTrades,
          trades_with_target: tradesWithTarget,
          trades_with_management_r: tradesWithManagementR,
          total_actual_r: totalActualR,
          total_potential_r: totalPotentialR,
          total_management_r: totalManagementR,
          r_efficiency: rEfficiency,
          r_left_on_table: rLeftOnTable,
          win_rate: winRate,
          winning_trades: winningTrades.length,
          losing_trades: losingTrades.length,
          avg_win_r: avgWinR,
          avg_loss_r: avgLossR,
          avg_management_r: avgManagementR
        }
      });
    } catch (error) {
      logger.error('Error fetching R performance:', error);
      res.status(500).json({ error: 'Failed to fetch R performance data' });
    }
  },

  /**
   * Analyze which target (stop loss or take profit) was hit first
   * Uses OHLCV data to determine the order of target crossings
   */
  async analyzeTargetHitFirst(req, res) {
    try {
      const userId = req.user.id;
      const { tradeId } = req.params;

      // Fetch the trade
      const result = await db.query(
        `SELECT * FROM trades WHERE id = $1 AND user_id = $2`,
        [tradeId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const trade = result.rows[0];

      // Check if trade has required data
      if (!trade.stop_loss) {
        return res.status(400).json({
          error: 'Stop loss must be set for target hit analysis',
          needs_stop_loss: true
        });
      }

      if (!trade.entry_time) {
        return res.status(400).json({
          error: 'Entry time is required for target hit analysis',
          missing_entry_time: true
        });
      }

      // Perform the analysis
      const analysisResult = await TargetHitAnalysisService.analyzeTargetHitOrder(trade, userId);

      if (!analysisResult.success) {
        return res.status(400).json({
          error: analysisResult.error,
          data_unavailable: analysisResult.data_unavailable || false
        });
      }

      // Store the analysis result in the trade
      await db.query(
        `UPDATE trades SET target_hit_analysis = $1 WHERE id = $2`,
        [JSON.stringify(analysisResult), tradeId]
      );

      res.json(analysisResult);
    } catch (error) {
      logger.error('Error analyzing target hit first:', error);
      res.status(500).json({ error: 'Failed to analyze target hit order' });
    }
  },

  /**
   * Set manual target hit first value for a trade
   * Allows users without API access to manually specify which target was hit first
   */
  async setManualTargetHitFirst(req, res) {
    try {
      const userId = req.user.id;
      const { tradeId } = req.params;
      const { manual_target_hit_first } = req.body;

      logger.debug('[MANUAL-TARGET] ========================================');
      logger.debug('[MANUAL-TARGET] setManualTargetHitFirst called:', {
        userId,
        tradeId,
        manual_target_hit_first,
        body: JSON.stringify(req.body)
      });

      // Validate the value
      const validValues = ['take_profit', 'stop_loss', null];
      if (!validValues.includes(manual_target_hit_first)) {
        logger.debug('[MANUAL-TARGET] Invalid value provided:', manual_target_hit_first);
        return res.status(400).json({
          error: 'Invalid value. Must be: take_profit, stop_loss, or null'
        });
      }

      // Fetch full trade data needed for recalculating management_r
      const result = await db.query(
        `SELECT id, symbol, entry_price, exit_price, stop_loss, take_profit,
                take_profit_targets, side, pnl, quantity, instrument_type,
                contract_size, point_value, risk_level_history
         FROM trades WHERE id = $1 AND user_id = $2`,
        [tradeId, userId]
      );

      if (result.rows.length === 0) {
        logger.debug('[MANUAL-TARGET] Trade not found');
        return res.status(404).json({ error: 'Trade not found' });
      }

      const trade = result.rows[0];
      logger.debug('[MANUAL-TARGET] Current trade state:', {
        id: trade.id,
        stop_loss: trade.stop_loss,
        take_profit: trade.take_profit,
        take_profit_targets: trade.take_profit_targets ? JSON.stringify(trade.take_profit_targets) : null
      });

      // Warn if setting manual value without stop_loss
      if (!trade.stop_loss && manual_target_hit_first !== null) {
        logger.warn(`[TRADE-MANAGEMENT] Setting manual_target_hit_first without stop_loss for trade ${tradeId}`);
      }

      // Recalculate management_r with the new manual_target_hit_first value
      let newManagementR = null;
      if (trade.stop_loss && trade.exit_price) {
        // Create a trade object with the new manual_target_hit_first for recalculation
        const tradeForCalc = {
          ...trade,
          manual_target_hit_first: manual_target_hit_first
        };
        const rValues = calculateRMultiples(tradeForCalc);
        if (rValues && !rValues.error) {
          newManagementR = rValues.management_r;
          logger.debug('[MANUAL-TARGET] Recalculated management_r:', newManagementR);
        }
      }

      // Update the trade with both manual_target_hit_first and recalculated management_r
      let updateQuery;
      let updateValues;

      logger.debug('[MANUAL-TARGET] Preparing update query...');
      if (manual_target_hit_first !== null) {
        // Setting a manual value - also clear automated analysis and update management_r
        logger.debug('[MANUAL-TARGET] Setting manual value, clearing automated analysis, and updating management_r');
        updateQuery = `
          UPDATE trades
          SET manual_target_hit_first = $1, target_hit_analysis = NULL, management_r = $2, updated_at = NOW()
          WHERE id = $3 AND user_id = $4
          RETURNING id, manual_target_hit_first, target_hit_analysis, management_r
        `;
        updateValues = [manual_target_hit_first, newManagementR, tradeId, userId];
      } else {
        // Clearing manual value - recalculate management_r without manual setting
        logger.debug('[MANUAL-TARGET] Clearing manual value and recalculating management_r');
        updateQuery = `
          UPDATE trades
          SET manual_target_hit_first = NULL, management_r = $1, updated_at = NOW()
          WHERE id = $2 AND user_id = $3
          RETURNING id, manual_target_hit_first, target_hit_analysis, management_r
        `;
        updateValues = [newManagementR, tradeId, userId];
      }

      logger.debug('[MANUAL-TARGET] Executing update query...');
      const updateResult = await db.query(updateQuery, updateValues);

      const updatedTrade = updateResult.rows[0];
      logger.debug('[MANUAL-TARGET] Update successful:', {
        id: updatedTrade.id,
        manual_target_hit_first: updatedTrade.manual_target_hit_first,
        target_hit_analysis: updatedTrade.target_hit_analysis ? 'exists' : null,
        management_r: updatedTrade.management_r
      });

      logger.info(`[TRADE-MANAGEMENT] Set manual_target_hit_first=${manual_target_hit_first}, management_r=${newManagementR} for trade ${tradeId}`);

      const response = {
        success: true,
        trade_id: tradeId,
        manual_target_hit_first: updatedTrade.manual_target_hit_first,
        target_hit_analysis: updatedTrade.target_hit_analysis,
        management_r: updatedTrade.management_r
      };
      logger.debug('[MANUAL-TARGET] Sending response:', JSON.stringify(response));

      res.json(response);
    } catch (error) {
      logger.error('Error setting manual target hit first:', error);
      logger.debug('[MANUAL-TARGET] Error details:', error.stack);
      res.status(500).json({ error: 'Failed to set manual target hit first' });
    }
  }
};

module.exports = tradeManagementController;
