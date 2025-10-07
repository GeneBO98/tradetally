const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const stockSplitService = require('../services/stockSplitService');
const StockSplit = require('../models/StockSplit');

// Check for stock splits manually
router.post('/stock-splits/check', requireAdmin, async (req, res, next) => {
  try {
    const { symbol, fromDate, toDate } = req.body;
    
    if (symbol) {
      // Check specific symbol
      const splits = await stockSplitService.checkSymbolForSplits(symbol, fromDate, toDate);
      res.json({ 
        message: `Checked ${symbol} for splits`,
        symbol,
        splits,
        count: splits.length
      });
    } else {
      // Check all open positions
      const result = await stockSplitService.checkForStockSplits();
      res.json({ 
        message: 'Stock split check completed',
        ...result
      });
    }
  } catch (error) {
    next(error);
  }
});

// Get stock split history
router.get('/stock-splits', requireAdmin, async (req, res, next) => {
  try {
    const { symbol, processed } = req.query;
    
    let query = 'SELECT * FROM stock_splits';
    const conditions = [];
    const values = [];
    
    if (symbol) {
      conditions.push(`symbol = $${values.length + 1}`);
      values.push(symbol);
    }
    
    if (processed !== undefined) {
      conditions.push(`processed = $${values.length + 1}`);
      values.push(processed === 'true');
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY split_date DESC, symbol';
    
    const db = require('../config/database');
    const result = await db.query(query, values);
    
    res.json({ splits: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get split adjustments for a specific trade
router.get('/trades/:tradeId/split-adjustments', requireAdmin, async (req, res, next) => {
  try {
    const { tradeId } = req.params;
    const adjustments = await StockSplit.getAdjustmentsForTrade(tradeId);
    res.json({ adjustments });
  } catch (error) {
    next(error);
  }
});

// Get stock split check log
router.get('/stock-splits/check-log', requireAdmin, async (req, res, next) => {
  try {
    const db = require('../config/database');
    const query = `
      SELECT * FROM stock_split_check_log
      ORDER BY last_checked_at DESC
      LIMIT 100
    `;

    const result = await db.query(query);
    res.json({ log: result.rows });
  } catch (error) {
    next(error);
  }
});

// Database health check - verifies critical column types
router.get('/database/health', requireAdmin, async (req, res, next) => {
  try {
    const db = require('../config/database');

    // Check critical numeric columns that have had precision issues
    const columnChecks = await db.query(`
      SELECT
        column_name,
        data_type,
        numeric_precision,
        numeric_scale,
        CASE
          WHEN column_name = 'strategy_confidence' AND numeric_precision < 5 THEN 'WARN: Should be DECIMAL(5,2) to hold percentage values (0-100)'
          WHEN column_name = 'pnl' AND numeric_precision < 20 THEN 'WARN: Should be NUMERIC(20,6) to handle large trade values'
          WHEN column_name = 'pnl_percent' AND numeric_precision < 15 THEN 'WARN: Should be NUMERIC(15,6) for accuracy'
          ELSE 'OK'
        END as status
      FROM information_schema.columns
      WHERE table_name = 'trades'
        AND column_name IN ('strategy_confidence', 'pnl', 'pnl_percent', 'entry_price', 'exit_price', 'quantity', 'commission')
      ORDER BY column_name
    `);

    // Count migrations run
    const migrationCount = await db.query(`
      SELECT COUNT(*) as count FROM migrations
    `);

    // Check for any columns with warnings
    const warnings = columnChecks.rows.filter(col => col.status !== 'OK');
    const hasIssues = warnings.length > 0;

    res.json({
      status: hasIssues ? 'warning' : 'healthy',
      migrationsRun: migrationCount.rows[0].count,
      columns: columnChecks.rows,
      warnings: warnings.length > 0 ? warnings : null,
      recommendations: hasIssues ? [
        'Run pending migrations to fix column precision issues',
        'Ensure migrations 058, 064 have been applied for numeric field fixes'
      ] : null
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;