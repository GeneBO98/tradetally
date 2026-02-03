/**
 * Target Hit Analysis Service
 * Analyzes OHLCV data to determine which target (stop loss or take profit) was crossed first
 */

const ChartService = require('./chartService');
const logger = require('../utils/logger');

class TargetHitAnalysisService {
  /**
   * Analyze OHLCV data to determine which target (SL or TP) was crossed first
   * @param {Object} trade - Trade object with entry_time, exit_time, side, stop_loss, take_profit, take_profit_targets
   * @param {string} userId - User ID for tier-based chart service
   * @returns {Object} Analysis result with first target hit information
   */
  static async analyzeTargetHitOrder(trade, userId) {
    try {
      const {
        symbol,
        entry_time,
        exit_time,
        side,
        stop_loss,
        take_profit,
        take_profit_targets
      } = trade;

      // Validate required fields
      if (!stop_loss) {
        return {
          success: false,
          error: 'Stop loss is required for target hit analysis'
        };
      }

      if (!entry_time) {
        return {
          success: false,
          error: 'Entry time is required for target hit analysis'
        };
      }

      // Get chart data for the trade period
      // For futures contracts, we need to use a futures-specific data provider
      // Since chart data may not be available for futures, we'll rely on exit price fallback
      let chartData;
      const instrumentType = trade.instrument_type || 'stock';
      
      if (instrumentType === 'future') {
        logger.info(`[TARGET-HIT] Futures contract detected (${symbol}), chart data may not be available. Will use exit price fallback if needed.`);
        // Try to get chart data, but don't fail if unavailable - we'll use exit price fallback
        try {
          chartData = await ChartService.getTradeChartData(userId, symbol, entry_time, exit_time);
        } catch (error) {
          logger.warn(`[TARGET-HIT] Chart data unavailable for futures contract ${symbol}: ${error.message}. Will use exit price analysis.`);
          // For futures, if chart data is unavailable, we'll proceed with exit price analysis
          chartData = null;
        }
      } else {
        try {
          chartData = await ChartService.getTradeChartData(userId, symbol, entry_time, exit_time);
        } catch (error) {
          logger.warn(`[TARGET-HIT] Failed to get chart data for ${symbol}: ${error.message}`);
          return {
            success: false,
            error: `Unable to fetch chart data: ${error.message}`,
            data_unavailable: true
          };
        }
      }

      // Build list of take profit targets
      const takeProfitTargets = this.buildTakeProfitTargetsList(take_profit, take_profit_targets);

      // For futures or when chart data is unavailable, use exit price analysis directly
      if (!chartData || !chartData.candles || chartData.candles.length === 0) {
        if (instrumentType === 'future' || !trade.exit_price) {
          // For futures without chart data, or if no exit price, use exit price analysis
          logger.info(`[TARGET-HIT] No candle data available for ${symbol} (${instrumentType}). Using exit price analysis.`);
          
          if (!trade.exit_price) {
            return {
              success: false,
              error: 'Exit price is required for futures target hit analysis when chart data is unavailable',
              data_unavailable: true
            };
          }

          // Use exit price to determine which target was hit
          const exitPrice = parseFloat(trade.exit_price);
          const entryPrice = trade.entry_price ? parseFloat(trade.entry_price) : null;
          const exitPriceBasedHit = this.determineHitFromExitPrice(
            exitPrice,
            parseFloat(stop_loss),
            takeProfitTargets,
            side === 'long',
            entryPrice
          );

          if (!exitPriceBasedHit) {
            return {
              success: false,
              error: 'Unable to determine which target was hit from exit price',
              data_unavailable: true
            };
          }

          // Build result based on exit price analysis
          const crossings = {
            stop_loss: exitPriceBasedHit.type === 'stop_loss' ? {
              time: exit_time || new Date().toISOString(),
              price: exitPrice,
              candle: null
            } : null,
            take_profits: exitPriceBasedHit.type === 'take_profit' ? {
              [exitPriceBasedHit.targetId]: {
                time: exit_time || new Date().toISOString(),
                price: exitPrice,
                target: exitPriceBasedHit.target,
                candle: null
              }
            } : {}
          };

          const result = this.determineFirstHit(crossings, parseFloat(stop_loss), takeProfitTargets);
          
          // Mark that we used exit price analysis
          result.used_exit_price_analysis = true;
          
          // Update conclusion to reflect that we used exit price analysis
          result.conclusion = this.generateConclusion(
            { type: result.first_target_hit, label: result.first_target_label, time: result.first_hit_time },
            crossings,
            parseFloat(stop_loss),
            takeProfitTargets,
            true
          );
          
          return {
            success: true,
            trade_id: trade.id,
            symbol,
            analysis_result: result,
            candle_data_used: {
              source: 'exit_price_analysis',
              resolution: 'N/A',
              candle_count: 0,
              note: 'Chart data unavailable - analysis based on exit price'
            },
            analyzed_at: new Date().toISOString()
          };
        }

        // For non-futures, require candle data
        return {
          success: false,
          error: 'No candle data available for analysis',
          data_unavailable: true
        };
      }

      // Analyze the candles
      const analysis = this.analyzeCandles({
        candles: chartData.candles,
        entryTime: new Date(entry_time),
        exitTime: exit_time ? new Date(exit_time) : null,
        stopLoss: parseFloat(stop_loss),
        takeProfitTargets,
        isLong: side === 'long',
        exitPrice: trade.exit_price ? parseFloat(trade.exit_price) : null,
        entryPrice: trade.entry_price ? parseFloat(trade.entry_price) : null
      });

      return {
        success: true,
        trade_id: trade.id,
        symbol,
        analysis_result: analysis,
        candle_data_used: {
          source: chartData.source || 'unknown',
          resolution: chartData.resolution || '5min',
          candle_count: chartData.candles.length
        },
        analyzed_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error('[TARGET-HIT] Error analyzing target hit order:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build a normalized list of take profit targets
   * Handles both single take_profit value and multiple take_profit_targets array
   */
  static buildTakeProfitTargetsList(takeProfit, takeProfitTargets) {
    const targets = [];

    // Add targets from take_profit_targets array if present
    if (takeProfitTargets && Array.isArray(takeProfitTargets) && takeProfitTargets.length > 0) {
      takeProfitTargets.forEach((target, index) => {
        targets.push({
          id: target.id || `tp_${index + 1}`,
          price: parseFloat(target.price),
          quantity: target.quantity || null,
          order: target.order || index + 1,
          label: `TP${target.order || index + 1}`
        });
      });
    }
    // Fall back to single take_profit value
    else if (takeProfit) {
      targets.push({
        id: 'tp_1',
        price: parseFloat(takeProfit),
        quantity: null,
        order: 1,
        label: 'TP1'
      });
    }

    return targets;
  }

  /**
   * Analyze candles to find first target crossing
   */
  static analyzeCandles({ candles, entryTime, exitTime, stopLoss, takeProfitTargets, isLong, exitPrice = null, entryPrice = null }) {
    const crossings = {
      stop_loss: null,
      take_profits: {}
    };

    // Sort candles by time
    const sortedCandles = [...candles].sort((a, b) => {
      const timeA = typeof a.time === 'number' ? a.time : new Date(a.time).getTime() / 1000;
      const timeB = typeof b.time === 'number' ? b.time : new Date(b.time).getTime() / 1000;
      return timeA - timeB;
    });

    for (const candle of sortedCandles) {
      const candleTime = typeof candle.time === 'number'
        ? new Date(candle.time * 1000)
        : new Date(candle.time);

      // Skip candles before entry
      if (candleTime < entryTime) continue;

      // Skip candles after exit (if exit time is known)
      if (exitTime && candleTime > exitTime) break;

      const high = parseFloat(candle.high);
      const low = parseFloat(candle.low);

      // Check stop loss crossing
      if (!crossings.stop_loss) {
        const slCrossed = isLong
          ? low <= stopLoss  // Long: price falls to SL
          : high >= stopLoss; // Short: price rises to SL

        if (slCrossed) {
          crossings.stop_loss = {
            time: candleTime.toISOString(),
            candle_time: candle.time,
            price: isLong ? low : high,
            candle: {
              time: candle.time,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close
            }
          };
        }
      }

      // Check each take profit target
      for (const target of takeProfitTargets) {
        if (!crossings.take_profits[target.id]) {
          const tpCrossed = isLong
            ? high >= target.price  // Long: price rises to TP
            : low <= target.price;  // Short: price falls to TP

          if (tpCrossed) {
            crossings.take_profits[target.id] = {
              time: candleTime.toISOString(),
              candle_time: candle.time,
              price: isLong ? high : low,
              target,
              candle: {
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close
              }
            };
          }
        }
      }
    }

    // Determine which was hit first
    // If no crossings were detected in candle data, check exit price as fallback
    // This handles cases where candle resolution is too coarse or exit happened exactly at a target
    if (crossings.stop_loss === null && Object.keys(crossings.take_profits).every(id => !crossings.take_profits[id])) {
      if (exitPrice !== null) {
        logger.debug('[TARGET-HIT] No crossings detected in candles, checking exit price as fallback:', { exitPrice, stopLoss, takeProfitTargets, entryPrice });
        const exitPriceBasedHit = this.determineHitFromExitPrice(exitPrice, stopLoss, takeProfitTargets, isLong, entryPrice);
        if (exitPriceBasedHit) {
          logger.info('[TARGET-HIT] Determined target hit from exit price:', exitPriceBasedHit);
          // Update crossings with exit price-based detection
          if (exitPriceBasedHit.type === 'stop_loss') {
            crossings.stop_loss = {
              time: exitTime ? exitTime.toISOString() : new Date().toISOString(),
              price: exitPrice,
              candle: null
            };
          } else {
            crossings.take_profits[exitPriceBasedHit.targetId] = {
              time: exitTime ? exitTime.toISOString() : new Date().toISOString(),
              price: exitPrice,
              target: exitPriceBasedHit.target,
              candle: null
            };
          }
        }
      }
    }

    const result = this.determineFirstHit(crossings, stopLoss, takeProfitTargets);

    return result;
  }

  /**
   * Determine which target was hit based on exit price when candle data doesn't show crossings
   * This is a fallback for cases where candle resolution is too coarse
   */
  static determineHitFromExitPrice(exitPrice, stopLoss, takeProfitTargets, isLong, entryPrice = null) {
    if (!exitPrice || !stopLoss) return null;

    // Tolerance for considering exit price "at" a target (0.1% of price, minimum $0.01)
    const tolerance = Math.max(Math.abs(exitPrice) * 0.001, 0.01);

    // Check if exit price is at or very close to stop loss
    if (Math.abs(exitPrice - stopLoss) <= tolerance) {
      return {
        type: 'stop_loss',
        targetId: 'stop_loss',
        target: { id: 'stop_loss', label: 'Stop Loss', price: stopLoss }
      };
    }

    // Check if exit price is at or very close to any take profit target
    // For long: exit should be at or above TP (profit)
    // For short: exit should be at or below TP (profit)
    for (const target of takeProfitTargets) {
      const distance = Math.abs(exitPrice - target.price);
      if (distance <= tolerance) {
        // Also verify direction makes sense
        const isAtTarget = isLong 
          ? exitPrice >= target.price - tolerance  // Long: exit at or above TP
          : exitPrice <= target.price + tolerance;  // Short: exit at or below TP
        
        if (isAtTarget) {
          return {
            type: 'take_profit',
            targetId: target.id,
            target
          };
        }
      }
    }

    // If we have entry price, use it to determine if exit is in profit or loss direction
    // Otherwise, infer from stop loss position
    let isLoss = false;
    if (entryPrice !== null) {
      isLoss = isLong ? exitPrice < entryPrice : exitPrice > entryPrice;
    } else {
      // Infer from stop loss: for long, SL is below entry, so if exit is near SL, it's a loss
      // For short, SL is above entry, so if exit is near SL, it's a loss
      isLoss = isLong ? exitPrice <= stopLoss : exitPrice >= stopLoss;
    }
    
    // Calculate distances to determine which target is closest
    const distanceToSL = Math.abs(exitPrice - stopLoss);
    let closestTP = null;
    let minTPDistance = Infinity;
    
    for (const target of takeProfitTargets) {
      const distance = Math.abs(exitPrice - target.price);
      if (distance < minTPDistance) {
        minTPDistance = distance;
        closestTP = target;
      }
    }
    
    // Determine which target was likely hit based on:
    // 1. If exit is in loss direction and closer to SL than any TP → SL was hit
    // 2. If exit is in profit direction and closer to a TP than SL → TP was hit
    // 3. If exit is in loss direction but closer to TP → still likely SL (price moved against us)
    // 4. If exit is in profit direction but closer to SL → likely TP (price moved in our favor)
    
    if (isLoss) {
      // Exit is in loss direction
      // If SL is closer than closest TP, assume SL was hit
      if (!closestTP || distanceToSL <= minTPDistance) {
        return {
          type: 'stop_loss',
          targetId: 'stop_loss',
          target: { id: 'stop_loss', label: 'Stop Loss', price: stopLoss }
        };
      }
      // Even if TP is closer, if we're in loss territory, SL was likely hit first
      // (price would have had to cross SL to get to current exit in loss)
      return {
        type: 'stop_loss',
        targetId: 'stop_loss',
        target: { id: 'stop_loss', label: 'Stop Loss', price: stopLoss }
      };
    } else {
      // Exit is in profit direction
      // If closest TP is closer than SL, assume TP was hit
      if (closestTP && minTPDistance < distanceToSL) {
        return {
          type: 'take_profit',
          targetId: closestTP.id,
          target: closestTP
        };
      }
      // If SL is closer but we're in profit, TP was likely hit first
      // (price would have had to cross TP to get to current exit in profit)
      if (closestTP) {
        return {
          type: 'take_profit',
          targetId: closestTP.id,
          target: closestTP
        };
      }
    }

    // Fallback: if we can't determine, return null (will show as 'none')
    return null;
  }

  /**
   * Determine which target was hit first based on crossing times
   */
  static determineFirstHit(crossings, stopLoss, takeProfitTargets) {
    let firstHit = {
      type: 'none',
      time: null,
      label: 'None'
    };

    // Check stop loss
    if (crossings.stop_loss) {
      firstHit = {
        type: 'stop_loss',
        time: crossings.stop_loss.time,
        label: 'Stop Loss'
      };
    }

    // Check each take profit
    for (const [targetId, crossing] of Object.entries(crossings.take_profits)) {
      if (crossing) {
        const crossingTime = new Date(crossing.time);
        const currentFirstTime = firstHit.time ? new Date(firstHit.time) : null;

        if (!currentFirstTime || crossingTime < currentFirstTime) {
          firstHit = {
            type: targetId,
            time: crossing.time,
            label: crossing.target.label
          };
        }
      }
    }

    // Track if we used exit price analysis (no candle data available)
    // Calculate this before building result object to avoid self-reference
    const usedExitPriceAnalysis = crossings.stop_loss?.candle === null &&
      Object.values(crossings.take_profits).some(tp => tp && tp.candle === null);

    // Build detailed result
    const result = {
      first_target_hit: firstHit.type,
      first_target_label: firstHit.label,
      first_hit_time: firstHit.time,

      stop_loss_analysis: {
        price: stopLoss,
        was_crossed: !!crossings.stop_loss,
        first_crossed_at: crossings.stop_loss?.time || null,
        crossing_price: crossings.stop_loss?.price || null,
        candle: crossings.stop_loss?.candle || null
      },

      take_profit_analysis: takeProfitTargets.map(target => ({
        id: target.id,
        label: target.label,
        price: target.price,
        quantity: target.quantity,
        was_crossed: !!crossings.take_profits[target.id],
        first_crossed_at: crossings.take_profits[target.id]?.time || null,
        crossing_price: crossings.take_profits[target.id]?.price || null,
        candle: crossings.take_profits[target.id]?.candle || null
      })),

      used_exit_price_analysis: usedExitPriceAnalysis,

      conclusion: this.generateConclusion(firstHit, crossings, stopLoss, takeProfitTargets, usedExitPriceAnalysis)
    };

    return result;
  }

  /**
   * Generate a human-readable conclusion
   */
  static generateConclusion(firstHit, crossings, stopLoss, takeProfitTargets, usedExitPriceAnalysis = false) {
    if (firstHit.type === 'none') {
      // If we used exit price analysis but still got 'none', it means we couldn't determine which target was hit
      // In this case, don't show the "neither" message since price data wasn't available
      if (usedExitPriceAnalysis) {
        return 'Unable to determine which target was hit first due to unavailable price data.';
      }
      return 'Neither stop loss nor take profit levels were reached during this trade.';
    }

    if (firstHit.type === 'stop_loss') {
      const slCrossing = crossings.stop_loss;
      const crossTime = new Date(slCrossing.time).toLocaleString();

      // Check if any TP was also hit
      const tpHits = Object.values(crossings.take_profits).filter(Boolean);
      if (tpHits.length > 0) {
        return `Stop loss ($${stopLoss.toFixed(2)}) was crossed first at ${crossTime}. Take profit levels were also reached later.`;
      }
      return `Stop loss ($${stopLoss.toFixed(2)}) was crossed first at ${crossTime}. No take profit levels were reached.`;
    }

    // Take profit was hit first
    const tpCrossing = crossings.take_profits[firstHit.type];
    const target = tpCrossing.target;
    const crossTime = new Date(tpCrossing.time).toLocaleString();

    if (crossings.stop_loss) {
      return `${target.label} ($${target.price.toFixed(2)}) was reached first at ${crossTime}. Stop loss was also triggered later.`;
    }
    return `${target.label} ($${target.price.toFixed(2)}) was reached first at ${crossTime}. Stop loss was never triggered.`;
  }

  /**
   * Calculate the total R saved from all SL moves in history
   * This accounts for partial position exits - remaining contracts benefit from moved SL
   *
   * @param {Array} risk_level_history - Array of history entries
   * @param {number} originalRisk - Original risk per share
   * @param {number} totalQty - Total trade quantity
   * @param {boolean} isLong - Whether trade is long
   * @param {number} inferredRemainingRatio - Fallback remaining ratio if not in history (from partial exits)
   * @returns {number} Total R saved from SL moves
   */
  static calculateSLMoveImpact(risk_level_history, originalRisk, totalQty, isLong, inferredRemainingRatio = 1.0) {
    if (!risk_level_history || !Array.isArray(risk_level_history) || risk_level_history.length === 0) {
      return 0;
    }

    let totalRSaved = 0;

    const slMoves = risk_level_history.filter(entry => entry.type === 'stop_loss');

    for (const move of slMoves) {
      // If history entry has pre-calculated total_r_saved, use it
      if (move.total_r_saved !== undefined && move.total_r_saved !== null) {
        totalRSaved += parseFloat(move.total_r_saved);
        continue;
      }

      // Otherwise, calculate from old/new values
      if (move.old_value && move.new_value && originalRisk > 0) {
        const oldSL = parseFloat(move.old_value);
        const newSL = parseFloat(move.new_value);

        // Distance saved: positive = reduced risk
        // For long: moving SL UP reduces risk
        // For short: moving SL DOWN reduces risk
        const distanceSaved = isLong ? newSL - oldSL : oldSL - newSL;
        const rSavedPerContract = distanceSaved / originalRisk;

        // Use remaining_shares_ratio from history if available,
        // otherwise use inferred ratio from partial exits
        const remainingRatio = move.remaining_shares_ratio !== undefined
          ? parseFloat(move.remaining_shares_ratio)
          : inferredRemainingRatio;

        totalRSaved += rSavedPerContract * remainingRatio;

        logger.debug('[SL-MOVE-IMPACT] Move calculation:', {
          oldSL,
          newSL,
          distanceSaved: distanceSaved.toFixed(4),
          rSavedPerContract: rSavedPerContract.toFixed(4),
          remainingRatio: remainingRatio.toFixed(4),
          rSavedThisMove: (rSavedPerContract * remainingRatio).toFixed(4)
        });
      }
    }

    logger.debug('[SL-MOVE-IMPACT] Total R saved from SL moves:', { totalRSaved: totalRSaved.toFixed(4), slMoveCount: slMoves.length });
    return totalRSaved;
  }

  /**
   * Calculate management R for a trade
   * Management R = Actual R - Planned R + SL Move Impact
   *
   * The "Planned R" depends on which target was hit first (manual_target_hit_first):
   * - If SL Hit First: Planned R = -1 (the trade was supposed to stop out)
   * - If TP Hit First: Planned R = Target R (the trade was supposed to hit take profit)
   *
   * SL Move Impact accounts for R saved by moving stop loss while remaining contracts are open.
   *
   * Examples:
   * - SL Hit First, Actual R = -2: Management R = -2 - (-1) = -1 (bad: lost more than planned)
   * - SL Hit First, Actual R = -0.5: Management R = -0.5 - (-1) = +0.5 (good: lost less than planned)
   * - TP Hit First, Actual R = 1.5, Target R = 2: Management R = 1.5 - 2 = -0.5 (bad: made less than planned)
   * - TP Hit First, Actual R = 3, Target R = 2: Management R = 3 - 2 = +1 (good: made more than planned)
   * - SL moved after partial exit: Adds R saved on remaining position to management R
   *
   * @param {Object} trade - Trade with entry, exit, stop loss, take profit, and manual_target_hit_first
   * @returns {number|null} Management R value
   */
  static calculateManagementR(trade) {
    const {
      entry_price,
      exit_price,
      stop_loss,
      take_profit,
      take_profit_targets,
      risk_level_history,
      manual_target_hit_first,
      side,
      quantity,
      executions,
      commission,
      fees,
      instrument_type,
      point_value,
      contract_size
    } = trade;

    if (!entry_price || !exit_price || !stop_loss) {
      return null;
    }

    // Must have target hit selection to calculate management R
    if (!manual_target_hit_first || (manual_target_hit_first !== 'stop_loss' && manual_target_hit_first !== 'take_profit')) {
      return null;
    }

    const entryPrice = parseFloat(entry_price);
    const exitPrice = parseFloat(exit_price);
    const isLong = side === 'long';
    const totalQty = parseFloat(quantity) || 1;

    // Get the original stop loss from risk_level_history if available
    // R value should be calculated based on the original risk
    let originalStopLoss = parseFloat(stop_loss);
    if (risk_level_history && Array.isArray(risk_level_history) && risk_level_history.length > 0) {
      const stopLossEntries = risk_level_history
        .filter(entry => entry.type === 'stop_loss' && entry.old_value !== null && entry.old_value !== undefined)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      if (stopLossEntries.length > 0) {
        originalStopLoss = parseFloat(stopLossEntries[0].old_value);
      }
    }

    // Calculate risk (R = 1)
    const risk = isLong ? entryPrice - originalStopLoss : originalStopLoss - entryPrice;
    if (risk <= 0) return null;

    // Check if we have partial exits (multiple targets with shares)
    const hasTargetsArray = take_profit_targets && Array.isArray(take_profit_targets) && take_profit_targets.length > 0;
    const hasExecutions = executions && Array.isArray(executions) && executions.length > 0;

    // Determine which targets were ACTUALLY hit by checking executions
    // A target is "hit" if there's an exit execution at or near that price
    let hitTargetsContribution = 0;
    let hitTargetsShares = 0;
    let remainingExitContribution = 0; // R contribution from non-target exits
    let remainingExitShares = 0;
    let remainingRatio = 1;
    let hasPartialExits = false;

    if (hasTargetsArray && hasExecutions) {
      // Get exit executions (opposite action from trade side)
      const exitAction = isLong ? 'sell' : 'buy';
      const exitExecs = executions.filter(e =>
        (e.action === exitAction || e.type === exitAction) &&
        parseFloat(e.price) > 0
      );

      logger.debug('[MANAGEMENT-R] Checking executions against targets:', {
        exitAction,
        exitExecCount: exitExecs.length,
        targetCount: take_profit_targets.length
      });

      // Track which executions matched targets
      const matchedExecIndices = new Set();

      // Check each target to see if it was hit
      for (const target of take_profit_targets) {
        const tPrice = parseFloat(target.price);
        const tShares = parseFloat(target.shares || target.quantity) || 0;

        // Find execution that matches this target price (within $1 tolerance)
        const matchingExecIdx = exitExecs.findIndex(e => Math.abs(parseFloat(e.price) - tPrice) < 1);

        if (matchingExecIdx !== -1) {
          matchedExecIndices.add(matchingExecIdx);
          const tR = isLong ? (tPrice - entryPrice) / risk : (entryPrice - tPrice) / risk;
          const contrib = tR * (tShares / totalQty);
          hitTargetsContribution += contrib;
          hitTargetsShares += tShares;

          logger.debug('[MANAGEMENT-R] Target HIT:', {
            price: tPrice,
            shares: tShares,
            R: tR.toFixed(4),
            contribution: contrib.toFixed(4),
            matchedExecPrice: exitExecs[matchingExecIdx].price
          });
        } else {
          logger.debug('[MANAGEMENT-R] Target NOT HIT:', { price: tPrice, shares: tShares });
        }
      }

      // Calculate R contribution from non-target exits (remaining position exits)
      exitExecs.forEach((exec, idx) => {
        if (!matchedExecIndices.has(idx)) {
          const execPrice = parseFloat(exec.price);
          const execQty = parseFloat(exec.quantity) || 0;
          const execR = isLong ? (execPrice - entryPrice) / risk : (entryPrice - execPrice) / risk;
          const contrib = execR * (execQty / totalQty);
          remainingExitContribution += contrib;
          remainingExitShares += execQty;

          logger.debug('[MANAGEMENT-R] Non-target exit:', {
            price: execPrice,
            quantity: execQty,
            R: execR.toFixed(4),
            contribution: contrib.toFixed(4)
          });
        }
      });

      // Calculate remaining based on what wasn't hit
      const remainingShares = totalQty - hitTargetsShares;
      remainingRatio = remainingShares / totalQty;
      hasPartialExits = hitTargetsShares > 0 && hitTargetsShares < totalQty;

      logger.debug('[MANAGEMENT-R] Hit targets summary:', {
        hitTargetsContribution: hitTargetsContribution.toFixed(4),
        hitTargetsShares,
        remainingExitContribution: remainingExitContribution.toFixed(4),
        remainingExitShares,
        remainingShares,
        remainingRatio: remainingRatio.toFixed(4),
        hasPartialExits
      });
    } else if (hasTargetsArray) {
      // No executions - fall back to checking exit price against targets
      // This is less accurate but better than nothing
      for (const target of take_profit_targets) {
        const tPrice = parseFloat(target.price);
        const tShares = parseFloat(target.shares || target.quantity) || 0;

        // Check if exit price passed this target
        const wasHit = isLong ? exitPrice >= tPrice : exitPrice <= tPrice;

        if (wasHit) {
          const tR = isLong ? (tPrice - entryPrice) / risk : (entryPrice - tPrice) / risk;
          const contrib = tR * (tShares / totalQty);
          hitTargetsContribution += contrib;
          hitTargetsShares += tShares;

          logger.debug('[MANAGEMENT-R] Target HIT (by exit price):', {
            price: tPrice,
            shares: tShares,
            R: tR.toFixed(4),
            contribution: contrib.toFixed(4)
          });
        }
      }

      const remainingShares = totalQty - hitTargetsShares;
      remainingRatio = remainingShares / totalQty;
      hasPartialExits = hitTargetsShares > 0 && hitTargetsShares < totalQty;

      logger.debug('[MANAGEMENT-R] Hit targets summary (from exit price):', {
        hitTargetsContribution: hitTargetsContribution.toFixed(4),
        hitTargetsShares,
        remainingRatio: remainingRatio.toFixed(4),
        hasPartialExits
      });
    }

    // Calculate actual R
    // For partial exits, actual R = hit targets contribution + non-target exits contribution
    // We use the actual execution prices, not the weighted average exit_price
    let actualR;
    if (hasPartialExits && remainingExitShares > 0) {
      // Weighted actual R = all hit targets + actual non-target exit contributions
      actualR = hitTargetsContribution + remainingExitContribution;
      logger.debug('[MANAGEMENT-R] Weighted Actual R for partial exits:', {
        hitTargetsContribution: hitTargetsContribution.toFixed(4),
        remainingExitContribution: remainingExitContribution.toFixed(4),
        actualR: actualR.toFixed(4)
      });
    } else if (hasPartialExits) {
      // Partial exits but no remaining exit data - fall back to exit_price
      const remainingExitR = isLong
        ? (exitPrice - entryPrice) / risk
        : (entryPrice - exitPrice) / risk;
      actualR = hitTargetsContribution + (remainingExitR * remainingRatio);
      logger.debug('[MANAGEMENT-R] Weighted Actual R (fallback to exit_price):', {
        hitTargetsContribution: hitTargetsContribution.toFixed(4),
        remainingExitR: remainingExitR.toFixed(4),
        remainingRatio: remainingRatio.toFixed(4),
        actualR: actualR.toFixed(4)
      });
    } else {
      // No partial exits - use exit_price for entire position
      const remainingExitR = isLong
        ? (exitPrice - entryPrice) / risk
        : (entryPrice - exitPrice) / risk;
      actualR = remainingExitR;
    }

    // Adjust actual R for commission and fees
    // Commission reduces your actual profit, so it reduces actual R
    const totalCommission = Math.abs(parseFloat(commission || 0)) + Math.abs(parseFloat(fees || 0));
    if (totalCommission > 0 && risk > 0 && totalQty > 0) {
      // Calculate multiplier based on instrument type
      // Also detect futures from symbol pattern if instrument_type is incorrect
      const { symbol } = trade;
      const isFutures = instrument_type === 'future' ||
        (symbol && /^(MES|ES|MNQ|NQ|MYM|YM|M2K|RTY|MGC|GC|MCL|CL|SI|HG)/i.test(symbol));

      let multiplier = 1; // default for stocks
      if (isFutures) {
        // Use point_value if set, otherwise detect from symbol
        if (point_value) {
          multiplier = parseFloat(point_value);
        } else if (symbol && /^(MES|MNQ|MYM|M2K)/i.test(symbol)) {
          multiplier = 5; // Micro futures = $5 per point
        } else if (symbol && /^(ES|NQ|YM|RTY)/i.test(symbol)) {
          multiplier = 50; // E-mini futures = $50 per point
        } else {
          multiplier = 5; // Default to micro
        }
      } else if (instrument_type === 'option') {
        multiplier = parseFloat(contract_size) || 100;
      }

      const riskAmount = risk * totalQty * multiplier;
      const commissionR = totalCommission / riskAmount;
      actualR = actualR - commissionR;

      logger.debug('[MANAGEMENT-R] Commission adjustment:', {
        symbol,
        isFutures,
        totalCommission,
        multiplier,
        riskAmount,
        commissionR: commissionR.toFixed(4),
        actualRAfterCommission: actualR.toFixed(4)
      });
    }

    let plannedR = null;

    let managementR = null;

    if (manual_target_hit_first === 'stop_loss') {
      // SL Hit First: Management R = Actual R - Planned R
      //
      // Planned R depends on whether there were partial exits:
      // - No partial exits: Planned R = -1R (full position would have stopped out)
      // - With partial exits: Planned R = hit targets contribution + (remaining × -1R)
      //
      // This measures how much better/worse you did compared to the planned stop out.
      // Examples:
      // - Entry 100, SL 90, Exit 102 (no partials): Actual R = +0.2, Planned R = -1, Management R = +1.2R
      // - Entry 100, SL 90, Exit 90 (stopped exactly): Actual R = -1, Planned R = -1, Management R = 0R
      // - Entry 100, SL 90, Exit 85 (slipped): Actual R = -1.5, Planned R = -1, Management R = -0.5R

      if (hasPartialExits) {
        // With partial exits: hit targets were captured, remaining would have stopped at -1R
        plannedR = hitTargetsContribution + (remainingRatio * -1);

        logger.debug('[MANAGEMENT-R] SL Hit First with partial exits:', {
          hitTargetsContribution: hitTargetsContribution.toFixed(4),
          remainingRatio: remainingRatio.toFixed(4),
          plannedR: plannedR.toFixed(4)
        });
      } else {
        // No partial exits: full position would have stopped at -1R
        plannedR = -1;

        logger.debug('[MANAGEMENT-R] SL Hit First without partial exits:', {
          plannedR: plannedR.toFixed(4)
        });
      }

      managementR = actualR - plannedR;

      logger.debug('[MANAGEMENT-R] SL Hit First result:', {
        actualR: actualR.toFixed(4),
        plannedR: plannedR.toFixed(4),
        managementR: managementR.toFixed(4)
      });

    } else if (manual_target_hit_first === 'take_profit') {
      // TP Hit First: Management R = Actual R - Weighted Target R
      // This measures how much better/worse you did vs your potential (all targets hit perfectly)
      const weightedTargetR = this.calculateWeightedTargetR(trade, risk);
      if (weightedTargetR === null) return null;

      plannedR = weightedTargetR;

      // Calculate actual R (exit_price is weighted average, so use it directly)
      const actualRDirect = isLong
        ? (exitPrice - entryPrice) / risk
        : (entryPrice - exitPrice) / risk;

      managementR = actualRDirect - plannedR;

      logger.debug('[MANAGEMENT-R] TP Hit First:', {
        actualR: actualRDirect.toFixed(4),
        weightedTargetR: weightedTargetR.toFixed(4),
        managementR: managementR.toFixed(4)
      });
    }

    logger.debug('[MANAGEMENT-R] Final calculation:', {
      managementR: managementR !== null ? managementR.toFixed(4) : 'null'
    });

    return managementR !== null ? Math.round(managementR * 100) / 100 : null;
  }

  /**
   * Calculate weighted average target R for a trade
   * Includes TP1 from take_profit field + all targets from take_profit_targets array
   * This matches the logic in calculateRMultiples() controller for consistency
   *
   * @param {Object} trade - Trade with take profit data
   * @param {number} risk - Risk per share (entry - stop loss for long, or stop loss - entry for short)
   * @returns {number|null} Weighted average target R, or null if no targets set
   */
  static calculateWeightedTargetR(trade, risk) {
    const {
      entry_price,
      take_profit,
      take_profit_targets,
      side,
      quantity
    } = trade;

    const entryPrice = parseFloat(entry_price);
    const isLong = side === 'long';
    const totalQty = parseFloat(quantity) || 1;

    const hasTargetsArray = take_profit_targets && Array.isArray(take_profit_targets) && take_profit_targets.length > 0;
    const hasPrimaryTp = !!take_profit;

    // If we have take_profit_targets array, include TP1 from take_profit field in weighted calculation
    if (hasTargetsArray) {
      let totalShares = 0;
      let weightedSum = 0;

      // Calculate total shares specified in targets array to determine remaining for TP1
      const specifiedShares = take_profit_targets.reduce(
        (sum, t) => sum + (parseFloat(t.shares || t.quantity) || 0), 0
      );

      // Add TP1 from take_profit field if it exists
      if (hasPrimaryTp) {
        const tp1Price = parseFloat(take_profit);
        const tp1R = isLong ? (tp1Price - entryPrice) / risk : (entryPrice - tp1Price) / risk;

        // Calculate shares for TP1: remaining shares after accounting for targets array
        const tp1Shares = specifiedShares > 0
          ? Math.max(0, totalQty - specifiedShares)
          : totalQty / (take_profit_targets.length + 1);

        if (tp1Shares > 0 && isFinite(tp1R)) {
          weightedSum += tp1R * tp1Shares;
          totalShares += tp1Shares;
          logger.debug('[WEIGHTED-TARGET-R] TP1 contribution:', { tp1Price, tp1R: tp1R.toFixed(2), shares: tp1Shares });
        }
      }

      // Process all targets from the array
      take_profit_targets.forEach((t, index) => {
        if (t.price) {
          const tpPrice = parseFloat(t.price);
          const tpR = isLong ? (tpPrice - entryPrice) / risk : (entryPrice - tpPrice) / risk;

          let shares;
          if (t.shares || t.quantity) {
            shares = parseFloat(t.shares || t.quantity);
          } else if (specifiedShares === 0) {
            // No targets have shares specified - distribute equally (including TP1 if exists)
            shares = totalQty / (hasPrimaryTp ? take_profit_targets.length + 1 : take_profit_targets.length);
          } else {
            shares = 1;
          }

          if (isFinite(tpR)) {
            weightedSum += tpR * shares;
            totalShares += shares;
            logger.debug(`[WEIGHTED-TARGET-R] Target ${index + 1} contribution:`, { tpPrice, tpR: tpR.toFixed(2), shares });
          }
        }
      });

      if (totalShares > 0) {
        const weightedR = weightedSum / totalShares;
        logger.debug('[WEIGHTED-TARGET-R] Final weighted average:', { weightedR: weightedR.toFixed(2), totalShares });
        return weightedR;
      }
    }

    // Fall back to single take_profit field (no targets array)
    if (take_profit) {
      const tpPrice = parseFloat(take_profit);
      return isLong ? (tpPrice - entryPrice) / risk : (entryPrice - tpPrice) / risk;
    }

    return null;
  }

  /**
   * Record a risk level adjustment in the trade history
   * @param {Object} trade - Current trade object
   * @param {string} type - 'stop_loss' or 'take_profit'
   * @param {number} oldValue - Previous value
   * @param {number} newValue - New value
   * @param {string} reason - Reason for the change
   * @param {Object} options - Additional options for tracking
   * @param {number} options.remaining_shares - Remaining contracts when SL moved (for partial exits)
   * @returns {Object} History entry to add
   */
  static createHistoryEntry(trade, type, oldValue, newValue, reason = null, options = {}) {
    const entryPrice = parseFloat(trade.entry_price);
    const isLong = trade.side === 'long';
    const totalQty = parseFloat(trade.quantity) || 1;

    // Get original stop loss to calculate risk basis
    // Use risk_level_history to find original SL, or use old_value for SL moves
    let originalStopLoss = null;
    if (trade.risk_level_history && Array.isArray(trade.risk_level_history) && trade.risk_level_history.length > 0) {
      const stopLossEntries = trade.risk_level_history
        .filter(entry => entry.type === 'stop_loss' && entry.old_value !== null)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      if (stopLossEntries.length > 0) {
        originalStopLoss = parseFloat(stopLossEntries[0].old_value);
      }
    }
    // If no history, use current stop_loss as original (or old_value if this is a SL move)
    if (!originalStopLoss) {
      if (type === 'stop_loss' && oldValue) {
        originalStopLoss = parseFloat(oldValue);
      } else {
        originalStopLoss = parseFloat(trade.stop_loss);
      }
    }

    // Calculate original risk for R calculations
    const originalRisk = isLong
      ? entryPrice - originalStopLoss
      : originalStopLoss - entryPrice;

    // Calculate R impact of this change
    let rImpact = 0;
    let rSavedPerContract = 0;
    let totalRSaved = 0;

    if (originalRisk > 0) {
      if (type === 'take_profit') {
        const oldR = oldValue ? (isLong ? oldValue - entryPrice : entryPrice - oldValue) / originalRisk : 0;
        const newR = newValue ? (isLong ? newValue - entryPrice : entryPrice - newValue) / originalRisk : 0;
        rImpact = newR - oldR;
      } else if (type === 'stop_loss' && oldValue && newValue) {
        // For SL moves, calculate R saved based on remaining position
        // Moving SL toward entry REDUCES risk (positive R saved for remaining contracts)
        // For long: moving SL UP (toward entry) = reducing risk
        // For short: moving SL DOWN (toward entry) = reducing risk
        const distanceSaved = isLong
          ? parseFloat(newValue) - parseFloat(oldValue)  // Long: SL up = positive
          : parseFloat(oldValue) - parseFloat(newValue); // Short: SL down = positive

        rSavedPerContract = distanceSaved / originalRisk;

        // Calculate total R saved based on remaining shares
        const remainingShares = options.remaining_shares !== undefined
          ? parseFloat(options.remaining_shares)
          : totalQty; // Default to total if not specified
        const remainingRatio = remainingShares / totalQty;
        totalRSaved = rSavedPerContract * remainingRatio;

        logger.debug('[HISTORY-ENTRY] SL move R impact:', {
          distanceSaved,
          originalRisk,
          rSavedPerContract: rSavedPerContract.toFixed(4),
          remainingShares,
          totalQty,
          remainingRatio: remainingRatio.toFixed(4),
          totalRSaved: totalRSaved.toFixed(4)
        });
      }
    }

    const entry = {
      timestamp: new Date().toISOString(),
      type,
      old_value: oldValue,
      new_value: newValue,
      r_impact: Math.round(rImpact * 100) / 100,
      reason: reason || null
    };

    // Add remaining shares tracking for SL moves
    if (type === 'stop_loss' && options.remaining_shares !== undefined) {
      entry.remaining_shares = options.remaining_shares;
      entry.remaining_shares_ratio = Math.round((options.remaining_shares / totalQty) * 10000) / 10000;
      entry.r_saved_per_contract = Math.round(rSavedPerContract * 10000) / 10000;
      entry.total_r_saved = Math.round(totalRSaved * 10000) / 10000;
    }

    return entry;
  }
}

module.exports = TargetHitAnalysisService;
