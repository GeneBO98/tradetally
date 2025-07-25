const db = require('../config/database');
const TierService = require('./tierService');
const finnhub = require('../utils/finnhub');
const AnalyticsCache = require('./analyticsCache');

/**
 * Loss Aversion Analytics Service
 * 
 * Note: Advanced price analysis features require Finnhub API configuration.
 * Basic analysis will still work without Finnhub, but with limited functionality.
 * Pro users with Finnhub configured get full price movement analysis.
 */
class LossAversionAnalyticsService {
  
  // Analyze loss aversion patterns for a user
  static async analyzeLossAversion(userId, startDate = null, endDate = null) {
    try {
      // Check tier access
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        throw new Error('Loss aversion analytics requires Pro tier');
      }

    // Set date range (default: all available trades)
    let end, start;
    if (endDate && startDate) {
      // Use specified date range
      end = new Date(endDate);
      start = new Date(startDate);
    } else {
      // Get all available trades - query the earliest and latest trade dates
      const dateRangeQuery = `
        SELECT 
          MIN(entry_time) as earliest_date,
          MAX(COALESCE(exit_time, entry_time)) as latest_date
        FROM trades 
        WHERE user_id = $1 
          AND entry_time IS NOT NULL
      `;
      const dateRangeResult = await db.query(dateRangeQuery, [userId]);
      
      if (dateRangeResult.rows[0].earliest_date) {
        start = new Date(dateRangeResult.rows[0].earliest_date);
        end = new Date(dateRangeResult.rows[0].latest_date);
      } else {
        // Fallback if no trades found
        end = new Date();
        start = new Date(end.getTime() - (90 * 24 * 60 * 60 * 1000));
      }
    }

    // Get all completed trades in the period
    const tradesQuery = `
      SELECT 
        id, symbol, entry_time, exit_time, entry_price, exit_price,
        quantity, side, COALESCE(pnl, 0) as pnl, COALESCE(commission, 0) as commission, COALESCE(fees, 0) as fees,
        EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60 as hold_time_minutes
      FROM trades
      WHERE user_id = $1
        AND exit_time IS NOT NULL
        AND entry_time IS NOT NULL
        AND pnl IS NOT NULL
        AND entry_time >= $2
        AND exit_time <= $3
      ORDER BY entry_time
    `;

    const tradesResult = await db.query(tradesQuery, [userId, start, end]);
    const trades = tradesResult.rows;
    
    console.log(`Loss aversion analysis for user ${userId}: Found ${trades.length} trades between ${start.toISOString()} and ${end.toISOString()}`);

    if (trades.length < 10) {
      return {
        error: 'Insufficient trades for analysis',
        message: `You currently have ${trades.length} completed trades. To analyze loss aversion patterns, you need at least 10 completed trades. Keep trading and check back once you've reached this milestone!`,
        currentTrades: trades.length,
        requiredTrades: 10,
        tradesNeeded: 10 - trades.length
      };
    }

    // Separate winners and losers
    const winners = trades.filter(t => parseFloat(t.pnl) > 0);
    const losers = trades.filter(t => parseFloat(t.pnl) < 0);

    if (winners.length === 0 || losers.length === 0) {
      return {
        error: 'Need both winning and losing trades',
        message: `Loss aversion analysis requires both winning and losing trades to compare behavior patterns. You currently have ${winners.length} winning trades and ${losers.length} losing trades. Keep trading to build a more diverse trade history!`,
        winningTrades: winners.length,
        losingTrades: losers.length
      };
    }

    // Calculate average hold times
    const avgWinnerHoldTime = winners.reduce((sum, t) => sum + parseFloat(t.hold_time_minutes || 0), 0) / winners.length;
    const avgLoserHoldTime = losers.reduce((sum, t) => sum + parseFloat(t.hold_time_minutes || 0), 0) / losers.length;
    const holdTimeRatio = avgWinnerHoldTime > 0 ? avgLoserHoldTime / avgWinnerHoldTime : 1.0;

    // Analyze individual trades for patterns
    const tradePatterns = await this.analyzeTradePatterns(trades, avgWinnerHoldTime, avgLoserHoldTime);

    // Analyze price history for premature exits
    let priceHistoryAnalysis = null;
    const prematureExitTrades = tradePatterns.patterns.filter(p => p.isWinner && p.prematureExit);
    console.log(`Found ${prematureExitTrades.length} premature exit trades for price history analysis`);
    
    try {
      priceHistoryAnalysis = await this.analyzePriceHistoryForPrematureExits(
        prematureExitTrades,
        userId
      );
      console.log(`Price history analysis completed: totalMissedProfit=${priceHistoryAnalysis.totalMissedProfit}, avgMissedProfitPercent=${priceHistoryAnalysis.avgMissedProfitPercent}`);
    } catch (error) {
      console.error('Error analyzing price history for premature exits:', error.message);
      // Continue with null price history analysis rather than failing the entire analysis
      priceHistoryAnalysis = {
        totalAnalyzed: 0,
        totalMissedProfit: 0,
        avgMissedProfitPercent: 0,
        exampleTrades: [],
        summary: 'Price history analysis unavailable due to API limitations'
      };
    }

    // Calculate financial impact
    const financialImpact = await this.calculateFinancialImpact(
      winners, 
      losers, 
      avgWinnerHoldTime, 
      avgLoserHoldTime,
      tradePatterns
    );

    // Find worst performing symbol
    const symbolAnalysis = await this.analyzeBySymbol(trades);

    // Create loss aversion event
    const eventQuery = `
      INSERT INTO loss_aversion_events (
        user_id, analysis_start_date, analysis_end_date,
        avg_winner_hold_time_minutes, avg_loser_hold_time_minutes,
        hold_time_ratio, total_winning_trades, total_losing_trades,
        premature_profit_exits, extended_loss_holds,
        estimated_monthly_cost, missed_profit_potential, unnecessary_loss_extension,
        avg_planned_risk_reward, avg_actual_risk_reward,
        worst_hold_ratio_symbol, worst_hold_ratio_value, avg_missed_profit_percent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

    const eventResult = await db.query(eventQuery, [
      userId,
      start,
      end,
      Math.round(avgWinnerHoldTime),
      Math.round(avgLoserHoldTime),
      Math.min(holdTimeRatio, 99.99), // Cap at 99.99 for DB constraint
      winners.length,
      losers.length,
      tradePatterns.prematureExits,
      tradePatterns.extendedHolds,
      financialImpact.estimatedMonthlyCost,
      financialImpact.missedProfitPotential,
      financialImpact.unnecessaryLossExtension,
      financialImpact.avgPlannedRiskReward,
      financialImpact.avgActualRiskReward,
      symbolAnalysis.worstSymbol,
      Math.min(symbolAnalysis.worstRatio, 99.99),
      priceHistoryAnalysis ? Math.min(priceHistoryAnalysis.avgMissedProfitPercent || 0, 99.99) : 0
    ]);

    // Store individual trade patterns
    await this.storeTradePatterns(userId, tradePatterns.patterns);

    return {
      event: eventResult.rows[0],
      analysis: {
        holdTimeRatio,
        avgWinnerHoldTime: Math.round(avgWinnerHoldTime),
        avgLoserHoldTime: Math.round(avgLoserHoldTime),
        totalTrades: trades.length,
        winners: winners.length,
        losers: losers.length,
        financialImpact,
        patterns: tradePatterns,
        priceHistoryAnalysis,
        symbolAnalysis,
        message: this.generateInsightMessage(holdTimeRatio, financialImpact)
      }
    };
    } catch (error) {
      console.error('Error in loss aversion analysis:', error);
      throw error;
    }
  }

  // Analyze individual trade patterns
  static async analyzeTradePatterns(trades, avgWinnerHoldTime, avgLoserHoldTime) {
    const patterns = [];
    let prematureExits = 0;
    let extendedHolds = 0;

    for (const trade of trades) {
      const isWinner = parseFloat(trade.pnl) > 0;
      const holdTime = parseFloat(trade.hold_time_minutes);
      
      // Determine if trade was held appropriately
      let isPremature = false;
      let isExtended = false;
      
      if (isWinner && holdTime < avgWinnerHoldTime * 0.5) {
        // Winner closed way too early
        isPremature = true;
        prematureExits++;
      } else if (!isWinner && holdTime > avgLoserHoldTime * 1.5) {
        // Loser held way too long
        isExtended = true;
        extendedHolds++;
      }

      // Calculate exit quality score (0-1)
      let exitQualityScore = 0.5;
      if (isWinner) {
        // For winners, longer hold = better (up to a point)
        exitQualityScore = Math.min(holdTime / (avgWinnerHoldTime * 1.2), 1.0);
      } else {
        // For losers, shorter hold = better
        exitQualityScore = Math.max(1.0 - (holdTime / (avgLoserHoldTime * 2)), 0.1);
      }

      patterns.push({
        tradeId: trade.id,
        symbol: trade.symbol,
        isWinner,
        pnl: parseFloat(trade.pnl),
        holdTimeMinutes: Math.round(holdTime),
        prematureExit: isPremature,
        extendedHold: isExtended,
        exitQualityScore: Math.round(exitQualityScore * 100) / 100
      });
    }

    return {
      patterns,
      prematureExits,
      extendedHolds
    };
  }

  // Calculate financial impact of loss aversion
  static async calculateFinancialImpact(winners, losers, avgWinnerHoldTime, avgLoserHoldTime, tradePatterns) {
    // Calculate missed profits from early exits
    let missedProfitPotential = 0;
    const prematureWinners = tradePatterns.patterns.filter(p => p.isWinner && p.prematureExit);
    
    for (const trade of prematureWinners) {
      // Estimate that holding to average time would capture 20% more profit
      const additionalProfit = trade.pnl * 0.2;
      missedProfitPotential += additionalProfit;
    }

    // Calculate unnecessary losses from holding too long
    let unnecessaryLossExtension = 0;
    const extendedLosers = tradePatterns.patterns.filter(p => !p.isWinner && p.extendedHold);
    
    for (const trade of extendedLosers) {
      // Estimate that cutting losses at average time would save 15% of the loss
      const savedLoss = Math.abs(trade.pnl) * 0.15;
      unnecessaryLossExtension += savedLoss;
    }

    // Calculate total impact over analysis period
    const totalImpact = missedProfitPotential + unnecessaryLossExtension;
    
    // Estimate monthly cost (scale to 30 days)
    const analysisDays = tradePatterns.patterns.length > 0 ? 
      Math.max(1, Math.ceil((new Date(losers[losers.length - 1].exit_time) - new Date(winners[0].entry_time)) / (1000 * 60 * 60 * 24))) : 30;
    const estimatedMonthlyCost = (totalImpact / analysisDays) * 30;

    // Calculate risk/reward ratios
    const avgPlannedRiskReward = 2.0; // Assume standard 2:1 target
    const actualRiskRewards = winners.map(w => {
      const avgLoss = losers.reduce((sum, l) => sum + Math.abs(parseFloat(l.pnl)), 0) / losers.length;
      return parseFloat(w.pnl) / avgLoss;
    });
    const avgActualRiskReward = actualRiskRewards.reduce((a, b) => a + b, 0) / actualRiskRewards.length;

    return {
      missedProfitPotential: Math.round(missedProfitPotential * 100) / 100,
      unnecessaryLossExtension: Math.round(unnecessaryLossExtension * 100) / 100,
      estimatedMonthlyCost: Math.round(estimatedMonthlyCost * 100) / 100,
      avgPlannedRiskReward: Math.round(avgPlannedRiskReward * 100) / 100,
      avgActualRiskReward: Math.round(avgActualRiskReward * 100) / 100
    };
  }

  // Analyze loss aversion by symbol
  static async analyzeBySymbol(trades) {
    const symbolStats = {};
    
    // Group trades by symbol
    for (const trade of trades) {
      if (!symbolStats[trade.symbol]) {
        symbolStats[trade.symbol] = {
          winners: [],
          losers: []
        };
      }
      
      if (parseFloat(trade.pnl) > 0) {
        symbolStats[trade.symbol].winners.push(parseFloat(trade.hold_time_minutes));
      } else {
        symbolStats[trade.symbol].losers.push(parseFloat(trade.hold_time_minutes));
      }
    }

    // Calculate ratios per symbol
    let worstSymbol = null;
    let worstRatio = 0;
    const symbolRatios = {};

    for (const [symbol, stats] of Object.entries(symbolStats)) {
      if (stats.winners.length > 0 && stats.losers.length > 0) {
        const avgWinnerTime = stats.winners.reduce((a, b) => a + b, 0) / stats.winners.length;
        const avgLoserTime = stats.losers.reduce((a, b) => a + b, 0) / stats.losers.length;
        const ratio = avgLoserTime / avgWinnerTime;
        
        symbolRatios[symbol] = ratio;
        
        if (ratio > worstRatio) {
          worstRatio = ratio;
          worstSymbol = symbol;
        }
      }
    }

    return {
      symbolRatios,
      worstSymbol,
      worstRatio: Math.round(worstRatio * 100) / 100
    };
  }

  // Store individual trade patterns
  static async storeTradePatterns(userId, patterns) {
    for (const pattern of patterns) {
      const query = `
        INSERT INTO trade_hold_patterns (
          user_id, trade_id, is_winner, pnl,
          hold_time_minutes, exit_quality_score,
          premature_exit, extended_hold
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (trade_id) DO UPDATE SET
          exit_quality_score = EXCLUDED.exit_quality_score,
          premature_exit = EXCLUDED.premature_exit,
          extended_hold = EXCLUDED.extended_hold,
          hold_time_minutes = EXCLUDED.hold_time_minutes
      `;

      await db.query(query, [
        userId,
        pattern.tradeId,
        pattern.isWinner,
        pattern.pnl,
        pattern.holdTimeMinutes,
        pattern.exitQualityScore,
        pattern.prematureExit,
        pattern.extendedHold
      ]);
    }
  }

  // Analyze price history for trades that were closed too early
  static async analyzePriceHistoryForPrematureExits(prematureExitTrades, userId = null) {
    const analysisResults = [];
    const exampleTrades = [];
    
    console.log(`Analyzing price history for ${prematureExitTrades.length} premature exit trades`);
    
    // Check if Finnhub is configured
    const finnhubConfigured = finnhub.isConfigured();
    
    // Check if user has Pro tier for higher limits
    let isProTier = false;
    if (userId) {
      try {
        const TierService = require('./tierService');
        isProTier = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      } catch (error) {
        console.error('Error checking tier status:', error);
      }
    }
    
    // Set limits based on configuration and tier
    let maxTradesToAnalyze, apiDelay;
    if (finnhubConfigured) {
      // For Finnhub Basic plan (150 calls/min = 2.5 calls/sec)
      // Pro users get higher limits for better analysis
      maxTradesToAnalyze = isProTier ? 25 : 10;
      apiDelay = 500; // 0.5s delay to stay within rate limits
    } else {
      // Self-hosted fallback
      maxTradesToAnalyze = 2;
      apiDelay = 2000;
    }
    
    const tradesToAnalyze = prematureExitTrades.slice(0, maxTradesToAnalyze);
    console.log(`Will analyze ${tradesToAnalyze.length} trades (Finnhub ${finnhubConfigured ? 'configured' : 'not configured'}, ${isProTier ? 'Pro' : 'Free'} tier)`);
    
    for (let i = 0; i < tradesToAnalyze.length; i++) {
      const tradePattern = tradesToAnalyze[i];
      
      // Add delay between trades to respect rate limits
      if (i > 0) {
        console.log(`Waiting ${apiDelay}ms before analyzing next trade (${i + 1}/${tradesToAnalyze.length})...`);
        await new Promise(resolve => setTimeout(resolve, apiDelay));
      }
      try {
        // Get the full trade details from database
        const tradeQuery = `
          SELECT id, symbol, entry_time, exit_time, entry_price, exit_price, 
                 quantity, side, pnl, commission, fees
          FROM trades 
          WHERE id = $1
        `;
        const tradeResult = await db.query(tradeQuery, [tradePattern.tradeId]);
        const trade = tradeResult.rows[0];
        
        if (!trade) continue;
        
        const exitTime = new Date(trade.exit_time);
        const entryTime = new Date(trade.entry_time);
        
        // Get price data for different time horizons after exit (dynamic based on trader profile)
        const priceAnalysis = await this.analyzePriceMovementAfterExit(
          trade.symbol,
          trade.exit_price,
          exitTime,
          trade.side,
          userId
        );
        
        // Skip market indicators for now to reduce API calls
        const indicators = {
          trend: 'unknown',
          signals: [],
          recommendation: 'price_analysis_only'
        };
        
        // Calculate potential additional profit (dynamic based on trader profile)
        const actualProfit = parseFloat(trade.pnl);
        const quantity = parseFloat(trade.quantity);
        const exitPrice = parseFloat(trade.exit_price);
        
        // Dynamic profit calculation based on available price intervals
        let potentialAdditionalProfit = {
          optimal: 0
        };
        
        // Calculate profit for each available time interval
        Object.keys(priceAnalysis).forEach(key => {
          if (key.startsWith('priceAfter') && priceAnalysis[key] !== undefined) {
            const price = priceAnalysis[key];
            if (trade.side === 'long') {
              potentialAdditionalProfit[key] = (price - exitPrice) * quantity;
            } else {
              potentialAdditionalProfit[key] = (exitPrice - price) * quantity;
            }
          }
        });
        
        // Calculate optimal profit based on max/min reached
        if (trade.side === 'long') {
          potentialAdditionalProfit.optimal = (priceAnalysis.maxPriceWithin24Hours - exitPrice) * quantity;
        } else {
          potentialAdditionalProfit.optimal = (exitPrice - priceAnalysis.minPriceWithin24Hours) * quantity;
        }
        
        // Add backward compatibility fields if they exist
        if (priceAnalysis.priceAfter1Hour !== undefined) {
          potentialAdditionalProfit.oneHour = potentialAdditionalProfit.priceAfter1Hour;
        }
        if (priceAnalysis.priceAfter4Hours !== undefined) {
          potentialAdditionalProfit.fourHours = potentialAdditionalProfit.priceAfter4Hours;
        }
        if (priceAnalysis.priceAfter1Day !== undefined) {
          potentialAdditionalProfit.oneDay = potentialAdditionalProfit.priceAfter1Day;
        }
        
        const analysis = {
          tradeId: trade.id,
          symbol: trade.symbol,
          entryTime: trade.entry_time,
          exitTime: trade.exit_time,
          entryPrice: parseFloat(trade.entry_price),
          exitPrice: parseFloat(trade.exit_price),
          side: trade.side,
          quantity: quantity,
          actualProfit: actualProfit,
          holdTimeMinutes: Math.round((exitTime - entryTime) / (1000 * 60)),
          priceMovement: priceAnalysis,
          indicators: indicators,
          potentialAdditionalProfit: potentialAdditionalProfit
        };
        
        analysisResults.push(analysis);
        
        // Add to examples if significant missed opportunity
        if (potentialAdditionalProfit.optimal > actualProfit * 0.5) { // 50%+ additional profit possible
          exampleTrades.push({
            ...analysis,
            missedOpportunityPercent: ((potentialAdditionalProfit.optimal / actualProfit) * 100).toFixed(1),
            recommendation: this.generateTradeRecommendation(analysis)
          });
        }
        
      } catch (error) {
        console.error(`Error analyzing trade ${tradePattern.tradeId}:`, error);
      }
    }
    
    // Calculate summary statistics
    const totalMissedProfit = analysisResults.reduce((sum, analysis) => 
      sum + Math.max(0, analysis.potentialAdditionalProfit.optimal), 0
    );
    
    const avgMissedProfitPercent = analysisResults.length > 0 ?
      analysisResults.reduce((sum, analysis) => 
        sum + (analysis.potentialAdditionalProfit.optimal / Math.abs(analysis.actualProfit)) * 100, 0
      ) / analysisResults.length : 0;
    
    return {
      totalAnalyzed: analysisResults.length,
      totalMissedProfit: Math.round(totalMissedProfit * 100) / 100,
      avgMissedProfitPercent: Math.round(avgMissedProfitPercent * 10) / 10,
      exampleTrades: exampleTrades.slice(0, 5), // Top 5 examples
      detailedAnalysis: analysisResults
    };
  }

  // Analyze price movement after a trade was closed (dynamic based on trader profile)
  static async analyzePriceMovementAfterExit(symbol, exitPrice, exitTime, side, userId = null) {
    try {
      // Get dynamic analysis parameters based on trader profile
      const analysisParams = await this.getAnalysisParameters(userId);
      
      const startTime = Math.floor(exitTime.getTime() / 1000);
      const endTime = startTime + analysisParams.maxLookAheadSeconds;
      
      // Use appropriate candle resolution based on time horizon
      const resolution = analysisParams.candleResolution;
      const candles = await finnhub.getCandles(symbol, resolution, startTime, endTime);
      
      if (!candles || !candles.c || candles.c.length === 0) {
        throw new Error(`No price data available for ${symbol}`);
      }
      
      const prices = candles.c;
      const times = candles.t;
      
      // Apply pullback logic based on trader type
      const { 
        effectivePrices, 
        effectiveTimes, 
        pullbackTime, 
        maxBeforePullback, 
        minBeforePullback 
      } = this.findPricesUntilPullback(prices, times, exitPrice, side, analysisParams.pullbackThreshold);
      
      // Find prices at intervals appropriate for this trader type
      const intervals = analysisParams.timeIntervals;
      const priceResults = {};
      
      intervals.forEach(interval => {
        const targetTime = startTime + interval.seconds;
        priceResults[interval.name] = this.findPriceAtTime(effectiveTimes, effectivePrices, targetTime) || exitPrice;
      });
      
      // Use max/min only until the pullback point
      const maxPrice = maxBeforePullback;
      const minPrice = minBeforePullback;
      const maxPriceIndex = effectivePrices.indexOf(maxPrice);
      const minPriceIndex = effectivePrices.indexOf(minPrice);
      
      return {
        ...priceResults,
        maxPriceWithin24Hours: maxPrice,
        minPriceWithin24Hours: minPrice,
        maxPriceTime: effectiveTimes[maxPriceIndex],
        minPriceTime: effectiveTimes[minPriceIndex],
        priceDirection: maxPrice > exitPrice ? 'up' : 'down',
        volatility: ((maxPrice - minPrice) / exitPrice) * 100,
        pullbackOccurred: pullbackTime !== null,
        pullbackTime: pullbackTime,
        analysisHorizon: analysisParams.description,
        traderType: analysisParams.traderType
      };
    } catch (error) {
      console.error(`Error getting price movement for ${symbol}:`, error);
      return {
        priceAfter1Hour: exitPrice,
        priceAfter4Hours: exitPrice,
        priceAfter1Day: exitPrice,
        maxPriceWithin24Hours: exitPrice,
        minPriceWithin24Hours: exitPrice,
        priceDirection: 'unknown',
        volatility: 0,
        pullbackOccurred: false,
        pullbackTime: null,
        analysisHorizon: 'default',
        traderType: 'unknown'
      };
    }
  }

  // Get analysis parameters based on trader profile
  static async getAnalysisParameters(userId) {
    try {
      if (!userId) {
        return this.getDefaultAnalysisParameters();
      }

      // Import TradingPersonalityService here to avoid circular dependencies
      const TradingPersonalityService = require('./tradingPersonalityService');
      const profile = await TradingPersonalityService.getLatestProfile(userId);
      
      if (!profile) {
        return this.getDefaultAnalysisParameters();
      }

      // Analyze user's actual trading patterns
      const tradesQuery = `
        SELECT 
          EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60 as hold_time_minutes,
          EXTRACT(EPOCH FROM (exit_time - entry_time)) / (60 * 60 * 24) as hold_time_days
        FROM trades 
        WHERE user_id = $1 
          AND exit_time IS NOT NULL 
          AND entry_time IS NOT NULL
        ORDER BY exit_time DESC
        LIMIT 100
      `;
      
      const db = require('../config/database');
      const tradesResult = await db.query(tradesQuery, [userId]);
      const trades = tradesResult.rows;

      // Calculate percentage of multiday trades
      const multidayTrades = trades.filter(t => parseFloat(t.hold_time_days) >= 1).length;
      const multidayPercentage = trades.length > 0 ? (multidayTrades / trades.length) * 100 : 0;
      
      // Get average hold time
      const avgHoldTime = profile.avg_hold_time_minutes || 0;
      const personality = profile.primary_personality || 'scalper';

      // Determine trader type and parameters
      if (personality === 'swing' || multidayPercentage >= 50 || avgHoldTime > 1440) {
        // Swing trader parameters
        return {
          traderType: 'swing',
          description: 'Swing trading analysis (5-30 days)',
          maxLookAheadSeconds: 30 * 24 * 60 * 60, // 30 days
          candleResolution: '60', // 1-hour candles
          pullbackThreshold: 0.15, // 15% pullback threshold
          timeIntervals: [
            { name: 'priceAfter4Hours', seconds: 4 * 60 * 60 },
            { name: 'priceAfter1Day', seconds: 24 * 60 * 60 },
            { name: 'priceAfter1Week', seconds: 7 * 24 * 60 * 60 },
            { name: 'priceAfter2Weeks', seconds: 14 * 24 * 60 * 60 }
          ]
        };
      } else if (personality === 'momentum' || (avgHoldTime > 240 && avgHoldTime <= 1440)) {
        // Momentum/short-term swing parameters  
        return {
          traderType: 'momentum',
          description: 'Momentum trading analysis (4 hours - 3 days)',
          maxLookAheadSeconds: 3 * 24 * 60 * 60, // 3 days
          candleResolution: '15', // 15-minute candles
          pullbackThreshold: 0.12, // 12% pullback threshold
          timeIntervals: [
            { name: 'priceAfter1Hour', seconds: 60 * 60 },
            { name: 'priceAfter4Hours', seconds: 4 * 60 * 60 },
            { name: 'priceAfter1Day', seconds: 24 * 60 * 60 },
            { name: 'priceAfter2Days', seconds: 2 * 24 * 60 * 60 }
          ]
        };
      } else {
        // Scalper/day trader parameters
        return {
          traderType: 'scalper',
          description: 'Day trading analysis (intraday focus)',
          maxLookAheadSeconds: 24 * 60 * 60, // 24 hours
          candleResolution: '5', // 5-minute candles
          pullbackThreshold: 0.10, // 10% pullback threshold
          timeIntervals: [
            { name: 'priceAfter30Min', seconds: 30 * 60 },
            { name: 'priceAfter1Hour', seconds: 60 * 60 },
            { name: 'priceAfter4Hours', seconds: 4 * 60 * 60 },
            { name: 'priceAfter1Day', seconds: 24 * 60 * 60 }
          ]
        };
      }
    } catch (error) {
      console.error('Error getting analysis parameters:', error);
      return this.getDefaultAnalysisParameters();
    }
  }

  // Default analysis parameters
  static getDefaultAnalysisParameters() {
    return {
      traderType: 'scalper',
      description: 'Day trading analysis (default)',
      maxLookAheadSeconds: 24 * 60 * 60, // 24 hours
      candleResolution: '5', // 5-minute candles
      pullbackThreshold: 0.10, // 10% pullback threshold
      timeIntervals: [
        { name: 'priceAfter1Hour', seconds: 60 * 60 },
        { name: 'priceAfter4Hours', seconds: 4 * 60 * 60 },
        { name: 'priceAfter1Day', seconds: 24 * 60 * 60 }
      ]
    };
  }

  // Find prices until first major pullback (dynamic threshold)
  static findPricesUntilPullback(prices, times, exitPrice, side, pullbackThreshold = 0.10) {
    let maxPrice = exitPrice;
    let minPrice = exitPrice;
    let pullbackTime = null;
    let effectiveEndIndex = prices.length - 1;
    
    for (let i = 0; i < prices.length; i++) {
      const currentPrice = prices[i];
      
      // Track running max/min
      if (currentPrice > maxPrice) maxPrice = currentPrice;
      if (currentPrice < minPrice) minPrice = currentPrice;
      
      // Check for pullback based on trade direction and dynamic threshold
      let pullbackOccurred = false;
      
      if (side === 'long') {
        // For long trades, check if price pulled back from the high
        if (maxPrice > exitPrice && currentPrice <= maxPrice * (1 - pullbackThreshold)) {
          pullbackOccurred = true;
        }
      } else {
        // For short trades, check if price moved up from the low  
        if (minPrice < exitPrice && currentPrice >= minPrice * (1 + pullbackThreshold)) {
          pullbackOccurred = true;
        }
      }
      
      if (pullbackOccurred) {
        effectiveEndIndex = i;
        pullbackTime = times[i];
        break;
      }
    }
    
    // Return data only up to the pullback point
    const effectivePrices = prices.slice(0, effectiveEndIndex + 1);
    const effectiveTimes = times.slice(0, effectiveEndIndex + 1);
    
    // Recalculate max/min for the effective period
    const maxBeforePullback = Math.max(...effectivePrices);
    const minBeforePullback = Math.min(...effectivePrices);
    
    return {
      effectivePrices,
      effectiveTimes,
      pullbackTime,
      maxBeforePullback,
      minBeforePullback
    };
  }

  // Find price closest to specific time
  static findPriceAtTime(times, prices, targetTime) {
    let closestIndex = 0;
    let closestDiff = Math.abs(times[0] - targetTime);
    
    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i] - targetTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }
    
    return prices[closestIndex];
  }

  // Analyze market indicators at the time of exit using advanced technical analysis
  static async analyzeMarketIndicatorsAtExit(symbol, exitTime, side) {
    try {
      const endTime = Math.floor(exitTime.getTime() / 1000);
      const startTime = endTime - (2 * 60 * 60); // 2 hours before for better context
      
      // Get multiple technical indicators in parallel
      const [
        candles,
        rsiData,
        macdData,
        stochData,
        patterns,
        supportResistance
      ] = await Promise.all([
        finnhub.getCandles(symbol, '5', startTime, endTime),
        this.getTechnicalIndicatorSafe(symbol, '5', startTime, endTime, 'rsi', { timeperiod: 14 }),
        this.getTechnicalIndicatorSafe(symbol, '5', startTime, endTime, 'macd', { fastperiod: 12, slowperiod: 26, signalperiod: 9 }),
        this.getTechnicalIndicatorSafe(symbol, '5', startTime, endTime, 'stoch', { fastkperiod: 14, slowkperiod: 3, slowdperiod: 3 }),
        this.getPatternRecognitionSafe(symbol, 'D'),
        this.getSupportResistanceSafe(symbol, 'D')
      ]);
      
      if (!candles || !candles.c || candles.c.length < 10) {
        return {
          trend: 'insufficient_data',
          signals: [],
          recommendation: 'insufficient_data'
        };
      }
      
      const prices = candles.c;
      const volumes = candles.v;
      const exitPrice = prices[prices.length - 1];
      
      // Analyze technical indicators
      const signals = [];
      let overallSignal = 'neutral';
      let confidence = 0.5;
      
      // RSI Analysis
      if (rsiData && rsiData.rsi && rsiData.rsi.length > 0) {
        const currentRSI = rsiData.rsi[rsiData.rsi.length - 1];
        if (side === 'long') {
          if (currentRSI < 70 && currentRSI > 50) {
            signals.push({ type: 'RSI', signal: 'bullish', value: currentRSI, reason: 'RSI in healthy uptrend zone' });
            confidence += 0.1;
          } else if (currentRSI > 70) {
            signals.push({ type: 'RSI', signal: 'overbought', value: currentRSI, reason: 'RSI overbought - good exit' });
          }
        } else {
          if (currentRSI > 30 && currentRSI < 50) {
            signals.push({ type: 'RSI', signal: 'bearish', value: currentRSI, reason: 'RSI in healthy downtrend zone' });
            confidence += 0.1;
          } else if (currentRSI < 30) {
            signals.push({ type: 'RSI', signal: 'oversold', value: currentRSI, reason: 'RSI oversold - good exit' });
          }
        }
      }
      
      // MACD Analysis
      if (macdData && macdData.macd && macdData.signal && macdData.macd.length > 1) {
        const currentMACD = macdData.macd[macdData.macd.length - 1];
        const currentSignal = macdData.signal[macdData.signal.length - 1];
        const prevMACD = macdData.macd[macdData.macd.length - 2];
        const prevSignal = macdData.signal[macdData.signal.length - 2];
        
        const macdCrossover = (prevMACD <= prevSignal) && (currentMACD > currentSignal);
        const macdCrossunder = (prevMACD >= prevSignal) && (currentMACD < currentSignal);
        
        if (side === 'long' && macdCrossover) {
          signals.push({ type: 'MACD', signal: 'bullish_crossover', reason: 'MACD crossed above signal - strong hold signal' });
          confidence += 0.2;
          overallSignal = 'strong_hold';
        } else if (side === 'short' && macdCrossunder) {
          signals.push({ type: 'MACD', signal: 'bearish_crossover', reason: 'MACD crossed below signal - strong hold signal' });
          confidence += 0.2;
          overallSignal = 'strong_hold';
        }
      }
      
      // Stochastic Analysis
      if (stochData && stochData.slowk && stochData.slowd && stochData.slowk.length > 0) {
        const currentK = stochData.slowk[stochData.slowk.length - 1];
        const currentD = stochData.slowd[stochData.slowd.length - 1];
        
        if (side === 'long') {
          if (currentK > currentD && currentK < 80) {
            signals.push({ type: 'Stochastic', signal: 'bullish', reason: 'Stochastic %K above %D in non-overbought zone' });
            confidence += 0.1;
          }
        } else {
          if (currentK < currentD && currentK > 20) {
            signals.push({ type: 'Stochastic', signal: 'bearish', reason: 'Stochastic %K below %D in non-oversold zone' });
            confidence += 0.1;
          }
        }
      }
      
      // Pattern Recognition Analysis
      if (patterns && patterns.points && patterns.points.length > 0) {
        const recentPatterns = patterns.points.filter(p => p.status === 'emerging' || p.status === 'completed');
        for (const pattern of recentPatterns) {
          if (this.isBullishPattern(pattern.patternname) && side === 'long') {
            signals.push({ type: 'Pattern', signal: 'bullish_pattern', pattern: pattern.patternname, reason: `${pattern.patternname} pattern suggests continuation` });
            confidence += 0.15;
          } else if (this.isBearishPattern(pattern.patternname) && side === 'short') {
            signals.push({ type: 'Pattern', signal: 'bearish_pattern', pattern: pattern.patternname, reason: `${pattern.patternname} pattern suggests continuation` });
            confidence += 0.15;
          }
        }
      }
      
      // Support/Resistance Analysis
      if (supportResistance && supportResistance.levels) {
        const nearestSupport = this.findNearestLevel(exitPrice, supportResistance.levels.filter(l => l < exitPrice));
        const nearestResistance = this.findNearestLevel(exitPrice, supportResistance.levels.filter(l => l > exitPrice));
        
        if (side === 'long' && nearestResistance) {
          const distanceToResistance = ((nearestResistance - exitPrice) / exitPrice) * 100;
          if (distanceToResistance > 2) {
            signals.push({ type: 'Support/Resistance', signal: 'room_to_grow', reason: `${distanceToResistance.toFixed(1)}% room to resistance at $${nearestResistance.toFixed(2)}` });
            confidence += 0.1;
          }
        } else if (side === 'short' && nearestSupport) {
          const distanceToSupport = ((exitPrice - nearestSupport) / exitPrice) * 100;
          if (distanceToSupport > 2) {
            signals.push({ type: 'Support/Resistance', signal: 'room_to_fall', reason: `${distanceToSupport.toFixed(1)}% room to support at $${nearestSupport.toFixed(2)}` });
            confidence += 0.1;
          }
        }
      }
      
      // Generate overall recommendation
      let recommendation = 'neutral';
      if (confidence > 0.7) {
        recommendation = 'strong_hold_signal';
        overallSignal = 'strong_hold';
      } else if (confidence > 0.6) {
        recommendation = 'moderate_hold_signal';
        overallSignal = 'moderate_hold';
      } else if (signals.some(s => s.signal.includes('overbought') || s.signal.includes('oversold'))) {
        recommendation = 'correct_exit';
        overallSignal = 'correct_exit';
      }
      
      return {
        trend: overallSignal,
        signals,
        confidence: Math.round(confidence * 100) / 100,
        recommendation,
        technicalSummary: this.generateTechnicalSummary(signals, side)
      };
    } catch (error) {
      console.error(`Error analyzing indicators for ${symbol}:`, error);
      return {
        trend: 'error',
        signals: [],
        recommendation: 'error_analyzing'
      };
    }
  }

  // Helper methods for safe API calls
  static async getTechnicalIndicatorSafe(symbol, resolution, from, to, indicator, params) {
    try {
      return await finnhub.getTechnicalIndicator(symbol, resolution, from, to, indicator, params);
    } catch (error) {
      console.warn(`Failed to get ${indicator} for ${symbol}: ${error.message}`);
      return null;
    }
  }

  static async getPatternRecognitionSafe(symbol, resolution) {
    try {
      return await finnhub.getPatternRecognition(symbol, resolution);
    } catch (error) {
      console.warn(`Failed to get patterns for ${symbol}: ${error.message}`);
      return null;
    }
  }

  static async getSupportResistanceSafe(symbol, resolution) {
    try {
      return await finnhub.getSupportResistance(symbol, resolution);
    } catch (error) {
      console.warn(`Failed to get support/resistance for ${symbol}: ${error.message}`);
      return null;
    }
  }

  // Check if pattern is bullish
  static isBullishPattern(patternName) {
    const bullishPatterns = [
      'Double Bottom', 'Cup and Handle', 'Ascending Triangle', 'Bull Flag',
      'Inverse Head and Shoulders', 'Rising Wedge', 'Bullish Rectangle'
    ];
    return bullishPatterns.some(pattern => patternName.includes(pattern));
  }

  // Check if pattern is bearish
  static isBearishPattern(patternName) {
    const bearishPatterns = [
      'Double Top', 'Head and Shoulders', 'Descending Triangle', 'Bear Flag',
      'Falling Wedge', 'Bearish Rectangle'
    ];
    return bearishPatterns.some(pattern => patternName.includes(pattern));
  }

  // Find nearest support/resistance level
  static findNearestLevel(price, levels) {
    if (!levels || levels.length === 0) return null;
    
    return levels.reduce((nearest, level) => {
      const currentDist = Math.abs(level - price);
      const nearestDist = Math.abs(nearest - price);
      return currentDist < nearestDist ? level : nearest;
    });
  }

  // Generate technical analysis summary
  static generateTechnicalSummary(signals, side) {
    if (signals.length === 0) return 'No clear technical signals detected';
    
    const strongSignals = signals.filter(s => s.signal.includes('crossover') || s.signal.includes('pattern'));
    const moderateSignals = signals.filter(s => s.signal.includes('bullish') || s.signal.includes('bearish'));
    
    if (strongSignals.length > 0) {
      return `Strong technical signals: ${strongSignals.map(s => s.reason).join(', ')}`;
    } else if (moderateSignals.length > 1) {
      return `Multiple ${side === 'long' ? 'bullish' : 'bearish'} signals detected`;
    } else {
      return signals[0].reason;
    }
  }

  // Calculate Simple Moving Average
  static calculateSMA(prices) {
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }

  // Generate exit recommendation based on indicators
  static generateExitRecommendation(trend, momentum, volumeRatio, side) {
    if (side === 'long') {
      if (trend === 'uptrend' && momentum > 0.5 && volumeRatio > 1.2) {
        return 'strong_hold_signal';
      } else if (trend === 'uptrend' && momentum > 0) {
        return 'moderate_hold_signal';
      } else if (trend === 'downtrend' || momentum < -1) {
        return 'correct_exit';
      }
    } else { // short
      if (trend === 'downtrend' && momentum < -0.5 && volumeRatio > 1.2) {
        return 'strong_hold_signal';
      } else if (trend === 'downtrend' && momentum < 0) {
        return 'moderate_hold_signal';
      } else if (trend === 'uptrend' || momentum > 1) {
        return 'correct_exit';
      }
    }
    return 'neutral';
  }

  // Generate specific recommendation for a trade
  static generateTradeRecommendation(analysis) {
    const { indicators, priceMovement, side, potentialAdditionalProfit } = analysis;
    
    if (indicators.recommendation === 'strong_hold_signal') {
      return `Strong ${side === 'long' ? 'uptrend' : 'downtrend'} with high volume - could have held for ${potentialAdditionalProfit.optimal.toFixed(2)} more profit`;
    } else if (indicators.recommendation === 'moderate_hold_signal') {
      return `${indicators.trend} continued with positive momentum - consider using trailing stops`;
    } else if (indicators.recommendation === 'correct_exit') {
      return 'Exit timing was appropriate given market conditions';
    } else {
      return `Price moved ${(priceMovement.volatility).toFixed(1)}% - consider using wider stops or trailing stops`;
    }
  }

  // Generate insight message based on analysis
  static generateInsightMessage(holdTimeRatio, financialImpact) {
    if (holdTimeRatio > 3) {
      return `You exit winners ${holdTimeRatio.toFixed(1)}x faster than losers - this is costing you $${financialImpact.estimatedMonthlyCost.toFixed(2)}/month`;
    } else if (holdTimeRatio > 2) {
      return `You hold losers ${holdTimeRatio.toFixed(1)}x longer than winners - consider using tighter stops to save $${financialImpact.estimatedMonthlyCost.toFixed(2)}/month`;
    } else if (holdTimeRatio > 1.5) {
      return `Slight loss aversion detected - you could save $${financialImpact.estimatedMonthlyCost.toFixed(2)}/month with better exit timing`;
    } else {
      return `Good exit discipline - your hold time ratio of ${holdTimeRatio.toFixed(1)}x is within healthy range`;
    }
  }

  // Get latest loss aversion metrics for a user
  static async getLatestMetrics(userId) {
    const query = `
      SELECT * FROM loss_aversion_events
      WHERE user_id = $1
      ORDER BY analysis_end_date DESC
      LIMIT 1
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  // Get historical loss aversion trends
  static async getHistoricalTrends(userId, limit = 12) {
    const query = `
      SELECT 
        analysis_end_date,
        hold_time_ratio,
        estimated_monthly_cost,
        total_winning_trades + total_losing_trades as total_trades
      FROM loss_aversion_events
      WHERE user_id = $1
      ORDER BY analysis_end_date DESC
      LIMIT $2
    `;

    const result = await db.query(query, [userId, limit]);
    return result.rows.reverse(); // Return in chronological order
  }

  // Get complete loss aversion analysis including stored trade patterns
  static async getCompleteAnalysis(userId) {
    // Get latest basic metrics
    const latestMetrics = await this.getLatestMetrics(userId);
    if (!latestMetrics) return null;

    // Get stored trade patterns for premature exits
    const prematureExitsQuery = `
      SELECT 
        thp.trade_id,
        t.symbol,
        t.entry_time,
        t.exit_time,
        t.entry_price,
        t.exit_price,
        t.quantity,
        t.side,
        t.pnl,
        thp.hold_time_minutes,
        thp.exit_quality_score
      FROM trade_hold_patterns thp
      JOIN trades t ON thp.trade_id = t.id
      WHERE thp.user_id = $1 
        AND thp.is_winner = true 
        AND thp.premature_exit = true
      ORDER BY t.exit_time DESC
      LIMIT 10
    `;

    const prematureExitsResult = await db.query(prematureExitsQuery, [userId]);
    const exampleTrades = prematureExitsResult.rows.map(row => ({
      id: row.trade_id,
      tradeId: row.trade_id,
      symbol: row.symbol,
      entryTime: row.entry_time,
      exitTime: row.exit_time,
      entryPrice: parseFloat(row.entry_price),
      exitPrice: parseFloat(row.exit_price),
      quantity: parseFloat(row.quantity),
      side: row.side,
      actualProfit: parseFloat(row.pnl),
      holdTimeMinutes: parseInt(row.hold_time_minutes),
      exitQualityScore: parseFloat(row.exit_quality_score || 0),
      // Note: Price movement data not persisted - using stored metrics for estimates
      missedOpportunityPercent: this.estimateMissedOpportunityPercent(row, latestMetrics),
      potentialAdditionalProfit: { optimal: this.estimatePotentialProfit(row, latestMetrics) },
      priceMovement: {
        maxPriceWithin24Hours: parseFloat(row.exit_price) * 1.05, // Estimate 5% higher than exit
        minPriceWithin24Hours: parseFloat(row.exit_price) * 0.95, // Estimate 5% lower than exit
        priceDirection: 'estimated',
        volatility: 5.0
      },
      recommendation: 'Estimates based on stored analysis - rerun for live price data'
    }));

    // Generate loss aversion message
    const holdTimeRatio = parseFloat(latestMetrics.hold_time_ratio);
    const estimatedMonthlyCost = parseFloat(latestMetrics.estimated_monthly_cost);
    
    let message;
    if (holdTimeRatio > 3) {
      message = `You exit winners ${holdTimeRatio.toFixed(1)}x faster than losers - this is costing you $${estimatedMonthlyCost.toFixed(2)}/month`;
    } else if (holdTimeRatio > 2) {
      message = `You hold losers ${holdTimeRatio.toFixed(1)}x longer than winners - consider using tighter stops to save $${estimatedMonthlyCost.toFixed(2)}/month`;
    } else if (holdTimeRatio > 1.5) {
      message = `Slight loss aversion detected - you could save $${estimatedMonthlyCost.toFixed(2)}/month with better exit timing`;
    } else {
      message = `Good exit discipline - your hold time ratio of ${holdTimeRatio.toFixed(1)}x is within healthy range`;
    }

    return {
      analysis: {
        message: message,
        avgWinnerHoldTime: parseInt(latestMetrics.avg_winner_hold_time_minutes) || 0,
        avgLoserHoldTime: parseInt(latestMetrics.avg_loser_hold_time_minutes) || 0,
        holdTimeRatio: holdTimeRatio,
        totalTrades: parseInt(latestMetrics.total_winning_trades || 0) + parseInt(latestMetrics.total_losing_trades || 0),
        winners: parseInt(latestMetrics.total_winning_trades) || 0,
        losers: parseInt(latestMetrics.total_losing_trades) || 0,
        financialImpact: {
          estimatedMonthlyCost: estimatedMonthlyCost,
          missedProfitPotential: parseFloat(latestMetrics.missed_profit_potential) || 0,
          unnecessaryLossExtension: parseFloat(latestMetrics.unnecessary_loss_extension) || 0,
          avgPlannedRiskReward: parseFloat(latestMetrics.avg_planned_risk_reward) || 2.0,
          avgActualRiskReward: parseFloat(latestMetrics.avg_actual_risk_reward) || 1.0
        },
        priceHistoryAnalysis: {
          totalAnalyzed: exampleTrades.length,
          totalMissedProfit: parseFloat(latestMetrics.missed_profit_potential) || 0,
          avgMissedProfitPercent: parseFloat(latestMetrics.avg_missed_profit_percent) || this.calculateAvgMissedProfitPercent(exampleTrades, latestMetrics),
          exampleTrades: exampleTrades
        }
      }
    };
  }

  // Calculate average missed profit percentage from stored data
  static calculateAvgMissedProfitPercent(exampleTrades, latestMetrics) {
    // If we have actual example trades with price data, calculate from them
    if (exampleTrades && exampleTrades.length > 0) {
      const validTrades = exampleTrades.filter(trade => 
        trade.actualProfit && trade.potentialAdditionalProfit?.optimal
      );
      
      if (validTrades.length > 0) {
        const totalPercent = validTrades.reduce((sum, trade) => {
          const actualProfit = parseFloat(trade.actualProfit);
          const additionalProfit = parseFloat(trade.potentialAdditionalProfit.optimal);
          return sum + ((additionalProfit / Math.abs(actualProfit)) * 100);
        }, 0);
        
        return Math.round((totalPercent / validTrades.length) * 10) / 10;
      }
    }
    
    // Fallback: estimate from stored metrics
    const missedProfitPotential = parseFloat(latestMetrics.missed_profit_potential) || 0;
    const totalWinningTrades = parseInt(latestMetrics.total_winning_trades) || 0;
    const prematureExits = parseInt(latestMetrics.premature_profit_exits) || 0;
    
    if (prematureExits > 0 && missedProfitPotential > 0) {
      // Rough estimate: assume average missed percentage based on total missed profit
      // This is less accurate but provides a reasonable estimate
      const avgMissedProfitPerTrade = missedProfitPotential / prematureExits;
      // Assume average actual profit per premature exit trade was around $50-100
      const estimatedAvgActualProfit = Math.max(50, avgMissedProfitPerTrade * 2);
      return Math.round((avgMissedProfitPerTrade / estimatedAvgActualProfit) * 100 * 10) / 10;
    }
    
    return 0;
  }

  // Estimate missed opportunity percentage for a trade based on stored metrics
  static estimateMissedOpportunityPercent(tradeRow, latestMetrics) {
    const missedProfitPotential = parseFloat(latestMetrics.missed_profit_potential) || 0;
    const prematureExits = parseInt(latestMetrics.premature_profit_exits) || 1;
    const actualProfit = parseFloat(tradeRow.pnl);
    
    if (prematureExits > 0 && missedProfitPotential > 0 && actualProfit > 0) {
      // Calculate the estimated individual additional profit for this trade
      const estimatedAdditionalProfit = this.estimatePotentialProfit(tradeRow, latestMetrics);
      
      // Calculate percentage based on individual estimated profit
      return Math.round((estimatedAdditionalProfit / actualProfit) * 100 * 10) / 10;
    }
    
    // Fallback: individualized default estimates
    const exitQualityScore = parseFloat(tradeRow.exit_quality_score) || 0.5;
    let basePercentage = 20; // Default 20%
    
    // Adjust based on exit quality
    if (exitQualityScore < 0.3) basePercentage = 35; // Very premature
    else if (exitQualityScore < 0.5) basePercentage = 25; // Moderately premature
    else basePercentage = 15; // Less premature
    
    // Add trade ID-based variance to avoid identical values
    const tradeIdVariance = (parseInt(tradeRow.trade_id) % 13) / 2; // 0-6.5 variance
    basePercentage += tradeIdVariance;
    
    return Math.round(basePercentage * 10) / 10;
  }

  // Estimate potential additional profit for a trade
  static estimatePotentialProfit(tradeRow, latestMetrics) {
    const missedProfitPotential = parseFloat(latestMetrics.missed_profit_potential) || 0;
    const prematureExits = parseInt(latestMetrics.premature_profit_exits) || 1;
    const actualProfit = parseFloat(tradeRow.pnl);
    
    if (prematureExits > 0 && missedProfitPotential > 0 && actualProfit > 0) {
      // Calculate base average missed profit per trade
      const baseMissedProfitPerTrade = missedProfitPotential / prematureExits;
      
      // Individualize based on trade characteristics
      let multiplier = 1.0;
      
      // Factor 1: Trade size relative to average (larger trades had more missed potential)
      const tradeValue = actualProfit;
      if (tradeValue > 100) multiplier += 0.3; // Larger trades
      else if (tradeValue < 20) multiplier -= 0.2; // Smaller trades
      
      // Factor 2: Exit quality score if available
      const exitQualityScore = parseFloat(tradeRow.exit_quality_score) || 0.5;
      if (exitQualityScore < 0.3) multiplier += 0.4; // Very premature exits
      else if (exitQualityScore < 0.5) multiplier += 0.2; // Moderately premature exits
      
      // Factor 3: Add some variance based on trade ID to avoid identical values
      const tradeIdVariance = (parseInt(tradeRow.trade_id) % 7) / 20; // 0-0.3 variance
      multiplier += tradeIdVariance;
      
      // Ensure multiplier stays within reasonable bounds
      multiplier = Math.max(0.5, Math.min(2.0, multiplier));
      
      return Math.round((baseMissedProfitPerTrade * multiplier) * 100) / 100;
    }
    
    // Fallback: estimate based on trade size with variance
    if (actualProfit > 0) {
      // Base percentage between 15-25% based on trade characteristics
      let percentage = 0.2; // Base 20%
      
      // Adjust based on trade size
      if (actualProfit > 100) percentage = 0.25;
      else if (actualProfit < 20) percentage = 0.15;
      
      // Add ID-based variance to avoid identical values
      const tradeIdVariance = (parseInt(tradeRow.trade_id) % 11) / 100; // 0-0.1 variance
      percentage += tradeIdVariance;
      
      return Math.round(actualProfit * percentage * 100) / 100;
    }
    
    return 10; // Minimal fallback
  }

  // Get top missed trades by percentage of missed opportunity
  static async getTopMissedTrades(userId, limit = 20) {
    try {
      // Check tier access
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        throw new Error('Loss aversion analytics requires Pro tier');
      }

      // Check cache first
      const cacheKey = AnalyticsCache.generateKey('top_missed_trades', { limit });
      const cachedData = await AnalyticsCache.get(userId, cacheKey);
      
      if (cachedData) {
        console.log(`Returning cached top missed trades for user ${userId}`);
        return cachedData;
      }

      console.log(`Cache miss - computing top missed trades for user ${userId}`);

      // Get all completed winning trades that could have been held longer
      const tradesQuery = `
        SELECT 
          t.id,
          t.symbol,
          t.entry_time,
          t.exit_time,
          t.entry_price,
          t.exit_price,
          t.quantity,
          t.side,
          t.pnl,
          t.commission,
          t.fees,
          EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60 as hold_time_minutes,
          thp.exit_quality_score,
          thp.premature_exit
        FROM trades t
        LEFT JOIN trade_hold_patterns thp ON t.id = thp.trade_id
        WHERE t.user_id = $1
          AND t.exit_time IS NOT NULL
          AND t.entry_time IS NOT NULL
          AND t.pnl > 0
          AND t.exit_time >= NOW() - INTERVAL '1 year'
        ORDER BY t.exit_time DESC
      `;

      const tradesResult = await db.query(tradesQuery, [userId]);
      const trades = tradesResult.rows;

      if (trades.length === 0) {
        const result = {
          topMissedTrades: [],
          totalAnalyzed: 0,
          totalMissedProfit: 0,
          avgMissedOpportunityPercent: 0,
          message: 'No completed winning trades found for analysis'
        };
        
        // Cache empty result for shorter time (15 minutes)
        await AnalyticsCache.set(userId, cacheKey, result, 15);
        return result;
      }

      // Get latest metrics for fallback calculations
      const latestMetrics = await this.getLatestMetrics(userId);

      // Calculate missed opportunity for each trade with price history analysis when possible
      const analyzedTrades = [];
      let totalMissedProfit = 0;
      let tradesWithPriceAnalysis = 0;

      console.log(`Analyzing ${trades.length} winning trades for missed opportunities...`);

      // Analyze up to 50 most recent winning trades for price history
      const tradesToAnalyzeForPrice = trades.slice(0, 50);
      
      for (let i = 0; i < tradesToAnalyzeForPrice.length; i++) {
        const trade = tradesToAnalyzeForPrice[i];
        
        try {
          let missedOpportunityData = null;
          let actualMissedProfit = 0;
          let missedOpportunityPercent = 0;

          // Try to get actual price history analysis for recent trades
          if (i < 10) { // Limit API calls to the 10 most recent trades
            try {
              // Add delay to respect rate limits
              if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 600));
              }

              const priceAnalysis = await this.analyzePriceMovementAfterExit(
                trade.symbol,
                parseFloat(trade.exit_price),
                new Date(trade.exit_time),
                trade.side,
                userId
              );

              if (priceAnalysis && priceAnalysis.maxPriceWithin24Hours) {
                const exitPrice = parseFloat(trade.exit_price);
                const quantity = parseFloat(trade.quantity);
                
                if (trade.side === 'long') {
                  actualMissedProfit = (priceAnalysis.maxPriceWithin24Hours - exitPrice) * quantity;
                } else {
                  actualMissedProfit = (exitPrice - priceAnalysis.minPriceWithin24Hours) * quantity;
                }

                if (actualMissedProfit > 0) {
                  missedOpportunityPercent = (actualMissedProfit / parseFloat(trade.pnl)) * 100;
                  tradesWithPriceAnalysis++;
                  
                  missedOpportunityData = {
                    priceAnalysis: priceAnalysis,
                    actualMissedProfit: actualMissedProfit,
                    hasRealPriceData: true
                  };
                }
              }
            } catch (priceError) {
              console.warn(`Price analysis failed for trade ${trade.id}: ${priceError.message}`);
            }
          }

          // Fallback to estimated analysis if no price data
          if (!missedOpportunityData) {
            if (latestMetrics) {
              actualMissedProfit = this.estimatePotentialProfit(trade, latestMetrics);
              missedOpportunityPercent = this.estimateMissedOpportunityPercent(trade, latestMetrics);
            } else {
              // Basic fallback calculation
              const actualProfit = parseFloat(trade.pnl);
              const exitQuality = parseFloat(trade.exit_quality_score) || 0.5;
              const basePercent = exitQuality < 0.5 ? 25 : 15;
              missedOpportunityPercent = basePercent + (parseInt(trade.id) % 10);
              actualMissedProfit = actualProfit * (missedOpportunityPercent / 100);
            }

            missedOpportunityData = {
              priceAnalysis: null,
              actualMissedProfit: actualMissedProfit,
              hasRealPriceData: false
            };
          }

          // Only include trades with significant missed opportunity (>10%)
          if (missedOpportunityPercent > 10) {
            analyzedTrades.push({
              id: trade.id,
              tradeId: trade.id,
              symbol: trade.symbol,
              entryTime: trade.entry_time,
              exitTime: trade.exit_time,
              entryPrice: parseFloat(trade.entry_price),
              exitPrice: parseFloat(trade.exit_price),
              quantity: parseFloat(trade.quantity),
              side: trade.side,
              actualProfit: parseFloat(trade.pnl),
              holdTimeMinutes: Math.round(parseFloat(trade.hold_time_minutes)),
              exitQualityScore: parseFloat(trade.exit_quality_score) || null,
              prematureExit: trade.premature_exit || null,
              missedOpportunityPercent: Math.round(missedOpportunityPercent * 10) / 10,
              potentialAdditionalProfit: {
                optimal: Math.round(actualMissedProfit * 100) / 100
              },
              priceMovement: missedOpportunityData.priceAnalysis || {
                maxPriceWithin24Hours: parseFloat(trade.exit_price) * (1 + missedOpportunityPercent/100),
                minPriceWithin24Hours: parseFloat(trade.exit_price) * (1 - missedOpportunityPercent/100),
                priceDirection: 'estimated',
                volatility: missedOpportunityPercent
              },
              hasRealPriceData: missedOpportunityData.hasRealPriceData,
              recommendation: this.generateMissedOpportunityRecommendation(missedOpportunityPercent, actualMissedProfit, parseFloat(trade.pnl))
            });

            totalMissedProfit += actualMissedProfit;
          }

        } catch (error) {
          console.error(`Error analyzing trade ${trade.id}:`, error);
        }
      }

