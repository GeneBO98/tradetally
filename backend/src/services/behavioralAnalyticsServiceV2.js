const db = require('../config/database');
const TierService = require('./tierService');
const TickDataService = require('./tickDataService');
const finnhub = require('../utils/finnhub');
const BehavioralAnalysisPositionService = require('./behavioralAnalysisPositionService');
const symbolCategories = require('../utils/symbolCategories');
const AnalyticsCache = require('./analyticsCache');

const REVENGE_CALCULATION_VERSION = '2026-07-risk-v2';

// Enhanced version with proper revenge trade aggregation
class BehavioralAnalyticsServiceV2 {
  static addTradeFilter(sqlParts, params, dateFilter = {}) {
    if (dateFilter.startDate) {
      params.push(dateFilter.startDate);
      sqlParts.push(`AND exit_time >= $${params.length}`);
    }
    if (dateFilter.endDate) {
      params.push(dateFilter.endDate);
      sqlParts.push(`AND exit_time <= $${params.length}`);
    }
    if (dateFilter.accounts && dateFilter.accounts.length > 0) {
      if (dateFilter.accounts.includes('__unsorted__')) {
        sqlParts.push(`AND (account_identifier IS NULL OR account_identifier = '')`);
      } else {
        params.push(dateFilter.accounts);
        sqlParts.push(`AND account_identifier = ANY($${params.length}::text[])`);
      }
    }
  }

  // Calculate monetary position size for any trade
  // For both long and short trades, quantity * entry_price represents the monetary value at risk
  static calculateMonetaryPositionSize(trade) {
    const riskAmount = parseFloat(trade?.position_risk?.amount);
    if (Number.isFinite(riskAmount) && riskAmount > 0) {
      return riskAmount;
    }

    const explicitPositionSize = parseFloat(trade.position_size);
    if (Number.isFinite(explicitPositionSize) && explicitPositionSize > 0) {
      return explicitPositionSize;
    }

    const quantity = parseFloat(trade.quantity);
    const entryPrice = parseFloat(trade.entry_price);
    if (!Number.isFinite(quantity) || !Number.isFinite(entryPrice)) return 0;
    return Math.abs(quantity) * entryPrice;
  }

  static riskBasisForPosition(position) {
    return position?.position_risk || {
      amount: this.calculateMonetaryPositionSize(position),
      basis: 'position_size',
      confidence: 'low',
      is_estimated: true,
      is_approximate: true
    };
  }

