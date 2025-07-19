const db = require('../config/database');
const TierService = require('./tierService');

class BehavioralAnalyticsService {
  
  // Get behavioral analytics overview for a user
  static async getBehavioralOverview(userId, dateFilter = '') {
    // Check if user has access to behavioral analytics
    const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
    if (!hasAccess) {
      throw new Error('Behavioral analytics requires Pro tier');
    }

    const params = [userId];
    let paramCount = 1;

    // Add date filter if provided
    let dateCondition = '';
    if (dateFilter.startDate && dateFilter.endDate) {
      dateCondition = ` AND detected_at >= $${++paramCount} AND detected_at <= $${++paramCount}`;
      params.push(dateFilter.startDate, dateFilter.endDate);
    }

    // Get pattern summary
    const patternQuery = `
      SELECT 
        pattern_type,
        COUNT(*) as total_occurrences,
        AVG(confidence_score) as avg_confidence,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity_count,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_severity_count,
        COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_severity_count,
        MAX(detected_at) as last_occurrence
      FROM behavioral_patterns 
      WHERE user_id = $1 ${dateCondition}
      GROUP BY pattern_type
      ORDER BY total_occurrences DESC
    `;

    const patternResult = await db.query(patternQuery, params);

    // Get recent alerts
    const alertQuery = `
      SELECT 
        ba.*,
        bp.pattern_type,
        bp.severity as pattern_severity
      FROM behavioral_alerts ba
      LEFT JOIN behavioral_patterns bp ON ba.pattern_id = bp.id
      WHERE ba.user_id = $1 ${dateCondition.replace('detected_at', 'ba.created_at')}
      ORDER BY ba.created_at DESC
      LIMIT 10
    `;

    const alertResult = await db.query(alertQuery, params);

    // Get user settings
    const settingsQuery = `
      SELECT * FROM behavioral_settings WHERE user_id = $1
    `;
    const settingsResult = await db.query(settingsQuery, [userId]);

    return {
      patterns: patternResult.rows,
      recentAlerts: alertResult.rows,
      settings: settingsResult.rows[0] || null
    };
  }

