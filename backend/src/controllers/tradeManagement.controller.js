/**
 * Trade Management Controller
 * Handles R-Multiple analysis for individual trades
 */

const db = require('../config/database');
const Trade = require('../models/Trade');
const User = require('../models/User');
const TradeQueries = require('../services/tradeQueries');
const logger = require('../utils/logger');
const TargetHitAnalysisService = require('../services/targetHitAnalysisService');
const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('../utils/futuresUtils');
const { parseTradeFilters, tradeFilterProfiles } = require('../utils/tradeFilters');
const { uuidv4 } = require('../utils/uuid');
const { getBreakevenToleranceConfig, breakevenPredicate, isBreakevenGrossPnl } = require('../utils/breakeven');
const { POSITION_GROUP_KEY } = require('../utils/positionGrouping');

/**
 * Parse a Trade Management request's query params into a filter spec for
 * TradeQueries._buildWhereClause. Mirrors trade.controller.getAnalytics so the
 * Trade Management page accepts the same filter set as the Performance page.
 * (limit/offset are handled separately by each endpoint.)
 */
function parseTradeManagementFilters(query = {}) {
  return parseTradeFilters(query, tradeFilterProfiles.tradeManagement);
}

function inferInstrumentType(trade) {
  const rawType = String(trade?.instrument_type || trade?.instrumentType || 'stock').trim().toLowerCase();
  if (rawType === 'future' || rawType === 'futures') return 'future';
  if (rawType !== 'option' && extractUnderlyingFromFuturesSymbol(trade?.symbol)) return 'future';
  if (rawType === 'option' || rawType === 'crypto' || rawType === 'stock') return rawType;
  return rawType || 'stock';
}

function roundR(value) {
  return Math.round(value * 100) / 100;
}

// Per-unit dollar multiplier for a trade (1 share for stocks, contract_size for
// options, point_value for futures). Mirrors the inline resolution below; used
// to express a fixed dollar risk as a per-share value (#345).
function instrumentMultiplier(trade) {
  const instrumentType = inferInstrumentType(trade);
  if (instrumentType === 'future') {
    let pv = trade.point_value ? parseFloat(trade.point_value) : null;
    if (!pv || isNaN(pv) || pv <= 0) {
      const underlying = trade.underlying_asset || trade.underlyingAsset
        || extractUnderlyingFromFuturesSymbol(trade.symbol);
      pv = underlying ? getFuturesPointValue(underlying) : 50;
    }
    return pv;
  }
  if (instrumentType === 'option') {
    const cs = trade.contract_size ? parseFloat(trade.contract_size) : 100;
    return !isNaN(cs) && cs > 0 ? cs : 100;
  }
  return 1;
}

// Returns the user's fixed dollar risk per trade when they use dollar-based
// default stops, else null. Used to switch R's risk unit to dollars (#345).
async function getUserDollarRisk(userId) {
  const { dollarRisk } = await getTradeManagementPreferences(userId);
  return dollarRisk;
}

async function getTradeManagementPreferences(userId) {
  const preferences = {
    groupByPosition: false,
    dollarRisk: null
  };

  try {
    const settings = await User.getSettings(userId);
    preferences.groupByPosition = settings?.analytics_position_grouping === true;

    const dollars = parseFloat(settings?.default_stop_loss_dollars);
    if (settings?.default_stop_loss_type === 'dollar' && Number.isFinite(dollars) && dollars > 0) {
      preferences.dollarRisk = dollars;
    }
  } catch (error) {
    logger.warn('[TRADE-MGMT] Could not load user trade-management preferences:', error.message);
  }

  return preferences;
}

// For fixed-dollar-risk users, R's risk unit is a constant dollar amount, so the
// per-share risk is that amount spread across the position. Returns null unless
// the user is in dollar mode with a positive risk (#345).
function dollarRiskPerShare(trade, dollarRisk) {
  if (!dollarRisk || dollarRisk <= 0) return null;
  const qty = parseFloat(trade.quantity);
  const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const mult = instrumentMultiplier(trade);
  if (!Number.isFinite(mult) || mult <= 0) return null;
  return dollarRisk / (safeQty * mult);
}

/**
 * Calculate R-Multiple values for a trade
 * @param {Object} trade - Trade object with entry_price, exit_price, stop_loss, take_profit, take_profit_targets, side
 * @returns {Object} R-Multiple analysis results
 */
