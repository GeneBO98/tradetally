const db = require('../config/database');
const TierService = require('./tierService');

class RevengeTradeDetector {

  // Main function to analyze a new trade for revenge trading patterns
  static async analyzeNewTrade(userId, newTrade) {
    try {
      // Check if user has revenge trading detection enabled
      const hasAccess = await TierService.hasFeatureAccess(userId, 'revenge_trading_detection');
      if (!hasAccess) {
        return null;
      }

      // Get user settings
      const settings = await this.getUserSettings(userId);
      if (!settings || !settings.revenge_trading_enabled) {
        return null;
      }

      // Get recent trading activity
      const recentActivity = await this.getRecentTradingActivity(userId, 60); // Last 60 minutes
      
      // Check for potential trigger events (recent losses)
      const triggerEvents = await this.findTriggerEvents(userId, 120); // Last 2 hours
      
      if (triggerEvents.length === 0) {
        return null; // No recent losses to trigger revenge trading
      }

      // Analyze for revenge trading patterns
      const analysis = await this.detectRevengePatterns(userId, newTrade, recentActivity, triggerEvents, settings);
      
      if (analysis.isRevengeTrading) {
        // Record the pattern
        await this.recordRevengePattern(userId, analysis);
        
        // Create alerts if needed
        await this.createAlerts(userId, analysis);
      }

      // Generate alert messages for frontend
      const alertMessages = analysis.isRevengeTrading ? this.generateAlertMessages(analysis) : [];
      
      return {
        ...analysis,
        alerts: alertMessages,
        recommendedCoolingPeriod: this.getRecommendedCoolingPeriod(analysis)
      };
    } catch (error) {
      console.error('Error analyzing trade for revenge patterns:', error);
      return null;
    }
  }