  // Get detailed revenge trading analysis
  static async getRevengeTradeAnalysis(userId, dateFilter = '', paginationOptions = {}) {
    const hasAccess = await TierService.hasFeatureAccess(userId, 'revenge_trading_detection');
    if (!hasAccess) {
      throw new Error('Revenge trading detection requires Pro tier');
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
      FROM revenge_trading_events rte
      WHERE user_id = $1 ${dateCondition}
    `;
    const countResult = await db.query(countQuery, baseParams);
    const totalCount = parseInt(countResult.rows[0].total_count);

    // Get revenge trading events with pagination
    const eventsQuery = `
      SELECT 
        rte.*,
        array_length(revenge_trades, 1) as trade_count,
        CASE 
          WHEN total_additional_loss > 0 THEN 'loss'
          WHEN total_additional_loss < 0 THEN 'profit'
          ELSE 'neutral'
        END as outcome_type
      FROM revenge_trading_events rte
      WHERE user_id = $1 ${dateCondition}
      ORDER BY created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
    
    // Create params array with pagination parameters for events query
    const eventsParams = [...baseParams, limit, offset];

    const eventsResult = await db.query(eventsQuery, eventsParams);

    // Enhance events with trade details
    for (let event of eventsResult.rows) {
      // Get trigger trade info with calculated P&L
      if (event.trigger_trade_id) {
        const triggerQuery = `
          SELECT 
            id, symbol, entry_price, exit_price, quantity, side, entry_time, exit_time, 
            commission, fees, pnl
          FROM trades WHERE id = $1
        `;
        const triggerResult = await db.query(triggerQuery, [event.trigger_trade_id]);
        if (triggerResult.rows[0]) {
          event.trigger_trade = triggerResult.rows[0];
        }
      }

      // Get revenge trade details from the revenge_trades array
      if (event.revenge_trades && event.revenge_trades.length > 0) {
        const revengeTradesQuery = `
          SELECT 
            t.id as trade_id, t.symbol, t.entry_price, t.exit_price, t.quantity, t.side, 
            t.entry_time, t.exit_time, t.pnl, t.commission, t.fees,
            -- Calculate total cost/value
            (t.quantity * t.entry_price) as total_cost,
            -- Calculate gross P&L (before fees)
            CASE 
              WHEN t.side = 'long' THEN (t.exit_price - t.entry_price) * t.quantity
              WHEN t.side = 'short' THEN (t.entry_price - t.exit_price) * t.quantity
              ELSE 0
            END as gross_pnl,
            -- Calculate percentage return
            CASE 
              WHEN t.side = 'long' THEN ((t.exit_price - t.entry_price) / t.entry_price) * 100
              WHEN t.side = 'short' THEN ((t.entry_price - t.exit_price) / t.entry_price) * 100
              ELSE 0
            END as return_percent,
            -- Calculate total fees
            COALESCE(t.commission, 0) + COALESCE(t.fees, 0) as total_fees,
            -- Pattern classification
            CASE 
              WHEN t.symbol = (SELECT symbol FROM trades WHERE id = $1) THEN 'same_symbol_revenge'
              ELSE 'emotional_reactive_trading'
            END as pattern_type,
            'medium' as severity,
            0.8 as confidence_score,
            t.entry_time as detected_at
          FROM trades t
          WHERE t.id = ANY($2)
          ORDER BY t.entry_time DESC
          LIMIT 10
        `;
        const patternsResult = await db.query(revengeTradesQuery, [
          event.trigger_trade_id, 
          event.revenge_trades
        ]);
        event.related_patterns = patternsResult.rows;
      } else {
        event.related_patterns = [];
      }
    }

    // Get statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_events,
        AVG(total_revenge_trades) as avg_trades_per_event,
        AVG(time_window_minutes) as avg_duration_minutes,
        AVG(position_size_increase_percent) as avg_size_increase,
        SUM(total_additional_loss) as total_additional_loss,
        COUNT(CASE WHEN total_additional_loss > 0 THEN 1 END) as loss_events,
        COUNT(CASE WHEN total_additional_loss <= 0 THEN 1 END) as profit_or_neutral_events,
        COUNT(CASE WHEN pattern_broken = true THEN 1 END) as pattern_broken_count,
        COUNT(CASE WHEN cooling_period_used = true THEN 1 END) as cooling_period_used_count
      FROM revenge_trading_events
      WHERE user_id = $1 ${dateCondition}
    `;

    const statsResult = await db.query(statsQuery, baseParams);

    // Calculate success rates
    const stats = statsResult.rows[0];
    const totalEvents = parseInt(stats.total_events);
    
    return {
      events: eventsResult.rows,
      statistics: {
        ...stats,
        loss_rate: totalEvents > 0 ? (stats.loss_events / totalEvents * 100).toFixed(1) : 0,
        pattern_break_rate: totalEvents > 0 ? (stats.pattern_broken_count / totalEvents * 100).toFixed(1) : 0,
        cooling_period_usage_rate: totalEvents > 0 ? (stats.cooling_period_used_count / totalEvents * 100).toFixed(1) : 0
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

  // Create or update user behavioral settings
  static async updateBehavioralSettings(userId, settings) {
    const query = `
      INSERT INTO behavioral_settings (
        user_id, revenge_trading_enabled, revenge_trading_sensitivity,
        cooling_period_minutes, enable_trade_blocking, alert_preferences
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) 
      DO UPDATE SET
        revenge_trading_enabled = EXCLUDED.revenge_trading_enabled,
        revenge_trading_sensitivity = EXCLUDED.revenge_trading_sensitivity,
        cooling_period_minutes = EXCLUDED.cooling_period_minutes,
        enable_trade_blocking = EXCLUDED.enable_trade_blocking,
        alert_preferences = EXCLUDED.alert_preferences,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      userId,
      settings.revengeTrading?.enabled ?? true,
      settings.revengeTrading?.sensitivity ?? 'medium',
      settings.coolingPeriod?.minutes ?? 30,
      false, // Trade blocking removed
      JSON.stringify(settings.alertPreferences ?? {email: false, push: true, toast: true})
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Get user behavioral settings
  static async getBehavioralSettings(userId) {
    const query = `
      SELECT * FROM behavioral_settings WHERE user_id = $1
    `;
    const result = await db.query(query, [userId]);
    
    // Return default settings if none exist
    if (result.rows.length === 0) {
      return {
        revengeTrading: { enabled: true, sensitivity: 'medium' },
        coolingPeriod: { minutes: 30 },
        alertPreferences: { email: false, push: true, toast: true }
      };
    }

    const settings = result.rows[0];
    return {
      revengeTrading: { 
        enabled: settings.revenge_trading_enabled, 
        sensitivity: settings.revenge_trading_sensitivity 
      },
      coolingPeriod: { minutes: settings.cooling_period_minutes },
      alertPreferences: settings.alert_preferences
    };
  }

  // Acknowledge an alert
  static async acknowledgeAlert(userId, alertId, response = {}) {
    const query = `
      UPDATE behavioral_alerts 
      SET 
        status = 'acknowledged',
        acknowledged_at = CURRENT_TIMESTAMP,
        user_response = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, [alertId, userId, JSON.stringify(response)]);
    return result.rows[0];
  }

  // Get active alerts for a user
  static async getActiveAlerts(userId) {
    const query = `
      SELECT 
        ba.*,
        bp.pattern_type,
        bp.severity as pattern_severity
      FROM behavioral_alerts ba
      LEFT JOIN behavioral_patterns bp ON ba.pattern_id = bp.id
      WHERE ba.user_id = $1 
        AND ba.status = 'active'
        AND (ba.expires_at IS NULL OR ba.expires_at > CURRENT_TIMESTAMP)
      ORDER BY ba.created_at DESC
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Clear existing historical behavioral data for a user
  static async clearHistoricalData(userId) {
    const queries = [
      'DELETE FROM revenge_trading_events WHERE user_id = $1',
      'DELETE FROM behavioral_patterns WHERE user_id = $1',
      'DELETE FROM behavioral_alerts WHERE user_id = $1'
    ];

    for (const query of queries) {
      await db.query(query, [userId]);
    }
  }

  // Analyze historical trades for behavioral patterns
  static async analyzeHistoricalTrades(userId, clearExisting = true) {
    const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
    if (!hasAccess) {
      throw new Error('Historical analysis requires Pro tier');
    }

    // Clear existing data if requested
    if (clearExisting) {
      await this.clearHistoricalData(userId);
    }

    // Get all completed trades for the user, ordered by entry time
    const tradesQuery = `
      SELECT 
        id, symbol, entry_time, exit_time, entry_price, exit_price, 
        quantity, side, commission, fees,
        CASE 
          WHEN exit_price IS NOT NULL THEN
            CASE 
              WHEN side = 'long' THEN 
                ((exit_price - entry_price) * quantity) - COALESCE(commission, 0) - COALESCE(fees, 0)
              WHEN side = 'short' THEN 
                ((entry_price - exit_price) * quantity) - COALESCE(commission, 0) - COALESCE(fees, 0)
            END
          ELSE NULL
        END as pnl
      FROM trades 
      WHERE user_id = $1 
        AND exit_price IS NOT NULL 
        AND exit_time IS NOT NULL
      ORDER BY entry_time ASC
    `;

    const tradesResult = await db.query(tradesQuery, [userId]);
    const trades = tradesResult.rows;

    let tradesAnalyzed = 0;
    let patternsDetected = 0;

    // Analyze trades for revenge trading patterns
    for (let i = 1; i < trades.length; i++) {
      const currentTrade = trades[i];
      const previousTrades = trades.slice(0, i);
      
      // Look for trigger events (losses) in the last 2 hours before current trade
      const currentTradeTime = new Date(currentTrade.entry_time);
      const lookbackTime = new Date(currentTradeTime.getTime() - (2 * 60 * 60 * 1000)); // 2 hours back
      
      const triggerEvents = previousTrades.filter(trade => {
        const tradeTime = new Date(trade.exit_time);
        return tradeTime >= lookbackTime && 
               tradeTime <= currentTradeTime && 
               parseFloat(trade.pnl) < 0; // Loss
      });

      if (triggerEvents.length === 0) {
        continue;
      }

      tradesAnalyzed++;

      // Analyze for revenge trading patterns
      const patterns = await this.detectHistoricalRevengePatterns(
        userId, currentTrade, previousTrades, triggerEvents
      );

      if (patterns.length > 0) {
        patternsDetected++;
        
        // Record the patterns
        for (const pattern of patterns) {
          await this.recordHistoricalPattern(userId, pattern, currentTrade);
        }
      }
    }

    return {
      tradesAnalyzed,
      patternsDetected,
      totalTrades: trades.length
    };
  }

  // Calculate estimated account size from trading history
  static async estimateAccountSize(userId, trades) {
    // Method 1: Use average position size over recent trades (conservative estimate)
    const recentTrades = trades.slice(-30); // Last 30 trades
    if (recentTrades.length === 0) return null;

    const avgPositionSize = recentTrades.reduce((sum, trade) => 
      sum + (parseFloat(trade.quantity) * parseFloat(trade.entry_price)), 0
    ) / recentTrades.length;

    // Assume average position is 2-5% of account (conservative trading)
    // Use 3% as middle ground
    const estimatedAccountSize = avgPositionSize / 0.03;

    return Math.round(estimatedAccountSize);
  }

  // Get sensitivity thresholds based on user settings
  static getPercentageThresholds(sensitivity = 'medium') {
    const thresholds = {
      low: {
        triggerLossPercent: 5.0,    // 5%+ loss triggers revenge detection
        revengeLossPercent: 1.0,    // 1%+ additional loss is considered revenge
        maxHoursAfterLoss: 24       // Within 24 hours
      },
      medium: {
        triggerLossPercent: 3.0,    // 3%+ loss triggers revenge detection  
        revengeLossPercent: 0.5,    // 0.5%+ additional loss is considered revenge
        maxHoursAfterLoss: 12       // Within 12 hours
      },
      high: {
        triggerLossPercent: 1.0,    // 1%+ loss triggers revenge detection
        revengeLossPercent: 0.25,   // 0.25%+ additional loss is considered revenge  
        maxHoursAfterLoss: 6        // Within 6 hours
      }
    };

    return thresholds[sensitivity] || thresholds.medium;
  }

  // Detect percentage-based revenge trading patterns
  static async detectHistoricalRevengePatterns(userId, currentTrade, previousTrades, triggerEvents) {
    const patterns = [];
    
    // Calculate estimated account size
    const accountSize = await this.estimateAccountSize(userId, previousTrades);
    if (!accountSize) return patterns; // Can't determine account size

    // Get user settings for sensitivity
    const userSettings = await this.getUserSettings(userId);
    const sensitivity = userSettings?.revenge_trading_sensitivity || 'medium';
    const thresholds = this.getPercentageThresholds(sensitivity);

    // Consider both same-symbol revenge and broader emotional reactive trading
    for (const triggerLoss of triggerEvents) {
      const lossTime = new Date(triggerLoss.exit_time);
      const currentTradeTime = new Date(currentTrade.entry_time);
      const hoursSinceLoss = (currentTradeTime - lossTime) / (1000 * 60 * 60);
      
      // Check if within time window
      if (hoursSinceLoss > thresholds.maxHoursAfterLoss) continue;

      const triggerLossAmount = Math.abs(parseFloat(triggerLoss.pnl));
      const triggerLossPercent = (triggerLossAmount / accountSize) * 100;

      // Check if trigger loss is significant enough
      if (triggerLossPercent < thresholds.triggerLossPercent) continue;

      // Revenge trading is about the BEHAVIOR (trading same symbol after loss),
      // not necessarily the outcome. Calculate position size to assess emotional scaling.
      const currentPositionSize = parseFloat(currentTrade.quantity) * parseFloat(currentTrade.entry_price);
      const currentPositionPercent = (currentPositionSize / accountSize) * 100;

      // Calculate outcome if trade is complete
      const currentPnl = currentTrade.exit_price ? 
        this.calculateTradePnL(currentTrade) : null;
      
      // Store the actual P&L (positive for profit, negative for loss)
      const revengeTradeResult = currentPnl || 0;
      const currentLossAmount = currentPnl && currentPnl < 0 ? Math.abs(currentPnl) : 0;
      const currentLossPercent = currentLossAmount ? (currentLossAmount / accountSize) * 100 : 0;

      // Determine pattern type and base confidence
      const isSameSymbol = currentTrade.symbol === triggerLoss.symbol;
      const patternType = isSameSymbol ? 'same_symbol_revenge' : 'emotional_reactive_trading';
      let patternSeverity = 'low';
      let confidence = isSameSymbol ? 0.7 : 0.5; // Higher confidence for same symbol

      // Adjust time window thresholds based on pattern type
      const timeThresholds = isSameSymbol 
        ? { high: 4, medium: 12 }    // Same symbol: more lenient timing
        : { high: 1, medium: 3 };    // Different symbol: stricter timing for emotional reaction

      // Increase severity based on timing (more emotional = higher severity)
      if (hoursSinceLoss <= timeThresholds.high) {
        patternSeverity = 'high';
        confidence += 0.3;
      } else if (hoursSinceLoss <= timeThresholds.medium) {
        patternSeverity = 'medium';
        confidence += 0.2;
      } else if (!isSameSymbol && hoursSinceLoss > 3) {
        // For different symbols, only detect if very close in time (emotional reaction)
        continue;
      }

      // Increase confidence for larger trigger losses (more emotional impact)
      confidence += Math.min(triggerLossPercent / 10, 0.2);

      // Calculate position size comparison
      const triggerPositionSize = parseFloat(triggerLoss.quantity) * parseFloat(triggerLoss.entry_price);
      const positionIncrease = ((currentPositionSize - triggerPositionSize) / triggerPositionSize) * 100;
      
      // Increase severity if position size increased significantly after loss
      if (positionIncrease > 50) {
        patternSeverity = patternSeverity === 'low' ? 'medium' : 'high';
        confidence += 0.2;
      }

      // Cap confidence
      confidence = Math.min(confidence, 1.0);

      patterns.push({
        pattern_type: patternType,
        severity: patternSeverity,
        confidence_score: confidence,
        metrics: {
          symbol: currentTrade.symbol,
          triggerSymbol: triggerLoss.symbol,
          isSameSymbol: isSameSymbol,
          triggerLossAmount: triggerLossAmount,
          triggerLossPercent: Number(triggerLossPercent.toFixed(2)),
          currentPositionSize: Math.round(currentPositionSize),
          currentPositionPercent: Number(currentPositionPercent.toFixed(2)),
          positionIncrease: Number(positionIncrease.toFixed(2)),
          revengeLossAmount: currentLossAmount,
          revengeTradeResult: revengeTradeResult, // Actual P&L: negative for loss, positive for profit
          revengeLossPercent: Number(currentLossPercent.toFixed(2)),
          totalLossPercent: Number((triggerLossPercent + currentLossPercent).toFixed(2)),
          hoursSinceLoss: Number(hoursSinceLoss.toFixed(1)),
          accountSize: accountSize,
          triggerTradeId: triggerLoss.id,
          isComplete: !!currentTrade.exit_price,
          outcome: currentPnl ? (currentPnl > 0 ? 'profit' : 'loss') : 'incomplete'
        }
      });
    }

    return patterns;
  }

  // Calculate trade P&L
  static calculateTradePnL(trade) {
    if (!trade.exit_price) return null;
    
    const entryPrice = parseFloat(trade.entry_price);
    const exitPrice = parseFloat(trade.exit_price);
    const quantity = parseFloat(trade.quantity);
    const commission = parseFloat(trade.commission || 0);
    const fees = parseFloat(trade.fees || 0);

    let pnl;
    if (trade.side === 'long') {
      pnl = (exitPrice - entryPrice) * quantity;
    } else if (trade.side === 'short') {
      pnl = (entryPrice - exitPrice) * quantity;
    }

    return pnl - commission - fees;
  }

  // Calculate revenge trading severity based on total loss percentage
  static calculateRevengeSeverity(totalLossPercent, hoursSinceLoss) {
    if (totalLossPercent >= 8 || hoursSinceLoss <= 1) return 'high';
    if (totalLossPercent >= 4 || hoursSinceLoss <= 4) return 'medium';
    return 'low';
  }

  // Calculate confidence score for revenge trading detection  
  static calculateRevengeConfidence(triggerLossPercent, revengeLossPercent, hoursSinceLoss) {
    let confidence = 0.5; // Base confidence

    // Higher confidence for larger trigger losses
    confidence += Math.min(triggerLossPercent / 10, 0.3);
    
    // Higher confidence for larger revenge losses
    confidence += Math.min(revengeLossPercent / 5, 0.2);
    
    // Higher confidence for shorter time windows (more emotional)
    if (hoursSinceLoss <= 1) confidence += 0.3;
    else if (hoursSinceLoss <= 4) confidence += 0.2;
    else if (hoursSinceLoss <= 12) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  // Get user behavioral settings (helper method)
  static async getUserSettings(userId) {
    const query = `SELECT * FROM behavioral_settings WHERE user_id = $1`;
    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
  }

  // Record historical pattern
  static async recordHistoricalPattern(userId, pattern, trade) {
    const query = `
      INSERT INTO behavioral_patterns (
        user_id, pattern_type, severity, confidence_score, 
        detected_at, context_data, trigger_trade_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const result = await db.query(query, [
      userId,
      pattern.pattern_type,
      pattern.severity,
      pattern.confidence_score,
      trade.entry_time, // Use trade entry time as detection time
      JSON.stringify(pattern.metrics),
      pattern.metrics.triggerTradeId || null // Store the actual trigger trade ID
    ]);

    // Create revenge trading event for both pattern types
    if (['same_symbol_revenge', 'emotional_reactive_trading'].includes(pattern.pattern_type)) {
      const triggerTradeId = pattern.metrics.triggerTradeId || null;
      await this.createHistoricalRevengeEvent(userId, pattern, trade, triggerTradeId);
    }

    return result.rows[0].id;
  }

  // Create historical revenge trading event
  static async createHistoricalRevengeEvent(userId, pattern, trade, triggerTradeId = null) {
    // Check if we already have an event for this time period
    const existingQuery = `
      SELECT id FROM revenge_trading_events 
      WHERE user_id = $1 
        AND ABS(EXTRACT(EPOCH FROM (created_at - $2)) / 60) <= 60
    `;
    
    const existing = await db.query(existingQuery, [userId, trade.entry_time]);
    
    if (existing.rows.length > 0) {
      return; // Don't create duplicate events
    }

    const query = `
      INSERT INTO revenge_trading_events (
        user_id, trigger_trade_id, trigger_loss_amount, total_revenge_trades,
        time_window_minutes, position_size_increase_percent,
        total_additional_loss, pattern_broken, cooling_period_used,
        trigger_timestamp, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    const triggerLoss = pattern.metrics.triggerLossAmount || 0;
    const revengeResult = pattern.metrics.revengeTradeResult || 0; // Actual P&L (positive/negative)
    const totalLossPercent = pattern.metrics.totalLossPercent || 0;
    const positionIncrease = pattern.metrics.positionIncrease || 0;
    const tradesCount = 1; // Always 1 for percentage-based revenge (trigger + revenge)
    
    // Calculate trigger timestamp (when the loss occurred)
    const hoursSinceLoss = pattern.metrics.hoursSinceLoss || 1;
    const triggerTimestamp = new Date(trade.entry_time);
    triggerTimestamp.setHours(triggerTimestamp.getHours() - hoursSinceLoss);
    
    await db.query(query, [
      userId,
      triggerTradeId,
      triggerLoss,
      tradesCount,
      Math.round(hoursSinceLoss * 60), // Convert hours to minutes for time window
      positionIncrease, // Position size increase percentage
      revengeResult, // Actual revenge trade P&L (negative for loss, positive for profit)
      false, // Pattern was not broken (it happened)
      false, // No cooling period was used (historical)
      triggerTimestamp,
      trade.entry_time
    ]);
  }
}

module.exports = BehavioralAnalyticsService;