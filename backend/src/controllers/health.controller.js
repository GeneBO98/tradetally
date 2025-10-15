const db = require('../config/database');
const logger = require('../utils/logger');
const aiService = require('../utils/aiService');

class HealthController {
  // POST /api/health/data - Submit health data from mobile app
  async submitHealthData(req, res) {
    try {
      const userId = req.user.id;
      const { healthData } = req.body;
      
      // Enhanced logging for debugging mobile app submissions
      console.log('\n🔔 HEALTH DATA SUBMISSION RECEIVED FROM MOBILE APP');
      console.log('  User ID:', userId);
      console.log('  User Email:', req.user.email);
      console.log('  Timestamp:', new Date().toISOString());
      console.log('  Request Headers:', {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'x-device-id': req.headers['x-device-id'] || 'not provided'
      });
      console.log('  Request Body:', JSON.stringify(req.body, null, 2));

      if (!Array.isArray(healthData)) {
        console.log('  ❌ ERROR: Health data must be an array');
        return res.status(400).json({
          success: false,
          message: 'Health data must be an array'
        });
      }

      logger.info(`Receiving ${healthData.length} health data points for user ${userId}`, 'health');
      console.log(`  📊 Processing ${healthData.length} health data points...`);

      // Debug: Count data types
      const dataTypeCounts = {};
      healthData.forEach(point => {
        dataTypeCounts[point.type] = (dataTypeCounts[point.type] || 0) + 1;
      });
      console.log(`  📊 Data types received:`, dataTypeCounts);
      logger.info(`Data types received: ${JSON.stringify(dataTypeCounts)}`, 'health');

      // Begin transaction
      await db.query('BEGIN');

      let insertedCount = 0;
      let updatedCount = 0;

      for (const dataPoint of healthData) {
        const { date, type, value, metadata = {}, timestamp } = dataPoint;

        // Validate required fields
        if (!date || !type || value === undefined) {
          logger.warn(`Invalid health data point: ${JSON.stringify(dataPoint)}`, 'health');
          continue;
        }

        // For time-series data (heart rate), use timestamp instead of date for uniqueness
        if (timestamp && type === 'heartRate') {
          // Insert individual time-series samples (heart rate at 1-minute intervals)
          const result = await db.query(`
            INSERT INTO health_data (user_id, date, data_type, value, metadata, timestamp, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (user_id, data_type, timestamp)
            WHERE timestamp IS NOT NULL
            DO UPDATE SET
              value = EXCLUDED.value,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `, [userId, date, type, value, JSON.stringify(metadata), timestamp]);

          if (result.rows[0].inserted) {
            insertedCount++;
          } else {
            updatedCount++;
          }
        } else {
          // Daily aggregates (sleep data)
          const result = await db.query(`
            INSERT INTO health_data (user_id, date, data_type, value, metadata, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (user_id, data_type, date)
            WHERE timestamp IS NULL
            DO UPDATE SET
              value = EXCLUDED.value,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `, [userId, date, type, value, JSON.stringify(metadata)]);

          if (result.rows[0].inserted) {
            insertedCount++;
          } else {
            updatedCount++;
          }
        }
      }

      await db.query('COMMIT');

      logger.info(`Health data submitted: ${insertedCount} inserted, ${updatedCount} updated for user ${userId}`, 'health');
      
      console.log('  ✅ SUCCESS: Health data processed');
      console.log(`     Inserted: ${insertedCount} new records`);
      console.log(`     Updated: ${updatedCount} existing records`);
      console.log(`     Total processed: ${insertedCount + updatedCount}`);
      console.log('='.repeat(60));

      res.status(200).json({
        success: true,
        message: 'Health data submitted successfully',
        summary: {
          inserted: insertedCount,
          updated: updatedCount,
          total: insertedCount + updatedCount
        }
      });

    } catch (error) {
      await db.query('ROLLBACK');
      logger.error(`Error submitting health data: ${error.message}`, 'health');
      res.status(500).json({
        success: false,
        message: 'Failed to submit health data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // GET /api/health/data - Get user's health data
  async getHealthData(req, res) {
    try {
      const userId = req.user.id;
      const { 
        startDate, 
        endDate, 
        dataType, 
        limit = 100,
        offset = 0 
      } = req.query;

      let query = `
        SELECT date, data_type, value, metadata, created_at
        FROM health_data 
        WHERE user_id = $1
      `;
      let params = [userId];
      let paramIndex = 2;

      if (startDate) {
        query += ` AND date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      if (dataType) {
        query += ` AND data_type = $${paramIndex}`;
        params.push(dataType);
        paramIndex++;
      }

      query += ` ORDER BY date DESC, data_type LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      res.status(200).json({
        success: true,
        data: result.rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: result.rows.length
        }
      });

    } catch (error) {
      logger.error(`Error getting health data: ${error.message}`, 'health');
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve health data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // POST /api/health/analyze - Perform health-trading correlation analysis
  async analyzeCorrelations(req, res) {
    try {
      const userId = req.user.id;
      const { startDate, endDate } = req.body;

      // Default to last 30 days if no range specified
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date(end.getTime() - (30 * 24 * 60 * 60 * 1000));

      logger.info(`Analyzing health-trading correlations for user ${userId} from ${start.toISOString()} to ${end.toISOString()}`, 'health');

      // Get health data for the date range
      const healthQuery = `
        SELECT date, data_type, value, metadata
        FROM health_data 
        WHERE user_id = $1 AND date >= $2 AND date <= $3
        ORDER BY date, data_type
      `;
      const healthData = await db.query(healthQuery, [userId, start.toISOString().split('T')[0], end.toISOString().split('T')[0]]);

      // Get trading data for the same period
      const tradesQuery = `
        SELECT 
          DATE(trade_date) as trade_date,
          SUM(pnl) as total_pnl,
          COUNT(*) as total_trades,
          AVG(pnl) as avg_pnl,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) as wins
        FROM trades 
        WHERE user_id = $1 AND trade_date >= $2 AND trade_date <= $3
        GROUP BY DATE(trade_date)
        ORDER BY trade_date
      `;
      const tradeData = await db.query(tradesQuery, [userId, start, end]);

      // Process and correlate the data
      const correlations = this.calculateCorrelations(healthData.rows, tradeData.rows);

      // Store correlation results
      if (correlations.length > 0) {
        await this.storeCorrelationResults(userId, correlations, start, end);
      }

      // Generate insights
      const insights = await this.generateInsights(userId, correlations);

      res.status(200).json({
        success: true,
        data: {
          correlations,
          insights,
          summary: {
            dateRange: { start: start.toISOString(), end: end.toISOString() },
            healthDataPoints: healthData.rows.length,
            tradingDays: tradeData.rows.length
          }
        }
      });

    } catch (error) {
      logger.error(`Error analyzing health correlations: ${error.message}`, 'health');
      res.status(500).json({
        success: false,
        message: 'Failed to analyze health correlations',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // GET /api/health/insights - Get health insights for user
  async getInsights(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 10 } = req.query;

      const query = `
        SELECT insight_type, title, description, confidence, is_actionable, created_at
        FROM health_insights 
        WHERE user_id = $1 AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result = await db.query(query, [userId, limit]);

      res.status(200).json({
        success: true,
        insights: result.rows
      });

    } catch (error) {
      logger.error(`Error getting health insights: ${error.message}`, 'health');
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve health insights',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Helper method to calculate correlations
  calculateCorrelations(healthData, tradeData) {
    const correlations = [];
    
    // Group health data by date and type
    const healthByDate = {};
    healthData.forEach(item => {
      const dateKey = item.date.toISOString().split('T')[0];
      if (!healthByDate[dateKey]) healthByDate[dateKey] = {};
      healthByDate[dateKey][item.data_type] = item;
    });

    // Create correlations for dates with both health and trade data
    tradeData.forEach(trade => {
      const dateKey = trade.trade_date.toISOString().split('T')[0];
      const healthForDate = healthByDate[dateKey];

      if (healthForDate) {
        const sleepData = healthForDate['sleep'];
        const heartRateData = healthForDate['heart_rate'];

        const correlation = {
          date: trade.trade_date,
          sleep_hours: sleepData ? parseFloat(sleepData.value) : null,
          sleep_quality: sleepData?.metadata?.sleepQuality || null,
          avg_heart_rate: heartRateData ? parseFloat(heartRateData.value) : null,
          heart_rate_variability: heartRateData?.metadata?.hrv || null,
          total_pnl: parseFloat(trade.total_pnl),
          total_trades: parseInt(trade.total_trades),
          avg_pnl: parseFloat(trade.avg_pnl),
          win_rate: (parseFloat(trade.wins) / parseInt(trade.total_trades)) * 100
        };

        correlations.push(correlation);
      }
    });

    return correlations;
  }

  // Helper method to store correlation results
  async storeCorrelationResults(userId, correlations, startDate, endDate) {
    try {
      for (const correlation of correlations) {
        await db.query(`
          INSERT INTO health_trading_correlations (
            user_id, analysis_date, date_range_start, date_range_end,
            sleep_hours, sleep_quality, avg_heart_rate, heart_rate_variability,
            total_pnl, win_rate, total_trades, average_pnl, correlation_score
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (user_id, analysis_date) DO UPDATE SET
            sleep_hours = EXCLUDED.sleep_hours,
            sleep_quality = EXCLUDED.sleep_quality,
            avg_heart_rate = EXCLUDED.avg_heart_rate,
            heart_rate_variability = EXCLUDED.heart_rate_variability,
            total_pnl = EXCLUDED.total_pnl,
            win_rate = EXCLUDED.win_rate,
            total_trades = EXCLUDED.total_trades,
            average_pnl = EXCLUDED.average_pnl,
            correlation_score = EXCLUDED.correlation_score
        `, [
          userId, correlation.date, startDate, endDate,
          correlation.sleep_hours, correlation.sleep_quality,
          correlation.avg_heart_rate, correlation.heart_rate_variability,
          correlation.total_pnl, correlation.win_rate,
          correlation.total_trades, correlation.avg_pnl,
          0 // TODO: Calculate actual correlation score
        ]);
      }
    } catch (error) {
      logger.error(`Error storing correlation results: ${error.message}`, 'health');
    }
  }

  // Helper method to generate insights
  async generateInsights(userId, correlations) {
    const insights = [];

    if (correlations.length < 3) {
      return [{
        type: 'insufficient_data',
        title: 'Need More Data',
        description: 'Collect at least 3 days of health and trading data to generate meaningful insights.',
        confidence: 0.0,
        actionable: false
      }];
    }

    // Try to use AI for insights if configured
    try {
      const aiInsights = await this.generateAIInsights(userId, correlations);
      if (aiInsights && aiInsights.length > 0) {
        insights.push(...aiInsights);
      }
    } catch (aiError) {
      console.log('AI insights generation failed, falling back to rule-based insights:', aiError.message);

      // Fall back to rule-based analysis
      // Analyze sleep vs trading performance
      const sleepInsight = this.analyzeSleepCorrelation(correlations);
      if (sleepInsight) insights.push(sleepInsight);

      // Analyze heart rate vs trading performance
      const heartRateInsight = this.analyzeHeartRateCorrelation(correlations);
      if (heartRateInsight) insights.push(heartRateInsight);

      // Analyze composure based on heart rate during individual trades
      const composureInsight = await this.analyzeComposure(userId);
      if (composureInsight) insights.push(composureInsight);
    }

    // Clear old insights before storing new ones
    try {
      await db.query(`DELETE FROM health_insights WHERE user_id = $1`, [userId]);
    } catch (error) {
      logger.error(`Error clearing old insights: ${error.message}`, 'health');
    }

    // Store new insights in database
    for (const insight of insights) {
      try {
        await db.query(`
          INSERT INTO health_insights (user_id, insight_type, title, description, confidence, is_actionable)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [userId, insight.type, insight.title, insight.description, insight.confidence, insight.actionable]);
      } catch (error) {
        logger.error(`Error storing insight: ${error.message}`, 'health');
      }
    }

    return insights;
  }

  // Helper methods for specific analysis
  async generateAIInsights(userId, correlations) {
    // Prepare data summary for AI
    const avgSleepHours = correlations.filter(c => c.sleep_hours).reduce((sum, c) => sum + c.sleep_hours, 0) / correlations.filter(c => c.sleep_hours).length || 0;
    const avgHeartRate = correlations.filter(c => c.avg_heart_rate).reduce((sum, c) => sum + c.avg_heart_rate, 0) / correlations.filter(c => c.avg_heart_rate).length || 0;
    const avgHRV = correlations.filter(c => c.heart_rate_variability).reduce((sum, c) => sum + c.heart_rate_variability, 0) / correlations.filter(c => c.heart_rate_variability).length || 0;

    // Calculate performance by health conditions
    const goodSleepDays = correlations.filter(c => c.sleep_hours >= 7);
    const poorSleepDays = correlations.filter(c => c.sleep_hours < 6);
    const goodSleepPnL = goodSleepDays.reduce((sum, c) => sum + c.total_pnl, 0) / (goodSleepDays.length || 1);
    const poorSleepPnL = poorSleepDays.reduce((sum, c) => sum + c.total_pnl, 0) / (poorSleepDays.length || 1);

    const highHRVDays = correlations.filter(c => c.heart_rate_variability > avgHRV);
    const lowHRVDays = correlations.filter(c => c.heart_rate_variability <= avgHRV);
    const highHRVWinRate = highHRVDays.reduce((sum, c) => sum + c.win_rate, 0) / (highHRVDays.length || 1);
    const lowHRVWinRate = lowHRVDays.reduce((sum, c) => sum + c.win_rate, 0) / (lowHRVDays.length || 1);

    const prompt = `
    Analyze the following health and trading performance data to generate actionable insights:

    HEALTH METRICS:
    - Average sleep hours: ${avgSleepHours.toFixed(1)} hours/night
    - Average heart rate: ${avgHeartRate.toFixed(0)} BPM
    - Average HRV: ${avgHRV.toFixed(0)} ms

    PERFORMANCE CORRELATIONS:
    - Days with 7+ hours sleep: Avg P&L = $${goodSleepPnL.toFixed(2)} (${goodSleepDays.length} days)
    - Days with <6 hours sleep: Avg P&L = $${poorSleepPnL.toFixed(2)} (${poorSleepDays.length} days)
    - Days with high HRV (>${avgHRV.toFixed(0)}ms): Win rate = ${highHRVWinRate.toFixed(1)}% (${highHRVDays.length} days)
    - Days with low HRV: Win rate = ${lowHRVWinRate.toFixed(1)}% (${lowHRVDays.length} days)

    DETAILED DATA:
    ${JSON.stringify(correlations.slice(0, 10), null, 2)}

    Based on this data, generate 3-5 specific, actionable insights about how this trader's health metrics correlate with their trading performance. Focus on:
    1. Sleep patterns and their impact on P&L
    2. Heart rate variability and stress levels affecting win rates
    3. Specific recommendations for optimal trading conditions based on health metrics
    4. Warning signs to watch for (health conditions that correlate with losses)

    Return the insights as a JSON array with the following structure:
    [
      {
        "type": "sleep_quality|heart_rate|stress_level|performance_pattern",
        "title": "Brief, impactful title",
        "description": "Detailed explanation with specific numbers from the data",
        "confidence": 0.0-1.0 (based on data strength),
        "actionable": true/false
      }
    ]

    IMPORTANT: Base insights on the actual data provided. Be specific with numbers and correlations found in the data.
    `;

    try {
      const response = await aiService.generateResponse(userId, prompt, {
        temperature: 0.7,
        format: 'json'
      });

      // Parse AI response
      let aiInsights;
      if (typeof response === 'string') {
        // Extract JSON from response if it's wrapped in text
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          aiInsights = JSON.parse(jsonMatch[0]);
        } else {
          aiInsights = JSON.parse(response);
        }
      } else {
        aiInsights = response;
      }

      // Validate and format insights
      return aiInsights.map(insight => ({
        type: insight.type || 'general',
        title: insight.title || 'Health Insight',
        description: insight.description || '',
        confidence: Math.min(1, Math.max(0, insight.confidence || 0.5)),
        actionable: insight.actionable !== false
      }));

    } catch (error) {
      console.error('Error generating AI insights:', error);
      throw error;
    }
  }

  analyzeSleepCorrelation(correlations) {
    const validData = correlations.filter(c => c.sleep_hours > 0);
    if (validData.length < 3) return null;

    const goodSleepDays = validData.filter(c => c.sleep_hours >= 7);
    const poorSleepDays = validData.filter(c => c.sleep_hours < 6);

    if (goodSleepDays.length === 0 || poorSleepDays.length === 0) return null;

    const goodSleepAvgPnL = goodSleepDays.reduce((sum, c) => sum + c.total_pnl, 0) / goodSleepDays.length;
    const poorSleepAvgPnL = poorSleepDays.reduce((sum, c) => sum + c.total_pnl, 0) / poorSleepDays.length;

    const improvement = goodSleepAvgPnL - poorSleepAvgPnL;

    if (improvement > 50) { // $50+ difference
      return {
        type: 'sleep_quality',
        title: 'Sleep Affects Trading Profits',
        description: `You average $${Math.round(improvement)} more profit on days with 7+ hours of sleep. Consider maintaining a consistent sleep schedule.`,
        confidence: 0.8,
        actionable: true
      };
    }

    return null;
  }

  analyzeHeartRateCorrelation(correlations) {
    const validData = correlations.filter(c => c.avg_heart_rate > 0 && c.heart_rate_variability > 0);
    if (validData.length < 3) return null;

    const avgHRV = validData.reduce((sum, c) => sum + c.heart_rate_variability, 0) / validData.length;

    const highHRVDays = validData.filter(c => c.heart_rate_variability > avgHRV);
    const lowHRVDays = validData.filter(c => c.heart_rate_variability < avgHRV);

    if (highHRVDays.length === 0 || lowHRVDays.length === 0) return null;

    const highHRVWinRate = highHRVDays.reduce((sum, c) => sum + c.win_rate, 0) / highHRVDays.length;
    const lowHRVWinRate = lowHRVDays.reduce((sum, c) => sum + c.win_rate, 0) / lowHRVDays.length;

    const difference = highHRVWinRate - lowHRVWinRate;

    if (difference > 10) { // 10% better win rate
      return {
        type: 'heart_rate',
        title: 'Heart Rate Variability Affects Performance',
        description: `Higher HRV correlates with ${Math.round(difference)}% better win rate. Consider stress management techniques.`,
        confidence: 0.7,
        actionable: true
      };
    }

    return null;
  }

  async analyzeComposure(userId) {
    try {
      // Get trades with heart rate data (matched by timestamp)
      const tradesQuery = `
        SELECT
          id,
          pnl,
          heart_rate,
          CASE
            WHEN pnl > 100 THEN 'big_win'
            WHEN pnl > 0 THEN 'win'
            WHEN pnl < -100 THEN 'big_loss'
            ELSE 'loss'
          END as trade_outcome
        FROM trades
        WHERE user_id = $1
        AND heart_rate IS NOT NULL
        AND pnl IS NOT NULL
      `;
      const result = await db.query(tradesQuery, [userId]);

      if (result.rows.length < 10) return null; // Need at least 10 trades for meaningful analysis

      // Group by outcome
      const bigWins = result.rows.filter(t => t.trade_outcome === 'big_win');
      const bigLosses = result.rows.filter(t => t.trade_outcome === 'big_loss');

      if (bigWins.length === 0 || bigLosses.length === 0) return null;

      // Calculate average heart rate for each group
      const avgHRBigWins = bigWins.reduce((sum, t) => sum + parseFloat(t.heart_rate), 0) / bigWins.length;
      const avgHRBigLosses = bigLosses.reduce((sum, t) => sum + parseFloat(t.heart_rate), 0) / bigLosses.length;

      const hrDifference = avgHRBigLosses - avgHRBigWins;

      // If heart rate is significantly higher during losses, indicates poor composure
      if (hrDifference > 10) {
        return {
          type: 'composure',
          title: 'Elevated Heart Rate During Losses',
          description: `Your heart rate averages ${Math.round(avgHRBigLosses)} BPM during big losses vs ${Math.round(avgHRBigWins)} BPM during big wins. This ${Math.round(hrDifference)} BPM difference suggests heightened stress during losing trades. Consider implementing breathing exercises or taking breaks when experiencing losses.`,
          confidence: 0.85,
          actionable: true
        };
      }

      // If heart rate is significantly higher during wins, might indicate overexcitement
      if (hrDifference < -10) {
        return {
          type: 'composure',
          title: 'Elevated Heart Rate During Wins',
          description: `Your heart rate averages ${Math.round(avgHRBigWins)} BPM during big wins vs ${Math.round(avgHRBigLosses)} BPM during losses. This ${Math.round(Math.abs(hrDifference))} BPM difference suggests overexcitement during winning trades. Stay calm and focused to avoid overtrading.`,
          confidence: 0.85,
          actionable: true
        };
      }

      // Good composure
      if (Math.abs(hrDifference) < 5) {
        return {
          type: 'composure',
          title: 'Excellent Trading Composure',
          description: `Your heart rate remains consistent between wins (${Math.round(avgHRBigWins)} BPM) and losses (${Math.round(avgHRBigLosses)} BPM), showing excellent emotional control during trading.`,
          confidence: 0.9,
          actionable: false
        };
      }

      return null;
    } catch (error) {
      logger.error(`Error analyzing composure: ${error.message}`, 'health');
      return null;
    }
  }

  // POST /api/health/correlate-trades - Correlate health data with trades by timestamp
  async correlateHealthWithTrades(req, res) {
    try {
      const userId = req.user.id;

      console.log(`[HEALTH] Correlating health data with trades for user ${userId}`);

      // Get all trades with entry_time for this user
      const tradesQuery = `
        SELECT id, trade_date, entry_time
        FROM trades
        WHERE user_id = $1
        AND entry_time IS NOT NULL
        ORDER BY entry_time
      `;
      const tradesResult = await db.query(tradesQuery, [userId]);
      console.log(`[HEALTH] Found ${tradesResult.rows.length} trades with entry_time`);

      // Get time-series heart rate data
      const heartRateQuery = `
        SELECT timestamp, value
        FROM health_data
        WHERE user_id = $1
        AND data_type = 'heartRate'
        AND timestamp IS NOT NULL
        ORDER BY timestamp
      `;
      const heartRateResult = await db.query(heartRateQuery, [userId]);
      console.log(`[HEALTH] Found ${heartRateResult.rows.length} heart rate samples with timestamps`);

      // Get daily sleep data
      const sleepQuery = `
        SELECT date, data_type, value, metadata
        FROM health_data
        WHERE user_id = $1
        AND data_type = 'sleep'
        AND timestamp IS NULL
        ORDER BY date
      `;
      const sleepResult = await db.query(sleepQuery, [userId]);

      // Group sleep data by date
      const sleepByDate = {};
      for (const row of sleepResult.rows) {
        const dateKey = row.date.toISOString().split('T')[0];

        // Parse metadata if it's a string
        let metadata = row.metadata;
        if (typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch (e) {
            console.error('Failed to parse sleep metadata:', e);
            metadata = {};
          }
        }

        sleepByDate[dateKey] = {
          value: row.value,
          metadata: metadata || {}
        };
      }

      // Update trades with heart rate matching by timestamp (within ±2 minutes)
      let updatedCount = 0;
      for (const trade of tradesResult.rows) {
        const tradeTime = new Date(trade.entry_time);

        // Find closest heart rate sample within ±2 minutes
        const matchWindow = 2 * 60 * 1000; // 2 minutes in milliseconds
        let closestHR = null;
        let minDiff = Infinity;

        for (const hrSample of heartRateResult.rows) {
          const hrTime = new Date(hrSample.timestamp);
          const timeDiff = Math.abs(tradeTime - hrTime);

          if (timeDiff <= matchWindow && timeDiff < minDiff) {
            minDiff = timeDiff;
            closestHR = hrSample.value;
          }
        }

        // Get sleep data for the trade date
        const tradeDateKey = trade.trade_date.toISOString().split('T')[0];
        const sleep = sleepByDate[tradeDateKey];

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        let heartRateStress = null;
        if (closestHR !== null) {
          updateFields.push(`heart_rate = $${paramIndex++}`);
          updateValues.push(closestHR);

          // Calculate heart rate component of stress (0-1 scale)
          // Normal resting: 60-80 BPM (low stress)
          // Slightly elevated: 80-100 BPM (medium stress)
          // Elevated: 100+ BPM (high stress)
          if (closestHR >= 100) {
            heartRateStress = 0.8;
          } else if (closestHR >= 90) {
            heartRateStress = 0.6;
          } else if (closestHR >= 80) {
            heartRateStress = 0.4;
          } else if (closestHR >= 70) {
            heartRateStress = 0.2;
          } else {
            heartRateStress = 0.1;
          }
        }

        let sleepQualityFactor = null;
        if (sleep) {
          updateFields.push(`sleep_hours = $${paramIndex++}`);
          updateValues.push(sleep.value);

          if (sleep.metadata && sleep.metadata.sleepQuality) {
            updateFields.push(`sleep_score = $${paramIndex++}`);
            updateValues.push(sleep.metadata.sleepQuality * 100);
            sleepQualityFactor = sleep.metadata.sleepQuality; // 0-1 scale
          }
        }

        // Calculate composite stress level
        // Combine heart rate stress with sleep quality (poor sleep increases stress)
        if (heartRateStress !== null || sleepQualityFactor !== null) {
          let stressLevel = 0;

          if (heartRateStress !== null && sleepQualityFactor !== null) {
            // Both metrics available: combine them
            // Poor sleep (low quality) amplifies heart rate stress
            // Formula: HR stress * (1 + inverse of sleep quality)
            // Good sleep (0.8-1.0) reduces stress, poor sleep (0-0.5) increases it
            const sleepStressMultiplier = 1 + (1 - sleepQualityFactor);
            stressLevel = Math.min(1.0, heartRateStress * sleepStressMultiplier);
          } else if (heartRateStress !== null) {
            // Only heart rate available
            stressLevel = heartRateStress;
          } else if (sleepQualityFactor !== null) {
            // Only sleep quality available: inverse relationship
            // Poor sleep = higher stress
            stressLevel = Math.max(0.1, 1 - sleepQualityFactor);
          }

          updateFields.push(`stress_level = $${paramIndex++}`);
          updateValues.push(stressLevel);
        }

        if (updateFields.length > 0) {
          updateValues.push(trade.id);
          const updateQuery = `
            UPDATE trades
            SET ${updateFields.join(', ')}, updated_at = NOW()
            WHERE id = $${paramIndex++}
            RETURNING id
          `;

          const result = await db.query(updateQuery, updateValues);
          updatedCount += result.rowCount;
        }
      }

      console.log(`[HEALTH] Updated ${updatedCount} trades with health data`);

      res.status(200).json({
        success: true,
        message: `Updated ${updatedCount} trades with health data`,
        updatedCount,
        heartRateSamples: heartRateResult.rows.length,
        tradesProcessed: tradesResult.rows.length
      });

    } catch (error) {
      console.error(`[HEALTH] Error correlating health with trades:`, error);
      logger.error(`Error correlating health with trades: ${error.message}`, 'health');
      res.status(500).json({
        success: false,
        message: 'Failed to correlate health data with trades',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // GET /api/health/insights - Get user's health insights
  async getHealthInsights(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 10 } = req.query;

      const query = `
        SELECT
          insight_type as "insightType",
          title,
          description,
          confidence,
          is_actionable as "isActionable",
          created_at
        FROM health_insights
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result = await db.query(query, [userId, limit]);

      res.status(200).json({
        success: true,
        insights: result.rows
      });

    } catch (error) {
      logger.error(`Error retrieving health insights: ${error.message}`, 'health');
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve health insights',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new HealthController();