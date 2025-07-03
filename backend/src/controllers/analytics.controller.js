const db = require('../config/database');

const analyticsController = {
  async getOverview(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      
      let dateFilter = '';
      const params = [req.user.id];
      
      if (startDate) {
        dateFilter += ' AND trade_date >= $2';
        params.push(startDate);
      }
      
      if (endDate) {
        dateFilter += ` AND trade_date <= $${params.length + 1}`;
        params.push(endDate);
      }

      const overviewQuery = `
        SELECT 
          COUNT(*) as total_trades,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN pnl < 0 THEN 1 END) as losing_trades,
          COUNT(CASE WHEN pnl = 0 THEN 1 END) as breakeven_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0) as avg_win,
          COALESCE(AVG(CASE WHEN pnl < 0 THEN pnl END), 0) as avg_loss,
          COALESCE(MAX(pnl), 0) as best_trade,
          COALESCE(MIN(pnl), 0) as worst_trade
        FROM trades
        WHERE user_id = $1 ${dateFilter}
      `;

      const result = await db.query(overviewQuery, params);
      const overview = result.rows[0];

      overview.win_rate = overview.total_trades > 0 
        ? (overview.winning_trades / overview.total_trades * 100).toFixed(2)
        : 0;

      overview.profit_factor = overview.avg_loss !== 0
        ? Math.abs(overview.avg_win / overview.avg_loss).toFixed(2)
        : 0;

      res.json({ overview });
    } catch (error) {
      next(error);
    }
  },

  async getPerformance(req, res, next) {
    try {
      const { period = 'daily', startDate, endDate } = req.query;
      
      let groupBy;
      switch (period) {
        case 'weekly':
          groupBy = "DATE_TRUNC('week', trade_date)";
          break;
        case 'monthly':
          groupBy = "DATE_TRUNC('month', trade_date)";
          break;
        default:
          groupBy = 'trade_date';
      }

      let dateFilter = '';
      const params = [req.user.id];
      
      if (startDate) {
        dateFilter += ' AND trade_date >= $2';
        params.push(startDate);
      }
      
      if (endDate) {
        dateFilter += ` AND trade_date <= $${params.length + 1}`;
        params.push(endDate);
      }

      const performanceQuery = `
        SELECT 
          ${groupBy} as period,
          COUNT(*) as trades,
          COALESCE(SUM(pnl), 0) as pnl,
          COALESCE(SUM(SUM(pnl)) OVER (ORDER BY ${groupBy}), 0) as cumulative_pnl
        FROM trades
        WHERE user_id = $1 ${dateFilter}
        GROUP BY ${groupBy}
        ORDER BY period
      `;

      const result = await db.query(performanceQuery, params);
      
      res.json({ performance: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getSymbolStats(req, res, next) {
    try {
      const { startDate, endDate, limit = 10 } = req.query;
      
      let dateFilter = '';
      const params = [req.user.id];
      
      if (startDate) {
        dateFilter += ' AND trade_date >= $2';
        params.push(startDate);
      }
      
      if (endDate) {
        dateFilter += ` AND trade_date <= $${params.length + 1}`;
        params.push(endDate);
      }

      params.push(parseInt(limit));

      const symbolQuery = `
        SELECT 
          symbol,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(AVG(pnl_percent), 0) as avg_pnl_percent
        FROM trades
        WHERE user_id = $1 ${dateFilter}
        GROUP BY symbol
        ORDER BY total_pnl DESC
        LIMIT $${params.length}
      `;

      const result = await db.query(symbolQuery, params);
      
      res.json({ symbols: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getTagStats(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      
      let dateFilter = '';
      const params = [req.user.id];
      
      if (startDate) {
        dateFilter += ' AND trade_date >= $2';
        params.push(startDate);
      }
      
      if (endDate) {
        dateFilter += ` AND trade_date <= $${params.length + 1}`;
        params.push(endDate);
      }

      const tagQuery = `
        SELECT 
          UNNEST(tags) as tag,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl
        FROM trades
        WHERE user_id = $1 ${dateFilter} AND tags IS NOT NULL
        GROUP BY tag
        ORDER BY total_trades DESC
      `;

      const result = await db.query(tagQuery, params);
      
      res.json({ tags: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getCalendarData(req, res, next) {
    try {
      const { year, month } = req.query;
      
      const params = [req.user.id];
      let dateFilter = '';
      
      if (year && month) {
        const startDate = `${year}-${month.padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        dateFilter = ' AND trade_date >= $2 AND trade_date <= $3';
        params.push(startDate, endDate);
      }

      const calendarQuery = `
        SELECT 
          trade_date,
          COUNT(*) as trades,
          COALESCE(SUM(pnl), 0) as daily_pnl
        FROM trades
        WHERE user_id = $1 ${dateFilter}
        GROUP BY trade_date
        ORDER BY trade_date
      `;

      const result = await db.query(calendarQuery, params);
      
      res.json({ calendar: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async exportData(req, res, next) {
    try {
      const { format = 'csv', startDate, endDate } = req.query;
      
      let dateFilter = '';
      const params = [req.user.id];
      
      if (startDate) {
        dateFilter += ' AND trade_date >= $2';
        params.push(startDate);
      }
      
      if (endDate) {
        dateFilter += ` AND trade_date <= $${params.length + 1}`;
        params.push(endDate);
      }

      const exportQuery = `
        SELECT * FROM trades
        WHERE user_id = $1 ${dateFilter}
        ORDER BY trade_date DESC, entry_time DESC
      `;

      const result = await db.query(exportQuery, params);
      
      if (format === 'csv') {
        const csv = convertToCSV(result.rows);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="trades.csv"');
        res.send(csv);
      } else {
        res.json({ trades: result.rows });
      }
    } catch (error) {
      next(error);
    }
  },

  async getChartData(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      
      let dateFilter = '';
      const params = [req.user.id];
      
      if (startDate) {
        dateFilter += ' AND trade_date >= $2';
        params.push(startDate);
      }
      
      if (endDate) {
        dateFilter += ` AND trade_date <= $${params.length + 1}`;
        params.push(endDate);
      }

      // Trade Distribution by Price
      const tradeDistributionQuery = `
        WITH price_ranges AS (
          SELECT 
            CASE 
              WHEN entry_price < 2 THEN '< $2'
              WHEN entry_price < 5 THEN '$2-4.99'
              WHEN entry_price < 10 THEN '$5-9.99'
              WHEN entry_price < 20 THEN '$10-19.99'
              WHEN entry_price < 50 THEN '$20-49.99'
              WHEN entry_price < 100 THEN '$50-99.99'
              WHEN entry_price < 200 THEN '$100-199.99'
              ELSE '$200+'
            END as price_range,
            CASE 
              WHEN entry_price < 2 THEN 1
              WHEN entry_price < 5 THEN 2
              WHEN entry_price < 10 THEN 3
              WHEN entry_price < 20 THEN 4
              WHEN entry_price < 50 THEN 5
              WHEN entry_price < 100 THEN 6
              WHEN entry_price < 200 THEN 7
              ELSE 8
            END as range_order
          FROM trades
          WHERE user_id = $1 ${dateFilter}
        )
        SELECT price_range, COUNT(*) as trade_count
        FROM price_ranges
        GROUP BY price_range, range_order
        ORDER BY range_order
      `;

      // Performance by Price
      const performanceByPriceQuery = `
        WITH price_ranges AS (
          SELECT 
            CASE 
              WHEN entry_price < 2 THEN '< $2'
              WHEN entry_price < 5 THEN '$2-4.99'
              WHEN entry_price < 10 THEN '$5-9.99'
              WHEN entry_price < 20 THEN '$10-19.99'
              WHEN entry_price < 50 THEN '$20-49.99'
              WHEN entry_price < 100 THEN '$50-99.99'
              WHEN entry_price < 200 THEN '$100-199.99'
              ELSE '$200+'
            END as price_range,
            CASE 
              WHEN entry_price < 2 THEN 1
              WHEN entry_price < 5 THEN 2
              WHEN entry_price < 10 THEN 3
              WHEN entry_price < 20 THEN 4
              WHEN entry_price < 50 THEN 5
              WHEN entry_price < 100 THEN 6
              WHEN entry_price < 200 THEN 7
              ELSE 8
            END as range_order,
            pnl
          FROM trades
          WHERE user_id = $1 ${dateFilter}
        )
        SELECT price_range, COALESCE(SUM(pnl), 0) as total_pnl
        FROM price_ranges
        GROUP BY price_range, range_order
        ORDER BY range_order
      `;

      // Performance by Volume
      const performanceByVolumeQuery = `
        WITH volume_ranges AS (
          SELECT 
            CASE 
              WHEN quantity BETWEEN 2 AND 4 THEN '2-4'
              WHEN quantity BETWEEN 5 AND 9 THEN '5-9'
              WHEN quantity BETWEEN 10 AND 19 THEN '10-19'
              WHEN quantity BETWEEN 20 AND 49 THEN '20-49'
              WHEN quantity BETWEEN 50 AND 99 THEN '50-99'
              WHEN quantity BETWEEN 100 AND 499 THEN '100-500'
              WHEN quantity BETWEEN 500 AND 999 THEN '500-999'
              WHEN quantity BETWEEN 1000 AND 1999 THEN '1K-2K'
              WHEN quantity BETWEEN 2000 AND 2999 THEN '2K-3K'
              WHEN quantity BETWEEN 3000 AND 4999 THEN '3K-5K'
              WHEN quantity BETWEEN 5000 AND 9999 THEN '5K-10K'
              WHEN quantity BETWEEN 10000 AND 19999 THEN '10K-20K'
              WHEN quantity >= 20000 THEN '20K+'
              ELSE 'Other'
            END as volume_range,
            CASE 
              WHEN quantity BETWEEN 2 AND 4 THEN 1
              WHEN quantity BETWEEN 5 AND 9 THEN 2
              WHEN quantity BETWEEN 10 AND 19 THEN 3
              WHEN quantity BETWEEN 20 AND 49 THEN 4
              WHEN quantity BETWEEN 50 AND 99 THEN 5
              WHEN quantity BETWEEN 100 AND 499 THEN 6
              WHEN quantity BETWEEN 500 AND 999 THEN 7
              WHEN quantity BETWEEN 1000 AND 1999 THEN 8
              WHEN quantity BETWEEN 2000 AND 2999 THEN 9
              WHEN quantity BETWEEN 3000 AND 4999 THEN 10
              WHEN quantity BETWEEN 5000 AND 9999 THEN 11
              WHEN quantity BETWEEN 10000 AND 19999 THEN 12
              WHEN quantity >= 20000 THEN 13
              ELSE 14
            END as range_order,
            pnl
          FROM trades
          WHERE user_id = $1 ${dateFilter}
        )
        SELECT volume_range, COALESCE(SUM(pnl), 0) as total_pnl
        FROM volume_ranges
        GROUP BY volume_range, range_order
        ORDER BY range_order
      `;

      // Performance by Hold Time
      const performanceByHoldTimeQuery = `
        WITH hold_time_analysis AS (
          SELECT 
            CASE 
              WHEN entry_time IS NULL OR exit_time IS NULL THEN 'Open Position'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 60 THEN '< 1 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 300 THEN '1-5 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 900 THEN '5-15 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 1800 THEN '15-30 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 3600 THEN '30-60 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 7200 THEN '1-2 hours'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 14400 THEN '2-4 hours'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 86400 THEN '4-24 hours'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 604800 THEN '1-7 days'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 2592000 THEN '1-4 weeks'
              ELSE '1+ months'
            END as hold_time_range,
            CASE 
              WHEN entry_time IS NULL OR exit_time IS NULL THEN 0
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 60 THEN 1
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 300 THEN 2
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 900 THEN 3
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 1800 THEN 4
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 3600 THEN 5
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 7200 THEN 6
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 14400 THEN 7
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 86400 THEN 8
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 604800 THEN 9
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 2592000 THEN 10
              ELSE 11
            END as range_order,
            pnl,
            CASE WHEN pnl > 0 THEN 1 ELSE 0 END as is_winner
          FROM trades
          WHERE user_id = $1 ${dateFilter} AND pnl IS NOT NULL
        )
        SELECT 
          hold_time_range, 
          COALESCE(SUM(pnl), 0) as total_pnl,
          COUNT(*) as trade_count,
          SUM(is_winner) as winning_trades
        FROM hold_time_analysis
        GROUP BY hold_time_range, range_order
        ORDER BY range_order
      `;

      const [tradeDistResult, perfByPriceResult, perfByVolumeResult, perfByHoldTimeResult] = await Promise.all([
        db.query(tradeDistributionQuery, params),
        db.query(performanceByPriceQuery, params),
        db.query(performanceByVolumeQuery, params),
        db.query(performanceByHoldTimeQuery, params)
      ]);

      console.log('Chart data query results:', {
        tradeDistribution: tradeDistResult.rows,
        performanceByPrice: perfByPriceResult.rows,
        performanceByVolume: perfByVolumeResult.rows,
        performanceByHoldTime: perfByHoldTimeResult.rows
      });

      // Process data into arrays matching the chart labels
      const priceLabels = ['< $2', '$2-4.99', '$5-9.99', '$10-19.99', '$20-49.99', '$50-99.99', '$100-199.99', '$200+'];
      const volumeLabels = ['2-4', '5-9', '10-19', '20-49', '50-99', '100-500', '500-999', '1K-2K', '2K-3K', '3K-5K', '5K-10K', '10K-20K', '20K+'];
      const holdTimeLabels = ['< 1 min', '1-5 min', '5-15 min', '15-30 min', '30-60 min', '1-2 hours', '2-4 hours', '4-24 hours', '1-7 days', '1-4 weeks', '1+ months'];

      const tradeDistribution = priceLabels.map(label => {
        const found = tradeDistResult.rows.find(row => row.price_range === label);
        return found ? parseInt(found.trade_count) : 0;
      });

      const performanceByPrice = priceLabels.map(label => {
        const found = perfByPriceResult.rows.find(row => row.price_range === label);
        return found ? parseFloat(found.total_pnl) : 0;
      });

      const performanceByVolume = volumeLabels.map(label => {
        const found = perfByVolumeResult.rows.find(row => row.volume_range === label);
        return found ? parseFloat(found.total_pnl) : 0;
      });

      const performanceByHoldTime = holdTimeLabels.map(label => {
        const found = perfByHoldTimeResult.rows.find(row => row.hold_time_range === label);
        return found ? parseFloat(found.total_pnl) : 0;
      });

      // Day of Week Performance
      const dayOfWeekQuery = `
        SELECT 
          EXTRACT(DOW FROM trade_date) as day_of_week,
          COUNT(*) as trade_count,
          COALESCE(SUM(pnl), 0) as total_pnl
        FROM trades
        WHERE user_id = $1 ${dateFilter}
        GROUP BY EXTRACT(DOW FROM trade_date)
        ORDER BY EXTRACT(DOW FROM trade_date)
      `;

      const dayOfWeekResult = await db.query(dayOfWeekQuery, params);

      // Process day of week data (0=Sunday, 1=Monday, ..., 6=Saturday)
      const dayOfWeekData = [];
      for (let i = 0; i < 7; i++) {
        const found = dayOfWeekResult.rows.find(row => parseInt(row.day_of_week) === i);
        dayOfWeekData.push({
          total_pnl: found ? parseFloat(found.total_pnl) : 0,
          trade_count: found ? parseInt(found.trade_count) : 0
        });
      }

      // Daily Volume Data
      const dailyVolumeQuery = `
        SELECT 
          trade_date,
          COALESCE(SUM(quantity), 0) as total_volume,
          COUNT(*) as trade_count
        FROM trades
        WHERE user_id = $1 ${dateFilter}
        GROUP BY trade_date
        ORDER BY trade_date
      `;

      const dailyVolumeResult = await db.query(dailyVolumeQuery, params);

      res.json({
        tradeDistribution,
        performanceByPrice,
        performanceByVolume,
        performanceByHoldTime,
        dayOfWeek: dayOfWeekData,
        dailyVolume: dailyVolumeResult.rows
      });
    } catch (error) {
      next(error);
    }
  },

  async getProfitLoss(req, res, next) {
    try {
      res.json({
        message: 'Profit/Loss analytics not yet implemented',
        data: null
      });
    } catch (error) {
      next(error);
    }
  },

  async getWinRate(req, res, next) {
    try {
      res.json({
        message: 'Win rate analytics not yet implemented',
        winRate: 0
      });
    } catch (error) {
      next(error);
    }
  },

  async getMonthlySummary(req, res, next) {
    try {
      res.json({
        message: 'Monthly summary not yet implemented',
        summary: null
      });
    } catch (error) {
      next(error);
    }
  },

  async getDailyAnalytics(req, res, next) {
    try {
      res.json({
        message: 'Daily analytics not yet implemented',
        analytics: null
      });
    } catch (error) {
      next(error);
    }
  },

  async getWeeklyAnalytics(req, res, next) {
    try {
      res.json({
        message: 'Weekly analytics not yet implemented',
        analytics: null
      });
    } catch (error) {
      next(error);
    }
  },

  async getMonthlyAnalytics(req, res, next) {
    try {
      res.json({
        message: 'Monthly analytics not yet implemented',
        analytics: null
      });
    } catch (error) {
      next(error);
    }
  },

  async getYearlyAnalytics(req, res, next) {
    try {
      res.json({
        message: 'Yearly analytics not yet implemented',
        analytics: null
      });
    } catch (error) {
      next(error);
    }
  },

  async getDrawdownAnalysis(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      
      let dateFilter = '';
      const params = [req.user.id];
      
      if (startDate) {
        dateFilter += ' AND trade_date >= $2';
        params.push(startDate);
      }
      
      if (endDate) {
        dateFilter += ` AND trade_date <= $${params.length + 1}`;
        params.push(endDate);
      }

      const drawdownQuery = `
        WITH daily_pnl AS (
          SELECT 
            trade_date,
            COALESCE(SUM(pnl), 0) as daily_pnl
          FROM trades
          WHERE user_id = $1 ${dateFilter}
          GROUP BY trade_date
          ORDER BY trade_date
        ),
        cumulative_pnl AS (
          SELECT 
            trade_date,
            daily_pnl,
            SUM(daily_pnl) OVER (ORDER BY trade_date) as cumulative_pnl
          FROM daily_pnl
        ),
        running_max AS (
          SELECT 
            trade_date,
            daily_pnl,
            cumulative_pnl,
            MAX(cumulative_pnl) OVER (ORDER BY trade_date) as running_max_pnl
          FROM cumulative_pnl
        )
        SELECT 
          trade_date,
          daily_pnl,
          cumulative_pnl,
          running_max_pnl,
          cumulative_pnl - running_max_pnl as drawdown
        FROM running_max
        ORDER BY trade_date
      `;

      const result = await db.query(drawdownQuery, params);
      
      res.json({ drawdown: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getRiskMetrics(req, res, next) {
    try {
      res.json({
        message: 'Risk metrics not yet implemented',
        metrics: null
      });
    } catch (error) {
      next(error);
    }
  },

  async getTradeDistribution(req, res, next) {
    try {
      res.json({
        message: 'Trade distribution not yet implemented',
        distribution: null
      });
    } catch (error) {
      next(error);
    }
  }
};

function convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',') 
        ? `"${value}"` 
        : value;
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

module.exports = analyticsController;