function calculateRMultiples(trade, options = {}) {
  const { entry_price, exit_price, stop_loss, take_profit, take_profit_targets, side, pnl, quantity, manual_target_hit_first, instrument_type, contract_size, point_value, risk_level_history } = trade;

  // Fixed-dollar-risk users (#345): R's risk unit is a constant dollar amount,
  // not the stored stop distance. dollarRiskUnit is the equivalent per-share
  // risk; when set it replaces (entry - stop) everywhere below so actual, target,
  // weighted, and management R all reconcile to net P&L / dollar risk.
  const dollarRisk = options.dollarRisk && options.dollarRisk > 0 ? options.dollarRisk : null;

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
  const normalizedTargets = TargetHitAnalysisService.getNormalizedTakeProfitTargets(trade);
  
  // Validate that stop_loss is a valid number
  if (isNaN(parseFloat(stop_loss)) || stop_loss === null || stop_loss === undefined) {
    logger.debug('[R-CALC] Invalid stop_loss value:', stop_loss);
    return {
      error: 'Invalid stop loss value for R-Multiple calculation',
      has_stop_loss: false
    };
  }
  
  // Use current stop loss for R calculations
  // R value reflects performance relative to the CURRENT risk level
  const stopLoss = parseFloat(stop_loss);
  
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
  
  logger.debug('[R-CALC] Parsed prices:', { entryPrice, exitPrice, stopLoss, instrument_type: instrument_type || 'stock' });

  // Per-share risk for dollar-mode users; null otherwise (price-based risk used).
  const dollarRiskUnit = dollarRisk ? dollarRiskPerShare(trade, dollarRisk) : null;
  if (dollarRiskUnit) {
    logger.debug('[R-CALC] Using fixed dollar risk unit:', { dollarRisk, dollarRiskUnit });
  }

  // Determine the take profit price to use for single-target analysis
  // Priority: take_profit_targets (first/primary target) > take_profit
  let takeProfit = null;
  const targets = take_profit_targets;
  logger.debug('[R-CALC] Processing take profit targets:', {
    hasTargetsArray: !!(targets && Array.isArray(targets)),
    targetsCount: targets && Array.isArray(targets) ? targets.length : 0,
    normalizedTargetsCount: normalizedTargets.length,
    hasSingleTakeProfit: !!take_profit
  });

  if (normalizedTargets.length > 0) {
    const firstTarget = normalizedTargets[0];
    logger.debug('[R-CALC] First normalized target:', JSON.stringify(firstTarget));
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
  // Also track direct target P&L calculation (sum of net profits at each TP level)
  let weightedTargetR = null;
  let directTargetPLAmount = null; // Direct calculation: sum of (profit - commission) at each TP
  // Calculate weighted average from normalized targets so TP1 is not double-counted.
  if (normalizedTargets.length > 1) {
    logger.debug('[R-CALC] Calculating weighted average R for normalized targets');
    const isLong = side === 'long';
    const riskCalc = dollarRiskUnit ?? (isLong ? entryPrice - stopLoss : stopLoss - entryPrice);
    logger.debug('[R-CALC] Risk calculation:', { isLong, risk: riskCalc });

    if (riskCalc > 0) {
      const totalShares = normalizedTargets.reduce((sum, target) => sum + target.shares, 0);
      let weightedSum = 0;
      let directPLSum = 0; // Sum of gross profits at each TP level
      const totalQuantity = parseFloat(quantity) || 1;

      // Determine multiplier early for direct P&L calculation
      let calcMultiplier = 1;
      const calcInstrumentType = instrument_type || 'stock';
      if (calcInstrumentType === 'future') {
        calcMultiplier = point_value ? parseFloat(point_value) : 5; // Default to micro futures
      } else if (calcInstrumentType === 'option') {
        calcMultiplier = contract_size ? parseFloat(contract_size) : 100;
      }

      normalizedTargets.forEach((target, index) => {
        const tpR = isLong ? (target.price - entryPrice) / riskCalc : (entryPrice - target.price) / riskCalc;
        weightedSum += tpR * target.shares;

        const tpProfitPerShare = isLong ? (target.price - entryPrice) : (entryPrice - target.price);
        directPLSum += tpProfitPerShare * target.shares * calcMultiplier;
        logger.debug(`[R-CALC] Normalized target ${index + 1} contribution:`, {
          tpPrice: target.price,
          tpR: tpR.toFixed(2),
          shares: target.shares,
          directPL: (tpProfitPerShare * target.shares * calcMultiplier).toFixed(2),
          status: target.status
        });
      });

      if (totalShares > 0) {
        weightedTargetR = weightedSum / totalShares;

        // Calculate commission to subtract from direct P&L
        // Estimate commission per contract based on actual trade commission
        const { commission: tradeCommission, fees: tradeFees } = trade;
        const totalTradeCommission = Math.abs(parseFloat(tradeCommission || 0)) + Math.abs(parseFloat(tradeFees || 0));
        // Commission per contract = total commission / total contracts
        // For target P&L, we need commission for exiting all contracts
        const commissionPerContract = totalQuantity > 0 ? totalTradeCommission / totalQuantity : 0;
        const targetExitCommission = commissionPerContract * totalShares;

        directTargetPLAmount = directPLSum - targetExitCommission;

        logger.debug('[R-CALC] Weighted average calculation:', {
          weightedSum: weightedSum.toFixed(2),
          totalShares,
          weightedTargetR: weightedTargetR.toFixed(2),
          totalTargetCount: normalizedTargets.length,
          directPLSum: directPLSum.toFixed(2),
          targetExitCommission: targetExitCommission.toFixed(2),
          directTargetPLAmount: directTargetPLAmount.toFixed(2)
        });
      }
    } else {
      logger.debug('[R-CALC] Risk is not positive, skipping weighted calculation');
    }
  }

  let risk, actualPL, targetPL, actualR, targetR, rLost;

  logger.debug('[R-CALC] ========== R-Value Calculation ==========');
  if (side === 'long') {
    // For long positions: risk is entry - stop loss (or the fixed dollar risk unit)
    risk = dollarRiskUnit ?? (entryPrice - stopLoss);
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
    // For short positions: risk is stop loss - entry (or the fixed dollar risk unit)
    risk = dollarRiskUnit ?? (stopLoss - entryPrice);
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
  const instrumentType = inferInstrumentType(trade);
  const tradeQuantityForRisk = parseFloat(quantity || 1);
  const calculatedRiskAmount = Trade.calculateRiskAmount(
    entryPrice,
    stopLoss,
    Number.isFinite(tradeQuantityForRisk) && tradeQuantityForRisk > 0 ? tradeQuantityForRisk : 1,
    side,
    instrumentType,
    contract_size,
    point_value,
    trade.symbol,
    trade.underlying_asset || trade.underlyingAsset
  );

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

  // Dollar-mode: the risk amount IS the fixed dollar risk, so actual R becomes
  // net P&L / dollar risk. Keep the instrument multiplier from the block above so
  // dollar amounts (actual/target P&L) stay in real dollars.
  const riskAmount = dollarRisk
    ? dollarRisk
    : (calculatedRiskAmount && calculatedRiskAmount > 0
        ? calculatedRiskAmount
        : risk * tradeQuantity * multiplier);
  if (!dollarRisk && calculatedRiskAmount && risk > 0 && tradeQuantity > 0) {
    multiplier = calculatedRiskAmount / (risk * tradeQuantity);
  }
  const actualPLAmount = actualPL * tradeQuantity * multiplier;
  
  // Calculate target_pl_amount:
  // - For multiple targets: use directTargetPLAmount (sum of net profits at each TP level)
  // - For single TP: use targetPL * quantity * multiplier
  // The direct calculation is more accurate as it accounts for share allocation at each level
  let targetPLAmount = null;
  if (directTargetPLAmount !== null) {
    // Use direct calculation for multiple targets (sum of profits at each TP minus estimated commission)
    targetPLAmount = directTargetPLAmount;
    logger.debug('[R-CALC] Using direct calculation for target_pl_amount (multiple targets):', {
      directTargetPLAmount: directTargetPLAmount.toFixed(2),
      note: 'Sum of (profit × shares × multiplier) at each TP level, minus estimated exit commission'
    });
  } else if (takeProfit) {
    // Traditional calculation for single TP
    targetPLAmount = targetPL * tradeQuantity * multiplier;
    logger.debug('[R-CALC] Using traditional calculation for target_pl_amount (single TP):', {
      targetPL: targetPL?.toFixed(2),
      tradeQuantity,
      multiplier,
      targetPLAmount: targetPLAmount?.toFixed(2)
    });
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

  // Actual R is canonical net P&L divided by dollar risk. This keeps Trade
  // Management aligned with stored r_value and dashboard analytics for partial
  // exits, futures/options multipliers, and broker-imported net P&L.
  const netPnl = parseFloat(pnl);
  let actualRAlreadyNet = false;
  if (Number.isFinite(netPnl) && riskAmount > 0) {
    const priceBasedActualR = actualR;
    actualR = netPnl / riskAmount;
    actualRAlreadyNet = true;
    logger.debug('[R-CALC] Actual R from net P&L:', {
      netPnl,
      riskAmount: riskAmount.toFixed(2),
      priceBasedActualR: priceBasedActualR.toFixed(4),
      netActualR: actualR.toFixed(4)
    });
  }

  // Adjust actual R AND target R for commission and fees (net R)
  // Commission reduces your actual profit, so it reduces actual R
  // Target R also needs commission adjustment for apples-to-apples comparison
  const { commission, fees, symbol } = trade;
  const totalCommission = Math.abs(parseFloat(commission || 0)) + Math.abs(parseFloat(fees || 0));
  if (totalCommission > 0 && riskAmount > 0) {
    // Detect futures from symbol if instrument_type is incorrect
    const isFutures = instrumentType === 'future' ||
      (symbol && /^(MES|ES|MNQ|NQ|MYM|YM|M2K|RTY|MGC|GC|MCL|CL|SI|HG)/i.test(symbol));

    // For futures detected by symbol but with wrong instrument_type, recalculate riskAmount
    // (skipped in dollar mode, where the risk amount is the fixed dollar risk).
    let effectiveRiskAmount = riskAmount;
    if (!dollarRisk && isFutures && instrumentType !== 'future') {
      // Recalculate with correct futures multiplier
      let futuresMultiplier = 5; // Default to micro
      if (symbol && /^(MES|MNQ|MYM|M2K)/i.test(symbol)) {
        futuresMultiplier = 5; // Micro futures = $5 per point
      } else if (symbol && /^(ES|NQ|YM|RTY)/i.test(symbol)) {
        futuresMultiplier = 50; // E-mini futures = $50 per point
      }
      effectiveRiskAmount = risk * tradeQuantity * futuresMultiplier;
    }

    const commissionR = totalCommission / effectiveRiskAmount;
    const grossActualR = actualR;
    if (!actualRAlreadyNet) {
      actualR = actualR - commissionR;
    }

    // Also adjust target R for commission (hitting targets also incurs commissions)
    if (targetR !== undefined) {
      const grossTargetR = targetR;
      targetR = targetR - commissionR;
      logger.debug('[R-CALC] Target R commission adjustment:', {
        grossTargetR: grossTargetR.toFixed(4),
        netTargetR: targetR.toFixed(4)
      });
    }
    if (weightedTargetR !== null) {
      const grossWeightedTargetR = weightedTargetR;
      weightedTargetR = weightedTargetR - commissionR;
      logger.debug('[R-CALC] Weighted Target R commission adjustment:', {
        grossWeightedTargetR: grossWeightedTargetR.toFixed(4),
        netWeightedTargetR: weightedTargetR.toFixed(4)
      });
    }

    logger.debug('[R-CALC] Commission adjustment:', {
      totalCommission,
      effectiveRiskAmount: effectiveRiskAmount.toFixed(2),
      commissionR: commissionR.toFixed(4),
      grossActualR: grossActualR.toFixed(4),
      netActualR: actualR.toFixed(4)
    });
  }

  if (targetR !== undefined) {
    rLost = targetR - actualR;
  }

  // Use weighted average target R if available (for multiple targets)
  // Both are now net of commissions
  const effectiveTargetR = weightedTargetR !== null ? weightedTargetR : targetR;
  const effectiveRLost = effectiveTargetR !== undefined ? effectiveTargetR - actualR : rLost;
  logger.debug('[R-CALC] Effective values:', {
    effectiveTargetR: effectiveTargetR?.toFixed(2) ?? null,
    effectiveRLost: effectiveRLost?.toFixed(2) ?? null,
    usingWeightedAverage: weightedTargetR !== null
  });

  // Calculate Management R using the TargetHitAnalysisService
  // This properly handles partial exits and SL move impacts
  //
  // For SL Hit First: Management R = Saved R from SL moves (accounts for partial exits)
  // For TP Hit First: Management R = Actual R - Weighted Target R
  logger.debug('[R-CALC] ========== Management R Calculation ==========');
  logger.debug('[R-CALC] manual_target_hit_first:', manual_target_hit_first);

  let managementR = null;
  let plannedR = null;
  let plannedPLAmount = null;

  if (manual_target_hit_first) {
    // Use TargetHitAnalysisService for proper partial exit handling
    managementR = TargetHitAnalysisService.calculateManagementR(trade, { dollarRisk });
    logger.debug('[R-CALC] Management R from TargetHitAnalysisService:', managementR);
    if (managementR !== null) {
      plannedR = actualR - managementR;
      plannedPLAmount = plannedR * riskAmount;
    }
  } else {
    logger.debug('[R-CALC] No target hit selection - cannot calculate management R');
  }

  logger.debug('[R-CALC] ========== Final Results ==========');
  logger.debug('[R-CALC] Final values:', {
    actual_r: roundR(actualR),
    target_r: targetR !== undefined ? roundR(targetR) : null,
    r_lost: rLost !== undefined ? roundR(rLost) : null,
    weighted_target_r: weightedTargetR !== null ? roundR(weightedTargetR) : null,
    effective_r_lost: effectiveRLost !== undefined ? roundR(effectiveRLost) : null,
    management_r: managementR !== null ? roundR(managementR) : null,
    planned_r: plannedR !== null ? roundR(plannedR) : null,
    planned_pl_amount: plannedPLAmount !== null ? Math.round(plannedPLAmount * 100) / 100 : null,
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
    planned_r: plannedR !== null ? Math.round(plannedR * 100) / 100 : null,
    planned_pl_amount: plannedPLAmount !== null ? Math.round(plannedPLAmount * 100) / 100 : null,

    // Dollar amounts
    risk_per_share: Math.round(risk * 100) / 100,
    risk_amount: Math.round(riskAmount * 100) / 100,
    actual_pl_per_share: Math.round(actualPL * 100) / 100,
    actual_pl_amount: pnl !== null && pnl !== undefined ? parseFloat(pnl) : Math.round(actualPLAmount * 100) / 100,
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
  const { entry_price, exit_price, stop_loss, take_profit, take_profit_targets, side, risk_level_history, quantity } = trade;

  logger.debug('[R-BATCH] calculateTradeR for trade:', { id: trade.id, symbol: trade.symbol, side });

  if (!entry_price || !exit_price || !stop_loss) {
    logger.debug('[R-BATCH] Missing required fields, returning null');
    return null;
  }

  const entryPrice = parseFloat(entry_price);
  const exitPrice = parseFloat(exit_price);

  // Use current stop loss for R calculations
  const stopLoss = parseFloat(stop_loss);
  const isLong = side === 'long';

  // Calculate risk
  let risk;
  if (isLong) {
    risk = entryPrice - stopLoss;
    if (risk <= 0) {
      logger.debug('[R-BATCH] Invalid risk for long trade');
      return null;
    }
  } else {
    risk = stopLoss - entryPrice;
    if (risk <= 0) {
      logger.debug('[R-BATCH] Invalid risk for short trade');
      return null;
    }
  }

  // Calculate actual R
  const actualR = isLong ? (exitPrice - entryPrice) / risk : (entryPrice - exitPrice) / risk;

  // Determine the take profit price to use for potential R
  // Priority: take_profit_targets (first/primary target) > take_profit
  let takeProfit = null;
  const targets = take_profit_targets;

  if (targets && Array.isArray(targets) && targets.length > 0) {
    const firstTarget = targets[0];
    if (firstTarget && firstTarget.price) {
      takeProfit = parseFloat(firstTarget.price);
      logger.debug('[R-BATCH] Using first target price:', takeProfit);
    }
  }

  if (!takeProfit && take_profit) {
    takeProfit = parseFloat(take_profit);
    logger.debug('[R-BATCH] Using single take_profit:', takeProfit);
  }

  // Calculate single target R
  let targetR;
  if (takeProfit) {
    targetR = isLong ? (takeProfit - entryPrice) / risk : (entryPrice - takeProfit) / risk;
  }

  // Calculate weighted average target R for multiple targets (matches calculateRMultiples)
  let weightedTargetR = null;
  const hasTargetsArray = targets && Array.isArray(targets) && targets.length > 0;
  const hasPrimaryTp = !!take_profit;
  const totalTargetCount = (hasPrimaryTp ? 1 : 0) + (hasTargetsArray ? targets.length : 0);

  if (hasTargetsArray && totalTargetCount > 1 && risk > 0) {
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
      logger.debug('[R-BATCH] Calculated weighted target R:', { weightedTargetR, totalShares });
    }
  }

  // Use weighted average if available, otherwise single target
  const effectiveTargetR = weightedTargetR !== null ? weightedTargetR : targetR;

  // Cap potential R at 10R to prevent unrealistic values from distorting charts
  const MAX_POTENTIAL_R = 10;
  let finalTargetR = effectiveTargetR;
  if (finalTargetR !== undefined && finalTargetR > MAX_POTENTIAL_R) {
    logger.debug(`[R-BATCH] Capping potential R from ${finalTargetR.toFixed(2)} to ${MAX_POTENTIAL_R}`);
    finalTargetR = MAX_POTENTIAL_R;
  }

  logger.debug('[R-BATCH] Calculated:', { actualR: actualR.toFixed(2), targetR: finalTargetR?.toFixed(2) });

  const result = {
    actual_r: Math.round(actualR * 100) / 100,
    target_r: finalTargetR !== undefined ? Math.round(finalTargetR * 100) / 100 : null
  };
  logger.debug('[R-BATCH] Final result:', result);
  return result;
}

function buildRPerformanceGroups(rows, groupByPosition, breakevenConfig) {
  if (!groupByPosition) {
    return rows.map(row => ({
      id: row.id,
      symbol: row.symbol,
      trade_date: row.trade_date,
      pnl: parseFloat(row.pnl) || 0,
      is_breakeven: row.is_breakeven === true,
      position_legs: [row]
    }));
  }

  const groupsByKey = new Map();
  rows.forEach(row => {
    const groupKey = row.position_group_key || row.id;
    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, {
        id: row.id,
        position_group_key: groupKey,
        symbol: row.position_symbol || row.underlying_symbol || row.symbol,
        trade_date: row.trade_date,
        pnl: 0,
        gross_pnl: 0,
        is_breakeven: false,
        position_legs: []
      });
    }

    const group = groupsByKey.get(groupKey);
    group.pnl += parseFloat(row.pnl) || 0;
    group.gross_pnl +=
      (parseFloat(row.pnl) || 0) +
      (parseFloat(row.commission) || 0) +
      (parseFloat(row.fees) || 0);
    group.position_legs.push(row);
  });

  return Array.from(groupsByKey.values()).map(group => ({
    ...group,
    pnl: Math.round(group.pnl * 100) / 100,
    gross_pnl: Math.round(group.gross_pnl * 100) / 100,
    // Tick mode preserves the historical exact-net grouped rule. Dollar mode
    // applies the configured range to the combined position's gross P&L.
    is_breakeven: breakevenConfig?.mode === 'dollars'
      ? isBreakevenGrossPnl(group.gross_pnl, breakevenConfig)
      : Math.round(group.pnl * 100) / 100 === 0
  }));
}

// pg may return JSONB columns as strings in some setups; normalize the fields
// calculateRMultiples reads. Shared by getRPerformance and the grouped
// individual-analysis path.
function parseTradeJsonFields(row) {
  const trade = { ...row };
  for (const field of ['executions', 'risk_level_history', 'take_profit_targets']) {
    if (typeof trade[field] === 'string') {
      try {
        trade[field] = JSON.parse(trade[field]);
      } catch (_) {
        trade[field] = null;
      }
    }
  }
  return trade;
}

// The position's 1R unit for combined R values. Dollar-mode users (#345) risk
// the fixed dollar amount per position, so combined R stays SUM(pnl)/risk like
// the dashboard aggregate; otherwise 1R is the total planned dollar risk across
// the analyzed legs.
function positionRiskAmount(analyses, dollarRisk) {
  if (dollarRisk && dollarRisk > 0) return dollarRisk;
  return analyses.reduce((sum, a) => sum + (Number(a.risk_amount) || 0), 0);
}

// Combine per-leg R values into one position-level R by converting each leg's R
// back to dollars (leg R x leg risk amount) and dividing by the position's risk
// unit, so the combined R always carries the sign of the combined dollar
// outcome. Summing raw leg Rs instead let a small-risk leg dominate: a losing
// bull put spread whose hedge leg risked a few dollars reported a positive
// combined Actual R next to a negative combined P&L (issue #359 follow-up).
// For dollar-mode users every leg's risk amount IS the position risk unit, so
// this reduces to the plain sum of leg Rs.
function combinePositionR(parts, positionRisk) {
  if (parts.length === 0) return null;
  if (!(positionRisk > 0)) {
    // Degenerate risk data; fall back to the plain sum rather than divide by zero.
    return parts.reduce((sum, part) => sum + part.r, 0);
  }
  const dollars = parts.reduce((sum, part) => sum + part.r * part.risk, 0);
  return dollars / positionRisk;
}

// Structural maximum profit, in dollars, for a defined-risk multi-leg option
// position (issue #359 follow-up). Per-leg take profits on a spread can be
// jointly impossible - the short leg targeting full premium decay and the
// hedge leg targeting a gain cannot both happen - so summing leg targets can
// report a combined target above what the structure can ever pay (a 3-lot
// credit spread with a $240 net credit showed a $1,376 combined target).
//
// The expiry payoff of same-expiration option legs is piecewise linear in the
// underlying price, so its maximum sits at underlying = 0 or at one of the
// strikes; evaluating those points covers verticals, condors, butterflies and
// any other single-expiry combination without naming strategies. Returns null
// (no cap) when the group is not a bounded single-expiry option structure:
// non-option or mixed-expiry legs, missing strike/type/premium data, or a net
// long call count (unbounded upside).
function definedRiskMaxProfit(legs) {
  if (!Array.isArray(legs) || legs.length < 2) return null;

  const parsed = [];
  for (const leg of legs) {
    if (inferInstrumentType(leg) !== 'option') return null;
    const strike = parseFloat(leg.strike_price);
    const entry = parseFloat(leg.entry_price);
    const qty = parseFloat(leg.quantity);
    const optionType = String(leg.option_type || '').toLowerCase();
    if (!(strike > 0) || !(entry >= 0) || !(qty > 0)) return null;
    if (optionType !== 'call' && optionType !== 'put') return null;
    const contractSize = parseFloat(leg.contract_size);
    const multiplier = contractSize > 0 ? contractSize : 100;
    const direction = leg.side === 'short' ? -1 : 1;
    parsed.push({ strike, entry, optionType, units: direction * qty * multiplier });
  }

  // The single-expiry payoff model only holds when every leg expires together.
  const expirationKeys = new Set(legs.map(leg => {
    if (!leg.expiration_date) return null;
    const date = new Date(leg.expiration_date);
    return Number.isNaN(date.getTime()) ? String(leg.expiration_date) : date.toISOString().slice(0, 10);
  }));
  if (expirationKeys.size !== 1 || expirationKeys.has(null)) return null;

  // Net long calls: payoff grows without bound as the underlying rises.
  const upsideSlope = parsed
    .filter(p => p.optionType === 'call')
    .reduce((sum, p) => sum + p.units, 0);
  if (upsideSlope > 0) return null;

  const intrinsic = (p, price) => (p.optionType === 'call'
    ? Math.max(price - p.strike, 0)
    : Math.max(p.strike - price, 0));
  const payoffAt = price => parsed.reduce((sum, p) => sum + (intrinsic(p, price) - p.entry) * p.units, 0);

  const maxProfit = Math.max(...[0, ...parsed.map(p => p.strike)].map(payoffAt));
  return Number.isFinite(maxProfit) && maxProfit > 0 ? maxProfit : null;
}

// Cap a combined target at the structure's maximum profit. Leg target Rs are
// net of commissions, so the R cap is too; the dollar target stays gross like
// the per-leg target_pl_amount values it sums. Returns null when the position
// is not a recognizable defined-risk structure or the target is within bounds.
function targetCapForPosition(legs, positionRisk) {
  const maxProfit = definedRiskMaxProfit(legs);
  if (maxProfit === null) return null;
  const totalCommission = legs.reduce((sum, leg) =>
    sum + Math.abs(parseFloat(leg.commission) || 0) + Math.abs(parseFloat(leg.fees) || 0), 0);
  return {
    maxProfit,
    maxProfitR: positionRisk > 0 ? (maxProfit - totalCommission) / positionRisk : null
  };
}

// Combine per-leg calculateRMultiples results into one position-level analysis
// (issue #359). Actual R and Management R are combined dollar-weighted exactly
// like the R-Performance chart's grouped rows; the combined target follows the
// analysis panel's semantics instead (weighted_target_r ?? target_r, not gated
// on target-hit data, and only when EVERY analyzed leg has a target). Dollar
// amounts are summed; per-share values are meaningless for a multi-leg
// position so they are null.
function combineLegAnalyses(analyzableEntries, allLegs, dollarRisk = null) {
  const totalLegCount = allLegs.length;
  const analyses = analyzableEntries.map(entry => entry.analysis);
  const legRisk = a => Number(a.risk_amount) || 0;
  const positionRisk = positionRiskAmount(analyses, dollarRisk);

  const actualR = roundR(combinePositionR(
    analyses.map(a => ({ r: a.actual_r, risk: legRisk(a) })),
    positionRisk
  ));
  const actualPlAmount = roundR(analyses.reduce((sum, a) => sum + (Number(a.actual_pl_amount) || 0), 0));
  const riskAmount = roundR(positionRisk);

  // A combined target only makes sense when every analyzed leg has one;
  // otherwise "target vs actual" would compare mismatched leg sets.
  const targetParts = analyses.map(a => a.weighted_target_r ?? a.target_r);
  let targetR = targetParts.every(value => value !== null && value !== undefined)
    ? roundR(combinePositionR(
        targetParts.map((value, i) => ({ r: value, risk: legRisk(analyses[i]) })),
        positionRisk
      ))
    : null;

  const targetPlParts = analyses.map(a => a.target_pl_amount);
  let targetPlAmount = targetR !== null && targetPlParts.every(value => value !== null && value !== undefined)
    ? roundR(targetPlParts.reduce((sum, value) => sum + value, 0))
    : null;

  // Defined-risk structures cannot pay more than their max profit, so the
  // combined target is capped there (issue #359 follow-up). Only applied when
  // every leg is in the combined math, so the cap and the summed target cover
  // the same legs.
  let targetCapped = false;
  if (targetR !== null && analyses.length === totalLegCount) {
    const cap = targetCapForPosition(allLegs, positionRisk);
    if (cap !== null) {
      if (cap.maxProfitR !== null && targetR > cap.maxProfitR) {
        targetR = roundR(cap.maxProfitR);
        targetCapped = true;
      }
      if (targetPlAmount !== null && targetPlAmount > cap.maxProfit) {
        targetPlAmount = roundR(cap.maxProfit);
        targetCapped = true;
      }
    }
  }

  const managementParts = analyses
    .filter(a => a.management_r !== null && a.management_r !== undefined)
    .map(a => ({ r: a.management_r, risk: legRisk(a) }));
  const managementR = managementParts.length > 0
    ? roundR(combinePositionR(managementParts, positionRisk))
    : null;

  // planned_r compares like-for-like leg sets: it is only reported when every
  // analyzed leg has its own planned_r, otherwise legs without management data
  // would inflate the "planned" figure.
  const plannedParts = analyses.map(a => a.planned_r);
  const plannedR = plannedParts.every(value => value !== null && value !== undefined)
    ? roundR(combinePositionR(
        plannedParts.map((value, i) => ({ r: value, risk: legRisk(analyses[i]) })),
        positionRisk
      ))
    : null;

  const rLost = targetR !== null ? roundR(targetR - actualR) : null;

  return {
    actual_r: actualR,
    target_r: targetR,
    r_lost: rLost,
    weighted_target_r: null,
    effective_r_lost: rLost,
    management_r: managementR,
    planned_r: plannedR,
    planned_pl_amount: null,
    risk_per_share: null,
    risk_amount: riskAmount,
    actual_pl_per_share: null,
    actual_pl_amount: actualPlAmount,
    target_pl_per_share: null,
    target_pl_amount: targetPlAmount,
    management_score: calculateManagementScore(actualR, targetR ?? undefined, rLost ?? undefined),
    has_stop_loss: true,
    has_take_profit: targetR !== null,
    target_capped_at_max_profit: targetCapped,
    position_grouped: true,
    leg_count: totalLegCount,
    analyzed_leg_count: analyzableEntries.length
  };
}

/**
 * Build the combined analysis response for a multi-leg position (whole-trade
 * grouping, issue #359 follow-up). Legs without a stop loss are listed but
 * excluded from the combined R math, mirroring the R-Performance chart.
 */
async function respondWithGroupedAnalysis(res, { legs, dollarRisk }) {
  const parsedLegs = legs.map(parseTradeJsonFields);

  const legEntries = parsedLegs.map(leg => {
    if (!leg.stop_loss) {
      return { leg, analysis: null, excluded_reason: 'missing_stop_loss' };
    }
    const analysis = calculateRMultiples(leg, { dollarRisk });
    if (analysis.error || analysis.actual_r == null) {
      return { leg, analysis: null, excluded_reason: analysis.error || 'no_r_value' };
    }
    return { leg, analysis, excluded_reason: null };
  });

  const analyzable = legEntries.filter(entry => entry.analysis);
  if (analyzable.length === 0) {
    // Distinguish "no stop losses" from "stop losses set but every leg failed
    // to calculate" so the client can show the real error instead of the
    // set-a-stop-loss flow.
    const calculationError = legEntries
      .map(entry => entry.excluded_reason)
      .find(reason => reason && reason !== 'missing_stop_loss' && reason !== 'no_r_value');
    if (calculationError) {
      return res.status(400).json({
        error: calculationError,
        position_grouped: true,
        leg_count: parsedLegs.length
      });
    }
    return res.status(400).json({
      error: 'Stop loss must be set for R-Multiple analysis',
      needs_stop_loss: true,
      needs_take_profit: parsedLegs.some(leg => !leg.take_profit),
      position_grouped: true,
      leg_count: parsedLegs.length
    });
  }

  const analysis = combineLegAnalyses(analyzable, parsedLegs, dollarRisk);
  const repLeg = analyzable[0].leg;

  // Charts uploaded to any leg belong to the position.
  const chartsResult = await db.query(
    `SELECT id, chart_url, chart_title, uploaded_at
     FROM trade_charts
     WHERE trade_id = ANY($1)
     ORDER BY uploaded_at ASC`,
    [parsedLegs.map(leg => leg.id)]
  );
  const charts = chartsResult.rows.map(chart => ({
    id: chart.id,
    chartUrl: chart.chart_url,
    chartTitle: chart.chart_title,
    uploadedAt: chart.uploaded_at
  }));

  // entry_time/exit_time come back from pg as Date objects; sort numerically,
  // not lexicographically.
  const byTime = (a, b) => new Date(a) - new Date(b);
  const entryTimes = parsedLegs.map(leg => leg.entry_time).filter(Boolean).sort(byTime);
  const exitTimes = parsedLegs.map(leg => leg.exit_time).filter(Boolean).sort(byTime);
  const totalPnl = roundR(parsedLegs.reduce((sum, leg) => sum + (parseFloat(leg.pnl) || 0), 0));
  const totalQuantity = roundR(parsedLegs.reduce((sum, leg) => sum + (parseFloat(leg.quantity) || 0), 0));

  res.json({
    trade: {
      // The representative leg's id keeps selection, URL deep-links, and the
      // grouped selector row (whose id is also the representative leg) aligned.
      id: repLeg.id,
      symbol: repLeg.position_symbol || repLeg.symbol,
      trade_date: parsedLegs.map(leg => leg.trade_date).filter(Boolean).sort()[0] || repLeg.trade_date,
      side: repLeg.side,
      quantity: totalQuantity,
      // Per-share levels do not exist for a combined position; the frontend
      // renders per-leg values from `legs` instead. stop_loss carries the
      // representative leg's value so the client knows analysis is possible.
      entry_price: null,
      exit_price: null,
      stop_loss: repLeg.stop_loss,
      take_profit: null,
      take_profit_targets: null,
      pnl: totalPnl,
      pnl_percent: null,
      entry_time: entryTimes[0] || null,
      exit_time: exitTimes[exitTimes.length - 1] || null,
      instrument_type: repLeg.instrument_type,
      charts,
      manual_target_hit_first: null,
      target_hit_analysis: null,
      position_grouped: true,
      leg_count: parsedLegs.length,
      legs: legEntries.map(({ leg, analysis: legAnalysis, excluded_reason }) => ({
        id: leg.id,
        symbol: leg.symbol,
        side: leg.side,
        quantity: leg.quantity,
        entry_price: leg.entry_price,
        exit_price: leg.exit_price,
        stop_loss: leg.stop_loss,
        take_profit: leg.take_profit,
        pnl: leg.pnl,
        entry_time: leg.entry_time,
        exit_time: leg.exit_time,
        instrument_type: leg.instrument_type,
        actual_r: legAnalysis ? legAnalysis.actual_r : null,
        target_r: legAnalysis ? (legAnalysis.weighted_target_r ?? legAnalysis.target_r) : null,
        management_r: legAnalysis ? legAnalysis.management_r : null,
        included_in_analysis: !!legAnalysis,
        excluded_reason
      }))
    },
    analysis
  });
}

const tradeManagementController = {
  /**
   * Get trades for selection with filters
   */
  async getTradesForSelection(req, res) {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      // Same Performance-page filter set as the R-Performance chart (issue #351).
      const filterSpec = parseTradeManagementFilters(req.query);

      logger.info('[TRADE-MGMT] getTradesForSelection called', { userId, filters: filterSpec, limit, offset });

      // Shared WHERE clause so the selector list, its trade numbering, and the
      // R-Performance chart all reflect the same filtered set. Whole-trade
      // grouping (issue #359 follow-up): when enabled, the selector collapses
      // multi-leg positions into one selectable row, matching the
      // R-Performance chart's grouped rows.
      const [{ whereClause, values, paramCount }, { groupByPosition }] = await Promise.all([
        TradeQueries._buildWhereClause(userId, filterSpec),
        getTradeManagementPreferences(userId)
      ]);

      if (groupByPosition) {
        // One row per position group. The representative leg (rep_id) is the
        // earliest stop-loss-bearing leg so the row exposes a usable stop_loss,
        // and trade_number ranks groups by their first stop-loss leg in
        // chronological order — the same order getRPerformance numbers its
        // grouped chart rows.
        const groupedQuery = `
          WITH base AS (
            SELECT
              t.id, t.symbol, t.trade_date, t.entry_time, t.exit_time, t.entry_price, t.exit_price,
              t.quantity, t.side, t.pnl, t.pnl_percent,
              t.stop_loss, t.take_profit, t.r_value,
              t.strategy, t.broker, t.instrument_type,
              t.manual_target_hit_first, t.target_hit_analysis,
              ${POSITION_GROUP_KEY} AS position_group_key,
              COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol) AS position_symbol
            FROM trades t
            ${whereClause}
              AND t.exit_price IS NOT NULL
          ),
          grouped AS (
            SELECT
              position_group_key,
              COUNT(*)::int AS leg_count,
              (ARRAY_AGG(id ORDER BY (stop_loss IS NULL) ASC, entry_time ASC NULLS LAST, id ASC))[1] AS rep_id,
              ARRAY_AGG(id ORDER BY entry_time ASC NULLS LAST, id ASC) AS trade_ids,
              MIN(trade_date) AS trade_date,
              MIN(entry_time) AS entry_time,
              MAX(exit_time) AS exit_time,
              SUM(pnl) AS pnl,
              SUM(quantity) AS quantity,
              BOOL_OR(stop_loss IS NOT NULL) AS has_any_stop_loss,
              BOOL_OR(stop_loss IS NULL) AS has_missing_stop_loss,
              BOOL_OR(stop_loss IS NOT NULL AND take_profit IS NULL) AS has_missing_take_profit,
              BOOL_OR(manual_target_hit_first IS NOT NULL OR target_hit_analysis IS NOT NULL) AS has_target_hit_data,
              (ARRAY_AGG(trade_date ORDER BY trade_date ASC, id ASC) FILTER (WHERE stop_loss IS NOT NULL))[1] AS first_sl_trade_date,
              (ARRAY_AGG(id ORDER BY trade_date ASC, id ASC) FILTER (WHERE stop_loss IS NOT NULL))[1] AS first_sl_id
            FROM base
            GROUP BY position_group_key
          ),
          numbered AS (
            SELECT position_group_key,
              ROW_NUMBER() OVER (ORDER BY first_sl_trade_date ASC, first_sl_id ASC) AS trade_number
            FROM grouped
            WHERE has_any_stop_loss
          )
          SELECT
            g.rep_id AS id,
            b.position_symbol AS symbol,
            g.trade_date, g.entry_time, g.exit_time,
            b.entry_price, b.exit_price,
            g.quantity, b.side, g.pnl,
            CASE WHEN g.leg_count = 1 THEN b.pnl_percent ELSE NULL END AS pnl_percent,
            b.stop_loss, b.take_profit, b.r_value,
            b.strategy, b.broker, b.instrument_type,
            b.manual_target_hit_first, b.target_hit_analysis,
            g.leg_count, g.trade_ids,
            g.has_any_stop_loss, g.has_missing_stop_loss,
            g.has_missing_take_profit, g.has_target_hit_data,
            n.trade_number
          FROM grouped g
          JOIN base b ON b.id = g.rep_id
          LEFT JOIN numbered n ON n.position_group_key = g.position_group_key
          ORDER BY g.trade_date DESC, g.entry_time DESC NULLS LAST
          LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        const groupedCountQuery = `
          SELECT COUNT(DISTINCT ${POSITION_GROUP_KEY}) as total
          FROM trades t
          ${whereClause}
            AND t.exit_price IS NOT NULL
        `;
        const groupedValues = [...values, limit, offset];
        const [groupedResult, countResult] = await Promise.all([
          db.query(groupedQuery, groupedValues),
          db.query(groupedCountQuery, values)
        ]);
        logger.info('[TRADE-MGMT] Grouped query returned', groupedResult.rows.length, 'positions');

        const trades = groupedResult.rows.map(row => ({
          ...row,
          position_grouped: row.leg_count > 1,
          needs_stop_loss: !row.has_any_stop_loss,
          // The combined analysis only reports a target when every analyzed
          // leg has one, so the badge reflects any stop-loss leg missing a TP.
          needs_take_profit: !!row.has_missing_take_profit,
          can_analyze: !!row.has_any_stop_loss,
          has_target_hit_data: !!row.has_target_hit_data
        }));

        const total = parseInt(countResult.rows[0].total);

        return res.json({
          trades,
          position_grouping: true,
          pagination: {
            total,
            limit,
            offset,
            has_more: offset + trades.length < total
          }
        });
      }

      // numbered_trades numbers the SAME filtered set the R-Performance chart
      // uses (closed trades with a stop loss, chronological) so trade_number
      // matches the chart. The outer query shows all closed trades so users can
      // still add stop losses to trades that lack them.
      const query = `
        WITH numbered_trades AS (
          SELECT
            id,
            ROW_NUMBER() OVER (ORDER BY trade_date ASC, id ASC) as trade_number
          FROM trades t
          ${whereClause}
            AND t.exit_price IS NOT NULL
            AND t.stop_loss IS NOT NULL
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
        ${whereClause}
          AND t.exit_price IS NOT NULL
        ORDER BY t.trade_date DESC, t.entry_time DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;
      const queryValues = [...values, limit, offset];

      const result = await db.query(query, queryValues);
      logger.info('[TRADE-MGMT] Query returned', result.rows.length, 'trades');

      // Add flags for missing data
      const trades = result.rows.map(trade => ({
        ...trade,
        needs_stop_loss: !trade.stop_loss,
        needs_take_profit: !trade.take_profit,
        can_analyze: !!trade.stop_loss,
        has_target_hit_data: !!trade.manual_target_hit_first || !!trade.target_hit_analysis
      }));

      // Get total count for pagination (reuses the same WHERE clause + values)
      const countQuery = `
        SELECT COUNT(*) as total
        FROM trades t
        ${whereClause}
          AND t.exit_price IS NOT NULL
      `;
      const countResult = await db.query(countQuery, values);
      const total = parseInt(countResult.rows[0].total);

      res.json({
        trades,
        position_grouping: false,
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + trades.length < total
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

      const [{ groupByPosition, dollarRisk: userDollarRisk }, result] = await Promise.all([
        getTradeManagementPreferences(userId),
        db.query(`SELECT * FROM trades WHERE id = $1 AND user_id = $2`, [tradeId, userId])
      ]);

      if (result.rows.length === 0) {
        logger.debug('[R-ANALYSIS] Trade not found');
        return res.status(404).json({ error: 'Trade not found' });
      }

      const trade = result.rows[0];

      // Whole-trade grouping (issue #359 follow-up): analyze the full multi-leg
      // position the selected trade belongs to. Legs are matched on the indexed
      // components of POSITION_GROUP_KEY (persisted group id, else
      // account + underlying + entry_time) rather than the computed expression,
      // and are scoped by the same request filters the trade selector used so
      // the analyzed leg set matches the selected row.
      if (groupByPosition && trade.exit_price) {
        let groupCondition = null;
        const groupParams = [];
        if (trade.position_group_id) {
          groupCondition = (idx) => `t.position_group_id = $${idx}`;
          groupParams.push(trade.position_group_id);
        } else if (trade.entry_time) {
          // Mirrors POSITION_GROUP_KEY's fallback key. A trade with no group id
          // and no entry_time keys on its own id and can never have siblings.
          groupCondition = (idx) => `t.position_group_id IS NULL
             AND COALESCE(t.account_identifier, '') = $${idx}
             AND COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol) = $${idx + 1}
             AND t.entry_time = $${idx + 2}`;
          groupParams.push(
            trade.account_identifier || '',
            trade.underlying_symbol || trade.symbol,
            trade.entry_time
          );
        }

        if (groupCondition) {
          const filterSpec = parseTradeManagementFilters(req.query);
          const { whereClause, values, paramCount } = await TradeQueries._buildWhereClause(userId, filterSpec);
          const legsResult = await db.query(
            `SELECT t.*, COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol) AS position_symbol
             FROM trades t
             ${whereClause}
               AND t.exit_price IS NOT NULL
               AND ${groupCondition(paramCount)}
             ORDER BY t.entry_time ASC NULLS LAST, t.id ASC`,
            [...values, ...groupParams]
          );

          if (legsResult.rows.length > 1) {
            return await respondWithGroupedAnalysis(res, {
              legs: legsResult.rows,
              dollarRisk: userDollarRisk
            });
          }
        }
      }
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
      const analysis = calculateRMultiples(trade, { dollarRisk: userDollarRisk });
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

      // Calculate remaining shares for SL move tracking
      // Remaining shares = total quantity - shares already exited at hit targets
      const calculateRemainingShares = () => {
        const totalQty = parseFloat(trade.quantity) || 1;
        let exitedShares = 0;

        // Check take_profit_targets for hit targets
        if (trade.take_profit_targets && Array.isArray(trade.take_profit_targets)) {
          for (const target of trade.take_profit_targets) {
            if (target.status === 'hit' && (target.shares || target.quantity)) {
              exitedShares += parseFloat(target.shares || target.quantity) || 0;
            }
          }
        }

        // Also check TP1 (take_profit field) - if it has been hit, subtract its shares
        // TP1 shares = total - sum of target array shares
        if (trade.take_profit_targets && Array.isArray(trade.take_profit_targets)) {
          const specifiedShares = trade.take_profit_targets.reduce(
            (sum, t) => sum + (parseFloat(t.shares || t.quantity) || 0), 0
          );
          // If we have a take_profit and some targets have been hit, check if TP1 was likely hit first
          // For now, assume TP1 shares are the remaining after target array shares
          // This is tracked via remaining_shares in the frontend/history
        }

        const remaining = Math.max(0, totalQty - exitedShares);
        logger.debug('[REMAINING-SHARES] Calculated:', { totalQty, exitedShares, remaining });
        return remaining;
      };

      // Compare as floats to avoid type coercion issues (string "6909" vs number 6909.000000)
      const stopLossChanged = stop_loss !== undefined &&
        (stop_loss === null) !== (trade.stop_loss === null) ||
        (stop_loss !== null && trade.stop_loss !== null &&
         Math.abs(parseFloat(stop_loss) - parseFloat(trade.stop_loss)) > 0.0001);

      if (stopLossChanged) {
        const remainingShares = calculateRemainingShares();
        historyEntries.push(
          TargetHitAnalysisService.createHistoryEntry(
            trade,
            'stop_loss',
            trade.stop_loss ? parseFloat(trade.stop_loss) : null,
            stop_loss !== null ? parseFloat(stop_loss) : null,
            adjustment_reason,
            { remaining_shares: remainingShares }
          )
        );
      }

      // Compare as floats to avoid type coercion issues
      const takeProfitChanged = take_profit !== undefined &&
        (take_profit === null) !== (trade.take_profit === null) ||
        (take_profit !== null && trade.take_profit !== null &&
         Math.abs(parseFloat(take_profit) - parseFloat(trade.take_profit)) > 0.0001);

      if (takeProfitChanged) {
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
          updatedTrade.side,
          {
            quantity: updatedTrade.quantity,
            commission: updatedTrade.commission,
            fees: updatedTrade.fees,
            instrumentType: updatedTrade.instrument_type || 'stock',
            contractSize: updatedTrade.contract_size,
            pointValue: updatedTrade.point_value,
            symbol: updatedTrade.symbol,
            underlyingAsset: updatedTrade.underlying_asset
          }
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
      const dollarRisk = await getUserDollarRisk(userId);
      const managementR = TargetHitAnalysisService.calculateManagementR(updatedTrade, { dollarRisk });
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
      const limit = parseInt(req.query.limit) || 2000;
      // Full Performance-page filter set, applied via the shared WHERE builder so
      // statistics stay consistent with the rest of the app (issue #351).
      const filterSpec = parseTradeManagementFilters(req.query);

      logger.info('[TRADE-MGMT] getRPerformance called', { userId, filters: filterSpec, limit });

      // Get trades with stop_loss set (required for R calculation)
      // Fetch executions so Management R and execution-based logic match getRMultipleAnalysis
      // Include commission, fees, and instrument fields for commission-adjusted R calculations
      const { whereClause, values, paramCount } = await TradeQueries._buildWhereClause(userId, filterSpec);

      // Classify break-even with the SAME tolerance-aware predicate the dashboard
      // analytics use (gross P&L within the user's configured tolerance),
      // not the naive actual_r == 0. Otherwise a small win inside the tolerance
      // band counts as a win here but as break-even on the dashboard, so the W/L/BE
      // splits disagree for the same filtered trades (issue #351).
      const breakevenConfig = await getBreakevenToleranceConfig(userId);
      const be = breakevenPredicate({
        gross: '(COALESCE(pnl, 0) + COALESCE(commission, 0) + COALESCE(fees, 0))',
        tickSize: 'tick_size',
        pointValue: 'point_value',
        quantity: 'quantity',
        underlying: 'underlying_asset'
      }, breakevenConfig);

      const { groupByPosition, dollarRisk } = await getTradeManagementPreferences(userId);
      const positionGroupingSelect = groupByPosition
        ? `,
          ${POSITION_GROUP_KEY} AS position_group_key,
          COALESCE(NULLIF(underlying_symbol, ''), symbol) AS position_symbol`
        : '';

      const query = `
        SELECT
          id, symbol, trade_date, entry_price, exit_price,
          quantity, side, pnl, stop_loss, take_profit, r_value,
          take_profit_targets, management_r, risk_level_history,
          manual_target_hit_first, executions,
          commission, fees, instrument_type, contract_size, point_value,
          underlying_asset, underlying_symbol,
          strike_price, option_type, expiration_date,
          (${be.is}) AS is_breakeven
          ${positionGroupingSelect}
        FROM trades t
        ${whereClause}
          AND t.exit_price IS NOT NULL
          AND t.stop_loss IS NOT NULL
        ORDER BY t.trade_date ASC, t.id ASC
        LIMIT $${paramCount}
      `;
      values.push(limit);

      const result = await db.query(query, values);
      logger.info('[TRADE-MGMT] Found', result.rows.length, 'trades with stop_loss for R analysis');

      // Use same calculation as R-Multiple Analysis (calculateRMultiples) so chart matches panel
      let cumulativeActualR = 0;
      let cumulativePotentialR = 0;
      let cumulativeManagementR = 0;
      // Actual R summed over ONLY the trades that have a target, so
      // "R left on the table" compares like-for-like (potential vs actual on
      // the same trade set). Subtracting all-trades actual R would skew the
      // metric toward the negative of actual R when few trades have targets.
      let actualRForTargetTrades = 0;
      let tradesWithTarget = 0;
      let tradesWithManagementR = 0;

      const chartData = [];
      const tradeDetails = [];

      const performanceRows = buildRPerformanceGroups(
        result.rows.map(parseTradeJsonFields),
        groupByPosition,
        breakevenConfig
      );

      performanceRows.forEach((performanceTrade) => {
        const legResults = [];
        performanceTrade.position_legs.forEach((trade) => {
          const analysis = calculateRMultiples(trade, { dollarRisk });

          if (analysis.error) {
            logger.debug('[TRADE-MGMT] Skipping trade leg for R performance (calculation error):', trade.id, analysis.error);
            return;
          }

          if (analysis.actual_r == null) return;
          legResults.push({ trade, analysis });
        });

        if (legResults.length === 0) return;

        // Multi-leg positions combine dollar-weighted (leg R x leg risk over the
        // position risk unit) so the position's R carries the sign of its net
        // P&L; see combinePositionR. Single-leg rows are unchanged by this.
        const legRisk = ({ analysis }) => Number(analysis.risk_amount) || 0;
        const positionRisk = positionRiskAmount(legResults.map(({ analysis }) => analysis), dollarRisk);

        const actualR = roundR(combinePositionR(
          legResults.map(entry => ({ r: entry.analysis.actual_r, risk: legRisk(entry) })),
          positionRisk
        ));

        cumulativeActualR += actualR;

        // Target R follows the reconstructed planned path when target-hit data exists.
        const targetParts = legResults
          .map(entry => {
            const { trade, analysis } = entry;
            const effectiveTargetR = analysis.planned_r ?? analysis.weighted_target_r ?? analysis.target_r;
            return trade.manual_target_hit_first && effectiveTargetR != null
              ? { r: effectiveTargetR, risk: legRisk(entry) }
              : null;
          })
          .filter(Boolean);

        let tradeTargetR = null;
        if (targetParts.length > 0) {
          tradeTargetR = roundR(combinePositionR(targetParts, positionRisk));
          // Same defined-risk max-profit cap as the Individual Trade Analysis,
          // applied when every leg contributed to the planned path so the cap
          // and the target cover the same legs (issue #359 follow-up).
          if (targetParts.length === performanceTrade.position_legs.length &&
              performanceTrade.position_legs.length > 1) {
            const cap = targetCapForPosition(performanceTrade.position_legs, positionRisk);
            if (cap !== null && cap.maxProfitR !== null && tradeTargetR > cap.maxProfitR) {
              tradeTargetR = roundR(cap.maxProfitR);
            }
          }
          tradesWithTarget++;
        }

        if (tradeTargetR !== null) {
          cumulativePotentialR += tradeTargetR;
          actualRForTargetTrades += actualR;
        }

        const managementParts = legResults
          .filter(({ analysis }) => analysis.management_r !== null && analysis.management_r !== undefined)
          .map(entry => ({ r: entry.analysis.management_r, risk: legRisk(entry) }));
        const tradeManagementR = managementParts.length > 0
          ? roundR(combinePositionR(managementParts, positionRisk))
          : 0;
        if (managementParts.length > 0) tradesWithManagementR++;
        cumulativeManagementR += tradeManagementR;

        chartData.push({
          trade_number: chartData.length + 1,
          trade_id: performanceTrade.id,
          trade_ids: performanceTrade.position_legs.map(leg => leg.id),
          symbol: performanceTrade.symbol,
          trade_date: performanceTrade.trade_date,
          actual_r: actualR,
          target_r: tradeTargetR,
          weighted_target_r: tradeTargetR,
          management_r: tradeManagementR,
          cumulative_actual_r: Math.round(cumulativeActualR * 100) / 100,
          cumulative_potential_r: Math.round(cumulativePotentialR * 100) / 100,
          cumulative_management_r: Math.round(cumulativeManagementR * 100) / 100,
          has_multiple_targets: performanceTrade.position_legs.some(leg => leg.take_profit_targets && leg.take_profit_targets.length > 0),
          has_adjustments: performanceTrade.position_legs.some(leg => leg.risk_level_history && leg.risk_level_history.length > 0),
          target_hit_first: performanceTrade.position_legs.find(leg => leg.manual_target_hit_first)?.manual_target_hit_first || null,
          position_grouped: groupByPosition && performanceTrade.position_legs.length > 1,
          leg_count: performanceTrade.position_legs.length
        });

        tradeDetails.push({
          id: performanceTrade.id,
          symbol: performanceTrade.symbol,
          trade_date: performanceTrade.trade_date,
          side: performanceTrade.position_legs[0]?.side,
          pnl: performanceTrade.pnl,
          is_breakeven: performanceTrade.is_breakeven === true,
          actual_r: actualR,
          target_r: tradeTargetR,
          management_r: tradeManagementR !== 0 ? tradeManagementR : null
        });
      });

      // Calculate summary statistics
      const totalTrades = chartData.length;
      const totalActualR = Math.round(cumulativeActualR * 100) / 100;
      const totalPotentialR = Math.round(cumulativePotentialR * 100) / 100;
      const totalManagementR = Math.round(cumulativeManagementR * 100) / 100;
      // Only meaningful for trades with a defined target; compared against the
      // actual R of those same trades (not all stop-defined trades).
      const rLeftOnTable = Math.round((totalPotentialR - actualRForTargetTrades) * 100) / 100;
      // Calculate win rate and average R. Wins/losses are decided by NET P&L
      // among the non-break-even trades, and break-even uses the dashboard's
      // tolerance-aware predicate (is_breakeven), so the W/L/BE split matches the
      // dashboard for the same filtered trades and still reconciles with
      // total_trades (issue #351). A small win inside the user's break-even
      // tolerance is classified BE here too, not as a +R win.
      const winningTrades = tradeDetails.filter(t => !t.is_breakeven && Number(t.pnl) > 0);
      const losingTrades = tradeDetails.filter(t => !t.is_breakeven && Number(t.pnl) < 0);
      const breakEvenTrades = totalTrades - winningTrades.length - losingTrades.length;
      const winRate = totalTrades > 0 ? Math.round((winningTrades.length / totalTrades) * 100) : 0;
      // Win rate among decisive (non-break-even) trades only, matching the
      // dashboard's "excl. BE" stat (issue #351 follow-up).
      const decisiveTrades = winningTrades.length + losingTrades.length;
      const winRateExcludingBreakeven = decisiveTrades > 0
        ? Math.round((winningTrades.length / decisiveTrades) * 100)
        : 0;
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
          r_left_on_table: rLeftOnTable,
          win_rate: winRate,
          win_rate_excluding_breakeven: winRateExcludingBreakeven,
          winning_trades: winningTrades.length,
          losing_trades: losingTrades.length,
          break_even_trades: breakEvenTrades,
          avg_win_r: avgWinR,
          avg_loss_r: avgLossR,
          avg_management_r: avgManagementR,
          position_grouping: groupByPosition
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
      const { manual_target_hit_first, target_statuses } = req.body;

      logger.debug('[MANUAL-TARGET] ========================================');
      logger.debug('[MANUAL-TARGET] setManualTargetHitFirst called:', {
        userId,
        tradeId,
        manual_target_hit_first,
        target_statuses: target_statuses ? JSON.stringify(target_statuses) : null,
        bodyKeys: Object.keys(req.body || {})
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

      // Apply target_statuses to take_profit_targets if provided
      let updatedTargets = trade.take_profit_targets;
      if (Array.isArray(target_statuses) && Array.isArray(trade.take_profit_targets)) {
        updatedTargets = trade.take_profit_targets.map((t, idx) => {
          const statusEntry = target_statuses.find(s => s.index === idx);
          if (statusEntry) {
            return { ...t, status: statusEntry.status };
          }
          return t;
        });
        logger.debug('[MANUAL-TARGET] Updated target statuses:', JSON.stringify(updatedTargets));
      }

      // Recalculate management_r with the new manual_target_hit_first value
      let newManagementR = null;
      let rValues = null;
      if (trade.stop_loss && trade.exit_price) {
        // Create a trade object with the new manual_target_hit_first for recalculation
        const tradeForCalc = {
          ...trade,
          manual_target_hit_first: manual_target_hit_first,
          take_profit_targets: updatedTargets
        };
        const dollarRisk = await getUserDollarRisk(userId);
        rValues = calculateRMultiples(tradeForCalc, { dollarRisk });
        if (rValues && !rValues.error) {
          newManagementR = rValues.management_r;
          logger.debug('[MANUAL-TARGET] Recalculated management_r:', newManagementR);
        }
      }

      // Update the trade with manual_target_hit_first, target statuses, and recalculated management_r
      let updateQuery;
      let updateValues;

      logger.debug('[MANUAL-TARGET] Preparing update query...');
      if (manual_target_hit_first !== null) {
        // Setting a manual value - also clear automated analysis and update management_r
        logger.debug('[MANUAL-TARGET] Setting manual value, clearing automated analysis, and updating management_r');
        updateQuery = `
          UPDATE trades
          SET manual_target_hit_first = $1, target_hit_analysis = NULL, management_r = $2,
              take_profit_targets = $3, updated_at = NOW()
          WHERE id = $4 AND user_id = $5
          RETURNING id, manual_target_hit_first, target_hit_analysis, management_r, take_profit_targets
        `;
        updateValues = [manual_target_hit_first, newManagementR, JSON.stringify(updatedTargets), tradeId, userId];
      } else {
        // Clearing manual value - also reset target statuses to pending
        logger.debug('[MANUAL-TARGET] Clearing manual value and recalculating management_r');
        let clearedTargets = updatedTargets;
        if (Array.isArray(clearedTargets)) {
          clearedTargets = clearedTargets.map(t => ({ ...t, status: 'pending' }));
        }
        updateQuery = `
          UPDATE trades
          SET manual_target_hit_first = NULL, management_r = $1,
              take_profit_targets = $2, updated_at = NOW()
          WHERE id = $3 AND user_id = $4
          RETURNING id, manual_target_hit_first, target_hit_analysis, management_r, take_profit_targets
        `;
        updateValues = [newManagementR, JSON.stringify(clearedTargets), tradeId, userId];
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
        management_r: updatedTrade.management_r,
        take_profit_targets: updatedTrade.take_profit_targets,
        analysis: rValues && !rValues.error ? rValues : null
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
