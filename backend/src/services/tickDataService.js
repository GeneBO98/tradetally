const db = require('../config/database');
const finnhub = require('../utils/finnhub');

class TickDataService {
  
  // Store tick data in database
  async storeTicks(symbol, date, ticks) {
    try {
      // Insert tick data
      for (let i = 0; i < ticks.t.length; i++) {
        const timestamp = ticks.t[i];
        const price = ticks.p[i];
        const volume = ticks.v[i] || null;
        const conditions = ticks.c && ticks.c[i] ? ticks.c[i] : null;
        const exchange = ticks.x && ticks.x[i] ? ticks.x[i] : null;
        
        await db.query(`
          INSERT INTO tick_data (symbol, date, timestamp, price, volume, conditions, exchange)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (symbol, timestamp) DO UPDATE SET
            price = EXCLUDED.price,
            volume = EXCLUDED.volume,
            conditions = EXCLUDED.conditions,
            exchange = EXCLUDED.exchange,
            updated_at = CURRENT_TIMESTAMP
        `, [symbol, date, timestamp, price, volume, conditions, exchange]);
      }
      
      // Update cache record
      await db.query(`
        INSERT INTO tick_data_cache (symbol, date, start_timestamp, end_timestamp, tick_count)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (symbol, date, start_timestamp, end_timestamp) DO UPDATE SET
          tick_count = EXCLUDED.tick_count,
          fetched_at = CURRENT_TIMESTAMP,
          expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
      `, [symbol, date, ticks.t[0], ticks.t[ticks.t.length - 1], ticks.t.length]);
      
      return true;
    } catch (error) {
      console.error('Error storing tick data:', error);
      throw error;
    }
  }
  
  // Get tick data from database
  async getStoredTicks(symbol, date, startTime, endTime) {
    const result = await db.query(`
      SELECT timestamp, price, volume, conditions, exchange
      FROM tick_data
      WHERE symbol = $1 AND date = $2 AND timestamp >= $3 AND timestamp <= $4
      ORDER BY timestamp ASC
    `, [symbol, date, startTime, endTime]);
    
    // Convert to Finnhub format
    const ticks = {
      t: [],
      p: [],
      v: [],
      c: [],
      x: []
    };
    
    result.rows.forEach(row => {
      ticks.t.push(row.timestamp);
      ticks.p.push(parseFloat(row.price));
      ticks.v.push(row.volume);
      ticks.c.push(row.conditions);
      ticks.x.push(row.exchange);
    });
    
    return ticks;
  }
  
  // Check if tick data is cached
  async isTickDataCached(symbol, date, startTime, endTime) {
    const result = await db.query(`
      SELECT COUNT(*) as count FROM tick_data_cache
      WHERE symbol = $1 AND date = $2 
        AND start_timestamp <= $3 AND end_timestamp >= $4
        AND expires_at > CURRENT_TIMESTAMP
    `, [symbol, date, startTime, endTime]);
    
    return result.rows[0].count > 0;
  }
  
  // Get or fetch tick data around a specific time
  async getTicksAroundTime(symbol, datetime, windowMinutes = 30) {
    const targetTime = new Date(datetime);
    const targetDate = targetTime.toISOString().split('T')[0];
    const targetTimestamp = Math.floor(targetTime.getTime() / 1000);
    const windowSeconds = windowMinutes * 60;
    const startTime = targetTimestamp - windowSeconds;
    const endTime = targetTimestamp + windowSeconds;
    
    // Check if we have cached data
    const isCached = await this.isTickDataCached(symbol, targetDate, startTime, endTime);
    
    if (isCached) {
      console.log(`Using cached tick data for ${symbol} on ${targetDate}`);
      return await this.getStoredTicks(symbol, targetDate, startTime, endTime);
    }
    
    // Fetch from Finnhub if not cached
    console.log(`Fetching tick data from Finnhub for ${symbol} on ${targetDate}`);
    try {
      const ticks = await finnhub.getTicksAroundTime(symbol, datetime, windowMinutes);
      
      // Store in database for future use
      if (ticks && ticks.t && ticks.t.length > 0) {
        await this.storeTicks(symbol, targetDate, ticks);
      }
      
      return ticks;
    } catch (error) {
      console.error(`Failed to fetch tick data for ${symbol}:`, error);
      // Return empty data if API fails
      return { t: [], p: [], v: [], c: [], x: [], count: 0 };
    }
  }
  
  // Analyze tick data for revenge trading patterns
  async analyzeRevengeTradeTickData(userId, revengeTradeId, triggerTradeId, symbol, tradeEntryTime, tradeExitTime, windowMinutes = 30) {
    try {
      console.log(`Analyzing tick data for revenge trade ${revengeTradeId} on ${symbol}`);
      
      // Get tick data around entry time
      const entryTicks = await this.getTicksAroundTime(symbol, tradeEntryTime, windowMinutes);
      
      // Get tick data around exit time if available
      let exitTicks = null;
      if (tradeExitTime) {
        exitTicks = await this.getTicksAroundTime(symbol, tradeExitTime, windowMinutes);
      }
      
      // Analyze the tick data
      const analysis = await this.performTickAnalysis(entryTicks, exitTicks, tradeEntryTime, tradeExitTime);
      
      // Store analysis results
      await this.storeTickAnalysis(userId, revengeTradeId, triggerTradeId, symbol, tradeEntryTime, tradeExitTime, windowMinutes, analysis);
      
      return analysis;
    } catch (error) {
      console.error('Error analyzing revenge trade tick data:', error);
      throw error;
    }
  }
  
