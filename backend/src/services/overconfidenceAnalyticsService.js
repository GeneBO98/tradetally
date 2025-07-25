const db = require('../config/database');
const TierService = require('./tierService');
const aiService = require('../utils/aiService');
const adminSettingsService = require('./adminSettings');
const AnalyticsCache = require('./analyticsCache');

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
        error: 'Insufficient trades for analysis',
        message: `You currently have ${trades.length} completed trades. To detect overconfidence patterns, you need at least 10 completed trades. Keep trading and check back once you've reached this milestone!`,
        tradesAnalyzed: trades.length,
        currentTrades: trades.length,
        requiredTrades: 10,
        tradesNeeded: 10 - trades.length,
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
    
    let positionIncreasePercent = ((peakPositionSize - effectiveBaseline) / effectiveBaseline) * 100;
    
    // Cap the percentage to prevent database overflow (max 9999.99%)
    if (positionIncreasePercent > 9999.99) {
      console.warn(`Position increase percent capped from ${positionIncreasePercent}% to 9999.99%`);
      positionIncreasePercent = 9999.99;
    }

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

    // Check cache first
    const cacheKey = AnalyticsCache.generateKey('overconfidence_analysis', { 
      ...dateFilter, 
      page, 
      limit 
    });
    const cachedData = await AnalyticsCache.get(userId, cacheKey);
    
    if (cachedData) {
      console.log(`Returning cached overconfidence analysis for user ${userId}`);
      return cachedData;
    }

    console.log(`Cache miss - computing overconfidence analysis for user ${userId}`);

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

    // Transform events to camelCase for frontend with AI recommendations
    const transformedEvents = [];
    
    // Process AI recommendations in batches to respect rate limits
    const batchSize = 3; // Process max 3 events at a time
    const fallbackRecommendations = [
      'Consider implementing position sizing rules to limit increases during win streaks',
      'Set a maximum position size relative to your account',
      'Take partial profits during extended win streaks'
    ];

    for (let i = 0; i < eventsResult.rows.length; i += batchSize) {
      const batch = eventsResult.rows.slice(i, i + batchSize);
      
      // Process batch with delay between batches to respect rate limits
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between batches
      }

      for (const event of batch) {
        // Generate AI recommendations for each event
        const aiRecommendations = await this.generateAIRecommendations(event, userId).catch((error) => {
          console.warn(`Failed to generate AI recommendations for event ${event.id}:`, error.message);
          return fallbackRecommendations;
        });

        transformedEvents.push({
          id: event.id,
          winStreakLength: parseInt(event.win_streak_length),
          detectionDate: event.created_at,
          winStreakStartDate: event.win_streak_start_date,
          winStreakEndDate: event.win_streak_end_date,
          baselinePositionSize: parseFloat(event.baseline_position_size),
          peakPositionSize: parseFloat(event.peak_position_size),
          positionSizeIncrease: parseFloat(event.position_size_increase_percent),
          streakPnl: parseFloat(event.total_streak_profit || 0),
          severity: event.severity,
          confidenceScore: parseFloat(event.confidence_score),
          outcomeAfterStreak: event.outcome_after_streak,
          outcomeTradeId: event.outcome_trade_id,
          subsequentTradeResult: parseFloat(event.outcome_amount || 0),
          totalImpact: parseFloat(event.outcome_amount || 0),
          streakTrades: event.streak_trades,
          outcomeStatus: event.outcome_status,
          recommendations: aiRecommendations || fallbackRecommendations
        });
      }
    }

    // Add trade details if needed
    for (let i = 0; i < transformedEvents.length; i++) {
      const event = eventsResult.rows[i];
      
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
        transformedEvents[i].streakTradeDetails = tradesResult.rows;
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
          transformedEvents[i].outcomeTradeDetails = outcomeResult.rows[0];
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

    // Get win streak analysis
    const winStreakQuery = `
      SELECT 
        MAX(win_streak_length) as longest_streak,
        AVG(win_streak_length) as avg_streak_length,
        AVG(position_size_increase_percent) as avg_position_growth,
        COUNT(DISTINCT user_id) as unique_users
      FROM overconfidence_events
      WHERE user_id = $1 ${dateCondition}
    `;
    
    const winStreakResult = await db.query(winStreakQuery, baseParams);
    const winStreakStats = winStreakResult.rows[0];

    // Calculate performance impact and success rate
    const performanceImpact = parseFloat(stats.total_losses_after_streaks || 0) - parseFloat(stats.total_streak_profits || 0);
    const successRate = totalEvents > 0 ? 
      (parseFloat(stats.streaks_ending_in_profit || 0) / totalEvents * 100) : 0;

    const result = {
      events: transformedEvents,
      statistics: {
        totalEvents: totalEvents,
        avgStreakLength: parseFloat(stats.avg_streak_length || 0),
        avgPositionIncrease: parseFloat(stats.avg_position_increase || 0),
        totalStreakProfits: parseFloat(stats.total_streak_profits || 0),
        totalLossesAfterStreaks: parseFloat(stats.total_losses_after_streaks || 0),
        streaksEndingInLoss: parseInt(stats.streaks_ending_in_loss || 0),
        streaksEndingInProfit: parseInt(stats.streaks_ending_in_profit || 0),
        highSeverityCount: parseInt(stats.high_severity_count || 0),
        mediumSeverityCount: parseInt(stats.medium_severity_count || 0),
        lowSeverityCount: parseInt(stats.low_severity_count || 0),
        lossRate: totalEvents > 0 ? parseFloat(((stats.streaks_ending_in_loss / totalEvents) * 100).toFixed(1)) : 0,
        profitRate: totalEvents > 0 ? parseFloat(((stats.streaks_ending_in_profit / totalEvents) * 100).toFixed(1)) : 0,
        performanceImpact: performanceImpact,
        successRate: successRate
      },
      winStreakAnalysis: {
        longestStreak: parseInt(winStreakStats.longest_streak || 0),
        avgStreakLength: parseFloat(winStreakStats.avg_streak_length || 0),
        avgPositionGrowth: parseFloat(winStreakStats.avg_position_growth || 0)
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

    // Cache the result for 2 hours
    await AnalyticsCache.set(userId, cacheKey, result, 120);
    
    return result;
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

  // Generate AI-powered recommendations for overconfidence events
  static async generateAIRecommendations(event, userId) {
    try {
      // First check if we already have cached AI recommendations for this event
      const cachedRecommendations = await this.getCachedAIRecommendations(event.id);
      if (cachedRecommendations && cachedRecommendations.length > 0) {
        console.log(`Using cached AI recommendations for event ${event.id}`);
        return cachedRecommendations;
      }

      // Check for similar events with existing AI recommendations
      const similarEventRecommendations = await this.findSimilarEventRecommendations(event, userId);
      if (similarEventRecommendations && similarEventRecommendations.length > 0) {
        console.log(`Using recommendations from similar event for event ${event.id}`);
        // Store these recommendations for this event too
        await this.storeAIRecommendations(event.id, similarEventRecommendations, 'cached_similar');
        return similarEventRecommendations;
      }

      // Get user AI settings (with admin defaults as fallback)
      const aiSettings = await aiService.getUserSettings(userId);
      
      if (!aiSettings.provider || !aiSettings.apiKey) {
        console.log('AI recommendations not available - no AI provider configured');
        return null;
      }

      // Check rate limiting for AI provider (especially for free tier)
      const canMakeRequest = await this.checkAIRateLimit(aiSettings.provider);
      if (!canMakeRequest) {
        console.log(`AI rate limit exceeded for ${aiSettings.provider}, using cached or fallback recommendations`);
        return null; // Will trigger fallback to static recommendations
      }

      // Get additional context about the user's trading patterns
      const userContext = await this.getUserTradingContext(userId);
      
      // Check for similarity hash based recommendations (most efficient)
      const similarityHash = this.generateEventSimilarityHash(event, userContext);
      const hashBasedRecommendations = await this.getRecommendationsByHash(similarityHash, userId);
      if (hashBasedRecommendations && hashBasedRecommendations.length > 0) {
        console.log(`Using hash-based recommendations for event ${event.id}, hash: ${similarityHash}`);
        // Store these recommendations for this event with the hash
        const recommendationsWithHash = {
          recommendations: hashBasedRecommendations,
          similarity_hash: similarityHash,
          source: 'hash_match'
        };
        await this.storeAIRecommendations(event.id, hashBasedRecommendations, 'cached_hash');
        return hashBasedRecommendations;
      }
      
      // Create a comprehensive prompt for the AI
      const prompt = this.buildOverconfidencePrompt(event, userContext);
      
      // Use AI provider to generate recommendations
      const provider = aiService.providers[aiSettings.provider];
      if (!provider) {
        console.log(`AI provider ${aiSettings.provider} not supported for recommendations`);
        return null;
      }

      const response = await provider(prompt, aiSettings, { 
        maxTokens: 500,
        temperature: 0.7 
      });
      
      // Parse the AI response into an array of recommendations
      const recommendations = this.parseAIRecommendations(response);
      
      // Store the AI recommendations for future use and caching with event data for similarity hashing
      await this.storeAIRecommendations(event.id, recommendations, aiSettings.provider, event);
      
      // Update rate limiting tracking
      await this.updateAIRateLimit(aiSettings.provider);
      
      return recommendations;
      
    } catch (error) {
      console.error('Error generating AI recommendations:', error.message);
      
      // If it's a rate limit error, track it
      if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('rate limit')) {
        await this.handleAIRateLimit(error);
      }
      
      return null;
    }
  }

  // Get additional trading context for the user
  static async getUserTradingContext(userId) {
    const contextQuery = `
      SELECT 
        COUNT(*) as total_trades,
        AVG(pnl) as avg_pnl,
        (COUNT(*) FILTER (WHERE pnl > 0))::float / COUNT(*) as win_rate,
        AVG(quantity * entry_price) as avg_position_size,
        COUNT(DISTINCT symbol) as symbols_traded,
        EXTRACT(DAYS FROM (MAX(entry_time) - MIN(entry_time))) as trading_days
      FROM trades 
      WHERE user_id = $1 AND exit_price IS NOT NULL
    `;
    
    const result = await db.query(contextQuery, [userId]);
    return result.rows[0];
  }

  // Build a comprehensive prompt for overconfidence analysis
  static buildOverconfidencePrompt(event, userContext) {
    return `You are an expert trading psychology consultant analyzing overconfidence behavior. A trader has exhibited the following overconfidence pattern:

OVERCONFIDENCE EVENT DETAILS:
- Win streak length: ${event.win_streak_length} consecutive profitable trades
- Position size increase: ${event.position_size_increase_percent}% above baseline
- Total profit from streak: $${event.total_streak_profit || 0}
- Severity level: ${event.severity}
- Confidence score: ${event.confidence_score}
- Outcome after streak: ${event.outcome_after_streak || 'ongoing'}
- Subsequent trade result: $${event.outcome_amount || 0}

TRADER'S OVERALL PROFILE:
- Total trades: ${userContext.total_trades || 0}
- Average P&L per trade: $${parseFloat(userContext.avg_pnl || 0).toFixed(2)}
- Win rate: ${(parseFloat(userContext.win_rate || 0) * 100).toFixed(1)}%
- Average position size: $${parseFloat(userContext.avg_position_size || 0).toFixed(2)}
- Symbols traded: ${userContext.symbols_traded || 0}
- Trading experience: ${Math.max(1, Math.floor(userContext.trading_days / 30) || 1)} months

Based on this overconfidence event and the trader's profile, provide 3-4 specific, actionable recommendations to help prevent future overconfidence episodes. Focus on:

1. Position sizing discipline
2. Risk management techniques  
3. Psychological awareness strategies
4. Practical implementation steps

Format your response as a simple list where each recommendation is on a new line and starts with a dash (-). Keep each recommendation concise (1-2 sentences) but specific to this trader's situation.

Example format:
- Implement a maximum position size rule of 2x your baseline to prevent emotional scaling
- Set profit-taking targets at 3 consecutive wins to lock in gains before overconfidence peaks
- Use a trading journal to track emotional state during win streaks
- Consider reducing position size by 25% after any 4-trade win streak`;
  }

  // Parse AI response into an array of recommendations
  static parseAIRecommendations(aiResponse) {
    if (!aiResponse) return [];
    
    // Handle object responses (convert to string first)
    let responseText;
    if (typeof aiResponse === 'object') {
      // Handle different object response formats
      if (aiResponse.content) {
        responseText = aiResponse.content;
      } else if (aiResponse.text) {
        responseText = aiResponse.text;
      } else if (aiResponse.message) {
        responseText = aiResponse.message;
      } else if (aiResponse.response) {
        responseText = aiResponse.response;
      } else {
        // If it's an object with no known text property, convert to string
        responseText = JSON.stringify(aiResponse);
      }
    } else if (typeof aiResponse === 'string') {
      responseText = aiResponse;
    } else {
      console.warn('Unexpected AI response type:', typeof aiResponse);
      return [];
    }
    
    // Split by lines and filter for lines that start with dash or bullet
    const lines = responseText.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('•') || line.startsWith('*'))
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 10); // Filter out very short lines
    
    // If no structured format found, try to extract sentences
    if (lines.length === 0) {
      const sentences = responseText.split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20 && s.length < 200)
        .slice(0, 4); // Max 4 recommendations
      
      return sentences.length > 0 ? sentences : [];
    }
    
    return lines.slice(0, 4); // Max 4 recommendations
  }

  // Store AI recommendations for analysis and improvement
  static async storeAIRecommendations(eventId, recommendations, aiProvider, event = null) {
    try {
      let recommendationsData = recommendations;
      
      // If event data is provided, generate similarity hash and include it
      if (event) {
        const userContext = await this.getUserTradingContext(event.user_id || null);
        const similarityHash = this.generateEventSimilarityHash(event, userContext);
        
        // Store recommendations with similarity hash for efficient future matching
        recommendationsData = {
          recommendations: Array.isArray(recommendations) ? recommendations : [recommendations],
          similarity_hash: similarityHash,
          generated_at: new Date().toISOString(),
          source: 'ai_generated'
        };
      } else if (!Array.isArray(recommendations)) {
        // Ensure recommendations is always in a consistent format
        recommendationsData = Array.isArray(recommendations) ? recommendations : [recommendations];
      }
      
      const query = `
        UPDATE overconfidence_events 
        SET ai_recommendations = $1, ai_provider = $2, ai_generated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `;
      
      await db.query(query, [JSON.stringify(recommendationsData), aiProvider, eventId]);
    } catch (error) {
      console.warn('Failed to store AI recommendations:', error.message);
    }
  }

  // Get cached AI recommendations from database
  static async getCachedAIRecommendations(eventId) {
    try {
      const query = `
        SELECT ai_recommendations 
        FROM overconfidence_events 
        WHERE id = $1 AND ai_recommendations IS NOT NULL
      `;
      
      const result = await db.query(query, [eventId]);
      if (result.rows.length > 0 && result.rows[0].ai_recommendations) {
        let recommendationsData = result.rows[0].ai_recommendations;
        
        // If it's already an object (database returned parsed JSON), use it directly
        if (typeof recommendationsData === 'object' && recommendationsData !== null) {
          // Handle structured data format
          if (recommendationsData.recommendations) {
            return Array.isArray(recommendationsData.recommendations) ? 
                   recommendationsData.recommendations : 
                   [recommendationsData.recommendations];
          }
          // Handle array format
          if (Array.isArray(recommendationsData)) {
            return recommendationsData;
          }
          // Single recommendation
          return [recommendationsData];
        }
        
        // If it's a string, try to parse as JSON
        if (typeof recommendationsData === 'string') {
          try {
            recommendationsData = JSON.parse(recommendationsData);
          } catch (parseError) {
            console.warn('Invalid JSON in ai_recommendations, treating as plain text:', parseError.message);
            // Split plain text into lines
            return recommendationsData.split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 10)
              .slice(0, 4);
          }
        }
        
        // Handle new object format with structured data
        if (recommendationsData && typeof recommendationsData === 'object' && recommendationsData.recommendations) {
          return Array.isArray(recommendationsData.recommendations) ? 
                 recommendationsData.recommendations : 
                 [recommendationsData.recommendations];
        }
        
        // Handle both old and new formats
        if (Array.isArray(recommendationsData)) {
          return recommendationsData; // Old format
        } else if (recommendationsData.recommendations) {
          return recommendationsData.recommendations; // New format
        } else {
          return [recommendationsData]; // Single recommendation
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to get cached AI recommendations:', error.message);
      return null;
    }
  }

  // Check if we can make an AI request (rate limiting)
  static async checkAIRateLimit(provider) {
    try {
      // For Gemini free tier: 15 requests per minute
      // For other providers, we'll be more conservative
      const limits = {
        'gemini': { requests: 10, windowMinutes: 1 }, // Conservative limit
        'claude': { requests: 50, windowMinutes: 1 },
        'openai': { requests: 50, windowMinutes: 1 },
        'ollama': { requests: 100, windowMinutes: 1 } // Local, no limit
      };

      const limit = limits[provider] || limits['gemini']; // Default to Gemini's conservative limit
      const windowStart = new Date(Date.now() - (limit.windowMinutes * 60 * 1000));

      // Check recent AI requests for this provider
      const query = `
        SELECT COUNT(*) as request_count
        FROM overconfidence_events 
        WHERE ai_provider = $1 
          AND ai_generated_at >= $2
      `;

      const result = await db.query(query, [provider, windowStart]);
      const requestCount = parseInt(result.rows[0].request_count || 0);

      console.log(`AI rate limit check for ${provider}: ${requestCount}/${limit.requests} requests in last ${limit.windowMinutes} minute(s)`);
      
      return requestCount < limit.requests;
    } catch (error) {
      console.warn('Error checking AI rate limit:', error.message);
      return true; // Allow request if check fails
    }
  }

  // Update rate limiting tracking
  static async updateAIRateLimit(provider) {
    // This is automatically handled by storeAIRecommendations
    // which updates ai_generated_at timestamp
    console.log(`Updated rate limit tracking for ${provider}`);
  }

  // Handle rate limit errors
  static async handleAIRateLimit(error) {
    try {
      console.warn('AI rate limit exceeded, implementing backoff strategy');
      
      // Log the rate limit event for monitoring
      const logQuery = `
        INSERT INTO admin_logs (log_level, message, context, created_at)
        VALUES ('warning', 'AI rate limit exceeded', $1, CURRENT_TIMESTAMP)
      `;
      
      const context = {
        error_type: 'ai_rate_limit',
        error_message: error.message,
        timestamp: new Date().toISOString()
      };

      await db.query(logQuery, [JSON.stringify(context)]).catch(() => {
        // Ignore if admin_logs table doesn't exist
      });

    } catch (logError) {
      console.warn('Failed to log rate limit event:', logError.message);
    }
  }

  // Find similar overconfidence events with existing AI recommendations
  static async findSimilarEventRecommendations(event, userId) {
    try {
      // Define similarity criteria for overconfidence events
      const winStreakTolerance = 1; // ±1 trade
      const positionSizeTolerance = 15; // ±15%
      const severityMatch = event.severity;

      const query = `
        SELECT ai_recommendations
        FROM overconfidence_events
        WHERE user_id = $1
          AND id != $2
          AND ai_recommendations IS NOT NULL
          AND ai_provider != 'cached_similar'
          AND severity = $3
          AND ABS(win_streak_length - $4) <= $5
          AND ABS(position_size_increase_percent - $6) <= $7
          AND ai_generated_at >= NOW() - INTERVAL '30 days'
        ORDER BY ai_generated_at DESC
        LIMIT 1
      `;

      const result = await db.query(query, [
        userId,
        event.id,
        severityMatch,
        parseInt(event.win_streak_length),
        winStreakTolerance,
        parseFloat(event.position_size_increase_percent),
        positionSizeTolerance
      ]);

      if (result.rows.length > 0) {
        let recommendations;
        
        try {
          recommendations = JSON.parse(result.rows[0].ai_recommendations);
        } catch (parseError) {
          console.warn('Error finding similar event recommendations:', parseError.message);
          return null;
        }
        
        console.log(`Found similar event with recommendations for user ${userId}, event ${event.id}`);
        
        // Handle object format with structured data
        if (recommendations && typeof recommendations === 'object' && recommendations.recommendations) {
          return Array.isArray(recommendations.recommendations) ? 
                 recommendations.recommendations : 
                 [recommendations.recommendations];
        }
        
        // Handle array format
        if (Array.isArray(recommendations)) {
          return recommendations;
        }
        
        return [recommendations]; // Single recommendation
      }

      return null;
    } catch (error) {
      console.warn('Error finding similar event recommendations:', error.message);
      return null;
    }
  }

  // Generate event similarity hash for even more efficient caching
  static generateEventSimilarityHash(event, userContext) {
    // Create a hash based on key characteristics that affect recommendations
    const characteristics = {
      severity: event.severity,
      streakLength: Math.floor(parseInt(event.win_streak_length) / 2) * 2, // Round to even numbers
      positionIncrease: Math.floor(parseFloat(event.position_size_increase_percent) / 10) * 10, // Round to nearest 10%
      experienceLevel: userContext.total_trades > 100 ? 'experienced' : userContext.total_trades > 20 ? 'intermediate' : 'beginner',
      tradeSize: userContext.avg_position_size > 10000 ? 'large' : userContext.avg_position_size > 1000 ? 'medium' : 'small'
    };

    // Create a simple hash from the characteristics
    const hashString = Object.values(characteristics).join('|');
    return Buffer.from(hashString).toString('base64').substring(0, 16);
  }

  // Get recommendations by similarity hash (even more efficient than event matching)
  static async getRecommendationsByHash(similarityHash, userId) {
    try {
      const query = `
        SELECT ai_recommendations
        FROM overconfidence_events
        WHERE user_id = $1
          AND ai_recommendations IS NOT NULL
          AND ai_provider != 'cached_similar'
          AND ai_generated_at >= NOW() - INTERVAL '30 days'
          AND (ai_recommendations->>'similarity_hash') = $2
        ORDER BY ai_generated_at DESC
        LIMIT 1
      `;

      const result = await db.query(query, [userId, similarityHash]);
      
      if (result.rows.length > 0) {
        let recommendationsData;
        
        try {
          recommendationsData = JSON.parse(result.rows[0].ai_recommendations);
        } catch (parseError) {
          console.warn('Error getting recommendations by hash:', parseError.message);
          return null;
        }
        
        console.log(`Found recommendations by similarity hash: ${similarityHash}`);
        
        // Return recommendations array, handling both old and new formats
        if (Array.isArray(recommendationsData)) {
          return recommendationsData; // Old format
        } else if (recommendationsData && recommendationsData.recommendations) {
          return recommendationsData.recommendations; // New format
        } else {
          return [recommendationsData]; // Single recommendation
        }
      }

      return null;
    } catch (error) {
      console.warn('Error getting recommendations by hash:', error.message);
      return null;
    }
  }
}

module.exports = OverconfidenceAnalyticsService;