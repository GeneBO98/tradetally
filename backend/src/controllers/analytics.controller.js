const db = require('../config/database');
const gemini = require('../utils/gemini');
const User = require('../models/User');
const finnhub = require('../utils/finnhub');
const cache = require('../utils/cache');
const MAEEstimator = require('../utils/maeEstimator');

// Async MAE/MFE calculation function
async function calculateMAEMFEAsync(userId, dateFilter, params) {
  try {
    // First try to get actual MAE/MFE if available
    const actualMaeQuery = `
      SELECT 
        COALESCE(AVG(mae), 0) as avg_mae,
        COALESCE(AVG(mfe), 0) as avg_mfe,
        COUNT(mae) as mae_count,
        COUNT(mfe) as mfe_count
      FROM trades
      WHERE user_id = $1 ${dateFilter}
        AND mae IS NOT NULL 
        AND mfe IS NOT NULL
    `;
    
    const actualMaeResult = await db.query(actualMaeQuery, params);
    const actualMaeData = actualMaeResult.rows[0];
    
    if (actualMaeData && actualMaeData.mae_count > 0) {
      // Use actual data if available
      return {
        avgMAE: parseFloat(actualMaeData.avg_mae).toFixed(2),
        avgMFE: parseFloat(actualMaeData.avg_mfe).toFixed(2),
        count: actualMaeData.mae_count
      };
    } else {
      // Estimate MAE/MFE from available trade data
      const estimateQuery = `
        SELECT
          id,
          symbol,
          entry_price,
          exit_price,
          CAST(quantity AS DECIMAL) as quantity,
          side,
          pnl,
          commission,
          fees,
          trade_date,
          entry_time,
          exit_time
        FROM trades
        WHERE user_id = $1 ${dateFilter}
          AND entry_price IS NOT NULL
          AND exit_price IS NOT NULL
          AND pnl IS NOT NULL
          AND quantity IS NOT NULL
          AND entry_time IS NOT NULL
          AND exit_time IS NOT NULL
      `;
      
      const tradesResult = await db.query(estimateQuery, params);
      const trades = tradesResult.rows.map(trade => ({
        ...trade,
        quantity: parseFloat(trade.quantity)
      }));
      
      if (trades.length > 0) {
        const estimates = await MAEEstimator.estimateForTrades(trades);
        return estimates;
      } else {
        return { avgMAE: 'N/A', avgMFE: 'N/A', count: 0 };
      }
    }
  } catch (error) {
    console.error('MAE/MFE calculation error:', error);
    return { avgMAE: 'N/A', avgMFE: 'N/A', count: 0 };
  }
}

