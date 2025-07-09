const pool = require('../config/database');

const equityController = {
  async getEquitySnapshots(req, res) {
    try {
      const userId = req.user.id;
      const { startDate, endDate, limit = 100 } = req.query;

      let query = `
        SELECT 
          id,
          equity_amount,
          snapshot_date,
          notes,
          created_at,
          updated_at
        FROM equity_snapshots 
        WHERE user_id = $1
      `;
      
      const params = [userId];
      let paramIndex = 2;

      if (startDate) {
        query += ` AND snapshot_date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND snapshot_date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += ` ORDER BY snapshot_date DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit));

      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching equity snapshots:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch equity snapshots'
      });
    }
  },

  async createEquitySnapshot(req, res) {
    try {
      const userId = req.user.id;
      const { equityAmount, snapshotDate, notes } = req.body;

      if (!equityAmount || !snapshotDate) {
        return res.status(400).json({
          success: false,
          message: 'Equity amount and snapshot date are required'
        });
      }

      const result = await pool.query(
        `INSERT INTO equity_snapshots (user_id, equity_amount, snapshot_date, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id, equity_amount, snapshot_date, notes, created_at, updated_at`,
        [userId, equityAmount, snapshotDate, notes]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(409).json({
          success: false,
          message: 'Equity snapshot already exists for this date'
        });
      }
      
      console.error('Error creating equity snapshot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create equity snapshot'
      });
    }
  },

  async updateEquitySnapshot(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { equityAmount, snapshotDate, notes } = req.body;

      if (!equityAmount || !snapshotDate) {
        return res.status(400).json({
          success: false,
          message: 'Equity amount and snapshot date are required'
        });
      }

      const result = await pool.query(
        `UPDATE equity_snapshots 
         SET equity_amount = $1, snapshot_date = $2, notes = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND user_id = $5
         RETURNING id, equity_amount, snapshot_date, notes, created_at, updated_at`,
        [equityAmount, snapshotDate, notes, id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Equity snapshot not found'
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(409).json({
          success: false,
          message: 'Equity snapshot already exists for this date'
        });
      }
      
      console.error('Error updating equity snapshot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update equity snapshot'
      });
    }
  },

  async deleteEquitySnapshot(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM equity_snapshots WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Equity snapshot not found'
        });
      }

      res.json({
        success: true,
        message: 'Equity snapshot deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting equity snapshot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete equity snapshot'
      });
    }
  },

  async updateCurrentEquity(req, res) {
    try {
      const userId = req.user.id;
      const { accountEquity } = req.body;

      if (!accountEquity) {
        return res.status(400).json({
          success: false,
          message: 'Account equity is required'
        });
      }

      // Update the current equity in user_settings
      await pool.query(
        'UPDATE user_settings SET account_equity = $1 WHERE user_id = $2',
        [accountEquity, userId]
      );

      // Also create a snapshot for today
      const today = new Date().toISOString().split('T')[0];
      
      try {
        await pool.query(
          `INSERT INTO equity_snapshots (user_id, equity_amount, snapshot_date)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, snapshot_date) 
           DO UPDATE SET equity_amount = $2, updated_at = CURRENT_TIMESTAMP`,
          [userId, accountEquity, today]
        );
      } catch (snapshotError) {
        console.warn('Failed to create equity snapshot:', snapshotError);
      }

      res.json({
        success: true,
        message: 'Account equity updated successfully'
      });
    } catch (error) {
      console.error('Error updating current equity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update account equity'
      });
    }
  },

  async calculateKRatio(req, res) {
    try {
      const userId = req.user.id;
      const { period = 90 } = req.query; // Default to 90 days

      // Get equity snapshots for the specified period
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - period);

      const result = await pool.query(
        `SELECT equity_amount, snapshot_date
         FROM equity_snapshots 
         WHERE user_id = $1 AND snapshot_date >= $2 AND snapshot_date <= $3
         ORDER BY snapshot_date ASC`,
        [userId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
      );

      const snapshots = result.rows;

      if (snapshots.length < 2) {
        return res.json({
          success: true,
          data: {
            kRatio: null,
            message: 'Insufficient data to calculate K Ratio. Need at least 2 equity snapshots.'
          }
        });
      }

      // Calculate daily returns
      const returns = [];
      for (let i = 1; i < snapshots.length; i++) {
        const prevEquity = parseFloat(snapshots[i - 1].equity_amount);
        const currentEquity = parseFloat(snapshots[i].equity_amount);
        const dailyReturn = (currentEquity - prevEquity) / prevEquity;
        returns.push(dailyReturn);
      }

      if (returns.length === 0) {
        return res.json({
          success: true,
          data: {
            kRatio: null,
            message: 'No returns to calculate K Ratio'
          }
        });
      }

      // Calculate average return
      const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;

      // Calculate standard deviation of returns
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      // Calculate K Ratio
      const kRatio = stdDev === 0 ? 0 : avgReturn / stdDev;

      res.json({
        success: true,
        data: {
          kRatio: kRatio,
          period: period,
          dataPoints: snapshots.length,
          averageReturn: avgReturn,
          standardDeviation: stdDev,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        }
      });
    } catch (error) {
      console.error('Error calculating K Ratio:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate K Ratio'
      });
    }
  }
};

module.exports = equityController;