  // Perform statistical analysis on tick data
  async performTickAnalysis(entryTicks, exitTicks, tradeEntryTime, tradeExitTime) {
    const analysis = {};
    
    if (!entryTicks || entryTicks.t.length === 0) {
      return {
        pre_trade_ticks: 0,
        post_trade_ticks: 0,
        price_trend_before: 'unknown',
        price_trend_after: 'unknown',
        volatility_before: 0,
        volatility_after: 0,
        volume_before_avg: 0,
        volume_after_avg: 0,
        was_chasing_momentum: false,
        was_fighting_trend: false,
        entry_timing_score: 0
      };
    }
    
    const entryTimestamp = Math.floor(new Date(tradeEntryTime).getTime() / 1000);
    const exitTimestamp = tradeExitTime ? Math.floor(new Date(tradeExitTime).getTime() / 1000) : null;
    
    // Separate ticks before and after entry
    const beforeEntryTicks = [];
    const afterEntryTicks = [];
    
    for (let i = 0; i < entryTicks.t.length; i++) {
      if (entryTicks.t[i] < entryTimestamp) {
        beforeEntryTicks.push({
          timestamp: entryTicks.t[i],
          price: entryTicks.p[i],
          volume: entryTicks.v[i] || 0
        });
      } else {
        afterEntryTicks.push({
          timestamp: entryTicks.t[i],
          price: entryTicks.p[i],
          volume: entryTicks.v[i] || 0
        });
      }
    }
    
    // Calculate basic metrics
    analysis.pre_trade_ticks = beforeEntryTicks.length;
    analysis.post_trade_ticks = afterEntryTicks.length;
    
    // Price analysis
    if (beforeEntryTicks.length > 0) {
      const beforePrices = beforeEntryTicks.map(t => t.price);
      const afterPrices = afterEntryTicks.map(t => t.price);
      
      analysis.price_before_entry = beforePrices.length > 0 ? beforePrices[beforePrices.length - 1] : null;
      analysis.price_at_entry = entryTicks.p[entryTicks.p.length - 1];
      
      // Calculate price trends
      analysis.price_trend_before = this.calculatePriceTrend(beforePrices);
      analysis.price_trend_after = this.calculatePriceTrend(afterPrices);
      
      // Calculate volatility (standard deviation)
      analysis.volatility_before = this.calculateVolatility(beforePrices);
      analysis.volatility_after = this.calculateVolatility(afterPrices);
      
      // Calculate average volume
      analysis.volume_before_avg = beforeEntryTicks.length > 0 ? 
        Math.round(beforeEntryTicks.reduce((sum, t) => sum + t.volume, 0) / beforeEntryTicks.length) : 0;
      analysis.volume_after_avg = afterEntryTicks.length > 0 ? 
        Math.round(afterEntryTicks.reduce((sum, t) => sum + t.volume, 0) / afterEntryTicks.length) : 0;
      
      // Behavioral analysis
      analysis.was_chasing_momentum = this.detectMomentumChasing(beforePrices, analysis.price_at_entry);
      analysis.was_fighting_trend = this.detectTrendFighting(beforePrices, analysis.price_at_entry);
      analysis.entry_timing_score = this.calculateEntryTimingScore(beforePrices, analysis.price_at_entry);
    }
    
    // Exit analysis if available
    if (exitTicks && exitTicks.t.length > 0 && exitTimestamp) {
      const exitPrices = exitTicks.p;
      analysis.price_at_exit = exitPrices[exitPrices.length - 1];
      
      // Find prices after exit
      const afterExitPrices = [];
      for (let i = 0; i < exitTicks.t.length; i++) {
        if (exitTicks.t[i] > exitTimestamp) {
          afterExitPrices.push(exitTicks.p[i]);
        }
      }
      
      analysis.price_after_exit = afterExitPrices.length > 0 ? afterExitPrices[afterExitPrices.length - 1] : null;
    }
    
    return analysis;
  }
  
  // Calculate price trend direction
  calculatePriceTrend(prices) {
    if (prices.length < 2) return 'unknown';
    
    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = (last - first) / first;
    
    if (change > 0.002) return 'up';      // >0.2% change
    if (change < -0.002) return 'down';   // <-0.2% change
    return 'sideways';
  }
  
