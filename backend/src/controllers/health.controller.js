const db = require('../config/database');
const logger = require('../utils/logger');

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

      // Begin transaction
      await db.query('BEGIN');

      let insertedCount = 0;
      let updatedCount = 0;

      for (const dataPoint of healthData) {
        const { date, type, value, metadata = {} } = dataPoint;

        // Validate required fields
        if (!date || !type || value === undefined) {
          logger.warn(`Invalid health data point: ${JSON.stringify(dataPoint)}`, 'health');
          continue;
        }

        // Upsert health data (insert or update if exists)
        const result = await db.query(`
          INSERT INTO health_data (user_id, date, data_type, value, metadata, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (user_id, date, data_type) 
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

    // Analyze sleep vs trading performance
    const sleepInsight = this.analyzeSleepCorrelation(correlations);
    if (sleepInsight) insights.push(sleepInsight);

    // Analyze heart rate vs trading performance  
    const heartRateInsight = this.analyzeHeartRateCorrelation(correlations);
    if (heartRateInsight) insights.push(heartRateInsight);

    // Store insights in database
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
}

module.exports = new HealthController();