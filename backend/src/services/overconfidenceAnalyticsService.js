const db = require('../config/database');
const TierService = require('./tierService');

class OverconfidenceAnalyticsService {
  
  // Calculate monetary position size for any trade
  static calculateMonetaryPositionSize(trade) {
    return parseFloat(trade.quantity) * parseFloat(trade.entry_price);
  }

  // Calculate position size volatility (standard deviation)
  static calculatePositionVolatility(positionSizes) {
    if (positionSizes.length < 2) return 0;
    
    const mean = positionSizes.reduce((sum, size) => sum + size, 0) / positionSizes.length;
    const variance = positionSizes.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0) / positionSizes.length;
    return Math.sqrt(variance);
  }

  // Analyze historical trades for overconfidence patterns
  static async analyzeHistoricalTrades(userId) {
    const hasAccess = await TierService.hasFeatureAccess(userId, 'overconfidence_analytics');
    if (!hasAccess) {
      throw new Error('Overconfidence analytics requires Pro tier');
    }

    // Clear existing data
    await this.clearHistoricalData(userId);

    // Get all completed trades for the user, ordered by entry time
    const tradesQuery = `
      SELECT 
        id, symbol, entry_time, exit_time, entry_price, exit_price, 
        quantity, side, commission, fees, pnl
      FROM trades 
      WHERE user_id = $1 
        AND exit_price IS NOT NULL 
        AND exit_time IS NOT NULL
      ORDER BY entry_time ASC
    `;

    const tradesResult = await db.query(tradesQuery, [userId]);
    const trades = tradesResult.rows;

    if (trades.length < 10) {
      return {
        message: 'Not enough completed trades for overconfidence analysis',
        tradesAnalyzed: trades.length,
        overconfidenceEventsCreated: 0
      };
    }

    let overconfidenceEventsCreated = 0;
    let currentStreak = [];
    let currentStreakType = null; // 'win' or 'loss'
    let baselinePositionSize = null;

    // Get user settings (adjusted for day trading context)
    const userSettings = await this.getUserSettings(userId);
    const minStreakLength = userSettings?.min_streak_length || 4; // Slightly higher for day trading
    const positionIncreaseThreshold = userSettings?.position_increase_threshold || 40.0; // Higher threshold for day trading

    // Calculate baseline position size from first 5 trades
    if (trades.length >= 5) {
      const baselineTrades = trades.slice(0, 5);
      baselinePositionSize = baselineTrades.reduce((sum, trade) => 
        sum + this.calculateMonetaryPositionSize(trade), 0) / baselineTrades.length;
    }

    // Analyze each trade for streaks
    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      const tradePnL = parseFloat(trade.pnl || 0);
      const isWin = tradePnL > 0;
      const isLoss = tradePnL < 0;
      
      // Skip breakeven trades
      if (tradePnL === 0) continue;

      const tradeType = isWin ? 'win' : 'loss';

      // Check if this continues the current streak
      if (currentStreakType === tradeType) {
        // Continue current streak
        currentStreak.push(trade);
      } else {
        // Streak broken - analyze previous streak if it was a win streak
        if (currentStreakType === 'win' && currentStreak.length >= minStreakLength) {
          const overconfidenceEvent = await this.analyzeWinStreak(
            userId, 
            currentStreak, 
            baselinePositionSize, 
            positionIncreaseThreshold
          );
          
          if (overconfidenceEvent) {
            console.log(`Overconfidence detected for user ${userId}:`, {
              streakLength: overconfidenceEvent.winStreakLength,
              positionIncreasePercent: overconfidenceEvent.positionSizeIncreasePercent,
              severity: overconfidenceEvent.severity,
              confidence: overconfidenceEvent.confidenceScore,
              totalProfit: overconfidenceEvent.totalStreakProfit,
              context: 'day_trading_adjusted'
            });
            
            // Look for outcome trade (first trade after streak)
            const outcomeTradeId = trade.id;
            const outcomeAmount = tradePnL;
            const outcomeType = isWin ? 'profit' : (isLoss ? 'loss' : 'breakeven');
            
            await this.createOverconfidenceEvent(
              userId,
              overconfidenceEvent,
              outcomeTradeId,
              outcomeAmount,
              outcomeType
            );
            
            overconfidenceEventsCreated++;
          }
        }
        
        // Start new streak
        currentStreak = [trade];
        currentStreakType = tradeType;
      }
    }

    // Analyze final streak if it's a win streak
    if (currentStreakType === 'win' && currentStreak.length >= minStreakLength) {
      const overconfidenceEvent = await this.analyzeWinStreak(
        userId, 
        currentStreak, 
        baselinePositionSize, 
        positionIncreaseThreshold
      );
      
      if (overconfidenceEvent) {
        console.log(`Ongoing overconfidence detected for user ${userId}:`, {
          streakLength: overconfidenceEvent.winStreakLength,
          positionIncreasePercent: overconfidenceEvent.positionSizeIncreasePercent,
          severity: overconfidenceEvent.severity,
          confidence: overconfidenceEvent.confidenceScore,
          totalProfit: overconfidenceEvent.totalStreakProfit,
          context: 'day_trading_adjusted_ongoing'
        });
        
        await this.createOverconfidenceEvent(
          userId,
          overconfidenceEvent,
          null, // No outcome trade yet
          null,
          'ongoing'
        );
        
        overconfidenceEventsCreated++;
      }
    }

    return {
      tradesAnalyzed: trades.length,
      overconfidenceEventsCreated,
      message: `Created ${overconfidenceEventsCreated} overconfidence events`
    };
  }

  // Analyze a win streak for overconfidence patterns
  static async analyzeWinStreak(userId, winStreak, baselinePositionSize, positionIncreaseThreshold) {
    if (winStreak.length < 3) return null;

    const winStreakLength = winStreak.length;
    const winStreakStartDate = new Date(winStreak[0].entry_time);
    const winStreakEndDate = new Date(winStreak[winStreak.length - 1].exit_time);
    
    // Calculate position sizes during the streak
    const positionSizes = winStreak.map(trade => this.calculateMonetaryPositionSize(trade));
    const peakPositionSize = Math.max(...positionSizes);
    const totalStreakProfit = winStreak.reduce((sum, trade) => sum + parseFloat(trade.pnl || 0), 0);
    
    // If no baseline, use average of first 3 trades in streak
    const effectiveBaseline = baselinePositionSize || 
      (positionSizes.slice(0, 3).reduce((a, b) => a + b, 0) / 3);
    
    const positionIncreasePercent = ((peakPositionSize - effectiveBaseline) / effectiveBaseline) * 100;

    // Only flag as overconfidence if position size increased significantly
    if (positionIncreasePercent < positionIncreaseThreshold) {
      return null;
    }

    // Calculate severity based on position increase and risk metrics (not timing)
    let severity = 'low';
    let confidence = 0.6; // Base confidence

    // For day trading, focus on position size risk relative to account
    const avgPositionSize = positionSizes.reduce((a, b) => a + b, 0) / positionSizes.length;
    const positionVolatility = this.calculatePositionVolatility(positionSizes);
    const profitMargin = totalStreakProfit / (avgPositionSize * winStreakLength); // Profit per dollar risked
    
    // Risk calculation for day trading context
    if (positionIncreasePercent > 150 || (positionIncreasePercent > 75 && profitMargin < 0.02)) {
      severity = 'high';
      confidence = 0.9;
    } else if (positionIncreasePercent > 75 || (positionIncreasePercent > 40 && profitMargin < 0.05)) {
      severity = 'medium';
      confidence = 0.8;
    }

    // Increase confidence based on position size consistency (overconfidence pattern)
    if (positionVolatility > avgPositionSize * 0.3) {
      confidence += 0.1; // High volatility in position sizes suggests emotional scaling
    }
    
    // Increase confidence for larger position increases
    confidence += Math.min(positionIncreasePercent * 0.002, 0.2);
    confidence = Math.min(confidence, 1.0);

    return {
      winStreakLength,
      winStreakStartDate,
      winStreakEndDate,
      baselinePositionSize: effectiveBaseline,
      peakPositionSize,
      positionSizeIncreasePercent: positionIncreasePercent,
      totalStreakProfit,
      streakTrades: winStreak.map(t => t.id),
      severity,
      confidenceScore: confidence
    };
  }

  // Create overconfidence event record
  static async createOverconfidenceEvent(userId, eventData, outcomeTradeId = null, outcomeAmount = null, outcomeType = 'ongoing') {
    const query = `
      INSERT INTO overconfidence_events (
        user_id, win_streak_length, win_streak_start_date, win_streak_end_date,
        baseline_position_size, peak_position_size, position_size_increase_percent,
        total_streak_profit, streak_trades, severity, confidence_score,
        outcome_after_streak, outcome_trade_id, outcome_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `;

    const result = await db.query(query, [
      userId,
      eventData.winStreakLength,
      eventData.winStreakStartDate,
      eventData.winStreakEndDate,
      eventData.baselinePositionSize,
      eventData.peakPositionSize,
      eventData.positionSizeIncreasePercent,
      eventData.totalStreakProfit,
      eventData.streakTrades,
      eventData.severity,
      eventData.confidenceScore,
      outcomeType,
      outcomeTradeId,
      outcomeAmount
    ]);

    // Also create behavioral pattern entry
    await this.createBehavioralPattern(userId, eventData, result.rows[0].id);

    return result.rows[0].id;
  }

  // Create behavioral pattern entry for overconfidence
  static async createBehavioralPattern(userId, eventData, overconfidenceEventId) {
    const query = `
      INSERT INTO behavioral_patterns (
        user_id, pattern_type, severity, confidence_score, 
        detected_at, context_data
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    await db.query(query, [
      userId,
      'overconfidence_bias',
      eventData.severity,
      eventData.confidenceScore,
      eventData.winStreakStartDate,
      JSON.stringify({
        overconfidenceEventId,
        winStreakLength: eventData.winStreakLength,
        positionSizeIncreasePercent: eventData.positionSizeIncreasePercent,
        totalStreakProfit: eventData.totalStreakProfit,
        peakPositionSize: eventData.peakPositionSize,
        baselinePositionSize: eventData.baselinePositionSize
      })
    ]);
  }

  // Get overconfidence analysis for a user
  static async getOverconfidenceAnalysis(userId, dateFilter = '', paginationOptions = {}) {
    const hasAccess = await TierService.hasFeatureAccess(userId, 'overconfidence_analytics');
    if (!hasAccess) {
      throw new Error('Overconfidence analytics requires Pro tier');
    }

    const page = paginationOptions.page || 1;
    const limit = paginationOptions.limit || 20;
    const offset = (page - 1) * limit;

    // Build base parameters for date filtering
    const baseParams = [userId];
    let paramCount = 1;

    let dateCondition = '';
    if (dateFilter.startDate && dateFilter.endDate) {
      dateCondition = ` AND created_at >= $${++paramCount} AND created_at <= $${++paramCount}`;
      baseParams.push(dateFilter.startDate, dateFilter.endDate);
    }

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM overconfidence_events
      WHERE user_id = $1 ${dateCondition}
    `;
    const countResult = await db.query(countQuery, baseParams);
    const totalCount = parseInt(countResult.rows[0].total_count);

    // Get overconfidence events with pagination
    const eventsQuery = `
      SELECT 
        oe.*,
        CASE 
          WHEN outcome_after_streak = 'loss' THEN 'warning'
          WHEN outcome_after_streak = 'profit' THEN 'success'
          WHEN outcome_after_streak = 'ongoing' THEN 'info'
          ELSE 'neutral'
        END as outcome_status
      FROM overconfidence_events oe
      WHERE user_id = $1 ${dateCondition}
      ORDER BY created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
    
    const eventsParams = [...baseParams, limit, offset];
    const eventsResult = await db.query(eventsQuery, eventsParams);

    // Enhance events with trade details
    for (let event of eventsResult.rows) {
      if (event.streak_trades && event.streak_trades.length > 0) {
        const tradesQuery = `
          SELECT 
            id, symbol, entry_time, exit_time, entry_price, exit_price, 
            quantity, side, pnl, commission, fees,
            (quantity * entry_price) as position_size
          FROM trades 
          WHERE id = ANY($1)
          ORDER BY entry_time ASC
        `;
        
        const tradesResult = await db.query(tradesQuery, [event.streak_trades]);
        event.streak_trade_details = tradesResult.rows;
      }

      // Get outcome trade details if available
      if (event.outcome_trade_id) {
        const outcomeQuery = `
          SELECT 
            id, symbol, entry_time, exit_time, entry_price, exit_price, 
            quantity, side, pnl, commission, fees
          FROM trades 
          WHERE id = $1
        `;
        
        const outcomeResult = await db.query(outcomeQuery, [event.outcome_trade_id]);
        if (outcomeResult.rows[0]) {
          event.outcome_trade_details = outcomeResult.rows[0];
        }
      }
    }

    // Get statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_events,
        AVG(win_streak_length) as avg_streak_length,
        AVG(position_size_increase_percent) as avg_position_increase,
        SUM(total_streak_profit) as total_streak_profits,
        SUM(CASE WHEN outcome_amount < 0 THEN ABS(outcome_amount) ELSE 0 END) as total_losses_after_streaks,
        COUNT(CASE WHEN outcome_after_streak = 'loss' THEN 1 END) as streaks_ending_in_loss,
        COUNT(CASE WHEN outcome_after_streak = 'profit' THEN 1 END) as streaks_ending_in_profit,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity_count,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_severity_count,
        COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_severity_count
      FROM overconfidence_events
      WHERE user_id = $1 ${dateCondition}
    `;

    const statsResult = await db.query(statsQuery, baseParams);
    const stats = statsResult.rows[0];
    const totalEvents = parseInt(stats.total_events);

    return {
      events: eventsResult.rows,
      statistics: {
        ...stats,
        loss_rate: totalEvents > 0 ? ((stats.streaks_ending_in_loss / totalEvents) * 100).toFixed(1) : 0,
        profit_rate: totalEvents > 0 ? ((stats.streaks_ending_in_profit / totalEvents) * 100).toFixed(1) : 0,
        net_overconfidence_cost: (stats.total_losses_after_streaks || 0) - (stats.total_streak_profits || 0)
      },
      pagination: {
        page: page,
        limit: limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPreviousPage: page > 1
      }
    };
  }

  // Update or create user overconfidence settings
  static async updateOverconfidenceSettings(userId, settings) {
    const query = `
      INSERT INTO overconfidence_settings (
        user_id, detection_enabled, min_streak_length, position_increase_threshold,
        sensitivity, alert_preferences
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) 
      DO UPDATE SET
        detection_enabled = EXCLUDED.detection_enabled,
        min_streak_length = EXCLUDED.min_streak_length,
        position_increase_threshold = EXCLUDED.position_increase_threshold,
        sensitivity = EXCLUDED.sensitivity,
        alert_preferences = EXCLUDED.alert_preferences,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      userId,
      settings.detectionEnabled ?? true,
      settings.minStreakLength ?? 3,
      settings.positionIncreaseThreshold ?? 25.0,
      settings.sensitivity ?? 'medium',
      JSON.stringify(settings.alertPreferences ?? {email: false, push: true, toast: true})
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Get user overconfidence settings
  static async getUserSettings(userId) {
    const query = `SELECT * FROM overconfidence_settings WHERE user_id = $1`;
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  // Clear existing historical data
  static async clearHistoricalData(userId) {
    const queries = [
      'DELETE FROM overconfidence_events WHERE user_id = $1',
      'DELETE FROM behavioral_patterns WHERE user_id = $1 AND pattern_type = $2'
    ];

    await db.query(queries[0], [userId]);
    await db.query(queries[1], [userId, 'overconfidence_bias']);
  }

  // Real-time overconfidence detection for new trades
  static async detectOverconfidenceInRealTime(userId, newTrade) {
    const hasAccess = await TierService.hasFeatureAccess(userId, 'overconfidence_analytics');
    if (!hasAccess) {
      return null;
    }

    const userSettings = await this.getUserSettings(userId);
    if (!userSettings?.detection_enabled) {
      return null;
    }

    // Get current win/loss streak
    const currentStreak = await this.getCurrentStreak(userId);
    
    // Update streak with new trade
    const updatedStreak = await this.updateCurrentStreak(userId, newTrade, currentStreak);
    
    // Check if we need to alert for overconfidence
    if (updatedStreak.streak_type === 'win' && 
        updatedStreak.current_length >= (userSettings.min_streak_length || 3)) {
      
      const positionIncreasePercent = ((updatedStreak.max_position_size - updatedStreak.baseline_position_size) / updatedStreak.baseline_position_size) * 100;
      
      if (positionIncreasePercent >= (userSettings.position_increase_threshold || 25)) {
        // Calculate additional risk metrics for day trading context
        const avgPositionSize = updatedStreak.total_pnl / updatedStreak.current_length; // Rough average
        const profitMargin = updatedStreak.total_pnl / (updatedStreak.max_position_size * updatedStreak.current_length);
        
        // Determine severity based on position size increase and profit efficiency
        let severity = 'medium';
        let alertMessage = `Overconfidence Alert: Your position sizes have increased ${positionIncreasePercent.toFixed(1)}% during this ${updatedStreak.current_length}-trade win streak`;
        
        // High severity for large position increases or poor profit margins
        if (positionIncreasePercent > 100 || (positionIncreasePercent > 50 && profitMargin < 0.02)) {
          severity = 'high';
          alertMessage += '. Consider reducing position size to manage risk.';
        } else if (positionIncreasePercent > 75) {
          severity = 'medium';
          alertMessage += '. Monitor your position sizing carefully.';
        }
        
        return {
          type: 'overconfidence_alert',
          message: alertMessage,
          severity: severity,
          streakLength: updatedStreak.current_length,
          positionIncrease: positionIncreasePercent,
          totalProfit: updatedStreak.total_pnl,
          profitMargin: profitMargin,
          recommendation: positionIncreasePercent > 75 ? 'Consider taking a break or reducing position size' : 'Monitor position sizing closely'
        };
      }
    }
    
    return null;
  }

  // Get current active streak for user
  static async getCurrentStreak(userId) {
    const query = `
      SELECT * FROM win_loss_streaks 
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  // Update current streak with new trade
  static async updateCurrentStreak(userId, newTrade, currentStreak) {
    const tradePnL = parseFloat(newTrade.pnl || 0);
    const isWin = tradePnL > 0;
    const isLoss = tradePnL < 0;
    
    // Skip breakeven trades
    if (tradePnL === 0) return currentStreak;
    
    const newTradeType = isWin ? 'win' : 'loss';
    const newPositionSize = this.calculateMonetaryPositionSize(newTrade);
    
    if (!currentStreak) {
      // Create new streak
      return await this.createNewStreak(userId, newTrade, newTradeType, newPositionSize);
    } else if (currentStreak.streak_type === newTradeType) {
      // Continue current streak
      return await this.continueStreak(userId, currentStreak, newTrade, newPositionSize);
    } else {
      // End current streak and start new one
      await this.endStreak(userId, currentStreak.id);
      return await this.createNewStreak(userId, newTrade, newTradeType, newPositionSize);
    }
  }

  // Create new streak record
  static async createNewStreak(userId, trade, streakType, positionSize) {
    const query = `
      INSERT INTO win_loss_streaks (
        user_id, streak_type, current_length, streak_start_date, 
        last_trade_date, total_pnl, trade_ids, baseline_position_size,
        max_position_size, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const result = await db.query(query, [
      userId,
      streakType,
      1,
      trade.entry_time,
      trade.exit_time || trade.entry_time,
      parseFloat(trade.pnl || 0),
      [trade.id],
      positionSize,
      positionSize,
      true
    ]);
    
    return result.rows[0];
  }

  // Continue existing streak
  static async continueStreak(userId, currentStreak, trade, positionSize) {
    const query = `
      UPDATE win_loss_streaks SET
        current_length = current_length + 1,
        last_trade_date = $3,
        total_pnl = total_pnl + $4,
        trade_ids = array_append(trade_ids, $5),
        max_position_size = GREATEST(max_position_size, $6),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [
      currentStreak.id,
      userId,
      trade.exit_time || trade.entry_time,
      parseFloat(trade.pnl || 0),
      trade.id,
      positionSize
    ]);
    
    return result.rows[0];
  }

  // End current streak
  static async endStreak(userId, streakId) {
    const query = `
      UPDATE win_loss_streaks SET
        is_active = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
    `;
    
    await db.query(query, [streakId, userId]);
  }
}

module.exports = OverconfidenceAnalyticsService;