const analyticsController = {
  async getOverview(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      
      console.log('Date filters received:', { startDate, endDate });
      
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
      
      console.log('Final date filter:', dateFilter);
      console.log('Query params:', params);

      // Test simple query first to debug
      const testQuery = `SELECT COUNT(*) as count FROM trades WHERE user_id = $1 ${dateFilter}`;
      console.log('Test query:', testQuery);
      const testResult = await db.query(testQuery, params);
      console.log('Test result:', testResult.rows[0]);

      const overviewQuery = `
        WITH trades_with_starts AS (
            SELECT
                *,
                CASE
                    WHEN LAG(position, 1, 0) OVER (PARTITION BY symbol ORDER BY trade_date, entry_time) = 0 THEN 1
                    ELSE 0
                END as is_trade_start
            FROM (
                SELECT
                    *,
                    SUM(CASE WHEN side = 'long' THEN quantity ELSE -quantity END) OVER (PARTITION BY symbol ORDER BY trade_date, entry_time) as position
                FROM trades
                WHERE user_id = $1 ${dateFilter}
            ) as positions
        ),
        trades_with_groups AS (
            SELECT
                *,
                SUM(is_trade_start) OVER (PARTITION BY symbol ORDER BY trade_date, entry_time) as trade_group
            FROM trades_with_starts
        ),
        completed_trades AS (
            SELECT
                symbol,
                trade_group,
                SUM(pnl) as pnl,
                SUM(commission) as commission,
                SUM(fees) as fees,
                MIN(trade_date) as trade_date,
                MIN(entry_time) as entry_time
            FROM trades_with_groups
            GROUP BY symbol, trade_group
        )
        SELECT 
          (SELECT COUNT(*) FROM completed_trades)::integer as total_trades,
          (SELECT COUNT(*) FROM completed_trades WHERE pnl > 0)::integer as winning_trades,
          (SELECT COUNT(*) FROM completed_trades WHERE pnl < 0)::integer as losing_trades,
          (SELECT COUNT(*) FROM completed_trades WHERE pnl = 0)::integer as breakeven_trades,
          COALESCE(SUM(pnl), 0)::numeric as total_pnl,
          COALESCE(AVG(pnl), 0)::numeric as avg_pnl,
          COALESCE(AVG(pnl) FILTER (WHERE pnl > 0), 0)::numeric as avg_win,
          COALESCE(AVG(pnl) FILTER (WHERE pnl < 0), 0)::numeric as avg_loss,
          COALESCE(MAX(pnl), 0)::numeric as best_trade,
          COALESCE(MIN(pnl), 0)::numeric as worst_trade,
          (SELECT COUNT(*) FROM trades WHERE user_id = $1 ${dateFilter})::integer as total_executions,
          COALESCE(SUM(pnl) FILTER (WHERE pnl > 0), 0) as total_gross_wins,
          COALESCE(ABS(SUM(pnl) FILTER (WHERE pnl < 0)), 0) as total_gross_losses,
          COALESCE(SUM(commission), 0) as total_commissions,
          COALESCE(SUM(fees), 0) as total_fees,
          COALESCE(STDDEV(pnl), 0) as pnl_stddev,
          (SELECT array_agg(pnl ORDER BY trade_date, entry_time) FROM completed_trades) as pnl_array
        FROM completed_trades
      `;

      const result = await db.query(overviewQuery, params);
      const overview = result.rows[0];

      // --- BEGIN DEBUG LOGGING ---
      console.log('--- Analytics Overview Debug ---');
      console.log('Query Parameters:', { startDate, endDate, userId: req.user.id });
      console.log('Raw Query Result:', result.rows);
      if (overview) {
        console.log('Initial Overview Object:', JSON.parse(JSON.stringify(overview)));
        console.log('Total trades found:', overview.total_trades);
      } else {
        console.log('No overview data returned from query.');
        // Send a valid empty response if overview is missing
        return res.json({ 
          overview: { 
            total_pnl: 0, win_rate: 0, total_trades: 0, winning_trades: 0, losing_trades: 0, 
            breakeven_trades: 0, avg_pnl: 0, avg_win: 0, avg_loss: 0, best_trade: 0, 
            worst_trade: 0, profit_factor: 0, sqn: '0.00', probability_random: 'N/A', 
            kelly_percentage: '0.00', k_ratio: '0.00', total_commissions: 0, total_fees: 0, 
            avg_mae: 'N/A', avg_mfe: 'N/A' 
          }
        });
      }
      // --- END DEBUG LOGGING ---

      // Debug logging
      console.log('Overview query result:', {
        total_trades: overview.total_trades,
        has_pnl_array: !!overview.pnl_array,
        pnl_array_length: overview.pnl_array ? overview.pnl_array.length : 0,
        total_gross_wins: overview.total_gross_wins,
        total_gross_losses: overview.total_gross_losses
      });

      // Convert numeric values to proper format
      overview.total_trades = parseInt(overview.total_trades) || 0;
      overview.winning_trades = parseInt(overview.winning_trades) || 0;
      overview.losing_trades = parseInt(overview.losing_trades) || 0;
      overview.breakeven_trades = parseInt(overview.breakeven_trades) || 0;
      overview.total_executions = parseInt(overview.total_executions) || 0;
      
      overview.total_pnl = parseFloat(overview.total_pnl) || 0;
      overview.avg_pnl = parseFloat(overview.avg_pnl) || 0;
      overview.avg_win = parseFloat(overview.avg_win) || 0;
      overview.avg_loss = parseFloat(overview.avg_loss) || 0;
      overview.best_trade = parseFloat(overview.best_trade) || 0;
      overview.worst_trade = parseFloat(overview.worst_trade) || 0;

      overview.win_rate = overview.total_trades > 0 
        ? (overview.winning_trades / overview.total_trades * 100).toFixed(2)
        : 0;

      // Calculate advanced trading metrics
      
      // 1. Profit Factor (ratio) - Total gross wins divided by total gross losses
      overview.profit_factor = overview.total_gross_losses > 0
        ? (overview.total_gross_wins / overview.total_gross_losses).toFixed(2)
        : overview.total_gross_wins > 0 ? 'Infinite' : '0.00';

      // 2. System Quality Number (ratio) - Measures trading system quality
      // SQN = (Average Trade / Standard Deviation) * sqrt(Number of Trades)
      const stdDev = parseFloat(overview.pnl_stddev) || 0;
      const avgTrade = parseFloat(overview.avg_pnl) || 0;
      const sqrtTrades = Math.sqrt(overview.total_trades);
      
      if (stdDev > 0 && overview.total_trades > 0) {
        overview.sqn = ((avgTrade / stdDev) * sqrtTrades).toFixed(2);
      } else {
        overview.sqn = '0.00';
      }

      // 3. Kelly Percentage (% of capital) - Optimal position size for maximum growth
      // Kelly % = (Win Rate × Avg Win/Avg Loss - Loss Rate) / (Avg Win/Avg Loss)
      const winRate = overview.winning_trades / overview.total_trades;
      const lossRate = overview.losing_trades / overview.total_trades;
      const avgWin = Math.abs(parseFloat(overview.avg_win)) || 0;
      const avgLoss = Math.abs(parseFloat(overview.avg_loss)) || 0;
      
      if (avgLoss > 0 && overview.total_trades > 0) {
        const winLossRatio = avgWin / avgLoss;
        const kellyDecimal = (winRate * winLossRatio - lossRate) / winLossRatio;
        overview.kelly_percentage = (kellyDecimal * 100).toFixed(2);
        
        // Debug info
        console.log('Kelly % calculation:', {
          winRate: winRate.toFixed(4),
          lossRate: lossRate.toFixed(4),
          avgWin: avgWin.toFixed(2),
          avgLoss: avgLoss.toFixed(2),
          winLossRatio: winLossRatio.toFixed(4),
          kellyDecimal: kellyDecimal.toFixed(4),
          kellyPercentage: overview.kelly_percentage
        });
      } else {
        overview.kelly_percentage = '0.00';
      }

      // 4. K-Ratio (ratio) - Measures consistency of returns over time using user-entered equity values
      // K-Ratio = Average Return / Standard Deviation of Returns
      // Uses only user-entered equity snapshots, not calculated trade data
      
      try {
        console.log('Starting K-Ratio calculation using equity snapshots...');
        // Get user-entered equity snapshots only
        const equityQuery = `
          SELECT 
            equity_amount,
            snapshot_date
          FROM equity_snapshots
          WHERE user_id = $1
          ORDER BY snapshot_date ASC
        `;
        
        const equityResult = await db.query(equityQuery, [req.user.id]);
        const equitySnapshots = equityResult.rows;
        
        console.log('K-Ratio equity snapshots found:', equitySnapshots.length);
        console.log('K-Ratio equity snapshots data:', equitySnapshots);
        
        if (equitySnapshots && equitySnapshots.length >= 3) {
          // Calculate daily returns from user-entered equity values
          const returns = [];
          for (let i = 1; i < equitySnapshots.length; i++) {
            const prevEquity = parseFloat(equitySnapshots[i - 1].equity_amount);
            const currentEquity = parseFloat(equitySnapshots[i].equity_amount);
            console.log(`K-Ratio: Processing ${equitySnapshots[i].snapshot_date}: ${prevEquity} -> ${currentEquity}`);
            if (prevEquity > 0) {
              const dailyReturn = (currentEquity - prevEquity) / prevEquity;
              returns.push(dailyReturn);
              console.log(`K-Ratio: Daily return: ${dailyReturn.toFixed(6)}`);
            }
          }
          
          console.log('K-Ratio daily returns calculated:', returns.length);
          
          if (returns.length > 0) {
            // Calculate average return and standard deviation
            const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
            const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
            const stdDev = Math.sqrt(variance);
            
            // Calculate K-Ratio
            const kRatio = stdDev === 0 ? 0 : avgReturn / stdDev;
            overview.k_ratio = kRatio.toFixed(2);
            
            console.log('K-Ratio calculation details:');
            console.log('  equity snapshots:', equitySnapshots.length);
            console.log('  returns count:', returns.length);
            console.log('  avgReturn:', avgReturn.toFixed(6));
            console.log('  stdDev:', stdDev.toFixed(6));
            console.log('  kRatio:', kRatio.toFixed(6));
          } else {
            overview.k_ratio = '0.00';
            console.log('K-Ratio: No valid returns calculated');
          }
        } else {
          overview.k_ratio = '0.00';
          console.log('K-Ratio: Insufficient equity snapshots (need at least 2)');
        }
      } catch (error) {
        console.error('K-Ratio calculation error:', error);
        overview.k_ratio = '0.00';
      }

      // 5. Probability of Random Chance (probability) - Statistical significance of results
      // Uses chi-square test based on win rate deviation from 50%
      if (overview.total_trades > 0) {
        const expectedWins = overview.total_trades * 0.5;
        const chiSquare = Math.pow(overview.winning_trades - expectedWins, 2) / expectedWins +
                         Math.pow(overview.losing_trades - expectedWins, 2) / expectedWins;
        
        // Convert chi-square to probability (simplified)
        // For df=1, critical value at 95% confidence is 3.841
        if (chiSquare > 3.841) {
          overview.probability_random = '< 5%';
        } else if (chiSquare > 2.706) {
          overview.probability_random = '< 10%';
        } else if (chiSquare > 1.642) {
          overview.probability_random = '< 20%';
        } else {
          overview.probability_random = '> 20%';
        }
      } else {
        overview.probability_random = 'N/A';
      }

      // 6. Total Commissions and Fees (USD) - Total trading costs
      overview.total_commissions = parseFloat(overview.total_commissions) || 0;
      overview.total_fees = parseFloat(overview.total_fees) || 0;

      // 7. Average Position MAE and MFE - Calculate quickly with simple estimation
      try {
        console.log('Starting MAE/MFE calculation...');
        const estimates = await Promise.race([
          calculateMAEMFEAsync(req.user.id, dateFilter, params),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('MAE/MFE calculation timeout')), 5000)
          )
        ]);
        console.log('MAE/MFE calculation completed');
        overview.avg_mae = estimates.avgMAE;
        overview.avg_mfe = estimates.avgMFE;
      } catch (error) {
        console.error('MAE/MFE calculation error:', error);
        overview.avg_mae = 'N/A';
        overview.avg_mfe = 'N/A';
      }

      // Clean up temporary fields
      delete overview.pnl_array;
      delete overview.pnl_stddev;
      delete overview.total_gross_wins;
      delete overview.total_gross_losses;

      // Debug logging before sending response
      console.log('Final overview object keys:', Object.keys(overview));
      console.log('Advanced metrics values:', {
        sqn: overview.sqn,
        k_ratio: overview.k_ratio,
        kelly_percentage: overview.kelly_percentage,
        probability_random: overview.probability_random,
        avg_mae: overview.avg_mae,
        avg_mfe: overview.avg_mfe
      });

      console.log('Analytics overview calculation completed, sending response');
      res.json({ overview });
    } catch (error) {
      console.error('Analytics overview error:', error);
      next(error);
    }
  },

  async getMAEMFE(req, res, next) {
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

      const estimates = await calculateMAEMFEAsync(req.user.id, dateFilter, params);
      
      res.json({
        success: true,
        data: estimates
      });
    } catch (error) {
      console.error('Error getting MAE/MFE:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate MAE/MFE'
      });
    }
  },

  async getPerformance(req, res, next) {
    try {
      const { period = 'daily', startDate, endDate } = req.query;
      
      // Whitelist allowed periods to prevent SQL injection
      const allowedPeriods = ['daily', 'weekly', 'monthly'];
      const sanitizedPeriod = allowedPeriods.includes(period) ? period : 'daily';
      
      let groupBy;
      switch (sanitizedPeriod) {
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

      // Validate and sanitize limit parameter
      const sanitizedLimit = parseInt(limit);
      if (isNaN(sanitizedLimit) || sanitizedLimit < 1 || sanitizedLimit > 100) {
        return res.status(400).json({ error: 'Invalid limit parameter. Must be between 1 and 100' });
      }
      
      params.push(sanitizedLimit);

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
        // Validate and sanitize year and month to prevent injection
        const sanitizedYear = parseInt(year);
        const sanitizedMonth = parseInt(month);
        
        // Validate ranges
        if (isNaN(sanitizedYear) || sanitizedYear < 1900 || sanitizedYear > 2100) {
          return res.status(400).json({ error: 'Invalid year parameter' });
        }
        
        if (isNaN(sanitizedMonth) || sanitizedMonth < 1 || sanitizedMonth > 12) {
          return res.status(400).json({ error: 'Invalid month parameter' });
        }
        
        const startDate = `${sanitizedYear}-${sanitizedMonth.toString().padStart(2, '0')}-01`;
        const endDate = new Date(sanitizedYear, sanitizedMonth, 0).toISOString().split('T')[0];
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
      
      // Validate format parameter
      const allowedFormats = ['csv', 'json'];
      const sanitizedFormat = allowedFormats.includes(format) ? format : 'csv';
      
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
      
      if (sanitizedFormat === 'csv') {
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
        WITH trade_volumes AS (
          SELECT 
            CASE 
              WHEN executions IS NOT NULL AND jsonb_array_length(executions) > 0 THEN
                (
                  SELECT COALESCE(SUM((exec->>'quantity')::integer), 0)
                  FROM jsonb_array_elements(executions) AS exec
                )
              ELSE quantity  -- Fallback to trade quantity if no executions data
            END as total_volume,
            pnl
          FROM trades
          WHERE user_id = $1 ${dateFilter}
        ),
        volume_ranges AS (
          SELECT 
            CASE 
              WHEN total_volume BETWEEN 2 AND 4 THEN '2-4'
              WHEN total_volume BETWEEN 5 AND 9 THEN '5-9'
              WHEN total_volume BETWEEN 10 AND 19 THEN '10-19'
              WHEN total_volume BETWEEN 20 AND 49 THEN '20-49'
              WHEN total_volume BETWEEN 50 AND 99 THEN '50-99'
              WHEN total_volume BETWEEN 100 AND 499 THEN '100-500'
              WHEN total_volume BETWEEN 500 AND 999 THEN '500-999'
              WHEN total_volume BETWEEN 1000 AND 1999 THEN '1K-2K'
              WHEN total_volume BETWEEN 2000 AND 2999 THEN '2K-3K'
              WHEN total_volume BETWEEN 3000 AND 4999 THEN '3K-5K'
              WHEN total_volume BETWEEN 5000 AND 9999 THEN '5K-10K'
              WHEN total_volume BETWEEN 10000 AND 19999 THEN '10K-20K'
              WHEN total_volume >= 20000 THEN '20K+'
              ELSE 'Other'
            END as volume_range,
            CASE 
              WHEN total_volume BETWEEN 2 AND 4 THEN 1
              WHEN total_volume BETWEEN 5 AND 9 THEN 2
              WHEN total_volume BETWEEN 10 AND 19 THEN 3
              WHEN total_volume BETWEEN 20 AND 49 THEN 4
              WHEN total_volume BETWEEN 50 AND 99 THEN 5
              WHEN total_volume BETWEEN 100 AND 499 THEN 6
              WHEN total_volume BETWEEN 500 AND 999 THEN 7
              WHEN total_volume BETWEEN 1000 AND 1999 THEN 8
              WHEN total_volume BETWEEN 2000 AND 2999 THEN 9
              WHEN total_volume BETWEEN 3000 AND 4999 THEN 10
              WHEN total_volume BETWEEN 5000 AND 9999 THEN 11
              WHEN total_volume BETWEEN 10000 AND 19999 THEN 12
              WHEN total_volume >= 20000 THEN 13
              ELSE 14
            END as range_order,
            pnl
          FROM trade_volumes
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

      // Dynamic volume categories - only include categories with data
      const volumeDataMap = new Map();
      const volumeOrderMap = {
        '2-4': 1, '5-9': 2, '10-19': 3, '20-49': 4, '50-99': 5, '100-500': 6,
        '500-999': 7, '1K-2K': 8, '2K-3K': 9, '3K-5K': 10, '5K-10K': 11, 
        '10K-20K': 12, '20K+': 13
      };

      // Collect data and filter out empty categories
      perfByVolumeResult.rows.forEach(row => {
        if (row.volume_range && row.volume_range !== 'Other' && parseFloat(row.total_pnl) !== 0) {
          volumeDataMap.set(row.volume_range, parseFloat(row.total_pnl));
        }
      });

      // Sort by order and create arrays
      const sortedVolumeEntries = Array.from(volumeDataMap.entries())
        .sort((a, b) => (volumeOrderMap[a[0]] || 999) - (volumeOrderMap[b[0]] || 999));

      const dynamicVolumeLabels = sortedVolumeEntries.map(([label]) => label);
      const performanceByVolume = sortedVolumeEntries.map(([, pnl]) => pnl);

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

      // Daily Volume Data - Calculate from executions for accurate trading volume
      const dailyVolumeQuery = `
        WITH execution_volumes AS (
          SELECT 
            trade_date,
            CASE 
              WHEN executions IS NOT NULL AND jsonb_array_length(executions) > 0 THEN
                (
                  SELECT COALESCE(SUM((exec->>'quantity')::integer), 0)
                  FROM jsonb_array_elements(executions) AS exec
                )
              ELSE quantity  -- Fallback to trade quantity if no executions data
            END as trade_volume
          FROM trades
          WHERE user_id = $1 ${dateFilter}
        )
        SELECT 
          trade_date,
          COALESCE(SUM(trade_volume), 0) as total_volume,
          COUNT(*) as trade_count
        FROM execution_volumes
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
        dailyVolume: dailyVolumeResult.rows,
        // Include dynamic labels for charts
        labels: {
          volume: dynamicVolumeLabels,
          price: priceLabels,
          holdTime: holdTimeLabels
        }
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
  },

  async getRecommendations(req, res, next) {
    try {
      console.log('🤖 AI Recommendations request started');
      
      if (!gemini.isConfigured()) {
        console.log('❌ Gemini API key not configured');
        return res.status(400).json({ 
          error: 'AI recommendations are not available. Gemini API key not configured.' 
        });
      }
      
      console.log('✅ Gemini API key is configured');

      const { startDate, endDate } = req.query;
      
      // Get analytics overview data
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

      // Get overview metrics
      console.log('📊 Fetching trade metrics...');
      const overviewQuery = `
        SELECT 
          COUNT(*) as total_trades,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0) as avg_win,
          COALESCE(AVG(CASE WHEN pnl < 0 THEN pnl END), 0) as avg_loss,
          COALESCE(MAX(pnl), 0) as best_trade,
          COALESCE(MIN(pnl), 0) as worst_trade
        FROM trades
        WHERE user_id = $1 ${dateFilter}
      `;

      const overviewResult = await db.query(overviewQuery, params);
      const metrics = overviewResult.rows[0];
      console.log(`📈 Found ${metrics.total_trades} trades for analysis`);

      // Calculate derived metrics
      metrics.win_rate = metrics.total_trades > 0 
        ? (metrics.winning_trades / metrics.total_trades * 100).toFixed(2)
        : 0;
      
      metrics.profit_factor = metrics.avg_loss !== 0
        ? Math.abs(metrics.avg_win / metrics.avg_loss).toFixed(2)
        : 0;

      // Get recent trade data for pattern analysis
      const tradesQuery = `
        SELECT 
          symbol, entry_time, exit_time, entry_price, exit_price,
          quantity, side, pnl, pnl_percent, commission, fees, broker,
          trade_date, strategy, tags, notes
        FROM trades
        WHERE user_id = $1 ${dateFilter}
        ORDER BY trade_date DESC, entry_time DESC
        LIMIT 100
      `;

      const tradesResult = await db.query(tradesQuery, params);
      const trades = tradesResult.rows;

      // Get user's trading profile for personalized recommendations
      console.log('👤 Fetching user trading profile...');
      let userSettings = null;
      let tradingProfile = null;
      
      try {
        userSettings = await User.getSettings(req.user.id);
        console.log('⚙️ User settings found:', !!userSettings);
        
        if (userSettings) {
          // Check if trading profile columns exist before accessing them
          tradingProfile = {
            tradingStrategies: userSettings.trading_strategies || [],
            tradingStyles: userSettings.trading_styles || [],
            riskTolerance: userSettings.risk_tolerance || 'moderate',
            primaryMarkets: userSettings.primary_markets || [],
            experienceLevel: userSettings.experience_level || 'intermediate',
            averagePositionSize: userSettings.average_position_size || 'medium',
            tradingGoals: userSettings.trading_goals || [],
            preferredSectors: userSettings.preferred_sectors || []
          };
          console.log('📋 Trading profile loaded with strategies:', tradingProfile.tradingStrategies.length);
        }
      } catch (settingsError) {
        console.warn('⚠️ Failed to load user settings, continuing without trading profile:', settingsError.message);
        console.warn('This might be because trading profile columns do not exist in database yet');
        tradingProfile = null;
      }

      // Get sector performance data for AI analysis
      console.log('🏭 Fetching sector performance for AI analysis...');
      let sectorData = null;
      try {
        // Get symbols and their P&L
        const symbolQuery = `
          SELECT 
            symbol,
            COUNT(*) as total_trades,
            COALESCE(SUM(pnl), 0) as total_pnl,
            COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades
          FROM trades
          WHERE user_id = $1 ${dateFilter}
          GROUP BY symbol
          HAVING COUNT(*) > 0
          ORDER BY total_pnl DESC
          LIMIT 15
        `;

        const symbolResult = await db.query(symbolQuery, params);
        const symbolData = symbolResult.rows;

        if (symbolData.length > 0 && finnhub.isConfigured()) {
          console.log(`📈 Analyzing ${symbolData.length} symbols for sector data...`);
          const sectorMap = new Map();
          
          // Process top symbols for sector analysis (limit to avoid delays)
          for (const symbolInfo of symbolData.slice(0, 10)) {
            try {
              const profile = await finnhub.getCompanyProfile(symbolInfo.symbol);
              
              if (profile && profile.finnhubIndustry) {
                const industry = profile.finnhubIndustry;
                
                if (!sectorMap.has(industry)) {
                  sectorMap.set(industry, {
                    industry: industry,
                    total_trades: 0,
                    total_pnl: 0,
                    winning_trades: 0,
                    symbols: []
                  });
                }
                
                const sector = sectorMap.get(industry);
                sector.total_trades += parseInt(symbolInfo.total_trades);
                sector.total_pnl += parseFloat(symbolInfo.total_pnl);
                sector.winning_trades += parseInt(symbolInfo.winning_trades);
                sector.symbols.push(symbolInfo.symbol);
              }
              
              // Shorter delay for AI analysis
              await new Promise(resolve => setTimeout(resolve, 1000));
              
            } catch (error) {
              console.warn(`⚠️ Failed to get sector for ${symbolInfo.symbol}:`, error.message);
            }
          }

          // Convert to array with calculated metrics
          sectorData = Array.from(sectorMap.values()).map(sector => ({
            ...sector,
            win_rate: sector.total_trades > 0 ? ((sector.winning_trades / sector.total_trades) * 100).toFixed(1) : 0,
            avg_pnl: sector.total_trades > 0 ? (sector.total_pnl / sector.total_trades).toFixed(2) : 0
          })).sort((a, b) => b.total_pnl - a.total_pnl);

          console.log(`✅ Sector analysis complete: ${sectorData.length} sectors identified`);
        } else {
          console.log('📊 Skipping sector analysis - insufficient data or Finnhub not configured');
        }
      } catch (error) {
        console.warn('⚠️ Failed to fetch sector data for AI analysis:', error.message);
        sectorData = null;
      }

      // Generate AI recommendations with sector data
      console.log('🧠 Generating AI recommendations with sector analysis...');
      const recommendations = await gemini.generateTradeRecommendations(metrics, trades, tradingProfile, sectorData);
      console.log('✅ AI recommendations generated successfully');

      res.json({ 
        recommendations,
        analysisDate: new Date().toISOString(),
        tradesAnalyzed: trades.length,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      });

    } catch (error) {
      console.error('Error generating recommendations:', error);
      next(error);
    }
  },

  async getSectorPerformance(req, res, next) {
    try {
      console.log('📊 Starting sector performance analysis...');
      
      if (!finnhub.isConfigured()) {
        console.log('❌ Finnhub API key not configured');
        return res.status(400).json({ 
          error: 'Sector analysis not available. Finnhub API key not configured.' 
        });
      }

      const { startDate, endDate } = req.query;
      
      // Check for cached sector performance results first
      const cacheKey = `${req.user.id}:${startDate || 'all'}:${endDate || 'all'}`;
      const cachedSectorResults = await cache.get('sector_performance', cacheKey);
      if (cachedSectorResults) {
        console.log('✅ Using cached sector performance results');
        return res.json(cachedSectorResults);
      }
      
      console.log('🔄 No cached results found, generating sector performance...');
      
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

      // Get all symbols and their P&L from trades
      console.log('🔍 Fetching symbols and P&L from trades...');
      const symbolQuery = `
        SELECT 
          symbol,
          COUNT(*) as total_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades
        FROM trades
        WHERE user_id = $1 ${dateFilter}
        GROUP BY symbol
        HAVING COUNT(*) > 0
        ORDER BY total_pnl DESC
      `;

      const symbolResult = await db.query(symbolQuery, params);
      const symbolData = symbolResult.rows;
      
      console.log(`📈 Found ${symbolData.length} unique symbols to analyze`);

      if (symbolData.length === 0) {
        return res.json({ 
          sectors: [],
          message: 'No trading data found for the selected date range'
        });
      }

      // Get industry data for each symbol
      console.log('🏭 Fetching industry data (using cache where possible)...');
      const sectorMap = new Map();
      
      // Process ALL symbols to ensure accurate totals
      let cachedCount = 0;
      let fetchedCount = 0;
      let failedSymbols = [];
      
      for (const symbolInfo of symbolData) {
        try {
          // Check if we already have this in cache first
          const cacheKey = `company_profile:${symbolInfo.symbol.toUpperCase()}`;
          const cache = require('../utils/cache');
          const cached = await cache.get('company_profile', symbolInfo.symbol.toUpperCase());
          
          let profile;
          if (cached) {
            profile = cached;
            cachedCount++;
            console.log(`✅ Using cached industry data for ${symbolInfo.symbol}`);
          } else {
            // Only fetch if not in cache and we haven't hit our limit
            if (fetchedCount < 20) { // Limit API calls to 20 per request
              console.log(`🔍 Fetching industry for ${symbolInfo.symbol} from API...`);
              profile = await finnhub.getCompanyProfile(symbolInfo.symbol);
              fetchedCount++;
              
              // Add delay only for API calls, not cached data
              await new Promise(resolve => setTimeout(resolve, 2100));
            } else {
              // Skip remaining symbols that aren't cached
              failedSymbols.push(symbolInfo.symbol);
              continue;
            }
          }
          
          if (profile && profile.finnhubIndustry) {
            const industry = profile.finnhubIndustry;
            
            if (!sectorMap.has(industry)) {
              sectorMap.set(industry, {
                industry: industry,
                total_trades: 0,
                total_pnl: 0,
                winning_trades: 0,
                symbols: []
              });
            }
            
            const sector = sectorMap.get(industry);
            sector.total_trades += parseInt(symbolInfo.total_trades);
            sector.total_pnl += parseFloat(symbolInfo.total_pnl);
            sector.winning_trades += parseInt(symbolInfo.winning_trades);
            sector.symbols.push({
              symbol: symbolInfo.symbol,
              trades: parseInt(symbolInfo.total_trades),
              pnl: parseFloat(symbolInfo.total_pnl)
            });
            
          } else {
            console.warn(`⚠️ No industry data found for ${symbolInfo.symbol}`);
          }
          
        } catch (error) {
          console.warn(`❌ Failed to get industry for ${symbolInfo.symbol}:`, error.message);
          failedSymbols.push(symbolInfo.symbol);
        }
      }
      
      console.log(`📊 Sector analysis stats: ${cachedCount} cached, ${fetchedCount} fetched, ${failedSymbols.length} skipped`);

      // Convert map to array and calculate additional metrics
      const sectors = Array.from(sectorMap.values()).map(sector => ({
        ...sector,
        win_rate: sector.total_trades > 0 ? ((sector.winning_trades / sector.total_trades) * 100).toFixed(2) : 0,
        avg_pnl: sector.total_trades > 0 ? (sector.total_pnl / sector.total_trades).toFixed(2) : 0,
        symbol_count: sector.symbols.length
      })).sort((a, b) => b.total_pnl - a.total_pnl);

      console.log(`✅ Sector analysis complete. Found ${sectors.length} sectors.`);

      const resultData = { 
        sectors,
        analysisDate: new Date().toISOString(),
        symbolsAnalyzed: symbolData.length - failedSymbols.length,
        totalSymbols: symbolData.length,
        cachedSymbols: cachedCount,
        fetchedSymbols: fetchedCount,
        skippedSymbols: failedSymbols.length,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      };

      // Cache the sector performance results for 2 hours
      try {
        await cache.set('sector_performance', cacheKey, resultData);
        console.log(`💾 Cached sector performance results for user ${req.user.id}`);
      } catch (cacheError) {
        console.warn('⚠️ Failed to cache sector performance results:', cacheError.message);
      }

      res.json(resultData);

    } catch (error) {
      console.error('Error generating sector performance:', error);
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