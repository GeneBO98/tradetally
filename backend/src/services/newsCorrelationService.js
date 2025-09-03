const db = require('../config/database');
const TierService = require('./tierService');
const logger = require('../utils/logger');

class NewsCorrelationService {
  /**
   * Check if news correlation analytics is enabled for user
   */
  async isNewsCorrelationEnabled(userId) {
    try {
      // Check if billing is enabled
      const billingEnabled = await TierService.isBillingEnabled();
      
      if (!billingEnabled) {
        // Self-hosted with billing disabled - always enabled
        return true;
      }
      
      // Check user tier for SaaS users
      const userTier = await TierService.getUserTier(userId);
      return userTier === 'pro';
    } catch (error) {
      logger.logError(`Error checking news correlation eligibility: ${error.message}`);
      return false;
    }
  }

  /**
   * Get comprehensive news sentiment correlation analytics
   */
  async getNewsCorrelationAnalytics(userId, options = {}) {
    try {
      if (!(await this.isNewsCorrelationEnabled(userId))) {
        return { error: 'News correlation analytics requires Pro tier' };
      }

      const {
        startDate = null,
        endDate = null,
        symbol = null,
        sector = null
      } = options;

      // Build base query filters
      let whereClause = `
        WHERE t.user_id = $1 
        AND t.exit_time IS NOT NULL 
        AND t.exit_price IS NOT NULL 
        AND t.has_news = TRUE 
        AND t.news_sentiment IS NOT NULL
      `;
      const params = [userId];
      let paramCount = 2;

      if (startDate) {
        whereClause += ` AND t.trade_date >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
      }

      if (endDate) {
        whereClause += ` AND t.trade_date <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
      }

      if (symbol) {
        whereClause += ` AND t.symbol = $${paramCount}`;
        params.push(symbol.toUpperCase());
        paramCount++;
      }

      if (sector) {
        whereClause += ` AND t.sector = $${paramCount}`;
        params.push(sector);
        paramCount++;
      }

      // Get overall sentiment correlation stats
      const overallQuery = `
        SELECT 
          news_sentiment,
          side,
          COUNT(*) as trade_count,
          COUNT(*) FILTER (WHERE pnl > 0) as profitable_trades,
          ROUND((AVG(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100)::numeric, 2) as win_rate,
          ROUND(AVG(pnl)::numeric, 2) as avg_pnl,
          ROUND(SUM(pnl)::numeric, 2) as total_pnl,
          ROUND(AVG(pnl_percent)::numeric, 2) as avg_return_pct,
          ROUND(AVG(ABS(pnl))::numeric, 2) as avg_absolute_pnl
        FROM trades t
        ${whereClause}
        GROUP BY news_sentiment, side
        ORDER BY news_sentiment, side
      `;

      // Get sentiment timing analysis
      const timingQuery = `
        WITH trade_timing AS (
          SELECT 
            t.*,
            EXTRACT(EPOCH FROM (t.entry_time - nc.checked_at)) / 3600 as hours_after_news
          FROM trades t
          JOIN news_cache nc ON nc.symbol = t.symbol AND nc.news_date = t.trade_date
          ${whereClause}
        )
        SELECT 
          news_sentiment,
          side,
          ROUND(AVG(hours_after_news)::numeric, 2) as avg_hours_after_news,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours_after_news)::numeric, 2) as median_hours_after_news,
          COUNT(*) FILTER (WHERE hours_after_news <= 1) as trades_within_1h,
          COUNT(*) FILTER (WHERE hours_after_news <= 24) as trades_within_24h,
          COUNT(*) as total_trades
        FROM trade_timing
        GROUP BY news_sentiment, side
        ORDER BY news_sentiment, side
      `;

      // Get sentiment vs direction bias
      const directionBiasQuery = `
        SELECT 
          news_sentiment,
          COUNT(*) as total_trades,
          COUNT(*) FILTER (WHERE side = 'long') as long_trades,
          COUNT(*) FILTER (WHERE side = 'short') as short_trades,
          ROUND((COUNT(*) FILTER (WHERE side = 'long')::numeric / COUNT(*) * 100)::numeric, 2) as long_percentage,
          ROUND((COUNT(*) FILTER (WHERE side = 'short')::numeric / COUNT(*) * 100)::numeric, 2) as short_percentage
        FROM trades t
        ${whereClause}
        GROUP BY news_sentiment
        ORDER BY news_sentiment
      `;

      // Get sentiment accuracy analysis
      const accuracyQuery = `
        SELECT 
          news_sentiment,
          side,
          COUNT(*) as total_trades,
          COUNT(*) FILTER (
            WHERE (news_sentiment = 'positive' AND pnl > 0) 
            OR (news_sentiment = 'negative' AND pnl < 0)
            OR (news_sentiment = 'neutral' AND ABS(pnl_percent) < 5)
          ) as aligned_trades,
          ROUND((
            COUNT(*) FILTER (
              WHERE (news_sentiment = 'positive' AND pnl > 0) 
              OR (news_sentiment = 'negative' AND pnl < 0)
              OR (news_sentiment = 'neutral' AND ABS(pnl_percent) < 5)
            )::numeric / COUNT(*) * 100
          )::numeric, 2) as alignment_percentage
        FROM trades t
        ${whereClause}
        GROUP BY news_sentiment, side
        ORDER BY news_sentiment, side
      `;

      // Get top performing sentiment/side combinations
      const topPerformersQuery = `
        SELECT 
          news_sentiment,
          side,
          symbol,
          COUNT(*) as trade_count,
          ROUND(AVG(pnl)::numeric, 2) as avg_pnl,
          ROUND(SUM(pnl)::numeric, 2) as total_pnl,
          ROUND(AVG(pnl_percent)::numeric, 2) as avg_return_pct,
          ROUND((AVG(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100)::numeric, 2) as win_rate
        FROM trades t
        ${whereClause}
        GROUP BY news_sentiment, side, symbol
        HAVING COUNT(*) >= 3  -- Only include symbols with 3+ trades
          AND SUM(pnl) > 100  -- Only include combinations with meaningful profit (>$100)
        ORDER BY total_pnl DESC
        LIMIT 20
      `;

      // Execute all queries in parallel
      const [
        overallResults,
        timingResults, 
        directionResults,
        accuracyResults,
        performerResults
      ] = await Promise.all([
        db.query(overallQuery, params),
        db.query(timingQuery, params),
        db.query(directionBiasQuery, params),
        db.query(accuracyQuery, params),
        db.query(topPerformersQuery, params)
      ]);

      // Process and structure the results
      const analytics = {
        overall_performance: this.processOverallPerformance(overallResults.rows),
        timing_analysis: this.processTimingAnalysis(timingResults.rows),
        direction_bias: this.processDirectionBias(directionResults.rows),
        sentiment_accuracy: this.processSentimentAccuracy(accuracyResults.rows),
        top_performers: performerResults.rows,
        insights: this.generateInsights(overallResults.rows, directionResults.rows, accuracyResults.rows),
        metadata: {
          total_trades_analyzed: overallResults.rows.reduce((sum, row) => sum + parseInt(row.trade_count), 0),
          date_range: { startDate, endDate },
          filters: { symbol, sector }
        }
      };

      return analytics;

    } catch (error) {
      logger.logError(`Error getting news correlation analytics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process overall performance data into structured format
   */
  processOverallPerformance(rows) {
    const performance = {
      by_sentiment: {},
      by_side: {},
      summary: {}
    };

    // Group by sentiment
    rows.forEach(row => {
      if (!performance.by_sentiment[row.news_sentiment]) {
        performance.by_sentiment[row.news_sentiment] = {
          total_trades: 0,
          profitable_trades: 0,
          total_pnl: 0,
          avg_pnl: 0,
          win_rate: 0,
          sides: {}
        };
      }

      const sentiment = performance.by_sentiment[row.news_sentiment];
      sentiment.total_trades += parseInt(row.trade_count);
      sentiment.profitable_trades += parseInt(row.profitable_trades);
      sentiment.total_pnl += parseFloat(row.total_pnl);
      sentiment.sides[row.side] = {
        trade_count: parseInt(row.trade_count),
        win_rate: parseFloat(row.win_rate),
        avg_pnl: parseFloat(row.avg_pnl),
        total_pnl: parseFloat(row.total_pnl),
        avg_return_pct: parseFloat(row.avg_return_pct)
      };
    });

    // Calculate overall metrics for each sentiment
    Object.keys(performance.by_sentiment).forEach(sentiment => {
      const data = performance.by_sentiment[sentiment];
      data.win_rate = Math.round((data.profitable_trades / data.total_trades) * 100 * 100) / 100;
      data.avg_pnl = Math.round((data.total_pnl / data.total_trades) * 100) / 100;
    });

    return performance;
  }

  /**
   * Process timing analysis data
   */
  processTimingAnalysis(rows) {
    const timing = {};

    rows.forEach(row => {
      const key = `${row.news_sentiment}_${row.side}`;
      timing[key] = {
        sentiment: row.news_sentiment,
        side: row.side,
        avg_hours_after_news: parseFloat(row.avg_hours_after_news),
        median_hours_after_news: parseFloat(row.median_hours_after_news),
        trades_within_1h: parseInt(row.trades_within_1h),
        trades_within_24h: parseInt(row.trades_within_24h),
        total_trades: parseInt(row.total_trades),
        immediate_reaction_rate: Math.round((parseInt(row.trades_within_1h) / parseInt(row.total_trades)) * 100 * 100) / 100,
        same_day_reaction_rate: Math.round((parseInt(row.trades_within_24h) / parseInt(row.total_trades)) * 100 * 100) / 100
      };
    });

    return timing;
  }

  /**
   * Process direction bias data
   */
  processDirectionBias(rows) {
    const bias = {};

    rows.forEach(row => {
      bias[row.news_sentiment] = {
        total_trades: parseInt(row.total_trades),
        long_trades: parseInt(row.long_trades),
        short_trades: parseInt(row.short_trades),
        long_percentage: parseFloat(row.long_percentage),
        short_percentage: parseFloat(row.short_percentage),
        bias_strength: Math.abs(parseFloat(row.long_percentage) - 50) // How far from 50/50 split
      };
    });

    return bias;
  }

  /**
   * Process sentiment accuracy data
   */
  processSentimentAccuracy(rows) {
    const accuracy = {};

    rows.forEach(row => {
      const key = `${row.news_sentiment}_${row.side}`;
      accuracy[key] = {
        sentiment: row.news_sentiment,
        side: row.side,
        total_trades: parseInt(row.total_trades),
        aligned_trades: parseInt(row.aligned_trades),
        alignment_percentage: parseFloat(row.alignment_percentage)
      };
    });

    return accuracy;
  }

  /**
   * Generate insights based on the analytics data
   */
  generateInsights(overallRows, directionRows, accuracyRows) {
    const insights = [];

    // Find best performing sentiment/side combinations
    const sortedPerformance = overallRows
      .sort((a, b) => parseFloat(b.win_rate) - parseFloat(a.win_rate))
      .slice(0, 3);

    if (sortedPerformance.length > 0) {
      const best = sortedPerformance[0];
      insights.push({
        type: 'performance',
        level: 'positive',
        title: 'Highest Win Rate Strategy',
        description: `Your highest win rate (${best.win_rate}%) comes from ${best.side} trades on ${best.news_sentiment} news sentiment`,
        metrics: {
          win_rate: parseFloat(best.win_rate),
          avg_pnl: parseFloat(best.avg_pnl),
          trade_count: parseInt(best.trade_count)
        }
      });
    }

    // Analyze direction bias
    directionRows.forEach(row => {
      const bias = parseFloat(row.long_percentage);
      if (bias > 70) {
        insights.push({
          type: 'bias',
          level: 'info',
          title: `Strong Long Bias on ${row.news_sentiment.charAt(0).toUpperCase() + row.news_sentiment.slice(1)} News`,
          description: `You go long ${bias}% of the time when ${row.news_sentiment} news occurs`,
          metrics: { bias_percentage: bias }
        });
      } else if (bias < 30) {
        insights.push({
          type: 'bias', 
          level: 'info',
          title: `Strong Short Bias on ${row.news_sentiment.charAt(0).toUpperCase() + row.news_sentiment.slice(1)} News`,
          description: `You go short ${100 - bias}% of the time when ${row.news_sentiment} news occurs`,
          metrics: { bias_percentage: 100 - bias }
        });
      }
    });

    // Check for sentiment alignment issues
    const poorAlignment = accuracyRows.filter(row => parseFloat(row.alignment_percentage) < 40);
    if (poorAlignment.length > 0) {
      insights.push({
        type: 'warning',
        level: 'warning',
        title: 'Low Sentiment Alignment',
        description: `Some sentiment predictions may not align well with trade outcomes`,
        metrics: { 
          low_alignment_combinations: poorAlignment.length,
          worst_alignment: Math.min(...poorAlignment.map(r => parseFloat(r.alignment_percentage)))
        }
      });
    }

    return insights;
  }

  /**
   * Get news correlation summary for dashboard
   */
  async getNewsCorrelationSummary(userId) {
    try {
      if (!(await this.isNewsCorrelationEnabled(userId))) {
        return null;
      }

      const query = `
        SELECT 
          COUNT(*) as total_trades_with_news,
          ROUND((AVG(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100)::numeric, 2) as overall_win_rate,
          ROUND(AVG(pnl)::numeric, 2) as avg_pnl,
          COUNT(*) FILTER (WHERE news_sentiment = 'positive') as positive_news_trades,
          COUNT(*) FILTER (WHERE news_sentiment = 'negative') as negative_news_trades,
          COUNT(*) FILTER (WHERE news_sentiment = 'neutral') as neutral_news_trades,
          ROUND((AVG(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) FILTER (WHERE news_sentiment = 'positive') * 100)::numeric, 2) as positive_win_rate,
          ROUND((AVG(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) FILTER (WHERE news_sentiment = 'negative') * 100)::numeric, 2) as negative_win_rate
        FROM trades 
        WHERE user_id = $1 
        AND exit_time IS NOT NULL 
        AND exit_price IS NOT NULL 
        AND has_news = TRUE 
        AND news_sentiment IS NOT NULL
      `;

      const result = await db.query(query, [userId]);
      const data = result.rows[0];

      if (parseInt(data.total_trades_with_news) === 0) {
        return null;
      }

      return {
        total_trades_with_news: parseInt(data.total_trades_with_news),
        overall_win_rate: parseFloat(data.overall_win_rate) || 0,
        avg_pnl: parseFloat(data.avg_pnl) || 0,
        sentiment_breakdown: {
          positive: parseInt(data.positive_news_trades) || 0,
          negative: parseInt(data.negative_news_trades) || 0,
          neutral: parseInt(data.neutral_news_trades) || 0
        },
        performance_by_sentiment: {
          positive_win_rate: parseFloat(data.positive_win_rate) || 0,
          negative_win_rate: parseFloat(data.negative_win_rate) || 0
        }
      };

    } catch (error) {
      logger.logError(`Error getting news correlation summary: ${error.message}`);
      return null;
    }
  }

  /**
   * Get detailed trades and news for a specific performer combination
   */
  async getPerformerDetails(userId, options = {}) {
    try {
      if (!(await this.isNewsCorrelationEnabled(userId))) {
        return { error: 'News correlation analytics requires Pro tier' };
      }

      const { symbol, sentiment, side } = options;

      if (!symbol || !sentiment || !side) {
        return { error: 'Symbol, sentiment, and side are required' };
      }

      const query = `
        SELECT 
          t.id,
          t.symbol,
          t.trade_date,
          t.entry_time,
          t.exit_time,
          t.entry_price,
          t.exit_price,
          t.quantity,
          t.side,
          t.pnl,
          t.pnl_percent,
          t.news_sentiment,
          t.news_events
        FROM trades t
        WHERE t.user_id = $1 
        AND t.symbol = $2
        AND t.news_sentiment = $3
        AND t.side = $4
        AND t.exit_time IS NOT NULL 
        AND t.exit_price IS NOT NULL 
        AND t.has_news = TRUE 
        AND t.news_sentiment IS NOT NULL
        ORDER BY t.trade_date DESC
        LIMIT 50
      `;

      const result = await db.query(query, [userId, symbol, sentiment, side]);
      
      return result.rows.map(trade => ({
        ...trade,
        news_headlines: trade.news_events ? 
          (Array.isArray(trade.news_events) ? 
            trade.news_events.map(event => event.headline || event.title || event.summary).filter(Boolean) : 
            []) : 
          []
      }));

    } catch (error) {
      logger.logError(`Error getting performer details: ${error.message}`);
      return { error: 'Failed to fetch performer details' };
    }
  }
}

module.exports = new NewsCorrelationService();