  // Analyze historical trades and properly aggregate revenge trading events
  static async analyzeHistoricalTradesV2(userId, dateFilter = {}) {
    const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
    if (!hasAccess) {
      throw new Error('Historical analysis requires Pro tier');
    }

    // Clear existing data
    await this.clearHistoricalData(userId, dateFilter);

    // Get all completed positions for the user, ordered by entry time. In
    // whole-trade mode, option strategy legs are already collapsed here.
    const trades = await BehavioralAnalysisPositionService.getCompletedPositions(userId, dateFilter);
    const userSettings = await this.getUserSettings(userId);
    const sensitivity = userSettings?.revenge_trading_sensitivity || 'medium';
    const revengeWindows = this.getRevengeWindows(sensitivity);
    const maxRevengeWindowMinutes = Math.max(revengeWindows.same, revengeWindows.cross);
    const industryMap = await this.getIndustryMap(trades);
    symbolCategories.categorizeNewSymbols(userId).catch(error => {
      console.warn(`[BEHAVIORAL] Symbol category backfill failed: ${error.message}`);
    });

    let revengeEventsCreated = 0;
    const processedTriggers = new Set(); // Track processed trigger trades

    // Analyze trades for revenge trading patterns
    for (let i = 0; i < trades.length; i++) {
      const potentialTrigger = trades[i];
      
      // Skip if not a loss or already processed
      if (parseFloat(potentialTrigger.pnl) >= 0 || processedTriggers.has(potentialTrigger.id)) {
        continue;
      }

      // Check if this loss is significant enough to be a trigger
      const isSignificantLoss = await this.isSignificantLoss(userId, potentialTrigger, trades, sensitivity);
      if (!isSignificantLoss) {
        continue;
      }

      const triggerLoss = Math.abs(parseFloat(potentialTrigger.pnl));
      const triggerExitTime = new Date(potentialTrigger.exit_time);
      const triggerSymbol = String(potentialTrigger.underlying_symbol || potentialTrigger.symbol || '').toUpperCase();
      const triggerIndustry = industryMap.get(triggerSymbol) || null;
      const triggerPositionSize = this.calculateMonetaryPositionSize(potentialTrigger);

      // Look for revenge trades within the configured same/cross-symbol windows.
      const revengeWindowEnd = new Date(triggerExitTime.getTime() + (maxRevengeWindowMinutes * 60 * 1000));
      const revengeTrades = [];
      let totalRevengePnL = 0;
      let maxPositionIncrease = 0;
      let earliestRevengeTime = null;
      let latestRevengeTime = null;

      // Find all trades that happen after this trigger loss within the window
      for (let j = i + 1; j < trades.length; j++) {
        const candidateTrade = trades[j];
        const entryTime = new Date(candidateTrade.entry_time);

        // Stop if we're past the revenge window
        if (entryTime > revengeWindowEnd) {
          break;
        }

        // Check if this trade started after the trigger loss
        if (entryTime > triggerExitTime) {
          const candidateSymbol = String(candidateTrade.underlying_symbol || candidateTrade.symbol || '').toUpperCase();
          const candidateIndustry = industryMap.get(candidateSymbol) || null;
          const minutesAfterTrigger = (entryTime - triggerExitTime) / (1000 * 60);
          const isSameSymbol = candidateSymbol === triggerSymbol;
          const candidatePositionSize = this.calculateMonetaryPositionSize(candidateTrade);
          const candidateRiskBasis = this.riskBasisForPosition(candidateTrade);
          const isPositionEscalation = triggerPositionSize > 0 && candidatePositionSize >= triggerPositionSize * 1.3;
          const isSameSector = Boolean(triggerIndustry && candidateIndustry && triggerIndustry === candidateIndustry);
          let crossSymbolQualifier = null;

          if (!isSameSymbol) {
            if (isPositionEscalation) crossSymbolQualifier = 'position_escalation';
            else if (isSameSector) crossSymbolQualifier = 'same_sector';
          }

          const admitted = isSameSymbol
            ? minutesAfterTrigger <= revengeWindows.same
            : minutesAfterTrigger <= revengeWindows.cross && Boolean(crossSymbolQualifier);

          if (!admitted) continue;

          // This is an admitted potential revenge trade
          const tradePnL = parseFloat(candidateTrade.pnl || 0);
          totalRevengePnL += tradePnL;
          
          revengeTrades.push({
            id: candidateTrade.id,
            symbol: candidateTrade.symbol,
            is_same_symbol: isSameSymbol,
            cross_symbol_qualifier: crossSymbolQualifier,
            trigger_industry: triggerIndustry,
            revenge_industry: candidateIndustry,
            window_minutes: isSameSymbol ? revengeWindows.same : revengeWindows.cross,
            position_risk: candidateRiskBasis,
            pnl: tradePnL,
            position_key: candidateTrade.position_key,
            position_group_id: candidateTrade.position_group_id,
            position_grouped: candidateTrade.position_grouped,
            leg_count: candidateTrade.leg_count,
            group_detected_strategy: candidateTrade.group_detected_strategy,
            trade_ids: candidateTrade.trade_ids
          });

          // Track timing
          if (!earliestRevengeTime || entryTime < earliestRevengeTime) {
            earliestRevengeTime = entryTime;
          }
          if (!latestRevengeTime || entryTime > latestRevengeTime) {
            latestRevengeTime = entryTime;
          }

          // Calculate position size increase (monetary value comparison)
          const positionIncrease = triggerPositionSize > 0
            ? ((candidatePositionSize - triggerPositionSize) / triggerPositionSize) * 100
            : 0;
          maxPositionIncrease = Math.max(maxPositionIncrease, Math.abs(positionIncrease));
        }
      }

      // Create revenge trading event if we found revenge trades
      if (revengeTrades.length > 0 && earliestRevengeTime) {
        // Use hybrid approach: try tick data analysis, fall back to position-based analysis
        const shouldCreateEvent = await this.shouldCreateRevengeEvent(userId, revengeTrades, potentialTrigger, trades);
        
        console.log(`Revenge trading analysis for user ${userId}:`, {
          candidateTradesCount: revengeTrades.length,
          shouldCreateEvent: shouldCreateEvent,
          triggerSymbol: potentialTrigger.symbol,
          triggerLoss: Math.abs(parseFloat(potentialTrigger.pnl)),
          timeWindow: Math.round((latestRevengeTime - new Date(potentialTrigger.exit_time)) / (1000 * 60)) + ' minutes',
          mode: 'hybrid_analysis'
        });
        
        // Create revenge trading event based on analysis
        if (shouldCreateEvent) {
          const timeWindowMinutes = Math.round((latestRevengeTime - triggerExitTime) / (1000 * 60));
          
          // Store the revenge trades array
          const revengeTradeIds = revengeTrades.map(t => t.id);

        const riskBasis = {
          calculation_version: REVENGE_CALCULATION_VERSION,
          comparison_basis: 'position_risk',
          trigger: this.riskBasisForPosition(potentialTrigger),
          revenge: revengeTrades.map(trade => ({
            id: trade.id,
            symbol: trade.symbol,
            position_risk: trade.position_risk,
            cross_symbol_qualifier: trade.cross_symbol_qualifier
          }))
        };

        const eventQuery = `
          INSERT INTO revenge_trading_events (
            user_id, trigger_trade_id, trigger_loss_amount, total_revenge_trades,
            time_window_minutes, position_size_increase_percent,
            total_additional_loss, pattern_broken, cooling_period_used,
            trigger_timestamp, created_at, revenge_trades,
            calculation_version, analysis_run_at, risk_basis
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `;

        await db.query(eventQuery, [
          userId,
          potentialTrigger.id,
          triggerLoss,
          revengeTrades.length,
          timeWindowMinutes,
          Math.min(Number(maxPositionIncrease.toFixed(2)), 999), // Cap at 999 to fit DECIMAL(5,2)
          -totalRevengePnL, // Negative P&L means profit in the total_additional_loss field
          false, // Pattern was not broken (it happened)
          false, // No cooling period was used (historical)
          triggerExitTime,
          earliestRevengeTime, // Use first revenge trade time as event time
          revengeTradeIds,
          REVENGE_CALCULATION_VERSION,
          new Date(),
          JSON.stringify(riskBasis)
        ]);

          revengeEventsCreated++;
          processedTriggers.add(potentialTrigger.id);

          // Also create behavioral patterns for tracking
          for (const revengeTrade of revengeTrades) {
            const isSameSymbol = revengeTrade.symbol === potentialTrigger.symbol;
            const patternType = isSameSymbol ? 'same_symbol_revenge' : 'emotional_reactive_trading';
            
            await db.query(`
              INSERT INTO behavioral_patterns (
                user_id, pattern_type, severity, confidence_score, 
                detected_at, context_data, trigger_trade_id
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              userId,
              patternType,
              'medium', // Default severity for hybrid analysis
              0.75, // Good confidence for position-based analysis
              earliestRevengeTime,
              JSON.stringify({
                triggerTradeId: potentialTrigger.id,
                triggerPositionKey: potentialTrigger.position_key,
                triggerTradeIds: potentialTrigger.trade_ids,
                triggerSymbol: potentialTrigger.symbol,
                triggerLoss: triggerLoss,
                revengeSymbol: revengeTrade.symbol,
                revengePnL: revengeTrade.pnl,
                revengePositionKey: revengeTrade.position_key,
                revengeTradeIds: revengeTrade.trade_ids,
                revengeLegCount: revengeTrade.leg_count,
                revengeDetectedStrategy: revengeTrade.group_detected_strategy,
                triggerRiskBasis: this.riskBasisForPosition(potentialTrigger),
                revengeRiskBasis: revengeTrade.position_risk,
                crossSymbolQualifier: revengeTrade.cross_symbol_qualifier,
                triggerIndustry: revengeTrade.trigger_industry,
                revengeIndustry: revengeTrade.revenge_industry,
                windowMinutes: revengeTrade.window_minutes,
                sensitivity,
                totalRevengePnL: totalRevengePnL,
                analysisMode: 'hybrid_analysis',
                calculationVersion: REVENGE_CALCULATION_VERSION,
                positionSizeIncrease: maxPositionIncrease,
                positionGrouping: {
                  triggerGrouped: potentialTrigger.position_grouped === true,
                  revengeGrouped: revengeTrade.position_grouped === true,
                  triggerLegCount: potentialTrigger.leg_count,
                  revengeLegCount: revengeTrade.leg_count,
                  triggerDetectedStrategy: potentialTrigger.group_detected_strategy,
                  revengeDetectedStrategy: revengeTrade.group_detected_strategy
                }
              }),
              potentialTrigger.id
            ]);
          }
        }
      }
    }

    return {
      tradesAnalyzed: trades.length,
      patternsDetected: revengeEventsCreated,
      revengeEventsCreated,
      calculationVersion: REVENGE_CALCULATION_VERSION,
      analysisRunAt: new Date().toISOString(),
      message: `Created ${revengeEventsCreated} revenge trading events`
    };
  }

  // Check if a loss is significant enough to be a trigger
  static async isSignificantLoss(userId, trade, allTrades, configuredSensitivity = null) {
    const lossAmount = Math.abs(parseFloat(trade.pnl));
    
    // Get user settings for sensitivity
    const sensitivity = configuredSensitivity || (await this.getUserSettings(userId))?.revenge_trading_sensitivity || 'medium';
    const thresholds = this.getLossThresholds(sensitivity);
    
    // Check if loss meets minimum dollar threshold
    if (lossAmount >= thresholds.minLossDollars) {
      return true;
    }
    
    // Estimate account size from trading history
    const accountSize = this.estimateAccountSizeFromTrades(allTrades);
    
    // Check if loss meets percentage threshold
    if (accountSize && lossAmount >= (accountSize * thresholds.triggerLossPercent / 100)) {
      return true;
    }
    
    return false;
  }

  // Get user settings
  static async getUserSettings(userId) {
    const query = `SELECT * FROM behavioral_settings WHERE user_id = $1`;
    const result = await db.query(query, [userId]);
    return result.rows[0];
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

  static getRevengeWindows(sensitivity = 'medium') {
    const windows = {
      low: { same: 90, cross: 30 },
      medium: { same: 120, cross: 60 },
      high: { same: 180, cross: 90 }
    };

    return windows[sensitivity] || windows.medium;
  }

  static async getIndustryMap(positions) {
    const symbols = [...new Set((positions || [])
      .map(position => position.underlying_symbol || position.symbol)
      .filter(Boolean)
      .map(symbol => String(symbol).toUpperCase()))];

    if (symbols.length === 0) return new Map();

    const result = await db.query(
      `SELECT symbol, finnhub_industry FROM symbol_categories WHERE symbol = ANY($1::text[])`,
      [symbols]
    );

    const industries = new Map();
    for (const row of result.rows || []) {
      if (row.symbol) industries.set(String(row.symbol).toUpperCase(), row.finnhub_industry || null);
    }

    return industries;
  }

  // Estimate account size from trading history
  static estimateAccountSizeFromTrades(trades) {
    if (trades.length < 5) {
      return null; // Not enough data
    }
    
    const positionSizes = trades.map(t => this.calculateMonetaryPositionSize(t));
    const maxPositionSize = Math.max(...positionSizes);
    const avgPositionSize = positionSizes.reduce((a, b) => a + b, 0) / positionSizes.length;
    
    // Conservative estimate: assume max position is 10% of account
    const estimatedFromMaxPosition = maxPositionSize * 10;
    
    // Alternative estimate: assume average position is 2% of account
    const estimatedFromAvgPosition = avgPositionSize * 50;
    
    // Use the more conservative estimate
    return Math.min(estimatedFromMaxPosition, estimatedFromAvgPosition);
  }

  // Analyze trade quality using news, candles, and position data to determine if trades are revenge trading
  static async analyzeTradeQuality(userId, revengeTrades, allTrades) {
    let totalQualityScore = 0;
    let poorQualityCount = 0;
    let momentumChasingCount = 0;
    let trendFightingCount = 0;
    let newsInfluencedCount = 0;
    const metrics = [];
    
    // Calculate baseline position size for comparison
    const baselinePositionSize = allTrades.length > 5 ? 
      allTrades.slice(0, 5).reduce((sum, trade) => sum + this.calculateMonetaryPositionSize(trade), 0) / 5 :
      revengeTrades.length > 0 ? this.calculateMonetaryPositionSize(allTrades.find(t => t.id === revengeTrades[0].id)) : 1000;

    for (const revengeTradeInfo of revengeTrades) {
      // Find the full trade details
      const fullTrade = allTrades.find(t => t.id === revengeTradeInfo.id);
      if (!fullTrade) continue;

      try {
        // Try multi-layered analysis using available Fundamental-1 plan data
        const analysisResult = await this.analyzeTradeWithFundamentalData(fullTrade);
        
        totalQualityScore += analysisResult.qualityScore;
        
        // Count poor quality indicators
        if (analysisResult.wasChasingMomentum) {
          momentumChasingCount++;
          poorQualityCount++;
        }
        
        if (analysisResult.wasFightingTrend) {
          trendFightingCount++;
          poorQualityCount++;
        }
        
        if (analysisResult.hasRelevantNews) {
          newsInfluencedCount++;
        }
        
        // Low quality score indicates poor trade quality
        if (analysisResult.qualityScore < 0.4) {
          poorQualityCount++;
        }

        metrics.push({
          tradeId: fullTrade.id,
          symbol: fullTrade.symbol,
          entryTimingScore: analysisResult.qualityScore,
          wasChasingMomentum: analysisResult.wasChasingMomentum,
          wasFightingTrend: analysisResult.wasFightingTrend,
          hasRelevantNews: analysisResult.hasRelevantNews,
          newsScore: analysisResult.newsScore,
          candleScore: analysisResult.candleScore,
          analysisMode: analysisResult.analysisMode
        });
      } catch (error) {
        console.error(`Error analyzing trade ${fullTrade.id}:`, error);
        // Fall back to position-based analysis
        const positionSize = this.calculateMonetaryPositionSize(fullTrade);
        const positionIncrease = baselinePositionSize > 0 ? 
          ((positionSize - baselinePositionSize) / baselinePositionSize) * 100 : 0;
        
        // Assign quality score based on position size patterns
        if (positionIncrease > 50) {
          totalQualityScore += 0.3; // Poor quality - large position increase
          poorQualityCount++;
          momentumChasingCount++; // Assume momentum chasing with large position increase
        } else if (positionIncrease > 20) {
          totalQualityScore += 0.4; // Moderate quality - moderate position increase
          poorQualityCount++;
        } else {
          totalQualityScore += 0.6; // Neutral - no significant position increase
        }
        
        // Add fallback metrics
        metrics.push({
          tradeId: fullTrade.id,
          symbol: fullTrade.symbol,
          entryTimingScore: 0.5,
          wasChasingMomentum: positionIncrease > 50,
          wasFightingTrend: false,
          hasRelevantNews: false,
          newsScore: 0.5,
          candleScore: 0.5,
          positionIncrease: positionIncrease,
          analysisMode: 'position_fallback'
        });
      }
    }

    const averageQualityScore = revengeTrades.length > 0 ? totalQualityScore / revengeTrades.length : 0.5;
    const poorQualityRatio = revengeTrades.length > 0 ? poorQualityCount / revengeTrades.length : 0;
    const newsInfluencedRatio = revengeTrades.length > 0 ? newsInfluencedCount / revengeTrades.length : 0;

    // Determine if this is revenge trading based on trade quality
    // For day trading with news analysis, consider:
    // 1. Average quality score is low (< 0.4) - tightened for better analysis
    // 2. Some trades (> 30%) show poor quality indicators
    // 3. Momentum chasing without news basis
    // 4. Low news influence suggests emotional rather than fundamental trading
    const isRevengeTrading = (
      averageQualityScore < 0.4 || 
      poorQualityRatio > 0.3 || 
      (momentumChasingCount >= Math.ceil(revengeTrades.length * 0.4) && newsInfluencedRatio < 0.3)
    );

    // Calculate confidence based on data quality and indicators
    let confidence = 0.5; // Base confidence
    
    if (isRevengeTrading) {
      // Increase confidence based on poor quality indicators
      confidence += Math.min(poorQualityRatio * 0.3, 0.3);
      confidence += Math.min((0.5 - averageQualityScore) * 0.4, 0.2);
    } else {
      // Decrease confidence if we think it's NOT revenge trading
      confidence = Math.max(0.3, 0.8 - averageQualityScore);
    }

    // Determine severity based on how bad the trade quality is
    let severity = 'low';
    if (isRevengeTrading) {
      if (averageQualityScore < 0.2 || poorQualityRatio > 0.8) {
        severity = 'high';
      } else if (averageQualityScore < 0.35 || poorQualityRatio > 0.6) {
        severity = 'medium';
      }
    }

    return {
      isRevengeTrading,
      confidence: Math.min(confidence, 1.0),
      severity,
      averageQualityScore,
      poorQualityRatio,
      newsInfluencedRatio,
      momentumChasingCount,
      trendFightingCount,
      newsInfluencedCount,
      totalTrades: revengeTrades.length,
      metrics
    };
  }

  // Simplified revenge trading detection without tick data (for day trading)
  static async shouldCreateRevengeEvent(userId, revengeTrades, triggerTrade, allTrades) {
    // For day trading, focus on position size patterns and loss magnitude
    
    // Calculate position sizes
    const triggerPositionSize = this.calculateMonetaryPositionSize(triggerTrade);
    const revengePositionSizes = revengeTrades.map(t => {
      const fullTrade = allTrades.find(trade => trade.id === t.id);
      return fullTrade ? this.calculateMonetaryPositionSize(fullTrade) : 0;
    });
    
    const maxRevengePosition = Math.max(...revengePositionSizes);
    const avgRevengePosition = revengePositionSizes.reduce((a, b) => a + b, 0) / revengePositionSizes.length;
    
    // Calculate position size increase
    const positionIncrease = triggerPositionSize > 0
      ? ((maxRevengePosition - triggerPositionSize) / triggerPositionSize) * 100
      : 0;
    
    // Calculate loss magnitude
    const triggerLoss = Math.abs(parseFloat(triggerTrade.pnl));
    
    // For day trading, detect revenge trading if:
    // 1. Position size increased significantly (>20% for day trading)
    // 2. OR multiple trades within short timeframe with increasing sizes
    // 3. OR significant loss followed by larger position sizes
    
    const hasSignificantPositionIncrease = positionIncrease > 20;
    const hasMultipleTradesWithIncreasingSize = revengeTrades.length >= 2 && 
      revengePositionSizes.some(size => size > triggerPositionSize * 1.3);
    const hasSameSymbolCandidate = revengeTrades.some(trade => trade.is_same_symbol === true);
    const hasLargeInitialLoss = triggerLoss > 200 && hasSameSymbolCandidate; // $200+ initial loss with same-symbol follow-up
    
    return hasSignificantPositionIncrease || hasMultipleTradesWithIncreasingSize || hasLargeInitialLoss;
  }

  // Analyze trade quality using Finnhub Fundamental-1 plan data (news, candles, quotes)
  static async analyzeTradeWithFundamentalData(trade) {
    const entryTime = new Date(trade.entry_time);
    const symbol = trade.symbol;
    
    let qualityScore = 0.5; // Start with neutral score
    let newsScore = 0.5;
    let candleScore = 0.5;
    let wasChasingMomentum = false;
    let wasFightingTrend = false;
    let hasRelevantNews = false;
    let analysisMode = 'fundamental_analysis';
    
    try {
      // 1. Analyze company news around trade time
      const newsAnalysis = await this.analyzeNewsAroundTrade(symbol, entryTime);
      newsScore = newsAnalysis.score;
      hasRelevantNews = newsAnalysis.hasRelevantNews;
      
      // 2. Analyze price action using 1-minute candles
      const candleAnalysis = await this.analyzeCandlesAroundTrade(symbol, entryTime, trade.side);
      candleScore = candleAnalysis.score;
      wasChasingMomentum = candleAnalysis.wasChasingMomentum;
      wasFightingTrend = candleAnalysis.wasFightingTrend;
      
      // 3. Combine scores with weights
      // News carries more weight for fundamental analysis
      qualityScore = (newsScore * 0.6) + (candleScore * 0.4);
      
      // 4. Adjust score based on news timing
      if (hasRelevantNews && newsScore > 0.7) {
        // Good news-based trade gets quality boost
        qualityScore = Math.min(qualityScore + 0.2, 1.0);
      } else if (wasChasingMomentum && !hasRelevantNews) {
        // Momentum chasing without news basis is poor quality
        qualityScore = Math.max(qualityScore - 0.2, 0.0);
      }
      
    } catch (error) {
      console.warn(`Error in fundamental analysis for ${symbol}: ${error.message}`);
      // Fall back to simple position-based analysis
      analysisMode = 'position_fallback';
    }
    
    return {
      qualityScore,
      newsScore,
      candleScore,
      wasChasingMomentum,
      wasFightingTrend,
      hasRelevantNews,
      analysisMode
    };
  }

  // Analyze news around trade time to determine if trade was news-driven
  static async analyzeNewsAroundTrade(symbol, entryTime) {
    try {
      // Look for news in 2-hour window before trade
      const windowStart = new Date(entryTime.getTime() - (2 * 60 * 60 * 1000));
      const windowEnd = entryTime;
      
      const news = await finnhub.getCompanyNews(
        symbol,
        windowStart.toISOString().split('T')[0],
        windowEnd.toISOString().split('T')[0]
      );
      
      if (!news || news.length === 0) {
        return { score: 0.5, hasRelevantNews: false };
      }
      
      let relevantNewsCount = 0;
      let totalSentimentScore = 0;
      let hasRecentBreakingNews = false;
      
      for (const newsItem of news) {
        const newsTime = new Date(newsItem.datetime * 1000);
        
        // Only consider news within 2 hours before trade
        if (newsTime >= windowStart && newsTime <= windowEnd) {
          relevantNewsCount++;
          
          // Analyze news timing - more recent = more relevant
          const timeFromNews = entryTime.getTime() - newsTime.getTime();
          const minutesFromNews = timeFromNews / (1000 * 60);
          
          // Breaking news within 30 minutes is highly relevant
          if (minutesFromNews <= 30) {
            hasRecentBreakingNews = true;
          }
          
          // Simple sentiment analysis based on headline
          const sentiment = this.analyzeNewsSentiment(newsItem.headline);
          totalSentimentScore += sentiment;
        }
      }
      
      if (relevantNewsCount === 0) {
        return { score: 0.5, hasRelevantNews: false };
      }
      
      const avgSentiment = totalSentimentScore / relevantNewsCount;
      let newsScore = 0.5;
      
      // Calculate news-based quality score
      if (hasRecentBreakingNews) {
        // Recent breaking news suggests informed trading
        newsScore = Math.min(0.5 + (avgSentiment * 0.3) + 0.2, 1.0);
      } else if (relevantNewsCount >= 2) {
        // Multiple news items suggest active story
        newsScore = Math.min(0.5 + (avgSentiment * 0.2) + 0.1, 0.8);
      } else {
        // Single news item
        newsScore = 0.5 + (avgSentiment * 0.1);
      }
      
      return {
        score: Math.max(newsScore, 0.1),
        hasRelevantNews: relevantNewsCount > 0,
        newsCount: relevantNewsCount,
        hasBreakingNews: hasRecentBreakingNews
      };
      
    } catch (error) {
      console.warn(`Error analyzing news for ${symbol}: ${error.message}`);
      return { score: 0.5, hasRelevantNews: false };
    }
  }

  // Simple sentiment analysis for news headlines
  static analyzeNewsSentiment(headline) {
    if (!headline) return 0;
    
    const text = headline.toLowerCase();
    
    // Positive indicators
    const positiveWords = ['up', 'gain', 'rise', 'surge', 'jump', 'beat', 'strong', 'good', 'positive', 'growth', 'profit', 'upgrade', 'buy'];
    const negativeWords = ['down', 'fall', 'drop', 'plunge', 'miss', 'weak', 'bad', 'negative', 'loss', 'cut', 'downgrade', 'sell'];
    
    let score = 0;
    
    for (const word of positiveWords) {
      if (text.includes(word)) score += 0.1;
    }
    
    for (const word of negativeWords) {
      if (text.includes(word)) score -= 0.1;
    }
    
    // Clamp between -0.5 and 0.5
    return Math.max(-0.5, Math.min(0.5, score));
  }

  // Analyze price action using 1-minute candles around trade time
  static async analyzeCandlesAroundTrade(symbol, entryTime, side) {
    try {
      // Get 1-minute candles for 30 minutes before and after trade
      const windowStart = new Date(entryTime.getTime() - (30 * 60 * 1000));
      const windowEnd = new Date(entryTime.getTime() + (30 * 60 * 1000));
      
      const candles = await finnhub.getCandles(
        symbol,
        '1', // 1-minute resolution
        Math.floor(windowStart.getTime() / 1000),
        Math.floor(windowEnd.getTime() / 1000)
      );
      
      if (!candles || !candles.c || candles.c.length < 10) {
        return { score: 0.5, wasChasingMomentum: false, wasFightingTrend: false };
      }
      
      // Find the candle closest to entry time
      const entryTimestamp = Math.floor(entryTime.getTime() / 1000);
      let entryIndex = -1;
      let minTimeDiff = Infinity;
      
      for (let i = 0; i < candles.t.length; i++) {
        const timeDiff = Math.abs(candles.t[i] - entryTimestamp);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          entryIndex = i;
        }
      }
      
      if (entryIndex === -1 || entryIndex < 5 || entryIndex >= candles.c.length - 5) {
        return { score: 0.5, wasChasingMomentum: false, wasFightingTrend: false };
      }
      
      // Analyze price action before trade
      const beforePrices = candles.c.slice(Math.max(0, entryIndex - 10), entryIndex);
      const afterPrices = candles.c.slice(entryIndex, Math.min(candles.c.length, entryIndex + 10));
      const entryPrice = candles.c[entryIndex];
      
      // Calculate trend before trade
      const trendBefore = this.calculatePriceTrend(beforePrices);
      
      // Check if chasing momentum
      const recentMove = beforePrices.length > 3 ? 
        (beforePrices[beforePrices.length - 1] - beforePrices[beforePrices.length - 4]) / beforePrices[beforePrices.length - 4] : 0;
      
      const wasChasingMomentum = (
        (side === 'long' && recentMove > 0.01) || // Buying after 1%+ move up
        (side === 'short' && recentMove < -0.01)   // Shorting after 1%+ move down
      );
      
      // Check if fighting trend
      const wasFightingTrend = (
        (side === 'long' && trendBefore < -0.005) ||  // Buying into downtrend
        (side === 'short' && trendBefore > 0.005)     // Shorting into uptrend
      );
      
      // Calculate quality score based on entry timing
      let candleScore = 0.5;
      
      if (wasChasingMomentum) {
        candleScore -= 0.2; // Penalty for momentum chasing
      }
      
      if (wasFightingTrend) {
        candleScore -= 0.1; // Penalty for fighting trend
      }
      
      // Bonus for entering during pullbacks or breakouts
      if (side === 'long' && recentMove < 0 && trendBefore > 0) {
        candleScore += 0.2; // Buying the dip in uptrend
      } else if (side === 'short' && recentMove > 0 && trendBefore < 0) {
        candleScore += 0.2; // Shorting the bounce in downtrend
      }
      
      return {
        score: Math.max(0.1, Math.min(0.9, candleScore)),
        wasChasingMomentum,
        wasFightingTrend,
        trendBefore,
        recentMove
      };
      
    } catch (error) {
      console.warn(`Error analyzing candles for ${symbol}: ${error.message}`);
      return { score: 0.5, wasChasingMomentum: false, wasFightingTrend: false };
    }
  }

  // Calculate price trend from array of prices
  static calculatePriceTrend(prices) {
    if (prices.length < 2) return 0;
    
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    
    return (lastPrice - firstPrice) / firstPrice;
  }

  // Clear existing historical data
  static async clearHistoricalData(userId, dateFilter = {}) {
    const eventParams = [userId];
    const patternParams = [userId];
    const alertParams = [userId];
    const eventConditions = [];
    const patternConditions = [];
    const alertConditions = [];

    if (dateFilter.startDate) {
      eventParams.push(dateFilter.startDate);
      patternParams.push(dateFilter.startDate);
      alertParams.push(dateFilter.startDate);
      eventConditions.push(`AND trigger_timestamp >= $${eventParams.length}`);
      patternConditions.push(`AND detected_at >= $${patternParams.length}`);
      alertConditions.push(`AND created_at >= $${alertParams.length}`);
    }

    if (dateFilter.endDate) {
      eventParams.push(dateFilter.endDate);
      patternParams.push(dateFilter.endDate);
      alertParams.push(dateFilter.endDate);
      eventConditions.push(`AND trigger_timestamp <= $${eventParams.length}`);
      patternConditions.push(`AND detected_at <= $${patternParams.length}`);
      alertConditions.push(`AND created_at <= $${alertParams.length}`);
    }

    if (dateFilter.accounts && dateFilter.accounts.length > 0) {
      if (dateFilter.accounts.includes('__unsorted__')) {
        eventConditions.push(`
          AND EXISTS (
            SELECT 1
            FROM trades account_trade
            WHERE (account_trade.id = revenge_trading_events.trigger_trade_id
               OR account_trade.id = ANY(revenge_trading_events.revenge_trades))
              AND (account_trade.account_identifier IS NULL OR account_trade.account_identifier = '')
          )
        `);
        patternConditions.push(`
          AND EXISTS (
            SELECT 1
            FROM trades account_trade
            WHERE account_trade.id = behavioral_patterns.trigger_trade_id
              AND (account_trade.account_identifier IS NULL OR account_trade.account_identifier = '')
          )
        `);
      } else {
        eventParams.push(dateFilter.accounts);
        patternParams.push(dateFilter.accounts);
        eventConditions.push(`
          AND EXISTS (
            SELECT 1
            FROM trades account_trade
            WHERE (account_trade.id = revenge_trading_events.trigger_trade_id
               OR account_trade.id = ANY(revenge_trading_events.revenge_trades))
              AND account_trade.account_identifier = ANY($${eventParams.length}::text[])
          )
        `);
        patternConditions.push(`
          AND EXISTS (
            SELECT 1
            FROM trades account_trade
            WHERE account_trade.id = behavioral_patterns.trigger_trade_id
              AND account_trade.account_identifier = ANY($${patternParams.length}::text[])
          )
        `);
      }
    }

    await db.query(`DELETE FROM revenge_trading_events WHERE user_id = $1 ${eventConditions.join(' ')}`, eventParams);
    await db.query(
      `DELETE FROM behavioral_patterns
       WHERE user_id = $1
         AND pattern_type IN ('same_symbol_revenge', 'emotional_reactive_trading', 'revenge_trading')
         ${patternConditions.join(' ')}`,
      patternParams
    );
    await db.query(`DELETE FROM behavioral_alerts WHERE user_id = $1 ${alertConditions.join(' ')}`, alertParams);
    await AnalyticsCache.delete(userId);
  }
}

BehavioralAnalyticsServiceV2.CALCULATION_VERSION = REVENGE_CALCULATION_VERSION;

module.exports = BehavioralAnalyticsServiceV2;
