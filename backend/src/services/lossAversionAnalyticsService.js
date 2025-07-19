const db = require('../config/database');
const TierService = require('./tierService');
const finnhub = require('../utils/finnhub');

class LossAversionAnalyticsService {
  
  // Analyze loss aversion patterns for a user
  static async analyzeLossAversion(userId, startDate = null, endDate = null) {
    try {
      // Check tier access
      const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
      if (!hasAccess) {
        throw new Error('Loss aversion analytics requires Pro tier');
      }

    // Set date range (default: last 90 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - (90 * 24 * 60 * 60 * 1000));

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
        message: 'Need at least 10 completed trades for meaningful loss aversion analysis'
      };
    }

    // Separate winners and losers
    const winners = trades.filter(t => parseFloat(t.pnl) > 0);
    const losers = trades.filter(t => parseFloat(t.pnl) < 0);

    if (winners.length === 0 || losers.length === 0) {
      return {
        error: 'Need both winning and losing trades',
        message: 'Analysis requires at least one winning and one losing trade'
      };
    }

    // Calculate average hold times
    const avgWinnerHoldTime = winners.reduce((sum, t) => sum + parseFloat(t.hold_time_minutes || 0), 0) / winners.length;
    const avgLoserHoldTime = losers.reduce((sum, t) => sum + parseFloat(t.hold_time_minutes || 0), 0) / losers.length;
    const holdTimeRatio = avgWinnerHoldTime > 0 ? avgLoserHoldTime / avgWinnerHoldTime : 1.0;

    // Analyze individual trades for patterns
    const tradePatterns = await this.analyzeTradePatterns(trades, avgWinnerHoldTime, avgLoserHoldTime);

    // Analyze price history for premature exits
    const priceHistoryAnalysis = await this.analyzePriceHistoryForPrematureExits(
      tradePatterns.patterns.filter(p => p.isWinner && p.prematureExit)
    );

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
        worst_hold_ratio_symbol, worst_hold_ratio_value
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
      Math.min(symbolAnalysis.worstRatio, 99.99)
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
  static async analyzePriceHistoryForPrematureExits(prematureExitTrades) {
    const analysisResults = [];
    const exampleTrades = [];
    
    console.log(`Analyzing price history for ${prematureExitTrades.length} premature exit trades`);
    
    for (const tradePattern of prematureExitTrades.slice(0, 10)) { // Limit to 10 for API rate limits
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
        
        // Get price data for different time horizons after exit
        const priceAnalysis = await this.analyzePriceMovementAfterExit(
          trade.symbol,
          trade.exit_price,
          exitTime,
          trade.side
        );
        
        // Analyze market indicators at exit time
        const indicators = await this.analyzeMarketIndicatorsAtExit(
          trade.symbol,
          exitTime,
          trade.side
        );
        
        // Calculate potential additional profit
        const actualProfit = parseFloat(trade.pnl);
        const quantity = parseFloat(trade.quantity);
        const exitPrice = parseFloat(trade.exit_price);
        
        let potentialAdditionalProfit = {
          oneHour: 0,
          fourHours: 0,
          oneDay: 0,
          optimal: 0
        };
        
        if (trade.side === 'long') {
          potentialAdditionalProfit.oneHour = (priceAnalysis.priceAfter1Hour - exitPrice) * quantity;
          potentialAdditionalProfit.fourHours = (priceAnalysis.priceAfter4Hours - exitPrice) * quantity;
          potentialAdditionalProfit.oneDay = (priceAnalysis.priceAfter1Day - exitPrice) * quantity;
          potentialAdditionalProfit.optimal = (priceAnalysis.maxPriceWithin24Hours - exitPrice) * quantity;
        } else {
          potentialAdditionalProfit.oneHour = (exitPrice - priceAnalysis.priceAfter1Hour) * quantity;
          potentialAdditionalProfit.fourHours = (exitPrice - priceAnalysis.priceAfter4Hours) * quantity;
          potentialAdditionalProfit.oneDay = (exitPrice - priceAnalysis.priceAfter1Day) * quantity;
          potentialAdditionalProfit.optimal = (exitPrice - priceAnalysis.minPriceWithin24Hours) * quantity;
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

  // Analyze price movement after a trade was closed
  static async analyzePriceMovementAfterExit(symbol, exitPrice, exitTime, side) {
    try {
      // Get 1-minute candles for 24 hours after exit
      const startTime = Math.floor(exitTime.getTime() / 1000);
      const endTime = startTime + (24 * 60 * 60); // 24 hours later
      
      const candles = await finnhub.getCandles(symbol, '5', startTime, endTime); // 5-minute candles
      
      if (!candles || !candles.c || candles.c.length === 0) {
        throw new Error(`No price data available for ${symbol}`);
      }
      
      const prices = candles.c;
      const times = candles.t;
      
      // Find prices at specific intervals
      const oneHourLater = startTime + (60 * 60);
      const fourHoursLater = startTime + (4 * 60 * 60);
      const oneDayLater = startTime + (24 * 60 * 60);
      
      const priceAfter1Hour = this.findPriceAtTime(times, prices, oneHourLater);
      const priceAfter4Hours = this.findPriceAtTime(times, prices, fourHoursLater);
      const priceAfter1Day = this.findPriceAtTime(times, prices, oneDayLater);
      
      // Find optimal exit points
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const maxPriceIndex = prices.indexOf(maxPrice);
      const minPriceIndex = prices.indexOf(minPrice);
      
      return {
        priceAfter1Hour: priceAfter1Hour || exitPrice,
        priceAfter4Hours: priceAfter4Hours || exitPrice,
        priceAfter1Day: priceAfter1Day || exitPrice,
        maxPriceWithin24Hours: maxPrice,
        minPriceWithin24Hours: minPrice,
        maxPriceTime: times[maxPriceIndex],
        minPriceTime: times[minPriceIndex],
        priceDirection: maxPrice > exitPrice ? 'up' : 'down',
        volatility: ((maxPrice - minPrice) / exitPrice) * 100
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
        volatility: 0
      };
    }
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
}

module.exports = LossAversionAnalyticsService;