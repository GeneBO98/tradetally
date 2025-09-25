const db = require('../config/database');
const TierService = require('./tierService');
const TickDataService = require('./tickDataService');
const finnhub = require('../utils/finnhub');

// Enhanced version with proper revenge trade aggregation
class BehavioralAnalyticsServiceV2 {

  // Calculate monetary position size for any trade
  // For both long and short trades, quantity * entry_price represents the monetary value at risk
  static calculateMonetaryPositionSize(trade) {
    return parseFloat(trade.quantity) * parseFloat(trade.entry_price);
  }

  // Analyze historical trades and properly aggregate revenge trading events
  static async analyzeHistoricalTradesV2(userId) {
    const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
    if (!hasAccess) {
      throw new Error('Historical analysis requires Pro tier');
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
      const isSignificantLoss = await this.isSignificantLoss(userId, potentialTrigger, trades);
      if (!isSignificantLoss) {
        continue;
      }

      const triggerLoss = Math.abs(parseFloat(potentialTrigger.pnl));
      const triggerExitTime = new Date(potentialTrigger.exit_time);

      // Look for revenge trades within 2 hours after this loss
      const revengeWindowEnd = new Date(triggerExitTime.getTime() + (2 * 60 * 60 * 1000));
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
          // This is a potential revenge trade
          const tradePnL = parseFloat(candidateTrade.pnl || 0);
          totalRevengePnL += tradePnL;
          
          revengeTrades.push({
            id: candidateTrade.id,
            symbol: candidateTrade.symbol,
            pnl: tradePnL
          });

          // Track timing
          if (!earliestRevengeTime || entryTime < earliestRevengeTime) {
            earliestRevengeTime = entryTime;
          }
          if (!latestRevengeTime || entryTime > latestRevengeTime) {
            latestRevengeTime = entryTime;
          }

          // Calculate position size increase (monetary value comparison)
          const candidatePositionSize = this.calculateMonetaryPositionSize(candidateTrade);
          const triggerPositionSize = this.calculateMonetaryPositionSize(potentialTrigger);
          const positionIncrease = ((candidatePositionSize - triggerPositionSize) / triggerPositionSize) * 100;
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

        const eventQuery = `
          INSERT INTO revenge_trading_events (
            user_id, trigger_trade_id, trigger_loss_amount, total_revenge_trades,
            time_window_minutes, position_size_increase_percent,
            total_additional_loss, pattern_broken, cooling_period_used,
            trigger_timestamp, created_at, revenge_trades
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
          revengeTradeIds
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
                triggerSymbol: potentialTrigger.symbol,
                triggerLoss: triggerLoss,
                revengeSymbol: revengeTrade.symbol,
                revengePnL: revengeTrade.pnl,
                totalRevengePnL: totalRevengePnL,
                analysisMode: 'hybrid_analysis',
                positionSizeIncrease: maxPositionIncrease
              }),
              potentialTrigger.id
            ]);
          }
        }
      }
    }

    return {
      tradesAnalyzed: trades.length,
      revengeEventsCreated,
      message: `Created ${revengeEventsCreated} revenge trading events`
    };
  }

  // Check if a loss is significant enough to be a trigger
  static async isSignificantLoss(userId, trade, allTrades) {
    const lossAmount = Math.abs(parseFloat(trade.pnl));
    
    // Get user settings for sensitivity
    const userSettings = await this.getUserSettings(userId);
    const sensitivity = userSettings?.revenge_trading_sensitivity || 'medium';
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
    const positionIncrease = ((maxRevengePosition - triggerPositionSize) / triggerPositionSize) * 100;
    
    // Calculate loss magnitude
    const triggerLoss = Math.abs(parseFloat(triggerTrade.pnl));
    
    // For day trading, detect revenge trading if:
    // 1. Position size increased significantly (>20% for day trading)
    // 2. OR multiple trades within short timeframe with increasing sizes
    // 3. OR significant loss followed by larger position sizes
    
    const hasSignificantPositionIncrease = positionIncrease > 20;
    const hasMultipleTradesWithIncreasingSize = revengeTrades.length >= 2 && 
      revengePositionSizes.some(size => size > triggerPositionSize * 1.3);
    const hasLargeInitialLoss = triggerLoss > 200; // $200+ initial loss
    
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
}

module.exports = BehavioralAnalyticsServiceV2;