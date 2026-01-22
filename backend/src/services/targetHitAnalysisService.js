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
      let chartData;
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

      if (!chartData || !chartData.candles || chartData.candles.length === 0) {
        return {
          success: false,
          error: 'No candle data available for analysis',
          data_unavailable: true
        };
      }

      // Build list of take profit targets
      const takeProfitTargets = this.buildTakeProfitTargetsList(take_profit, take_profit_targets);

      // Analyze the candles
      const analysis = this.analyzeCandles({
        candles: chartData.candles,
        entryTime: new Date(entry_time),
        exitTime: exit_time ? new Date(exit_time) : null,
        stopLoss: parseFloat(stop_loss),
        takeProfitTargets,
        isLong: side === 'long'
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
  static analyzeCandles({ candles, entryTime, exitTime, stopLoss, takeProfitTargets, isLong }) {
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
    const result = this.determineFirstHit(crossings, stopLoss, takeProfitTargets);

    return result;
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

      conclusion: this.generateConclusion(firstHit, crossings, stopLoss, takeProfitTargets)
    };

    return result;
  }

  /**
   * Generate a human-readable conclusion
   */
  static generateConclusion(firstHit, crossings, stopLoss, takeProfitTargets) {
    if (firstHit.type === 'none') {
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
   * Calculate management R for a trade
   * Management R = Actual R - Potential R
   * Potential R = R that would have been achieved without management (based on original SL/TP)
   * 
   * Handles these scenarios:
   * 1. SL was trailed, but final TP was hit before the trailed SL → No management impact
   * 2. SL was trailed and initial SL price was hit → Positive management impact
   * 3. SL was trailed but initial SL price was not hit. Got taken out at the trailed SL price and after that price went to the final TP → Negative management impact
   * 4. "SL was trailed" can also be replaced by "closed manually" for cases 2 and 3
   * 
   * @param {Object} trade - Trade with history and targets
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
      side
    } = trade;

    if (!entry_price || !exit_price || !stop_loss) {
      return null;
    }

    const entryPrice = parseFloat(entry_price);
    const exitPrice = parseFloat(exit_price);
    const currentStopLoss = parseFloat(stop_loss);
    const isLong = side === 'long';

    // Get the original stop loss from risk_level_history if available
    let originalStopLoss = currentStopLoss;
    if (risk_level_history && Array.isArray(risk_level_history) && risk_level_history.length > 0) {
      const stopLossEntries = risk_level_history
        .filter(entry => entry.type === 'stop_loss' && entry.old_value !== null && entry.old_value !== undefined)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      if (stopLossEntries.length > 0) {
        originalStopLoss = parseFloat(stopLossEntries[0].old_value);
      }
    }

    // Calculate risk based on original stop loss (R value should use original risk)
    const risk = isLong ? entryPrice - originalStopLoss : originalStopLoss - entryPrice;
    if (risk <= 0) return null;

    // Calculate actual R
    const actualPL = isLong ? exitPrice - entryPrice : entryPrice - exitPrice;
    const actualR = actualPL / risk;

    // If we have risk_level_history, sum up the r_impact values
    // This takes precedence as it represents actual management adjustments
    if (risk_level_history && Array.isArray(risk_level_history) && risk_level_history.length > 0) {
      const totalRImpact = risk_level_history.reduce((sum, adjustment) => {
        return sum + (parseFloat(adjustment.r_impact) || 0);
      }, 0);
      // Only use this if r_impact values are actually calculated (non-zero)
      // Otherwise, use the more sophisticated calculation below
      if (Math.abs(totalRImpact) > 0.01) {
        return Math.round(totalRImpact * 100) / 100;
      }
    }

    // Check if stop loss was moved (trailed)
    const stopLossWasMoved = risk_level_history && Array.isArray(risk_level_history) && 
      risk_level_history.some(entry => entry.type === 'stop_loss' && entry.old_value !== null);
    const stopLossChanged = stopLossWasMoved && Math.abs(currentStopLoss - originalStopLoss) > 0.0001;

    // Calculate Potential R based on manual_target_hit_first and stop loss adjustments
    let potentialR = null;
    const MAX_POTENTIAL_R = 10;

    if (manual_target_hit_first) {
      if (manual_target_hit_first === 'stop_loss') {
        // Original SL was hit first (without management, would have lost 1R)
        potentialR = -1;
      } else if (manual_target_hit_first === 'take_profit') {
        // Final TP was hit - use the final TP target's R value
        let finalTpR = null;
        if (take_profit_targets && Array.isArray(take_profit_targets) && take_profit_targets.length > 0) {
          const sortedTargets = [...take_profit_targets].sort((a, b) => {
            const priceA = parseFloat(a.price);
            const priceB = parseFloat(b.price);
            return isLong ? priceB - priceA : priceA - priceB;
          });
          const finalTarget = sortedTargets[0];
          if (finalTarget && finalTarget.price) {
            const finalTpPrice = parseFloat(finalTarget.price);
            const finalTpPL = isLong ? finalTpPrice - entryPrice : entryPrice - finalTpPrice;
            finalTpR = finalTpPL / risk;
          }
        }
        
        if (!finalTpR && take_profit) {
          const tpPL = isLong ? parseFloat(take_profit) - entryPrice : entryPrice - parseFloat(take_profit);
          finalTpR = tpPL / risk;
        }
        
        if (finalTpR !== null) {
          if (finalTpR > MAX_POTENTIAL_R) {
            finalTpR = MAX_POTENTIAL_R;
          }
          potentialR = finalTpR;
          // If actual R equals potential R (within rounding), no management impact
          if (Math.abs(actualR - potentialR) < 0.01) {
            return 0;
          }
        }
      } else if (manual_target_hit_first === 'neither') {
        // Manual exit - determine what would have happened without management
        if (stopLossChanged) {
          // Stop loss was moved - check if exit was at trailed SL
          const exitAtTrailedSL = Math.abs(exitPrice - currentStopLoss) < (risk * 0.1);
          
          if (exitAtTrailedSL) {
            const originalSLHit = (isLong && exitPrice <= originalStopLoss) || (!isLong && exitPrice >= originalStopLoss);
            
            if (!originalSLHit) {
              // Case 3: Got taken out at trailed SL, but final TP would have been hit
              let finalTpR = null;
              if (take_profit_targets && Array.isArray(take_profit_targets) && take_profit_targets.length > 0) {
                const sortedTargets = [...take_profit_targets].sort((a, b) => {
                  const priceA = parseFloat(a.price);
                  const priceB = parseFloat(b.price);
                  return isLong ? priceB - priceA : priceA - priceB;
                });
                const finalTarget = sortedTargets[0];
                if (finalTarget && finalTarget.price) {
                  const finalTpPrice = parseFloat(finalTarget.price);
                  const finalTpPL = isLong ? finalTpPrice - entryPrice : entryPrice - finalTpPrice;
                  finalTpR = finalTpPL / risk;
                }
              }
              
              if (!finalTpR && take_profit) {
                const tpPL = isLong ? parseFloat(take_profit) - entryPrice : entryPrice - parseFloat(take_profit);
                finalTpR = tpPL / risk;
              }
              
              if (finalTpR !== null) {
                if (finalTpR > MAX_POTENTIAL_R) {
                  finalTpR = MAX_POTENTIAL_R;
                }
                potentialR = finalTpR;
              } else {
                potentialR = 0;
              }
            } else {
              // Case 2: Original SL was hit - trailing prevented full loss
              potentialR = -1;
            }
          } else {
            // Manual exit not at trailed SL
            const originalSLHit = (isLong && exitPrice <= originalStopLoss) || (!isLong && exitPrice >= originalStopLoss);
            potentialR = originalSLHit ? -1 : 0;
          }
        } else {
          // No stop loss change - just manual exit
          potentialR = 0;
        }
      }
    }

    // If we couldn't determine potential R, return null
    if (potentialR === null) {
      return null;
    }

    // Management R = Actual R - Potential R
    const managementR = actualR - potentialR;

    return Math.round(managementR * 100) / 100;
  }

  /**
   * Record a risk level adjustment in the trade history
   * @param {Object} trade - Current trade object
   * @param {string} type - 'stop_loss' or 'take_profit'
   * @param {number} oldValue - Previous value
   * @param {number} newValue - New value
   * @param {string} reason - Reason for the change
   * @returns {Object} History entry to add
   */
  static createHistoryEntry(trade, type, oldValue, newValue, reason = null) {
    const entryPrice = parseFloat(trade.entry_price);
    const stopLoss = parseFloat(trade.stop_loss);
    const isLong = trade.side === 'long';

    // Calculate R impact of this change
    let rImpact = 0;

    if (stopLoss && entryPrice) {
      const risk = isLong ? entryPrice - stopLoss : stopLoss - entryPrice;

      if (risk > 0) {
        if (type === 'take_profit') {
          const oldR = oldValue ? (isLong ? oldValue - entryPrice : entryPrice - oldValue) / risk : 0;
          const newR = newValue ? (isLong ? newValue - entryPrice : entryPrice - newValue) / risk : 0;
          rImpact = newR - oldR;
        } else if (type === 'stop_loss') {
          // SL changes affect the risk basis, which is complex
          // For simplicity, we track it but don't calculate R impact for SL changes
          rImpact = 0;
        }
      }
    }

    return {
      timestamp: new Date().toISOString(),
      type,
      old_value: oldValue,
      new_value: newValue,
      r_impact: Math.round(rImpact * 100) / 100,
      reason: reason || null
    };
  }
}

module.exports = TargetHitAnalysisService;