  // Calculate price volatility (standard deviation)
  calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    return Math.sqrt(variance);
  }
  
  // Detect momentum chasing behavior
  detectMomentumChasing(beforePrices, entryPrice) {
    if (beforePrices.length < 3) return false;
    
    // Check if price was rising rapidly before entry
    const recentPrices = beforePrices.slice(-5); // Last 5 ticks
    const trend = this.calculatePriceTrend(recentPrices);
    
    // If price was going up strongly and entry was at/near peak, likely momentum chasing
    if (trend === 'up') {
      const maxPrice = Math.max(...recentPrices);
      return entryPrice >= maxPrice * 0.995; // Within 0.5% of peak
    }
    
    return false;
  }
  
  // Detect trend fighting behavior
  detectTrendFighting(beforePrices, entryPrice) {
    if (beforePrices.length < 5) return false;
    
    // Check if entry was against the prevailing trend
    const trend = this.calculatePriceTrend(beforePrices);
    const recentTrend = this.calculatePriceTrend(beforePrices.slice(-3));
    
    // If overall trend is down but entry suggests buying, or vice versa
    return trend !== recentTrend && trend !== 'sideways';
  }
  
  // Calculate entry timing quality score (0-1)
  calculateEntryTimingScore(beforePrices, entryPrice) {
    if (beforePrices.length < 3) return 0.5;
    
    const volatility = this.calculateVolatility(beforePrices);
    const trend = this.calculatePriceTrend(beforePrices);
    
    let score = 0.5; // Neutral baseline
    
    // Penalize high volatility entries
    if (volatility > 0.01) score -= 0.2;
    
    // Reward entries with clear trend
    if (trend !== 'sideways') score += 0.1;
    
    // Penalize entries at extreme prices
    const minPrice = Math.min(...beforePrices);
    const maxPrice = Math.max(...beforePrices);
    const priceRange = maxPrice - minPrice;
    
    if (priceRange > 0) {
      const entryPosition = (entryPrice - minPrice) / priceRange;
      if (entryPosition > 0.8 || entryPosition < 0.2) {
        score -= 0.2; // Penalize extreme entries
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  // Store tick analysis results
  async storeTickAnalysis(userId, revengeTradeId, triggerTradeId, symbol, tradeEntryTime, tradeExitTime, windowMinutes, analysis) {
    await db.query(`
      INSERT INTO revenge_trade_tick_analysis (
        user_id, revenge_trade_id, trigger_trade_id, symbol, 
        trade_entry_time, trade_exit_time, analysis_window_minutes,
        pre_trade_ticks, post_trade_ticks, price_before_entry, price_at_entry,
        price_at_exit, price_after_exit, price_trend_before, price_trend_after,
        volatility_before, volatility_after, volume_before_avg, volume_after_avg,
        was_chasing_momentum, was_fighting_trend, entry_timing_score
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )
      ON CONFLICT (user_id, revenge_trade_id) DO UPDATE SET
        pre_trade_ticks = EXCLUDED.pre_trade_ticks,
        post_trade_ticks = EXCLUDED.post_trade_ticks,
        price_before_entry = EXCLUDED.price_before_entry,
        price_at_entry = EXCLUDED.price_at_entry,
        price_at_exit = EXCLUDED.price_at_exit,
        price_after_exit = EXCLUDED.price_after_exit,
        price_trend_before = EXCLUDED.price_trend_before,
        price_trend_after = EXCLUDED.price_trend_after,
        volatility_before = EXCLUDED.volatility_before,
        volatility_after = EXCLUDED.volatility_after,
        volume_before_avg = EXCLUDED.volume_before_avg,
        volume_after_avg = EXCLUDED.volume_after_avg,
        was_chasing_momentum = EXCLUDED.was_chasing_momentum,
        was_fighting_trend = EXCLUDED.was_fighting_trend,
        entry_timing_score = EXCLUDED.entry_timing_score,
        updated_at = CURRENT_TIMESTAMP
    `, [
      userId, revengeTradeId, triggerTradeId, symbol,
      tradeEntryTime, tradeExitTime, windowMinutes,
      analysis.pre_trade_ticks, analysis.post_trade_ticks,
      analysis.price_before_entry, analysis.price_at_entry,
      analysis.price_at_exit, analysis.price_after_exit,
      analysis.price_trend_before, analysis.price_trend_after,
      analysis.volatility_before, analysis.volatility_after,
      analysis.volume_before_avg, analysis.volume_after_avg,
      analysis.was_chasing_momentum, analysis.was_fighting_trend,
      analysis.entry_timing_score
    ]);
  }
  
  // Get tick analysis for revenge trade
  async getTickAnalysis(userId, revengeTradeId) {
    const result = await db.query(`
      SELECT * FROM revenge_trade_tick_analysis
      WHERE user_id = $1 AND revenge_trade_id = $2
    `, [userId, revengeTradeId]);
    
    return result.rows[0] || null;
  }
  
  // Clean up expired cache entries
  async cleanupExpiredCache() {
    const result = await db.query(`
      DELETE FROM tick_data_cache 
      WHERE expires_at < CURRENT_TIMESTAMP
    `);
    
    console.log(`Cleaned up ${result.rowCount} expired tick data cache entries`);
    return result.rowCount;
  }
}

module.exports = new TickDataService();