  // Get user behavioral settings
  static async getUserSettings(userId) {
    const query = `
      SELECT * FROM behavioral_settings WHERE user_id = $1
    `;
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  // Get recent trading activity for analysis
  static async getRecentTradingActivity(userId, minutesBack) {
    const query = `
      SELECT 
        id, symbol, entry_time, entry_price, quantity, side, pnl,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - entry_time))/60 as minutes_ago
      FROM trades 
      WHERE user_id = $1 
        AND entry_time >= CURRENT_TIMESTAMP - INTERVAL '${minutesBack} minutes'
      ORDER BY entry_time DESC
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Find recent loss events that could trigger revenge trading
  static async findTriggerEvents(userId, minutesBack) {
    const query = `
      SELECT 
        id, symbol, entry_time, exit_time, pnl, quantity,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(exit_time, entry_time)))/60 as minutes_ago
      FROM trades 
      WHERE user_id = $1 
        AND pnl < 0 
        AND COALESCE(exit_time, entry_time) >= CURRENT_TIMESTAMP - INTERVAL '${minutesBack} minutes'
      ORDER BY COALESCE(exit_time, entry_time) DESC
    `;
    
    const result = await db.query(query, [userId]);
    
    // Filter losses by significance threshold
    const significantLosses = await this.filterSignificantLosses(userId, result.rows);
    return significantLosses;
  }

  // Filter losses to only include those that meet the threshold criteria
  static async filterSignificantLosses(userId, losses) {
    if (losses.length === 0) return [];

    // Get user settings for sensitivity
    const userSettings = await this.getUserSettings(userId);
    const sensitivity = userSettings?.revenge_trading_sensitivity || 'medium';
    const thresholds = this.getLossThresholds(sensitivity);

    // Estimate account size from recent trades
    const accountSize = await this.estimateAccountSize(userId);
    
    // Filter losses that meet the threshold
    const significantLosses = [];
    for (const loss of losses) {
      const lossAmount = Math.abs(loss.pnl);
      
      // Check if loss meets minimum dollar threshold
      if (lossAmount >= thresholds.minLossDollars) {
        significantLosses.push(loss);
        continue;
      }
      
      // Check if loss meets percentage threshold (if we can estimate account size)
      if (accountSize && lossAmount >= (accountSize * thresholds.triggerLossPercent / 100)) {
        significantLosses.push(loss);
        continue;
      }
    }
    
    return significantLosses;
  }

  // Get loss thresholds for different sensitivity levels
  static getLossThresholds(sensitivity = 'medium') {
    const thresholds = {
      low: {
        triggerLossPercent: 5.0,    // 5%+ loss triggers revenge detection
        minLossDollars: 1000        // Minimum $1000 loss
      },
      medium: {
        triggerLossPercent: 3.0,    // 3%+ loss triggers revenge detection  
        minLossDollars: 500         // Minimum $500 loss
      },
      high: {
        triggerLossPercent: 1.0,    // 1%+ loss triggers revenge detection
        minLossDollars: 250         // Minimum $250 loss
      }
    };

    return thresholds[sensitivity] || thresholds.medium;
  }

  // Estimate account size based on recent trading activity
  static async estimateAccountSize(userId) {
    const query = `
      SELECT 
        MAX(ABS(quantity * entry_price)) as max_position_size,
        AVG(ABS(quantity * entry_price)) as avg_position_size,
        COUNT(*) as trade_count
      FROM trades 
      WHERE user_id = $1 
        AND entry_time >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `;
    
    const result = await db.query(query, [userId]);
    const stats = result.rows[0];
    
    if (!stats || stats.trade_count < 5) {
      return null; // Not enough data to estimate account size
    }
    
    // Conservative estimate: assume max position is 10% of account
    const estimatedFromMaxPosition = stats.max_position_size * 10;
    
    // Alternative estimate: assume average position is 2% of account
    const estimatedFromAvgPosition = stats.avg_position_size * 50;
    
    // Use the more conservative estimate
    return Math.min(estimatedFromMaxPosition, estimatedFromAvgPosition);
  }

  // Core revenge trading detection logic
  static async detectRevengePatterns(userId, newTrade, recentActivity, triggerEvents, settings) {
    const sensitivity = settings.revenge_trading_sensitivity || 'medium';
    const thresholds = this.getSensitivityThresholds(sensitivity);
    
    let analysis = {
      isRevengeTrading: false,
      confidence: 0,
      severity: 'low',
      triggers: [],
      patterns: [],
      metrics: {}
    };

    // Pattern 1: Trade frequency spike after loss
    const frequencyAnalysis = this.analyzeTradeFrequency(recentActivity, triggerEvents, thresholds);
    if (frequencyAnalysis.detected) {
      analysis.patterns.push('frequency_spike');
      analysis.confidence = Math.max(analysis.confidence, frequencyAnalysis.confidence);
    }

    // Pattern 2: Position size increase after loss
    const sizeAnalysis = this.analyzePositionSizeIncrease(newTrade, recentActivity, triggerEvents, thresholds);
    if (sizeAnalysis.detected) {
      analysis.patterns.push('size_increase');
      analysis.confidence = Math.max(analysis.confidence, sizeAnalysis.confidence);
    }

    // Pattern 3: Immediate trading after loss (no cooling period)
    const timingAnalysis = this.analyzeTimingPatterns(newTrade, triggerEvents, thresholds);
    if (timingAnalysis.detected) {
      analysis.patterns.push('immediate_trading');
      analysis.confidence = Math.max(analysis.confidence, timingAnalysis.confidence);
    }

    // Pattern 4: Same symbol revenge trading
    const symbolAnalysis = this.analyzeSameSymbolRevenge(newTrade, triggerEvents);
    if (symbolAnalysis.detected) {
      analysis.patterns.push('same_symbol_revenge');
      analysis.confidence = Math.max(analysis.confidence, symbolAnalysis.confidence);
    }

    // Determine if this constitutes revenge trading
    analysis.isRevengeTrading = analysis.patterns.length >= 2 || analysis.confidence >= 0.7;
    
    // Set severity based on confidence and pattern count
    if (analysis.confidence >= 0.8 || analysis.patterns.length >= 3) {
      analysis.severity = 'high';
    } else if (analysis.confidence >= 0.6 || analysis.patterns.length >= 2) {
      analysis.severity = 'medium';
    }

    // Store metrics for analysis
    analysis.metrics = {
      tradeCount: recentActivity.length,
      triggerLoss: triggerEvents[0]?.pnl || 0,
      timeSinceLoss: triggerEvents[0]?.minutes_ago || 0,
      positionSizeChange: sizeAnalysis.sizeChangePercent || 0,
      avgPreviousSize: sizeAnalysis.avgPreviousSize || 0,
      currentSize: sizeAnalysis.currentSize || 0
    };

    analysis.triggers = triggerEvents.slice(0, 3); // Keep top 3 trigger events

    return analysis;
  }

  // Analyze trade frequency patterns
  static analyzeTradeFrequency(recentActivity, triggerEvents, thresholds) {
    const tradesAfterLoss = recentActivity.filter(trade => {
      return triggerEvents.some(trigger => 
        new Date(trade.entry_time) > new Date(trigger.exit_time || trigger.entry_time)
      );
    });

    const tradesInWindow = tradesAfterLoss.filter(trade => trade.minutes_ago <= 10);
    const detected = tradesInWindow.length >= thresholds.minTradesIn10Min;
    
    return {
      detected,
      confidence: Math.min(tradesInWindow.length / 5, 1), // Scale to 0-1
      tradesInWindow: tradesInWindow.length
    };
  }

  // Analyze position size increases
  static analyzePositionSizeIncrease(newTrade, recentActivity, triggerEvents, thresholds) {
    if (recentActivity.length < 2) {
      return { detected: false, confidence: 0, sizeChangePercent: 0 };
    }

    // Get trades before the most recent loss to establish baseline position sizing
    const tradesBeforeLoss = recentActivity.filter(trade => {
      return !triggerEvents.some(trigger => 
        new Date(trade.entry_time) > new Date(trigger.exit_time || trigger.entry_time)
      );
    });

    if (tradesBeforeLoss.length === 0) {
      return { detected: false, confidence: 0, sizeChangePercent: 0 };
    }

    // Calculate average monetary position size before loss
    const avgPreviousSize = tradesBeforeLoss.reduce((sum, trade) => {
      return sum + this.calculateMonetaryPositionSize(trade);
    }, 0) / tradesBeforeLoss.length;

    // Calculate current trade's monetary position size
    const currentSize = this.calculateMonetaryPositionSize(newTrade);
    
    // Calculate percentage change in position sizing
    const sizeChangePercent = ((currentSize - avgPreviousSize) / avgPreviousSize) * 100;

    const detected = sizeChangePercent >= thresholds.minPositionSizeIncrease;
    
    return {
      detected,
      confidence: Math.min(Math.abs(sizeChangePercent) / 50, 1), // Use absolute value, scale to 0-1 (50% = max confidence)
      sizeChangePercent: Number(sizeChangePercent.toFixed(2)),
      avgPreviousSize: Math.round(avgPreviousSize),
      currentSize: Math.round(currentSize)
    };
  }

  // Analyze timing patterns
  static analyzeTimingPatterns(newTrade, triggerEvents, thresholds) {
    if (triggerEvents.length === 0) {
      return { detected: false, confidence: 0 };
    }

    const mostRecentLoss = triggerEvents[0];
    const minutesSinceLoss = mostRecentLoss.minutes_ago;
    
    const detected = minutesSinceLoss <= thresholds.maxMinutesAfterLoss;
    const confidence = Math.max(0, 1 - (minutesSinceLoss / thresholds.maxMinutesAfterLoss));

    return {
      detected,
      confidence,
      minutesSinceLoss
    };
  }

  // Analyze same symbol revenge trading
  static analyzeSameSymbolRevenge(newTrade, triggerEvents) {
    const sameSymbolLoss = triggerEvents.find(trigger => 
      trigger.symbol === newTrade.symbol
    );

    if (!sameSymbolLoss) {
      return { detected: false, confidence: 0 };
    }

    // Higher confidence if it's the same symbol and recent
    const confidence = sameSymbolLoss.minutes_ago <= 30 ? 0.8 : 0.5;

    return {
      detected: true,
      confidence,
      triggerSymbol: sameSymbolLoss.symbol
    };
  }

  // Calculate monetary position size for any trade
  // For both long and short trades, quantity * entry_price represents the monetary value at risk
  static calculateMonetaryPositionSize(trade) {
    return parseFloat(trade.quantity) * parseFloat(trade.entry_price);
  }

  // Get sensitivity thresholds based on user settings
  static getSensitivityThresholds(sensitivity) {
    const thresholds = {
      low: {
        minTradesIn10Min: 5,
        minPositionSizeIncrease: 50, // 50%
        maxMinutesAfterLoss: 5
      },
      medium: {
        minTradesIn10Min: 3,
        minPositionSizeIncrease: 25, // 25%
        maxMinutesAfterLoss: 15
      },
      high: {
        minTradesIn10Min: 2,
        minPositionSizeIncrease: 15, // 15%
        maxMinutesAfterLoss: 30
      }
    };

    return thresholds[sensitivity] || thresholds.medium;
  }

  // Record detected revenge trading pattern
  static async recordRevengePattern(userId, analysis) {
    // Record in behavioral_patterns table
    const patternQuery = `
      INSERT INTO behavioral_patterns (
        user_id, pattern_type, detected_at, severity, confidence_score,
        trigger_trade_id, context_data
      )
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6)
      RETURNING id
    `;

    const contextData = {
      patterns: analysis.patterns,
      metrics: analysis.metrics,
      triggers: analysis.triggers.map(t => t.id)
    };

    const patternResult = await db.query(patternQuery, [
      userId,
      'revenge_trading',
      analysis.severity,
      analysis.confidence,
      analysis.triggers[0]?.id || null,
      JSON.stringify(contextData)
    ]);

    // Record in revenge_trading_events table
    const eventQuery = `
      INSERT INTO revenge_trading_events (
        user_id, trigger_trade_id, trigger_loss_amount, trigger_timestamp,
        total_revenge_trades, time_window_minutes, position_size_increase_percent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    await db.query(eventQuery, [
      userId,
      analysis.triggers[0]?.id || null,
      analysis.triggers[0]?.pnl || 0,
      new Date(),
      1, // This is the first revenge trade in this event
      analysis.metrics.timeSinceLoss || 0,
      analysis.metrics.positionSizeChange || 0
    ]);

    return patternResult.rows[0].id;
  }

  // Create alerts for detected patterns
  static async createAlerts(userId, analysis) {
    const alertMessages = this.generateAlertMessages(analysis);
    
    for (const alert of alertMessages) {
      const query = `
        INSERT INTO behavioral_alerts (
          user_id, alert_type, title, message, alert_data,
          status, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await db.query(query, [
        userId,
        alert.type,
        alert.title,
        alert.message,
        JSON.stringify(alert.data),
        'active',
        new Date(Date.now() + 24 * 60 * 60 * 1000) // Expires in 24 hours
      ]);
    }
  }

  // Generate appropriate alert messages
  static generateAlertMessages(analysis) {
    const alerts = [];
    const { patterns, metrics, confidence, severity } = analysis;

    if (patterns.includes('frequency_spike')) {
      alerts.push({
        type: 'warning',
        title: 'High Trading Frequency Detected',
        message: `You've placed ${metrics.tradeCount} trades in a short time after a loss. Historical data shows this often leads to additional losses.`,
        data: { pattern: 'frequency_spike', confidence }
      });
    }

    if (patterns.includes('size_increase')) {
      const avgPrevious = metrics.avgPreviousSize || 0;
      const current = metrics.currentSize || 0;
      alerts.push({
        type: 'warning',
        title: 'Position Size Increase Detected',
        message: `Your position size has increased by ${metrics.positionSizeChange}% after a loss (from $${avgPrevious.toLocaleString()} avg to $${current.toLocaleString()}). Consider your risk management strategy.`,
        data: { pattern: 'size_increase', confidence, avgPreviousSize: avgPrevious, currentSize: current }
      });
    }

    if (patterns.includes('immediate_trading')) {
      alerts.push({
        type: 'recommendation',
        title: 'Consider a Cooling Period',
        message: `You're trading ${metrics.timeSinceLoss.toFixed(0)} minutes after a loss. Consider taking a break to avoid emotional decisions.`,
        data: { pattern: 'immediate_trading', confidence }
      });
    }

    if (severity === 'high') {
      alerts.push({
        type: 'blocking',
        title: 'High-Risk Revenge Trading Pattern',
        message: `Multiple revenge trading indicators detected. Consider pausing trading for 30 minutes.`,
        data: { patterns, confidence, severity }
      });
    }

    return alerts;
  }

  // Calculate recommended cooling period based on analysis
  static getRecommendedCoolingPeriod(analysis) {
    if (!analysis.isRevengeTrading) {
      return 0;
    }

    let basePeriod = 15; // 15 minutes base
    
    // Increase based on severity
    if (analysis.severity === 'high') {
      basePeriod = 60; // 1 hour
    } else if (analysis.severity === 'medium') {
      basePeriod = 30; // 30 minutes
    }
    
    // Increase based on confidence
    basePeriod = Math.round(basePeriod * (1 + analysis.confidence));
    
    // Cap at 2 hours
    return Math.min(basePeriod, 120);
  }
}

module.exports = RevengeTradeDetector;