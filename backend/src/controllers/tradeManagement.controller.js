/**
 * Trade Management Controller
 * Handles R-Multiple analysis for individual trades
 */

const db = require('../config/database');
const Trade = require('../models/Trade');
const logger = require('../utils/logger');

/**
 * Calculate R-Multiple values for a trade
 * @param {Object} trade - Trade object with entry_price, exit_price, stop_loss, take_profit, side
 * @returns {Object} R-Multiple analysis results
 */
function calculateRMultiples(trade) {
  const { entry_price, exit_price, stop_loss, take_profit, side, pnl, quantity } = trade;

  // Validate required fields
  if (!entry_price || !exit_price || !stop_loss) {
    return {
      error: 'Missing required fields for R-Multiple calculation',
      has_stop_loss: !!stop_loss,
      has_take_profit: !!take_profit
    };
  }

  const entryPrice = parseFloat(entry_price);
  const exitPrice = parseFloat(exit_price);
  const stopLoss = parseFloat(stop_loss);
  const takeProfit = take_profit ? parseFloat(take_profit) : null;

  let risk, actualPL, targetPL, actualR, targetR, rLost;

  if (side === 'long') {
    // For long positions: risk is entry - stop loss
    risk = entryPrice - stopLoss;

    if (risk <= 0) {
      return { error: 'Invalid stop loss position for long trade (stop loss must be below entry)' };
    }

    // Actual P&L per share
    actualPL = exitPrice - entryPrice;

    // Calculate actual R
    actualR = actualPL / risk;

    // Calculate target R if take profit exists
    if (takeProfit) {
      targetPL = takeProfit - entryPrice;
      targetR = targetPL / risk;

      // R lost is how much potential R was left on the table
      // Positive means exited early, negative means exceeded target
      rLost = targetR - actualR;
    }
  } else {
    // For short positions: risk is stop loss - entry
    risk = stopLoss - entryPrice;

    if (risk <= 0) {
      return { error: 'Invalid stop loss position for short trade (stop loss must be above entry)' };
    }

    // Actual P&L per share (inverted for shorts)
    actualPL = entryPrice - exitPrice;

    // Calculate actual R
    actualR = actualPL / risk;

    // Calculate target R if take profit exists
    if (takeProfit) {
      targetPL = entryPrice - takeProfit;
      targetR = targetPL / risk;

      // R lost is how much potential R was left on the table
      rLost = targetR - actualR;
    }
  }

  // Calculate dollar amounts
  const riskAmount = risk * parseFloat(quantity || 1);
  const actualPLAmount = actualPL * parseFloat(quantity || 1);
  const targetPLAmount = takeProfit ? targetPL * parseFloat(quantity || 1) : null;

  return {
    // R-Multiple values
    actual_r: Math.round(actualR * 100) / 100,
    target_r: targetR !== undefined ? Math.round(targetR * 100) / 100 : null,
    r_lost: rLost !== undefined ? Math.round(rLost * 100) / 100 : null,

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
    if (actualR >= -1) return { score: 'stopped_out', label: 'Stopped Out', color: 'red' };
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
 */
function calculateTradeR(trade) {
  const { entry_price, exit_price, stop_loss, take_profit, side } = trade;

  if (!entry_price || !exit_price || !stop_loss) {
    return null;
  }

  const entryPrice = parseFloat(entry_price);
  const exitPrice = parseFloat(exit_price);
  const stopLoss = parseFloat(stop_loss);
  const takeProfit = take_profit ? parseFloat(take_profit) : null;

  let risk, actualR, targetR;

  if (side === 'long') {
    risk = entryPrice - stopLoss;
    if (risk <= 0) return null;
    actualR = (exitPrice - entryPrice) / risk;
    if (takeProfit) {
      targetR = (takeProfit - entryPrice) / risk;
    }
  } else {
    risk = stopLoss - entryPrice;
    if (risk <= 0) return null;
    actualR = (entryPrice - exitPrice) / risk;
    if (takeProfit) {
      targetR = (entryPrice - takeProfit) / risk;
    }
  }

  return {
    actual_r: Math.round(actualR * 100) / 100,
    target_r: targetR !== undefined ? Math.round(targetR * 100) / 100 : null
  };
}

const tradeManagementController = {
  /**
   * Get trades for selection with filters
   */
  async getTradesForSelection(req, res) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, symbol, limit = 100, offset = 0 } = req.query;

      logger.info('[TRADE-MGMT] getTradesForSelection called', { userId, symbol, startDate, endDate, limit, offset });

      let query = `
        SELECT
          id, symbol, trade_date, entry_price, exit_price,
          quantity, side, pnl, pnl_percent,
          stop_loss, take_profit, r_value,
          strategy, broker, instrument_type
        FROM trades
        WHERE user_id = $1
          AND exit_price IS NOT NULL
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
        const searchSymbol = symbol.trim();
        query += ` AND UPPER(symbol) LIKE UPPER($${paramCount})`;
        values.push(`%${searchSymbol}%`);
        paramCount++;
        logger.info('[TRADE-MGMT] Searching for symbol:', searchSymbol);
      }

      query += ` ORDER BY trade_date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(parseInt(limit), parseInt(offset));

      const result = await db.query(query, values);
      logger.info('[TRADE-MGMT] Query returned', result.rows.length, 'trades');

      // Add flags for missing data
      const trades = result.rows.map(trade => ({
        ...trade,
        needs_stop_loss: !trade.stop_loss,
        needs_take_profit: !trade.take_profit,
        can_analyze: !!trade.stop_loss
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

      // Fetch the trade
      const result = await db.query(
        `SELECT * FROM trades WHERE id = $1 AND user_id = $2`,
        [tradeId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const trade = result.rows[0];

      // Check if trade is closed
      if (!trade.exit_price) {
        return res.status(400).json({
          error: 'Trade must be closed for R-Multiple analysis',
          trade_status: 'open'
        });
      }

      // Check if stop loss is set
      if (!trade.stop_loss) {
        return res.status(400).json({
          error: 'Stop loss must be set for R-Multiple analysis',
          needs_stop_loss: true,
          needs_take_profit: !trade.take_profit
        });
      }

      // Calculate R-Multiples
      const analysis = calculateRMultiples(trade);

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
          pnl: trade.pnl,
          pnl_percent: trade.pnl_percent,
          entry_time: trade.entry_time,
          exit_time: trade.exit_time,
          charts: charts
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
   */
  async updateTradeLevels(req, res) {
    try {
      const userId = req.user.id;
      const { tradeId } = req.params;
      const { stop_loss, take_profit } = req.body;

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

      // Validate stop loss position based on side
      if (stop_loss !== undefined && stop_loss !== null) {
        const stopLossValue = parseFloat(stop_loss);
        if (trade.side === 'long' && stopLossValue >= entryPrice) {
          return res.status(400).json({
            error: 'Stop loss must be below entry price for long trades'
          });
        }
        if (trade.side === 'short' && stopLossValue <= entryPrice) {
          return res.status(400).json({
            error: 'Stop loss must be above entry price for short trades'
          });
        }
      }

      // Validate take profit position based on side
      if (take_profit !== undefined && take_profit !== null) {
        const takeProfitValue = parseFloat(take_profit);
        if (trade.side === 'long' && takeProfitValue <= entryPrice) {
          return res.status(400).json({
            error: 'Take profit must be above entry price for long trades'
          });
        }
        if (trade.side === 'short' && takeProfitValue >= entryPrice) {
          return res.status(400).json({
            error: 'Take profit must be below entry price for short trades'
          });
        }
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
   */
  async getRPerformance(req, res) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, symbol, limit = 100 } = req.query;

      logger.info('[TRADE-MGMT] getRPerformance called', { userId, symbol, startDate, endDate, limit });

      // Get trades with stop_loss set (required for R calculation)
      let query = `
        SELECT
          id, symbol, trade_date, entry_price, exit_price,
          quantity, side, pnl, stop_loss, take_profit
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

      query += ` ORDER BY trade_date ASC, id ASC LIMIT $${paramCount}`;
      values.push(parseInt(limit));

      const result = await db.query(query, values);
      logger.info('[TRADE-MGMT] Found', result.rows.length, 'trades with stop_loss for R analysis');

      // Calculate R values and build cumulative data
      let cumulativeActualR = 0;
      let cumulativePotentialR = 0;
      let tradesWithTarget = 0;

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

          chartData.push({
            trade_number: index + 1,
            trade_id: trade.id,
            symbol: trade.symbol,
            trade_date: trade.trade_date,
            actual_r: rValues.actual_r,
            target_r: rValues.target_r,
            cumulative_actual_r: Math.round(cumulativeActualR * 100) / 100,
            cumulative_potential_r: Math.round(cumulativePotentialR * 100) / 100
          });

          tradeDetails.push({
            id: trade.id,
            symbol: trade.symbol,
            trade_date: trade.trade_date,
            side: trade.side,
            pnl: trade.pnl,
            actual_r: rValues.actual_r,
            target_r: rValues.target_r
          });
        }
      });

      // Calculate summary statistics
      const totalTrades = chartData.length;
      const totalActualR = Math.round(cumulativeActualR * 100) / 100;
      const totalPotentialR = Math.round(cumulativePotentialR * 100) / 100;
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

      res.json({
        chart_data: chartData,
        summary: {
          total_trades: totalTrades,
          trades_with_target: tradesWithTarget,
          total_actual_r: totalActualR,
          total_potential_r: totalPotentialR,
          r_efficiency: rEfficiency,
          r_left_on_table: rLeftOnTable,
          win_rate: winRate,
          winning_trades: winningTrades.length,
          losing_trades: losingTrades.length,
          avg_win_r: avgWinR,
          avg_loss_r: avgLossR
        }
      });
    } catch (error) {
      logger.error('Error fetching R performance:', error);
      res.status(500).json({ error: 'Failed to fetch R performance data' });
    }
  }
};

module.exports = tradeManagementController;
