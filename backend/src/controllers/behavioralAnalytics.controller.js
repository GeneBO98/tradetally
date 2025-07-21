const BehavioralAnalyticsService = require('../services/behavioralAnalyticsService');
const BehavioralAnalyticsServiceV2 = require('../services/behavioralAnalyticsServiceV2');
const OverconfidenceAnalyticsService = require('../services/overconfidenceAnalyticsService');
const LossAversionAnalyticsService = require('../services/lossAversionAnalyticsService');
const TradingPersonalityService = require('../services/tradingPersonalityService');
const RevengeTradeDetector = require('../services/revengeTradeDetector');
const TierService = require('../services/tierService');
const TickDataService = require('../services/tickDataService');

const behavioralAnalyticsController = {
  
  // Get behavioral analytics overview
  async getOverview(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate } = req.query;
      
      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;

      const overview = await BehavioralAnalyticsService.getBehavioralOverview(userId, dateFilter);
      
      res.json({
        success: true,
        data: overview
      });
    } catch (error) {
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Get revenge trading analysis
  async getRevengeTradeAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, page, limit } = req.query;
      
      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;

      const paginationOptions = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      const analysis = await BehavioralAnalyticsService.getRevengeTradeAnalysis(userId, dateFilter, paginationOptions);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Get user behavioral settings
  async getSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = await BehavioralAnalyticsService.getBehavioralSettings(userId);
      
      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      next(error);
    }
  },

  // Update user behavioral settings
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = req.body;

      // Validate settings structure
      if (!behavioralAnalyticsController.validateSettings(settings)) {
        return res.status(400).json({
          error: 'Invalid settings format',
          message: 'Please provide valid behavioral settings'
        });
      }

      const updatedSettings = await BehavioralAnalyticsService.updateBehavioralSettings(userId, settings);
      
      res.json({
        success: true,
        data: updatedSettings,
        message: 'Behavioral settings updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Get active alerts for user
  async getActiveAlerts(req, res, next) {
    try {
      const userId = req.user.id;
      const alerts = await BehavioralAnalyticsService.getActiveAlerts(userId);
      
      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      next(error);
    }
  },

  // Acknowledge an alert
  async acknowledgeAlert(req, res, next) {
    try {
      const userId = req.user.id;
      const { alertId } = req.params;
      const { response } = req.body;

      const acknowledgedAlert = await BehavioralAnalyticsService.acknowledgeAlert(userId, alertId, response);
      
      if (!acknowledgedAlert) {
        return res.status(404).json({
          error: 'Alert not found',
          message: 'The specified alert was not found or does not belong to you'
        });
      }

      res.json({
        success: true,
        data: acknowledgedAlert,
        message: 'Alert acknowledged successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Analyze a trade for revenge trading (used internally)
  async analyzeTrade(req, res, next) {
    try {
      const userId = req.user.id;
      const { trade } = req.body;

      if (!trade) {
        return res.status(400).json({
          error: 'Missing trade data',
          message: 'Trade information is required for analysis'
        });
      }

      const analysis = await RevengeTradeDetector.analyzeNewTrade(userId, trade);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      next(error);
    }
  },

  // Check if user should be blocked from trading
  async getTradeBlockStatus(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Check if user has trade blocking feature
      const hasAccess = await TierService.hasFeatureAccess(userId, 'trade_blocking');
      if (!hasAccess) {
        return res.json({
          success: true,
          data: { shouldBlock: false, reason: 'feature_not_available' }
        });
      }

      // Get user settings
      const settings = await BehavioralAnalyticsService.getBehavioralSettings(userId);
      
      if (!settings.tradeBlocking?.enabled) {
        return res.json({
          success: true,
          data: { shouldBlock: false, reason: 'blocking_disabled' }
        });
      }

      // Check for recent high-severity alerts
      const activeAlerts = await BehavioralAnalyticsService.getActiveAlerts(userId);
      const blockingAlerts = activeAlerts.filter(alert => 
        alert.alert_type === 'blocking' && 
        alert.status === 'active'
      );

      if (blockingAlerts.length > 0) {
        return res.json({
          success: true,
          data: { 
            shouldBlock: true, 
            reason: 'behavioral_alert',
            alerts: blockingAlerts,
            recommendedCoolingPeriod: settings.coolingPeriod?.minutes || 30
          }
        });
      }

      res.json({
        success: true,
        data: { shouldBlock: false, reason: 'no_blocking_conditions' }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get behavioral insights and recommendations
  async getInsights(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Get recent patterns and statistics
      const overview = await BehavioralAnalyticsService.getBehavioralOverview(userId);
      const revengeAnalysis = await BehavioralAnalyticsService.getRevengeTradeAnalysis(userId);
      
      // Generate insights based on data
      const insights = behavioralAnalyticsController.generateInsights(overview, revengeAnalysis);
      
      res.json({
        success: true,
        data: insights
      });
    } catch (error) {
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Validate settings format
  validateSettings(settings) {
    if (!settings || typeof settings !== 'object') return false;
    
    // Check required structure
    const validStructure = (
      (!settings.revengeTrading || (
        typeof settings.revengeTrading.enabled === 'boolean' &&
        ['low', 'medium', 'high'].includes(settings.revengeTrading.sensitivity)
      )) &&
      (!settings.coolingPeriod || (
        typeof settings.coolingPeriod.minutes === 'number' &&
        settings.coolingPeriod.minutes >= 0 && settings.coolingPeriod.minutes <= 1440
      )) &&
      (!settings.tradeBlocking || typeof settings.tradeBlocking.enabled === 'boolean') &&
      (!settings.alertPreferences || typeof settings.alertPreferences === 'object')
    );

    return validStructure;
  },

  // Generate insights from behavioral data
  generateInsights(overview, revengeAnalysis) {
    const insights = [];
    
    // Revenge trading insights
    if (revengeAnalysis.statistics?.total_events > 0) {
      const stats = revengeAnalysis.statistics;
      
      if (parseFloat(stats.loss_rate) > 70) {
        insights.push({
          type: 'warning',
          title: 'High Revenge Trading Loss Rate',
          message: `${stats.loss_rate}% of your revenge trading events resulted in additional losses.`,
          recommendation: 'Consider implementing cooling periods after losses.',
          severity: 'high'
        });
      }
      
      if (parseFloat(stats.avg_size_increase) > 25) {
        insights.push({
          type: 'risk',
          title: 'Position Size Escalation',
          message: `You tend to increase position sizes by ${parseFloat(stats.avg_size_increase).toFixed(2)}% during revenge trading.`,
          recommendation: 'Set strict position sizing rules to prevent emotional scaling.',
          severity: 'medium'
        });
      }
      
      if (parseFloat(stats.cooling_period_usage_rate) < 30) {
        insights.push({
          type: 'improvement',
          title: 'Low Cooling Period Usage',
          message: `You use cooling periods only ${stats.cooling_period_usage_rate}% of the time.`,
          recommendation: 'Try setting automatic cooling periods after losses.',
          severity: 'low'
        });
      }
    }
    
    // Pattern frequency insights
    const revengePattern = overview.patterns?.find(p => p.pattern_type === 'revenge_trading');
    if (revengePattern && revengePattern.total_occurrences > 5) {
      insights.push({
        type: 'pattern',
        title: 'Frequent Revenge Trading',
        message: `Revenge trading detected ${revengePattern.total_occurrences} times recently.`,
        recommendation: 'Consider adjusting your trading plan to include mandatory breaks after losses.',
        severity: revengePattern.high_severity_count > 3 ? 'high' : 'medium'
      });
    }
    
    return {
      insights,
      overallRisk: behavioralAnalyticsController.calculateOverallRisk(overview, revengeAnalysis),
      recommendations: behavioralAnalyticsController.generateRecommendations(insights)
    };
  },

  // Calculate overall behavioral risk score
  calculateOverallRisk(overview, revengeAnalysis) {
    let riskScore = 0;
    
    // Revenge trading risk
    if (revengeAnalysis.statistics?.loss_rate) {
      riskScore += parseFloat(revengeAnalysis.statistics.loss_rate) / 10;
    }
    
    // Pattern frequency risk
    const revengePattern = overview.patterns?.find(p => p.pattern_type === 'revenge_trading');
    if (revengePattern) {
      riskScore += revengePattern.high_severity_count * 10;
    }
    
    // Cap at 100
    riskScore = Math.min(riskScore, 100);
    
    let riskLevel = 'low';
    if (riskScore > 70) riskLevel = 'high';
    else if (riskScore > 40) riskLevel = 'medium';
    
    return {
      score: Math.round(riskScore),
      level: riskLevel,
      description: behavioralAnalyticsController.getRiskDescription(riskLevel)
    };
  },

  // Get risk level description
  getRiskDescription(level) {
    const descriptions = {
      low: 'Your trading behavior shows minimal emotional patterns.',
      medium: 'Some concerning patterns detected. Consider implementing safeguards.',
      high: 'High-risk emotional trading patterns detected. Immediate action recommended.'
    };
    return descriptions[level] || descriptions.low;
  },

  // Generate actionable recommendations
  generateRecommendations(insights) {
    const recommendations = [];
    
    if (insights.some(i => i.type === 'warning' || i.severity === 'high')) {
      recommendations.push({
        priority: 'high',
        action: 'Enable automatic trade blocking during high-risk periods',
        benefit: 'Prevents emotional decision-making during vulnerable moments'
      });
    }
    
    if (insights.some(i => i.title.includes('Cooling Period'))) {
      recommendations.push({
        priority: 'medium',
        action: 'Implement mandatory 30-minute cooling periods after losses',
        benefit: 'Allows time for emotional regulation before making new trading decisions'
      });
    }
    
    recommendations.push({
      priority: 'low',
      action: 'Review your trading plan after each session',
      benefit: 'Helps identify patterns and improve decision-making over time'
    });
    
    return recommendations;
  },

  // Analyze historical trades for behavioral patterns
  async analyzeHistoricalTrades(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Historical analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Use the improved V2 version for proper revenge trade aggregation
      const analysis = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2(userId);
      
      res.json({
        success: true,
        data: analysis,
        message: `Historical analysis complete. Analyzed ${analysis.tradesAnalyzed} trades and detected ${analysis.patternsDetected} behavioral patterns.`
      });
    } catch (error) {
      console.error('Error analyzing historical trades:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Get tick data analysis for a revenge trade
  async getRevengeTradeTickData(req, res, next) {
    try {
      const userId = req.user.id;
      const { revengeTradeId } = req.params;
      const { windowMinutes = 30 } = req.query;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Tick data analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Get existing tick analysis
      const existingAnalysis = await TickDataService.getTickAnalysis(userId, revengeTradeId);
      
      if (existingAnalysis) {
        // Get tick data for visualization
        const tickData = await TickDataService.getTicksAroundTime(
          existingAnalysis.symbol,
          existingAnalysis.trade_entry_time,
          parseInt(windowMinutes)
        );
        
        res.json({
          success: true,
          data: {
            analysis: existingAnalysis,
            tickData: tickData
          }
        });
      } else {
        res.status(404).json({
          error: 'Tick analysis not found',
          message: 'No tick data analysis found for this revenge trade'
        });
      }
    } catch (error) {
      console.error('Error getting revenge trade tick data:', error);
      next(error);
    }
  },

  // Generate tick data analysis for a revenge trade
  async generateTickDataAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { revengeTradeId } = req.params;
      const { triggerTradeId, symbol, tradeEntryTime, tradeExitTime, windowMinutes = 30 } = req.body;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Tick data analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Validate required fields
      if (!triggerTradeId || !symbol || !tradeEntryTime) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'triggerTradeId, symbol, and tradeEntryTime are required'
        });
      }

      // Generate tick data analysis
      const analysis = await TickDataService.analyzeRevengeTradeTickData(
        userId,
        revengeTradeId,
        triggerTradeId,
        symbol,
        tradeEntryTime,
        tradeExitTime,
        parseInt(windowMinutes)
      );
      
      res.json({
        success: true,
        data: analysis,
        message: 'Tick data analysis generated successfully'
      });
    } catch (error) {
      console.error('Error generating tick data analysis:', error);
      
      if (error.message.includes('No tick data available')) {
        return res.status(404).json({
          error: 'Tick data unavailable',
          message: 'No tick data available for this symbol and date. This might be due to market hours, weekends, or API limitations.'
        });
      }
      
      next(error);
    }
  },

  // Get tick data for a specific symbol and time range
  async getTickData(req, res, next) {
    try {
      const userId = req.user.id;
      const { symbol, datetime } = req.params;
      const { windowMinutes = 30 } = req.query;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Tick data access requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Get tick data
      const tickData = await TickDataService.getTicksAroundTime(
        symbol,
        datetime,
        parseInt(windowMinutes)
      );
      
      res.json({
        success: true,
        data: tickData
      });
    } catch (error) {
      console.error('Error getting tick data:', error);
      
      if (error.message.includes('No tick data available')) {
        return res.status(404).json({
          error: 'Tick data unavailable',
          message: 'No tick data available for this symbol and date. This might be due to market hours, weekends, or API limitations.'
        });
      }
      
      next(error);
    }
  },

  // Clear old data and re-run historical analysis with new thresholds
  async reRunHistoricalAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Check if user has access to behavioral analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Historical analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      // Use the improved V2 version with proper loss thresholds
      const analysis = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2(userId);
      
      res.json({
        success: true,
        data: analysis,
        message: `Historical analysis complete with new thresholds. Analyzed ${analysis.tradesAnalyzed} trades and detected ${analysis.revengeEventsCreated} revenge trading events.`
      });
    } catch (error) {
      console.error('Error re-running historical analysis:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Get trade details for a specific overconfidence event
  async getOverconfidenceEventTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const { eventId } = req.params;
      
      // Get the overconfidence event details
      const eventQuery = `
        SELECT streak_trades
        FROM overconfidence_events
        WHERE id = $1 AND user_id = $2
      `;
      
      const eventResult = await db.query(eventQuery, [eventId, userId]);
      if (eventResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Event not found',
          message: 'Overconfidence event not found'
        });
      }
      
      const streakTrades = eventResult.rows[0].streak_trades;
      if (!streakTrades || streakTrades.length === 0) {
        return res.json({
          success: true,
          data: []
        });
      }
      
      // Get trade details
      const tradesQuery = `
        SELECT 
          id, symbol, entry_time, exit_time, entry_price, exit_price, 
          quantity, side, pnl, commission, fees,
          (quantity * entry_price) as position_size
        FROM trades 
        WHERE id = ANY($1)
        ORDER BY entry_time ASC
      `;
      
      const tradesResult = await db.query(tradesQuery, [streakTrades]);
      
      res.json({
        success: true,
        data: tradesResult.rows
      });
    } catch (error) {
      console.error('Error getting overconfidence event trades:', error);
      next(error);
    }
  },

  // Get overconfidence analysis for a user
  async getOverconfidenceAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, page, limit } = req.query;
      
      const dateFilter = {};
      if (startDate) dateFilter.startDate = startDate;
      if (endDate) dateFilter.endDate = endDate;

      const paginationOptions = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      const analysis = await OverconfidenceAnalyticsService.getOverconfidenceAnalysis(userId, dateFilter, paginationOptions);
      
      // First, run historical analysis if no events exist
      if (!analysis.events || analysis.events.length === 0) {
        console.log('No overconfidence events found, running historical analysis...');
        const historicalAnalysis = await OverconfidenceAnalyticsService.analyzeHistoricalTrades(userId);
        console.log(`Historical analysis complete: ${historicalAnalysis.overconfidenceEventsCreated} events created`);
        
        // Fetch the analysis again after historical analysis
        const updatedAnalysis = await OverconfidenceAnalyticsService.getOverconfidenceAnalysis(userId, dateFilter, paginationOptions);
        
        res.json({
          success: true,
          data: {
            analysis: updatedAnalysis,
            message: historicalAnalysis.overconfidenceEventsCreated > 0 
              ? `Detected ${historicalAnalysis.overconfidenceEventsCreated} overconfidence events in your trading history`
              : 'No overconfidence patterns detected in your trading history'
          }
        });
      } else {
        res.json({
          success: true,
          data: {
            analysis: analysis
          }
        });
      }
    } catch (error) {
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Analyze historical trades for overconfidence patterns
  async analyzeOverconfidenceHistoricalTrades(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Check if user has access to overconfidence analytics
      const hasAccess = await TierService.hasFeatureAccess(userId, 'overconfidence_analytics');
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: 'Overconfidence analysis requires Pro tier access',
          upgradeRequired: true
        });
      }

      const analysis = await OverconfidenceAnalyticsService.analyzeHistoricalTrades(userId);
      
      res.json({
        success: true,
        data: analysis,
        message: `Overconfidence analysis complete. Analyzed ${analysis.tradesAnalyzed} trades and detected ${analysis.overconfidenceEventsCreated} overconfidence events.`
      });
    } catch (error) {
      console.error('Error analyzing overconfidence historical trades:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      next(error);
    }
  },

  // Get overconfidence settings for a user
  async getOverconfidenceSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = await OverconfidenceAnalyticsService.getUserSettings(userId);
      
      // Return default settings if none exist (adjusted for day trading)
      const defaultSettings = {
        detectionEnabled: true,
        minStreakLength: 4, // Higher for day trading context
        positionIncreaseThreshold: 40.0, // Higher threshold for day trading
        sensitivity: 'medium',
        alertPreferences: { email: false, push: true, toast: true }
      };
      
      res.json({
        success: true,
        data: settings || defaultSettings
      });
    } catch (error) {
      next(error);
    }
  },

  // Update overconfidence settings for a user
  async updateOverconfidenceSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = req.body;

      // Validate settings
      if (!behavioralAnalyticsController.validateOverconfidenceSettings(settings)) {
        return res.status(400).json({
          error: 'Invalid settings format',
          message: 'Please provide valid overconfidence settings'
        });
      }

      const updatedSettings = await OverconfidenceAnalyticsService.updateOverconfidenceSettings(userId, settings);
      
      res.json({
        success: true,
        data: updatedSettings,
        message: 'Overconfidence settings updated successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Validate overconfidence settings format
  validateOverconfidenceSettings(settings) {
    if (!settings || typeof settings !== 'object') return false;
    
    return (
      (settings.detectionEnabled === undefined || typeof settings.detectionEnabled === 'boolean') &&
      (settings.minStreakLength === undefined || (typeof settings.minStreakLength === 'number' && settings.minStreakLength >= 1 && settings.minStreakLength <= 20)) &&
      (settings.positionIncreaseThreshold === undefined || (typeof settings.positionIncreaseThreshold === 'number' && settings.positionIncreaseThreshold >= 0 && settings.positionIncreaseThreshold <= 500)) &&
      (settings.sensitivity === undefined || ['low', 'medium', 'high'].includes(settings.sensitivity)) &&
      (settings.alertPreferences === undefined || typeof settings.alertPreferences === 'object')
    );
  },

  // Real-time overconfidence detection for new trades
  async detectOverconfidenceInRealTime(req, res, next) {
    try {
      const userId = req.user.id;
      const { trade } = req.body;

      if (!trade) {
        return res.status(400).json({
          error: 'Missing trade data',
          message: 'Trade information is required for overconfidence analysis'
        });
      }

      const alert = await OverconfidenceAnalyticsService.detectOverconfidenceInRealTime(userId, trade);
      
      res.json({
        success: true,
        data: alert
      });
    } catch (error) {
      next(error);
    }
  },

  // Get loss aversion analysis
  async getLossAversionAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate } = req.query;
      
      console.log(`Loss aversion analysis requested for user ${userId}, dates: ${startDate} - ${endDate}`);
      
      const analysis = await LossAversionAnalyticsService.analyzeLossAversion(userId, startDate, endDate);
      
      if (analysis.error) {
        console.log(`Loss aversion analysis returned error: ${analysis.error} - ${analysis.message}`);
        return res.status(400).json({
          error: analysis.error,
          message: analysis.message
        });
      }
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Loss aversion analysis error:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message
      });
    }
  },

  // Get historical loss aversion trends
  async getLossAversionTrends(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 12 } = req.query;
      
      const trends = await LossAversionAnalyticsService.getHistoricalTrends(userId, parseInt(limit));
      
      res.json({
        success: true,
        data: trends
      });
    } catch (error) {
      next(error);
    }
  },

  // Get latest loss aversion metrics
  async getLatestLossAversionMetrics(req, res, next) {
    try {
      const userId = req.user.id;
      
      const metrics = await LossAversionAnalyticsService.getLatestMetrics(userId);
      
      if (!metrics) {
        return res.json({
          success: true,
          data: null,
          message: 'No loss aversion analysis available. Run analysis first.'
        });
      }
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      next(error);
    }
  },

  // Get complete loss aversion analysis (with stored trade patterns)
  async getCompleteLossAversionAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      
      const analysis = await LossAversionAnalyticsService.getCompleteAnalysis(userId);
      
      if (!analysis) {
        return res.json({
          success: true,
          data: null,
          message: 'No loss aversion analysis available. Run analysis first.'
        });
      }
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      next(error);
    }
  },

  // Get top missed trades by percentage of missed opportunity
  async getTopMissedTrades(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 20 } = req.query;
      
      console.log(`Top missed trades requested for user ${userId}, limit: ${limit}`);
      
      const analysis = await LossAversionAnalyticsService.getTopMissedTrades(userId, parseInt(limit));
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Top missed trades analysis error:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message
      });
    }
  },

  // Get trading personality analysis
  async getPersonalityAnalysis(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate } = req.query;
      
      console.log(`Personality analysis requested for user ${userId}, dates: ${startDate} - ${endDate}`);
      
      const analysis = await TradingPersonalityService.analyzePersonality(userId, startDate, endDate);
      
      if (analysis.error) {
        console.log(`Personality analysis returned error: ${analysis.error} - ${analysis.message}`);
        return res.status(400).json({
          error: analysis.error,
          message: analysis.message
        });
      }
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Trading personality analysis error:', error);
      if (error.message.includes('requires Pro tier')) {
        return res.status(403).json({
          error: 'Pro tier required',
          message: error.message,
          upgradeRequired: true
        });
      }
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message
      });
    }
  },

  // Get latest personality profile (with complete analysis data)
  async getLatestPersonalityProfile(req, res, next) {
    try {
      const userId = req.user.id;
      
      const analysis = await TradingPersonalityService.getCompleteAnalysis(userId);
      
      if (!analysis) {
        return res.json({
          success: true,
          data: null,
          message: 'No personality analysis available. Run analysis first.'
        });
      }
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      next(error);
    }
  },

  // Get personality drift analysis
  async getPersonalityDrift(req, res, next) {
    try {
      const userId = req.user.id;
      
      const driftAnalysis = await TradingPersonalityService.analyzeBehavioralDrift(userId);
      
      res.json({
        success: true,
        data: driftAnalysis
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = behavioralAnalyticsController;