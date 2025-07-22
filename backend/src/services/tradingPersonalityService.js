const db = require('../config/database');
const TierService = require('./tierService');
const finnhub = require('../utils/finnhub');

class TradingPersonalityService {
  
  // Analyze and classify a user's trading personality
  static async analyzePersonality(userId, startDate = null, endDate = null) {
    try {
      // Note: Basic personality analysis is available to all users
      // Only advanced technical analysis features require Pro tier

      // Set date range (default: all available trades)
      let end, start;
      let useProvidedDateRange = false;
      
      if (endDate && startDate) {
        // Check if provided date range has sufficient trades first
        const testEnd = new Date(endDate);
        const testStart = new Date(startDate);
        
        const testQuery = `
          SELECT COUNT(*) as count
          FROM trades 
          WHERE user_id = $1 
            AND entry_time >= $2
            AND exit_time <= $3
            AND exit_time IS NOT NULL
            AND entry_time IS NOT NULL
            AND pnl IS NOT NULL
        `;
        
        const testResult = await db.query(testQuery, [userId, testStart, testEnd]);
        const tradesInRange = parseInt(testResult.rows[0].count);
        
        if (tradesInRange >= 20) {
          // Use specified date range if it has enough trades
          end = testEnd;
          start = testStart;
          useProvidedDateRange = true;
          console.log(`Using provided date range: ${tradesInRange} trades found`);
        } else {
          console.log(`Provided date range has only ${tradesInRange} trades, expanding to all available trades`);
        }
      }
      
      if (!useProvidedDateRange) {
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
          console.log(`Using full available date range: ${start.toISOString()} to ${end.toISOString()}`);
        } else {
          // Fallback if no trades found
          end = new Date();
          start = new Date(end.getTime() - (90 * 24 * 60 * 60 * 1000));
        }
      }

      // Get all completed trades for analysis
      const tradesQuery = `
        SELECT 
          id, symbol, entry_time, exit_time, entry_price, exit_price,
          quantity, side, COALESCE(pnl, 0) as pnl, COALESCE(commission, 0) as commission,
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

      console.log(`Personality analysis for user ${userId}: Found ${trades.length} trades`);

      if (trades.length < 20) {
        return {
          error: 'Insufficient trades for personality analysis',
          message: `You currently have ${trades.length} completed trades. To generate a meaningful personality profile, you need at least 20 completed trades. Keep trading and check back once you've reached this milestone!`,
          currentTrades: trades.length,
          requiredTrades: 20,
          tradesNeeded: 20 - trades.length
        };
      }

      // Analyze trading patterns
      const behaviorMetrics = this.calculateBehaviorMetrics(trades);
      
      // Analyze technical patterns used
      const technicalAnalysis = await this.analyzeTechnicalPatterns(trades.slice(0, 10)); // Sample for API limits
      
      // Calculate personality scores
      const personalityScores = await this.calculatePersonalityScores(userId, behaviorMetrics, technicalAnalysis);
      
      // Determine primary personality
      const primaryPersonality = this.determinePrimaryPersonality(personalityScores);
      
      // Calculate performance alignment
      const performanceAlignment = this.calculatePerformanceAlignment(trades, primaryPersonality);
      
      // Generate recommendations
      const recommendations = this.generatePersonalityRecommendations(primaryPersonality, behaviorMetrics, performanceAlignment);

      // Store personality profile
      const profile = await this.storePersonalityProfile(userId, {
        primaryPersonality: primaryPersonality.type,
        personalityConfidence: primaryPersonality.confidence,
        personalityScores,
        behaviorMetrics,
        performanceAlignment,
        totalTrades: trades.length,
        analysisStartDate: start,
        analysisEndDate: end
      });

      // Analyze behavioral drift if previous profile exists
      const driftAnalysis = await this.analyzeBehavioralDrift(userId);

      // Get peer comparison
      const peerComparison = await this.getPeerComparison(userId, primaryPersonality.type);

      return {
        profile,
        personalityScores,
        behaviorMetrics,
        performanceAlignment,
        recommendations,
        driftAnalysis,
        peerComparison
      };

    } catch (error) {
      console.error('Error in personality analysis:', error);
      throw error;
    }
  }

  // Calculate core behavioral metrics from trades
  static calculateBehaviorMetrics(trades) {
    if (trades.length === 0) return {};

    const holdTimes = trades.map(t => parseFloat(t.hold_time_minutes || 0));
    const medianHoldTime = this.calculateMedian(holdTimes);
    
    // Calculate trading frequency
    const firstTrade = new Date(trades[0].entry_time);
    const lastTrade = new Date(trades[trades.length - 1].entry_time);
    const tradingDays = Math.max(1, (lastTrade - firstTrade) / (1000 * 60 * 60 * 24));
    const avgTradesPerDay = trades.length / tradingDays;

    // Analyze hold time distribution
    const shortTrades = holdTimes.filter(t => t < 60).length; // < 1 hour
    const mediumTrades = holdTimes.filter(t => t >= 60 && t < 1440).length; // 1 hour - 1 day
    const longTrades = holdTimes.filter(t => t >= 1440).length; // > 1 day

    // Position sizing analysis
    const positionSizes = trades.map(t => parseFloat(t.quantity) * parseFloat(t.entry_price));
    const avgPosition = positionSizes.reduce((a, b) => a + b, 0) / positionSizes.length;
    const positionStdDev = this.calculateStandardDeviation(positionSizes);
    const positionConsistency = 1 - (positionStdDev / avgPosition); // Higher = more consistent

    // Win/loss patterns
    const winners = trades.filter(t => parseFloat(t.pnl) > 0);
    const losers = trades.filter(t => parseFloat(t.pnl) < 0);
    const winRate = winners.length / trades.length;

    // Quick scalping indicators
    const veryShortTrades = holdTimes.filter(t => t < 15).length; // < 15 minutes
    const scalpingRatio = veryShortTrades / trades.length;

    // Momentum vs mean reversion patterns
    const momentumScore = this.calculateMomentumScore(trades);
    const meanReversionScore = this.calculateMeanReversionScore(trades);

    return {
      avgHoldTime: Math.round(medianHoldTime),
      avgTradesPerDay: Math.round(avgTradesPerDay * 100) / 100,
      shortTradeRatio: shortTrades / trades.length,
      mediumTradeRatio: mediumTrades / trades.length,
      longTradeRatio: longTrades / trades.length,
      scalpingRatio,
      positionConsistency: Math.max(0, Math.min(1, positionConsistency)),
      winRate,
      momentumScore,
      meanReversionScore,
      totalTrades: trades.length,
      tradingDays: Math.round(tradingDays),
      trades: trades // Include actual trades data for strategy classification
    };
  }

  // Analyze technical patterns using Finnhub APIs
  static async analyzeTechnicalPatterns(sampleTrades) {
    const technicalUsage = {
      usesMomentumIndicators: false,
      usesMeanReversionIndicators: false,
      usesVolumeAnalysis: false,
      usesPatternRecognition: false,
      patternTypes: [],
      indicatorSignals: []
    };

    const symbols = [...new Set(sampleTrades.map(t => t.symbol))].slice(0, 5); // Limit for API

    for (const symbol of symbols) {
      try {
        // Get support/resistance levels for mean reversion analysis
        const supportResistance = await this.getSupportResistanceSafe(symbol, 'D');

        if (supportResistance && supportResistance.levels) {
          technicalUsage.usesMeanReversionIndicators = true;
        }

        // Analyze if trades align with momentum or mean reversion
        const symbolTrades = sampleTrades.filter(t => t.symbol === symbol);
        // Limit RSI checks to avoid excessive API calls - only check first few trades per symbol
        const limitedTrades = symbolTrades.slice(0, 2); // Max 2 trades per symbol for RSI check
        
        for (let i = 0; i < limitedTrades.length; i++) {
          const trade = limitedTrades[i];
          const tradeTime = Math.floor(new Date(trade.entry_time).getTime() / 1000);
          
          // Add delay between RSI API calls
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay
          }
          
          // Check RSI at trade time
          const rsiData = await this.getTechnicalIndicatorSafe(
            symbol, '5', tradeTime - 3600, tradeTime, 'rsi', { timeperiod: 14 }
          );
          
          if (rsiData && rsiData.rsi && rsiData.rsi.length > 0) {
            const rsi = rsiData.rsi[rsiData.rsi.length - 1];
            
            if (trade.side === 'long' && rsi > 70) {
              technicalUsage.usesMomentumIndicators = true;
              technicalUsage.indicatorSignals.push('momentum_buy_overbought');
            } else if (trade.side === 'long' && rsi < 30) {
              technicalUsage.usesMeanReversionIndicators = true;
              technicalUsage.indicatorSignals.push('mean_reversion_buy_oversold');
            }
          }
        }

      } catch (error) {
        console.warn(`Error analyzing technical patterns for ${symbol}: ${error.message}`);
      }
    }

    return technicalUsage;
  }

  // Calculate personality scores as actual percentages that add to 100%
  static async calculatePersonalityScores(userId, behaviorMetrics, technicalAnalysis) {
    // Import Trade model to classify individual trades
    const Trade = require('../models/Trade');
    
    // If we have actual trades data, use it for classification
    if (behaviorMetrics.trades) {
      const strategies = {
        scalper: 0,
        momentum: 0,
        mean_reversion: 0,
        swing: 0,
        day_trading: 0,
        position: 0
      };

      // Check if user has Pro tier for advanced technical analysis
      // Get actual user tier from database directly (bypass TierService billing logic)
      const userTierQuery = await db.query('SELECT tier FROM users WHERE id = $1', [userId]);
      const actualTier = userTierQuery.rows[0]?.tier || 'free';
      const hasProAccess = actualTier === 'pro';
      
      console.log(`User ${userId} has tier: ${actualTier}, Pro access: ${hasProAccess}`);
      
      // Classify each trade and count
      if (hasProAccess) {
        // For Pro users: Use technical analysis with API calls
        // Limit sample size to avoid exceeding Finnhub rate limits (150 calls/min)
        // With 4 API calls per trade, we can safely analyze ~10 trades in quick succession
        const sampleSize = Math.min(behaviorMetrics.trades.length, 10); // Reduced to 10 trades to stay well under rate limit
        const sampleTrades = behaviorMetrics.trades.slice(0, sampleSize);
        
        console.log(`Analyzing ${sampleSize} trades out of ${behaviorMetrics.trades.length} total for strategy classification (Pro user)`);
        
        // Analyze sampled trades with technical analysis
        // Process sequentially to respect API rate limits (150 calls/minute)
        const analysisResults = [];
        for (let i = 0; i < sampleTrades.length; i++) {
          const trade = sampleTrades[i];
          
          // Add delay between trades to avoid hitting rate limit
          // Each trade makes 4 API calls (candles + 3 indicators)
          // 150 calls/min = 2.5 calls/sec, so with 4 calls per trade, we can do ~37 trades/min
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1600)); // 1.6 second delay between trades
          }
          
          try {
            const strategy = await Trade.classifyTradeStrategyWithAnalysis(trade);
            analysisResults.push({ trade, strategy });
          } catch (error) {
            console.error(`Error analyzing trade ${trade.id}:`, error);
            analysisResults.push({ trade, strategy: Trade.classifyTradeStrategy(trade) }); // Fallback
          }
        }
        
        // Count strategies from analyzed trades
        analysisResults.forEach(({ strategy }) => {
          if (strategies.hasOwnProperty(strategy)) {
            strategies[strategy]++;
          }
        });
        
        // For remaining trades, use time-based classification
        const remainingTrades = behaviorMetrics.trades.slice(sampleSize);
        remainingTrades.forEach(trade => {
          const strategy = Trade.classifyTradeStrategy(trade);
          if (strategies.hasOwnProperty(strategy)) {
            strategies[strategy]++;
          }
        });
      } else {
        // For Free users: Use only time-based classification (no API calls)
        console.log(`Using time-based strategy classification for ${behaviorMetrics.trades.length} trades (Free user)`);
        behaviorMetrics.trades.forEach(trade => {
          const strategy = Trade.classifyTradeStrategy(trade);
          if (strategies.hasOwnProperty(strategy)) {
            strategies[strategy]++;
          }
        });
      }

      const totalTrades = behaviorMetrics.trades.length;
      
      console.log('Strategy classification counts:', strategies);
      console.log('Total trades analyzed:', totalTrades);
      
      // Convert counts to percentages - MUST add to 100%
      const totalCount = strategies.scalper + strategies.momentum + strategies.mean_reversion + strategies.swing + strategies.day_trading + strategies.position;
      
      if (totalCount === 0) {
        return { scalper: 25, momentum: 25, mean_reversion: 25, swing: 25 };
      }
      
      // Combine similar strategies for the 4 main personalities
      const combinedCounts = {
        scalper: strategies.scalper,
        momentum: strategies.momentum + Math.round(strategies.day_trading * 0.7), // Most day trading is momentum-like
        mean_reversion: strategies.mean_reversion + Math.round(strategies.day_trading * 0.3), // Some day trading is mean reversion
        swing: strategies.swing + strategies.position // Combine swing and position
      };
      
      const combinedTotal = Object.values(combinedCounts).reduce((sum, val) => sum + val, 0);
      
      // Calculate exact percentages that MUST add to 100%
      const percentages = {};
      let runningTotal = 0;
      const keys = Object.keys(combinedCounts);
      
      // Calculate percentages for first 3, ensuring no rounding errors
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        percentages[key] = Math.round((combinedCounts[key] / combinedTotal) * 100);
        runningTotal += percentages[key];
      }
      
      // Last percentage gets the remainder to ensure total = 100%
      const lastKey = keys[keys.length - 1];
      percentages[lastKey] = 100 - runningTotal;
      
      console.log('Final strategy percentages:', percentages);
      console.log('Total percentage:', Object.values(percentages).reduce((a, b) => a + b, 0));
      
      return percentages;
    }

    // Fallback to behavior-based scoring if no trades data
    let scalperScore = 0;
    let momentumScore = 0;
    let meanReversionScore = 0;
    let swingScore = 0;

    // Scalper scoring
    if (behaviorMetrics.avgHoldTime < 30) scalperScore += 40;
    else if (behaviorMetrics.avgHoldTime < 60) scalperScore += 20;
    
    if (behaviorMetrics.avgTradesPerDay > 10) scalperScore += 30;
    else if (behaviorMetrics.avgTradesPerDay > 5) scalperScore += 15;
    
    if (behaviorMetrics.scalpingRatio > 0.5) scalperScore += 30;

    // Momentum scoring
    if (behaviorMetrics.momentumScore > 0.6) momentumScore += 40;
    if (technicalAnalysis.usesMomentumIndicators) momentumScore += 20;
    if (behaviorMetrics.avgHoldTime > 60 && behaviorMetrics.avgHoldTime < 480) momentumScore += 20;
    if (technicalAnalysis.indicatorSignals.includes('momentum_buy_overbought')) momentumScore += 20;

    // Mean reversion scoring
    if (behaviorMetrics.meanReversionScore > 0.6) meanReversionScore += 40;
    if (technicalAnalysis.usesMeanReversionIndicators) meanReversionScore += 20;
    if (technicalAnalysis.indicatorSignals.includes('mean_reversion_buy_oversold')) meanReversionScore += 30;
    if (behaviorMetrics.winRate > 0.6) meanReversionScore += 10; // Mean reversion often has higher win rate

    // Swing trading scoring
    if (behaviorMetrics.avgHoldTime > 1440) swingScore += 40; // > 1 day
    if (behaviorMetrics.longTradeRatio > 0.5) swingScore += 30;
    if (behaviorMetrics.avgTradesPerDay < 2) swingScore += 20;
    if (technicalAnalysis.usesPatternRecognition) swingScore += 10;

    // Normalize scores to percentages that add to 100%
    const totalScore = scalperScore + momentumScore + meanReversionScore + swingScore;
    if (totalScore === 0) {
      return { scalper: 25, momentum: 25, mean_reversion: 25, swing: 25 }; // Equal distribution if no clear signals
    }

    return {
      scalper: Math.round((scalperScore / totalScore) * 100),
      momentum: Math.round((momentumScore / totalScore) * 100),
      mean_reversion: Math.round((meanReversionScore / totalScore) * 100),
      swing: Math.round((swingScore / totalScore) * 100)
    };
  }

  // Determine primary personality type
  static determinePrimaryPersonality(scores) {
    const maxScore = Math.max(...Object.values(scores));
    const personalityType = Object.keys(scores).find(key => scores[key] === maxScore);
    
    // Calculate confidence based on score separation
    const secondHighest = Object.values(scores).sort((a, b) => b - a)[1];
    const confidence = Math.min(1, (maxScore - secondHighest) / 100 + 0.5);

    return {
      type: personalityType,
      confidence: Math.round(confidence * 100) / 100,
      scores
    };
  }

  // Calculate how well performance aligns with personality
  static calculatePerformanceAlignment(trades, personality) {
    const winners = trades.filter(t => parseFloat(t.pnl) > 0);
    const losers = trades.filter(t => parseFloat(t.pnl) < 0);
    
    let alignmentScore = 0.5; // Start neutral
    
    // Personality-specific performance expectations
    switch (personality.type) {
      case 'scalper':
        // Scalpers should have high win rate, small profits
        const avgWin = winners.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / winners.length;
        const winRate = winners.length / trades.length;
        if (winRate > 0.6) alignmentScore += 0.2;
        if (avgWin < 50) alignmentScore += 0.1; // Small profits expected
        break;
        
      case 'momentum':
        // Momentum traders should have good trend-following performance
        const avgMomentumWin = winners.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / winners.length;
        if (avgMomentumWin > 100) alignmentScore += 0.2; // Larger wins expected
        break;
        
      case 'mean_reversion':
        // Mean reversion should have high win rate, controlled losses
        const meanRevWinRate = winners.length / trades.length;
        if (meanRevWinRate > 0.65) alignmentScore += 0.3;
        break;
        
      case 'swing':
        // Swing traders should have patient holding, larger moves
        const avgSwingProfit = trades.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / trades.length;
        if (avgSwingProfit > 50) alignmentScore += 0.2;
        break;
    }

    return Math.min(1, alignmentScore);
  }

  // Generate personality-specific recommendations
  static generatePersonalityRecommendations(personality, behaviorMetrics, performanceAlignment) {
    const recommendations = [];

    switch (personality.type) {
      case 'scalper':
        if (behaviorMetrics.avgHoldTime > 60) {
          recommendations.push({
            type: 'hold_time',
            message: 'Consider shorter hold times - scalpers typically hold positions for under 1 hour',
            priority: 'high'
          });
        }
        if (behaviorMetrics.avgTradesPerDay < 5) {
          recommendations.push({
            type: 'frequency',
            message: 'Increase trading frequency - scalpers typically make 5+ trades per day',
            priority: 'medium'
          });
        }
        break;

      case 'momentum':
        if (behaviorMetrics.momentumScore < 0.5) {
          recommendations.push({
            type: 'strategy',
            message: 'Focus on trending markets and breakout patterns',
            priority: 'high'
          });
        }
        recommendations.push({
          type: 'tools',
          message: 'Use MACD, RSI, and moving averages for momentum confirmation',
          priority: 'medium'
        });
        break;

      case 'mean_reversion':
        if (behaviorMetrics.meanReversionScore < 0.5) {
          recommendations.push({
            type: 'strategy',
            message: 'Focus on oversold/overbought conditions and support/resistance levels',
            priority: 'high'
          });
        }
        break;

      case 'swing':
        if (behaviorMetrics.avgHoldTime < 1440) {
          recommendations.push({
            type: 'patience',
            message: 'Hold positions longer - swing traders typically hold for days/weeks',
            priority: 'high'
          });
        }
        break;
    }

    if (performanceAlignment < 0.6) {
      recommendations.push({
        type: 'alignment',
        message: `Your trading performance suggests you might benefit from adjusting your ${personality.type} strategy or exploring other personality types`,
        priority: 'high'
      });
    }

    return recommendations;
  }

  // Store personality profile in database
  static async storePersonalityProfile(userId, profileData) {
    const query = `
      INSERT INTO trading_personality_profiles (
        user_id, primary_personality, personality_confidence,
        scalper_score, momentum_score, mean_reversion_score, swing_score,
        avg_hold_time_minutes, avg_trade_frequency_per_day,
        risk_tolerance, position_sizing_consistency,
        personality_performance_score, optimal_strategy_adherence,
        total_trades_analyzed, analysis_start_date, analysis_end_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (user_id, analysis_end_date) DO UPDATE SET
        primary_personality = EXCLUDED.primary_personality,
        personality_confidence = EXCLUDED.personality_confidence,
        scalper_score = EXCLUDED.scalper_score,
        momentum_score = EXCLUDED.momentum_score,
        mean_reversion_score = EXCLUDED.mean_reversion_score,
        swing_score = EXCLUDED.swing_score,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await db.query(query, [
      userId,
      profileData.primaryPersonality,
      profileData.personalityConfidence,
      profileData.personalityScores.scalper,
      profileData.personalityScores.momentum,
      profileData.personalityScores.mean_reversion,
      profileData.personalityScores.swing,
      profileData.behaviorMetrics.avgHoldTime,
      profileData.behaviorMetrics.avgTradesPerDay,
      'medium', // default risk tolerance
      profileData.behaviorMetrics.positionConsistency,
      profileData.performanceAlignment,
      0.5, // default strategy adherence
      profileData.totalTrades,
      profileData.analysisStartDate,
      profileData.analysisEndDate
    ]);

    return result.rows[0];
  }

  // Analyze behavioral drift from previous personality assessments
  static async analyzeBehavioralDrift(userId) {
    const query = `
      SELECT * FROM trading_personality_profiles
      WHERE user_id = $1
      ORDER BY analysis_end_date DESC
      LIMIT 2
    `;

    const result = await db.query(query, [userId]);
    
    if (result.rows.length < 2) {
      return { message: 'No previous personality data for drift analysis' };
    }

    const [current, previous] = result.rows;
    const driftScore = this.calculateDriftScore(current, previous);
    
    // Calculate specific drift metrics (cap at 999.99 to avoid database overflow)
    const rawHoldTimeDriftPercent = ((current.avg_hold_time_minutes - previous.avg_hold_time_minutes) / previous.avg_hold_time_minutes) * 100;
    const rawFrequencyDriftPercent = ((current.avg_trade_frequency_per_day - previous.avg_trade_frequency_per_day) / previous.avg_trade_frequency_per_day) * 100;
    
    const holdTimeDriftPercent = Math.max(-999.99, Math.min(999.99, rawHoldTimeDriftPercent || 0));
    const frequencyDriftPercent = Math.max(-999.99, Math.min(999.99, rawFrequencyDriftPercent || 0));
    const riskToleranceDrift = Math.abs(current.position_sizing_consistency - previous.position_sizing_consistency);
    
    // Determine drift severity
    let driftSeverity = 'low';
    if (driftScore > 0.7) driftSeverity = 'high';
    else if (driftScore > 0.4) driftSeverity = 'medium';
    
    // Calculate performance impact
    const performanceImpact = this.calculateDriftPerformanceImpact(current, previous, driftScore);
    
    const driftRecommendations = this.generateAdvancedDriftRecommendations(current, previous, driftScore);
    
    // Store drift analysis
    const driftData = {
      userId,
      analysisDate: new Date(),
      periodDays: Math.round((new Date(current.analysis_end_date) - new Date(previous.analysis_end_date)) / (1000 * 60 * 60 * 24)),
      previousPrimaryPersonality: previous.primary_personality,
      currentPrimaryPersonality: current.primary_personality,
      personalityDriftScore: driftScore,
      holdTimeDriftPercent,
      frequencyDriftPercent,
      riskToleranceDrift,
      driftPerformanceImpact: performanceImpact,
      driftSeverity,
      driftRecommendations
    };
    
    await this.storeDriftAnalysis(driftData);
    
    return {
      hasDrift: driftScore > 0.3,
      driftScore: Math.round(driftScore * 100) / 100,
      previousPersonality: previous.primary_personality,
      currentPersonality: current.primary_personality,
      personalityChanged: previous.primary_personality !== current.primary_personality,
      driftMetrics: {
        holdTimeDrift: Math.round(holdTimeDriftPercent * 10) / 10,
        frequencyDrift: Math.round(frequencyDriftPercent * 10) / 10,
        riskToleranceDrift: Math.round(riskToleranceDrift * 100) / 100
      },
      severity: driftSeverity,
      performanceImpact: Math.round(performanceImpact * 100) / 100,
      recommendations: driftRecommendations,
      driftTrends: await this.getDriftTrends(userId)
    };
  }

  // Calculate performance impact of drift
  static calculateDriftPerformanceImpact(current, previous, driftScore) {
    // Estimate performance impact based on drift severity and performance changes
    const performanceChange = current.personality_performance_score - previous.personality_performance_score;
    
    // If performance decreased with high drift, it's likely drift-related
    if (driftScore > 0.5 && performanceChange < 0) {
      return Math.abs(performanceChange) * 1000; // Convert to dollar estimate
    }
    
    // If performance improved despite drift, user might be adapting well
    if (performanceChange > 0) {
      return -Math.abs(performanceChange) * 500; // Positive adaptation
    }
    
    return 0;
  }

  // Generate advanced drift recommendations
  static generateAdvancedDriftRecommendations(current, previous, driftScore) {
    const recommendations = [];
    
    if (current.primary_personality !== previous.primary_personality) {
      recommendations.push({
        type: 'personality_change',
        priority: 'high',
        message: `Personality shifted from ${previous.primary_personality} to ${current.primary_personality}`,
        action: 'Review and adjust your trading strategy to align with your new personality type'
      });
    }
    
    const holdTimeDrift = Math.abs((current.avg_hold_time_minutes - previous.avg_hold_time_minutes) / previous.avg_hold_time_minutes);
    if (holdTimeDrift > 0.5) {
      const direction = current.avg_hold_time_minutes > previous.avg_hold_time_minutes ? 'increased' : 'decreased';
      recommendations.push({
        type: 'hold_time_drift',
        priority: 'medium',
        message: `Hold times have ${direction} significantly (${Math.round(holdTimeDrift * 100)}%)`,
        action: 'Ensure this change aligns with your intended strategy and market conditions'
      });
    }
    
    const frequencyDrift = Math.abs((current.avg_trade_frequency_per_day - previous.avg_trade_frequency_per_day) / previous.avg_trade_frequency_per_day);
    if (frequencyDrift > 0.3) {
      const direction = current.avg_trade_frequency_per_day > previous.avg_trade_frequency_per_day ? 'increased' : 'decreased';
      recommendations.push({
        type: 'frequency_drift',
        priority: 'medium',
        message: `Trading frequency has ${direction} by ${Math.round(frequencyDrift * 100)}%`,
        action: direction === 'increased' ? 'Consider if you\'re overtrading' : 'Ensure you\'re not missing opportunities'
      });
    }
    
    if (driftScore > 0.7) {
      recommendations.push({
        type: 'high_drift_warning',
        priority: 'high',
        message: 'Significant behavioral drift detected across multiple dimensions',
        action: 'Consider taking a break to reassess your trading approach and market conditions'
      });
    }
    
    return recommendations;
  }

  // Store drift analysis in database
  static async storeDriftAnalysis(driftData) {
    const query = `
      INSERT INTO personality_drift_tracking (
        user_id, analysis_date, period_days, previous_primary_personality,
        current_primary_personality, personality_drift_score, hold_time_drift_percent,
        frequency_drift_percent, risk_tolerance_drift, drift_performance_impact,
        drift_severity, drift_recommendations
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id, analysis_date) DO UPDATE SET
        personality_drift_score = EXCLUDED.personality_drift_score,
        hold_time_drift_percent = EXCLUDED.hold_time_drift_percent,
        frequency_drift_percent = EXCLUDED.frequency_drift_percent,
        drift_severity = EXCLUDED.drift_severity,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await db.query(query, [
      driftData.userId,
      driftData.analysisDate,
      driftData.periodDays,
      driftData.previousPrimaryPersonality,
      driftData.currentPrimaryPersonality,
      driftData.personalityDriftScore,
      driftData.holdTimeDriftPercent,
      driftData.frequencyDriftPercent,
      driftData.riskToleranceDrift,
      driftData.driftPerformanceImpact,
      driftData.driftSeverity,
      JSON.stringify(driftData.driftRecommendations)
    ]);

    return result.rows[0];
  }

  // Get drift trends over time
  static async getDriftTrends(userId) {
    const query = `
      SELECT 
        analysis_date,
        personality_drift_score,
        drift_severity,
        previous_primary_personality,
        current_primary_personality,
        drift_performance_impact
      FROM personality_drift_tracking
      WHERE user_id = $1
      ORDER BY analysis_date DESC
      LIMIT 12
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Get peer comparison for personality type
  static async getPeerComparison(userId, personalityType) {
    try {
      // Get user's latest personality profile
      const userProfile = await this.getLatestProfile(userId);
      if (!userProfile) {
        return { error: 'No user personality profile found' };
      }

      // Get aggregated stats for the same personality type from other users
      const peerStatsQuery = `
        SELECT 
          COUNT(*) as peer_count,
          AVG(personality_performance_score) as avg_performance_score,
          AVG(avg_hold_time_minutes) as avg_hold_time,
          AVG(avg_trade_frequency_per_day) as avg_frequency,
          AVG(position_sizing_consistency) as avg_consistency,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY personality_performance_score) as median_performance,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY personality_performance_score) as p75_performance,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY personality_performance_score) as p90_performance
        FROM trading_personality_profiles 
        WHERE primary_personality = $1 
          AND user_id != $2
          AND analysis_end_date >= NOW() - INTERVAL '30 days'
      `;

      const peerStatsResult = await db.query(peerStatsQuery, [personalityType, userId]);
      const peerStats = peerStatsResult.rows[0];

      if (!peerStats || parseInt(peerStats.peer_count) < 5) {
        return {
          personalityType,
          peerGroupSize: parseInt(peerStats?.peer_count || 0),
          insufficientData: true,
          message: 'Not enough peer data available for meaningful comparison (need at least 5 users)'
        };
      }

      // Calculate user's percentile ranking
      const percentileQuery = `
        SELECT 
          COUNT(*) as users_below,
          (SELECT COUNT(*) FROM trading_personality_profiles 
           WHERE primary_personality = $1 AND user_id != $2 AND analysis_end_date >= NOW() - INTERVAL '30 days') as total_users
        FROM trading_personality_profiles 
        WHERE primary_personality = $1 
          AND user_id != $2 
          AND personality_performance_score < $3
          AND analysis_end_date >= NOW() - INTERVAL '30 days'
      `;

      const percentileResult = await db.query(percentileQuery, [
        personalityType, 
        userId, 
        userProfile.personality_performance_score
      ]);
      
      const userPercentile = Math.round(
        (parseFloat(percentileResult.rows[0].users_below) / parseFloat(percentileResult.rows[0].total_users)) * 100
      );

      // Get top performer characteristics
      const topPerformersQuery = `
        SELECT 
          AVG(avg_hold_time_minutes) as optimal_hold_time,
          AVG(avg_trade_frequency_per_day) as optimal_frequency,
          AVG(position_sizing_consistency) as optimal_consistency
        FROM trading_personality_profiles 
        WHERE primary_personality = $1 
          AND user_id != $2
          AND personality_performance_score >= $3
          AND analysis_end_date >= NOW() - INTERVAL '30 days'
      `;

      const topPerformersResult = await db.query(topPerformersQuery, [
        personalityType, 
        userId, 
        parseFloat(peerStats.p75_performance)
      ]);
      
      const topPerformer = topPerformersResult.rows[0];

      // Generate personalized recommendations based on peer comparison
      const recommendations = this.generatePeerComparisonRecommendations(
        userProfile, 
        peerStats, 
        topPerformer,
        userPercentile
      );

      // Store peer comparison data
      await this.storePeerComparison(userId, {
        personalityType,
        peerGroupSize: parseInt(peerStats.peer_count),
        userPercentile,
        userPerformanceScore: userProfile.personality_performance_score,
        peerAvgPerformanceScore: parseFloat(peerStats.avg_performance_score),
        userHoldTime: userProfile.avg_hold_time_minutes,
        peerAvgHoldTime: parseFloat(peerStats.avg_hold_time),
        userFrequency: userProfile.avg_trade_frequency_per_day,
        peerAvgFrequency: parseFloat(peerStats.avg_frequency),
        userConsistency: userProfile.position_sizing_consistency,
        peerAvgConsistency: parseFloat(peerStats.avg_consistency)
      });

      return {
        personalityType,
        peerGroupSize: parseInt(peerStats.peer_count),
        userPercentile,
        performanceComparison: {
          user: parseFloat(userProfile.personality_performance_score).toFixed(3),
          peers: parseFloat(peerStats.avg_performance_score).toFixed(3),
          median: parseFloat(peerStats.median_performance).toFixed(3),
          top25: parseFloat(peerStats.p75_performance).toFixed(3),
          top10: parseFloat(peerStats.p90_performance).toFixed(3)
        },
        behaviorComparison: {
          holdTime: {
            user: Math.round(userProfile.avg_hold_time_minutes),
            peers: Math.round(parseFloat(peerStats.avg_hold_time)),
            optimal: Math.round(parseFloat(topPerformer.optimal_hold_time))
          },
          frequency: {
            user: parseFloat(userProfile.avg_trade_frequency_per_day).toFixed(1),
            peers: parseFloat(peerStats.avg_frequency).toFixed(1),
            optimal: parseFloat(topPerformer.optimal_frequency).toFixed(1)
          },
          consistency: {
            user: parseFloat(userProfile.position_sizing_consistency).toFixed(2),
            peers: parseFloat(peerStats.avg_consistency).toFixed(2),
            optimal: parseFloat(topPerformer.optimal_consistency).toFixed(2)
          }
        },
        recommendations,
        lastUpdated: new Date()
      };

    } catch (error) {
      console.error('Error generating peer comparison:', error);
      return {
        personalityType,
        error: 'Failed to generate peer comparison',
        message: error.message
      };
    }
  }

  // Generate recommendations based on peer comparison
  static generatePeerComparisonRecommendations(userProfile, peerStats, topPerformer, userPercentile) {
    const recommendations = [];

    // Performance-based recommendations
    if (userPercentile < 50) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: `You're in the ${userPercentile}th percentile. Focus on improving consistency to match peer performance.`
      });
    } else if (userPercentile > 75) {
      recommendations.push({
        type: 'performance',
        priority: 'low',
        message: `You're in the top ${100 - userPercentile}% of ${userProfile.primary_personality} traders. Keep up the great work!`
      });
    }

    // Hold time recommendations
    const userHoldTime = userProfile.avg_hold_time_minutes;
    const optimalHoldTime = parseFloat(topPerformer.optimal_hold_time);
    const holdTimeDiff = Math.abs(userHoldTime - optimalHoldTime) / optimalHoldTime;

    if (holdTimeDiff > 0.3) {
      if (userHoldTime > optimalHoldTime) {
        recommendations.push({
          type: 'hold_time',
          priority: 'medium',
          message: `Top ${userProfile.primary_personality} traders hold positions for ${Math.round(optimalHoldTime)} minutes on average. Consider shorter holds.`
        });
      } else {
        recommendations.push({
          type: 'hold_time',
          priority: 'medium',
          message: `Top ${userProfile.primary_personality} traders hold positions for ${Math.round(optimalHoldTime)} minutes on average. Consider longer holds.`
        });
      }
    }

    // Frequency recommendations
    const userFreq = userProfile.avg_trade_frequency_per_day;
    const optimalFreq = parseFloat(topPerformer.optimal_frequency);
    const freqDiff = Math.abs(userFreq - optimalFreq) / optimalFreq;

    if (freqDiff > 0.3) {
      if (userFreq > optimalFreq) {
        recommendations.push({
          type: 'frequency',
          priority: 'medium',
          message: `You trade ${userFreq.toFixed(1)} times per day vs. ${optimalFreq.toFixed(1)} for top performers. Consider being more selective.`
        });
      } else {
        recommendations.push({
          type: 'frequency',
          priority: 'low',
          message: `Top ${userProfile.primary_personality} traders average ${optimalFreq.toFixed(1)} trades per day. You might benefit from more opportunities.`
        });
      }
    }

    // Consistency recommendations
    const userConsistency = userProfile.position_sizing_consistency;
    const optimalConsistency = parseFloat(topPerformer.optimal_consistency);

    if (userConsistency < optimalConsistency - 0.1) {
      recommendations.push({
        type: 'consistency',
        priority: 'high',
        message: `Your position sizing consistency (${userConsistency.toFixed(2)}) is below top performers (${optimalConsistency.toFixed(2)}). Focus on standardizing position sizes.`
      });
    }

    return recommendations;
  }

  // Store peer comparison data
  static async storePeerComparison(userId, comparisonData) {
    const query = `
      INSERT INTO personality_peer_comparison (
        user_id, personality_type, peer_group_size, return_percentile,
        user_avg_return, peer_avg_return, user_sharpe_ratio, peer_avg_sharpe_ratio,
        user_win_rate, peer_avg_win_rate, comparison_date, peer_data_quality
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, $11)
      ON CONFLICT (user_id, personality_type, comparison_date) 
      DO UPDATE SET
        peer_group_size = EXCLUDED.peer_group_size,
        return_percentile = EXCLUDED.return_percentile,
        user_avg_return = EXCLUDED.user_avg_return,
        peer_avg_return = EXCLUDED.peer_avg_return,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    // Calculate data quality score based on peer group size
    const dataQuality = Math.min(1.0, comparisonData.peerGroupSize / 50); // Max quality at 50+ peers

    const result = await db.query(query, [
      userId,
      comparisonData.personalityType,
      comparisonData.peerGroupSize,
      comparisonData.userPercentile,
      comparisonData.userPerformanceScore,
      comparisonData.peerAvgPerformanceScore,
      0.5, // placeholder sharpe ratio
      0.45, // placeholder peer sharpe ratio
      0.6, // placeholder win rate
      0.58, // placeholder peer win rate
      dataQuality
    ]);

    return result.rows[0];
  }

  // Helper methods
  static calculateStandardDeviation(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }

  static calculateMedian(values) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
      return sorted[middle];
    }
  }

  static calculateMomentumScore(trades) {
    // Simplified momentum calculation based on trade timing and results
    let momentumTrades = 0;
    for (const trade of trades) {
      const holdTime = parseFloat(trade.hold_time_minutes);
      const pnl = parseFloat(trade.pnl);
      
      // Quick profitable trades suggest momentum trading
      if (holdTime < 240 && pnl > 0) { // < 4 hours and profitable
        momentumTrades++;
      }
    }
    return momentumTrades / trades.length;
  }

  static calculateMeanReversionScore(trades) {
    // Simplified mean reversion calculation
    const winners = trades.filter(t => parseFloat(t.pnl) > 0);
    const winRate = winners.length / trades.length;
    
    // Mean reversion typically has higher win rate
    return winRate > 0.6 ? winRate : winRate * 0.8;
  }

  static calculateDriftScore(current, previous) {
    const personalityDrift = current.primary_personality !== previous.primary_personality ? 0.5 : 0;
    const holdTimeDrift = Math.abs(current.avg_hold_time_minutes - previous.avg_hold_time_minutes) / previous.avg_hold_time_minutes;
    const frequencyDrift = Math.abs(current.avg_trade_frequency_per_day - previous.avg_trade_frequency_per_day) / previous.avg_trade_frequency_per_day;
    
    return Math.min(1, personalityDrift + holdTimeDrift * 0.3 + frequencyDrift * 0.2);
  }

  static generateDriftRecommendations(current, previous) {
    const recommendations = [];
    
    if (current.primary_personality !== previous.primary_personality) {
      recommendations.push(`Personality shifted from ${previous.primary_personality} to ${current.primary_personality} - consider reviewing your strategy`);
    }
    
    if (Math.abs(current.avg_hold_time_minutes - previous.avg_hold_time_minutes) > previous.avg_hold_time_minutes * 0.5) {
      recommendations.push('Significant change in hold times detected - ensure this aligns with your intended strategy');
    }
    
    return recommendations;
  }

  // Safe API call helpers
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

  // Get latest personality profile
  static async getLatestProfile(userId) {
    const query = `
      SELECT * FROM trading_personality_profiles
      WHERE user_id = $1
      ORDER BY analysis_end_date DESC
      LIMIT 1
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  // Get complete personality analysis (latest profile + all related data)
  static async getCompleteAnalysis(userId) {
    try {
      const profile = await this.getLatestProfile(userId);
      
      if (!profile) {
        return null;
      }

      // Reconstruct personality scores from stored data
      const personalityScores = {
        scalper: profile.scalper_score || 0,
        momentum: profile.momentum_score || 0,
        mean_reversion: profile.mean_reversion_score || 0,
        swing: profile.swing_score || 0
      };

      // Reconstruct behavior metrics from stored data
      const behaviorMetrics = {
        avgHoldTime: profile.avg_hold_time_minutes || 0,
        avgTradesPerDay: profile.avg_trade_frequency_per_day || 0,
        positionConsistency: profile.position_sizing_consistency || 0
      };

      // Get latest drift analysis
      const driftAnalysis = await this.analyzeBehavioralDrift(userId);

      // Get peer comparison for this personality type
      const peerComparison = await this.getPeerComparison(userId, profile.primary_personality);

      // Get latest recommendations (could be stored or regenerated)
      const recommendations = this.generatePersonalityRecommendations(
        { type: profile.primary_personality, confidence: profile.personality_confidence },
        behaviorMetrics,
        profile.personality_performance_score || 0
      );

      return {
        profile,
        personalityScores,
        behaviorMetrics,
        performanceAlignment: profile.personality_performance_score || 0,
        recommendations,
        driftAnalysis,
        peerComparison
      };

    } catch (error) {
      console.error('Error getting complete personality analysis:', error);
      return null;
    }
  }
}

module.exports = TradingPersonalityService;