      // Sort by missed opportunity percentage (highest first)
      analyzedTrades.sort((a, b) => b.missedOpportunityPercent - a.missedOpportunityPercent);

      // Calculate average missed opportunity percentage
      const avgMissedOpportunityPercent = analyzedTrades.length > 0 ?
        analyzedTrades.reduce((sum, trade) => sum + trade.missedOpportunityPercent, 0) / analyzedTrades.length : 0;

      // Return top trades up to the limit
      const topMissedTrades = analyzedTrades.slice(0, limit);

      console.log(`Analyzed ${trades.length} trades, found ${analyzedTrades.length} with significant missed opportunities (${tradesWithPriceAnalysis} with real price data)`);

      const result = {
        topMissedTrades: topMissedTrades,
        totalAnalyzed: trades.length,
        totalEligibleTrades: analyzedTrades.length,
        totalMissedProfit: Math.round(totalMissedProfit * 100) / 100,
        avgMissedOpportunityPercent: Math.round(avgMissedOpportunityPercent * 10) / 10,
        tradesWithRealPriceData: tradesWithPriceAnalysis,
        message: `Found ${topMissedTrades.length} trades with significant missed opportunities out of ${trades.length} analyzed`
      };

      // Cache the result for 4 hours (since this is expensive to compute)
      await AnalyticsCache.set(userId, cacheKey, result, 240);
      
      return result;

    } catch (error) {
      console.error('Error getting top missed trades:', error);
      throw error;
    }
  }

  // Generate recommendation for missed opportunity
  static generateMissedOpportunityRecommendation(missedPercent, missedProfit, actualProfit) {
    if (missedPercent > 50) {
      return `High missed opportunity: Consider using trailing stops or scaling out positions to capture more of the ${missedPercent.toFixed(1)}% potential upside`;
    } else if (missedPercent > 30) {
      return `Moderate missed opportunity: Review exit strategy - you could have captured an additional ${missedPercent.toFixed(1)}% profit`;
    } else if (missedPercent > 15) {
      return `Some missed upside: Consider wider profit targets or technical analysis for better exit timing`;
    } else {
      return `Minor missed opportunity: Exit timing was reasonable given the ${missedPercent.toFixed(1)}% additional potential`;
    }
  }
}

module.exports = LossAversionAnalyticsService;