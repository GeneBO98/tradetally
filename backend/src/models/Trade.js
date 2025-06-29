const db = require('../config/database');

class Trade {
  static async create(userId, tradeData) {
    const {
      symbol, entryTime, exitTime, entryPrice, exitPrice,
      quantity, side, commission, fees, notes, isPublic, broker,
      strategy, setup, tags, pnl: providedPnL, pnlPercent: providedPnLPercent
    } = tradeData;

    // Use provided P&L if available (e.g., from Schwab), otherwise calculate it
    const pnl = providedPnL !== undefined ? providedPnL : this.calculatePnL(entryPrice, exitPrice, quantity, side, commission, fees);
    const pnlPercent = providedPnLPercent !== undefined ? providedPnLPercent : this.calculatePnLPercent(entryPrice, exitPrice, side);

    // Use exit date as trade date if available, otherwise use entry date
    const finalTradeDate = exitTime ? new Date(exitTime).toISOString().split('T')[0] : new Date(entryTime).toISOString().split('T')[0];

    const query = `
      INSERT INTO trades (
        user_id, symbol, trade_date, entry_time, exit_time, entry_price, exit_price,
        quantity, side, commission, fees, pnl, pnl_percent, notes, is_public,
        broker, strategy, setup, tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;

    const values = [
      userId, symbol.toUpperCase(), finalTradeDate, entryTime, exitTime, entryPrice, exitPrice,
      quantity, side, commission || 0, fees || 0, pnl, pnlPercent, notes, isPublic || false,
      broker, strategy, setup, tags || []
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findById(id, userId = null) {
    let query = `
      SELECT t.*, u.username, u.avatar_url,
        array_agg(DISTINCT ta.*) FILTER (WHERE ta.id IS NOT NULL) as attachments,
        count(DISTINCT tc.id)::integer as comment_count
      FROM trades t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      WHERE t.id = $1
    `;

    const values = [id];

    if (userId) {
      query += ` AND (t.user_id = $2 OR t.is_public = true)`;
      values.push(userId);
    } else {
      query += ` AND t.is_public = true`;
    }

    query += ` GROUP BY t.id, u.username, u.avatar_url`;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findByUser(userId, filters = {}) {
    let query = `
      SELECT t.*, 
        array_agg(DISTINCT ta.file_url) FILTER (WHERE ta.id IS NOT NULL) as attachment_urls,
        count(DISTINCT tc.id)::integer as comment_count
      FROM trades t
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      WHERE t.user_id = $1
    `;

    const values = [userId];
    let paramCount = 2;

    if (filters.symbol) {
      query += ` AND t.symbol = $${paramCount}`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

    if (filters.startDate) {
      query += ` AND t.trade_date >= $${paramCount}`;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      query += ` AND t.trade_date <= $${paramCount}`;
      values.push(filters.endDate);
      paramCount++;
    }

    if (filters.tags && filters.tags.length > 0) {
      query += ` AND t.tags && $${paramCount}`;
      values.push(filters.tags);
      paramCount++;
    }

    if (filters.strategy) {
      query += ` AND t.strategy = $${paramCount}`;
      values.push(filters.strategy);
      paramCount++;
    }

    // Advanced filters
    if (filters.side) {
      query += ` AND t.side = $${paramCount}`;
      values.push(filters.side);
      paramCount++;
    }

    if (filters.minPrice !== undefined) {
      query += ` AND t.entry_price >= $${paramCount}`;
      values.push(filters.minPrice);
      paramCount++;
    }

    if (filters.maxPrice !== undefined) {
      query += ` AND t.entry_price <= $${paramCount}`;
      values.push(filters.maxPrice);
      paramCount++;
    }

    if (filters.minQuantity !== undefined) {
      query += ` AND t.quantity >= $${paramCount}`;
      values.push(filters.minQuantity);
      paramCount++;
    }

    if (filters.maxQuantity !== undefined) {
      query += ` AND t.quantity <= $${paramCount}`;
      values.push(filters.maxQuantity);
      paramCount++;
    }

    if (filters.status === 'open') {
      query += ` AND t.exit_price IS NULL`;
    } else if (filters.status === 'closed') {
      query += ` AND t.exit_price IS NOT NULL`;
    }

    if (filters.minPnl !== undefined) {
      query += ` AND t.pnl >= $${paramCount}`;
      values.push(filters.minPnl);
      paramCount++;
    }

    if (filters.maxPnl !== undefined) {
      query += ` AND t.pnl <= $${paramCount}`;
      values.push(filters.maxPnl);
      paramCount++;
    }

    if (filters.pnlType === 'profit') {
      query += ` AND t.pnl > 0`;
    } else if (filters.pnlType === 'loss') {
      query += ` AND t.pnl < 0`;
    }

    query += ` GROUP BY t.id ORDER BY t.trade_date DESC, t.entry_time DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await db.query(query, values);
    return result.rows;
  }

  static async update(id, userId, updates) {
    // First get the current trade data for calculations
    const currentTrade = await this.findById(id, userId);
    
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Calculate trade_date based on exitTime or entryTime
    if (updates.exitTime) {
      updates.tradeDate = new Date(updates.exitTime).toISOString().split('T')[0];
    } else if (updates.entryTime) {
      // If we're updating entry time and there's no exit time, use entry time for trade date
      const exitTime = updates.exitTime || currentTrade.exit_time;
      if (!exitTime) {
        updates.tradeDate = new Date(updates.entryTime).toISOString().split('T')[0];
      }
    }

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'user_id' && key !== 'created_at') {
        // Convert camelCase to snake_case for database columns
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (updates.entryPrice || updates.exitPrice || updates.quantity || updates.side || updates.commission || updates.fees) {
      const pnl = this.calculatePnL(
        updates.entryPrice || currentTrade.entry_price,
        updates.exitPrice || currentTrade.exit_price,
        updates.quantity || currentTrade.quantity,
        updates.side || currentTrade.side,
        updates.commission || currentTrade.commission,
        updates.fees || currentTrade.fees
      );
      const pnlPercent = this.calculatePnLPercent(
        updates.entryPrice || currentTrade.entry_price,
        updates.exitPrice || currentTrade.exit_price,
        updates.side || currentTrade.side
      );

      fields.push(`pnl = $${paramCount}`);
      values.push(pnl);
      paramCount++;

      fields.push(`pnl_percent = $${paramCount}`);
      values.push(pnlPercent);
      paramCount++;
    }

    values.push(id);
    values.push(userId);

    const query = `
      UPDATE trades
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async delete(id, userId) {
    const query = `
      DELETE FROM trades
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await db.query(query, [id, userId]);
    return result.rows[0];
  }

  static async addAttachment(tradeId, attachmentData) {
    const { fileUrl, fileType, fileName, fileSize } = attachmentData;

    const query = `
      INSERT INTO trade_attachments (trade_id, file_url, file_type, file_name, file_size)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await db.query(query, [tradeId, fileUrl, fileType, fileName, fileSize]);
    return result.rows[0];
  }

  static async deleteAttachment(attachmentId, userId) {
    const query = `
      DELETE FROM trade_attachments ta
      USING trades t
      WHERE ta.id = $1 AND ta.trade_id = t.id AND t.user_id = $2
      RETURNING ta.id
    `;

    const result = await db.query(query, [attachmentId, userId]);
    return result.rows[0];
  }

  static async getPublicTrades(filters = {}) {
    let query = `
      SELECT t.*, u.username, u.avatar_url,
        array_agg(DISTINCT ta.file_url) FILTER (WHERE ta.id IS NOT NULL) as attachment_urls,
        count(DISTINCT tc.id)::integer as comment_count
      FROM trades t
      JOIN users u ON t.user_id = u.id
      JOIN user_settings us ON u.id = us.user_id
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      WHERE t.is_public = true AND us.public_profile = true
    `;

    const values = [];
    let paramCount = 1;

    if (filters.symbol) {
      query += ` AND t.symbol = $${paramCount}`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

    if (filters.username) {
      query += ` AND u.username = $${paramCount}`;
      values.push(filters.username);
      paramCount++;
    }

    query += ` GROUP BY t.id, u.username, u.avatar_url ORDER BY t.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await db.query(query, values);
    return result.rows;
  }

  static calculatePnL(entryPrice, exitPrice, quantity, side, commission = 0, fees = 0) {
    if (!exitPrice) return null;
    
    let pnl;
    if (side === 'long') {
      pnl = (exitPrice - entryPrice) * quantity;
    } else {
      pnl = (entryPrice - exitPrice) * quantity;
    }
    
    return pnl - commission - fees;
  }

  static calculatePnLPercent(entryPrice, exitPrice, side) {
    if (!exitPrice) return null;
    
    if (side === 'long') {
      return ((exitPrice - entryPrice) / entryPrice) * 100;
    } else {
      return ((entryPrice - exitPrice) / entryPrice) * 100;
    }
  }

  static async getAnalytics(userId, filters = {}) {
    console.log('Getting analytics for user:', userId, 'with filters:', filters);
    
    // First, check what data exists in the database
    const dataCheckQuery = `
      SELECT 
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE pnl IS NOT NULL) as trades_with_pnl,
        COUNT(*) FILTER (WHERE exit_price IS NOT NULL) as trades_with_exit,
        MIN(trade_date) as earliest_date,
        MAX(trade_date) as latest_date
      FROM trades 
      WHERE user_id = $1
    `;
    const dataCheck = await db.query(dataCheckQuery, [userId]);
    console.log('Analytics: Database data check:', dataCheck.rows[0]);
    
    // Make analytics less restrictive - only require user_id
    let whereClause = 'WHERE t.user_id = $1';
    const values = [userId];
    let paramCount = 2;

    // Add date filtering
    if (filters.startDate) {
      whereClause += ` AND t.trade_date >= $${paramCount}`;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      whereClause += ` AND t.trade_date <= $${paramCount}`;
      values.push(filters.endDate);
      paramCount++;
    }

    if (filters.symbol) {
      whereClause += ` AND t.symbol = $${paramCount}`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

    if (filters.strategy) {
      whereClause += ` AND t.strategy = $${paramCount}`;
      values.push(filters.strategy);
      paramCount++;
    }

    console.log('Analytics query - whereClause:', whereClause);
    console.log('Analytics query - values:', values);
    
    // First, let's count executions (individual database records)
    const executionCountQuery = `
      SELECT COUNT(*) as execution_count
      FROM trades t
      ${whereClause}
    `;
    
    const executionResult = await db.query(executionCountQuery, values);
    const executionCount = parseInt(executionResult.rows[0].execution_count) || 0;
    console.log('Total executions:', executionCount);

    const analyticsQuery = `
      WITH simple_trades AS (
        -- Simple grouping by symbol and date - include both open and closed positions
        SELECT 
          symbol,
          trade_date,
          SUM(COALESCE(pnl, 0)) as trade_pnl,
          SUM(commission + fees) as trade_costs,
          COUNT(*) as execution_count,
          AVG(pnl_percent) as avg_return_pct,
          MIN(entry_time) as first_entry,
          MAX(COALESCE(exit_time, entry_time)) as last_exit,
          -- Only count as a completed trade if there's P&L
          CASE WHEN SUM(pnl) IS NOT NULL THEN 1 ELSE 0 END as is_completed
        FROM trades t
        ${whereClause}
        GROUP BY symbol, trade_date
      ),
      trade_stats AS (
        SELECT 
          -- Only count completed trades for win/loss stats
          COUNT(*) FILTER (WHERE is_completed = 1)::integer as total_trades,
          COUNT(*) FILTER (WHERE is_completed = 1 AND trade_pnl > 0)::integer as winning_trades,
          COUNT(*) FILTER (WHERE is_completed = 1 AND trade_pnl < 0)::integer as losing_trades,
          COUNT(*) FILTER (WHERE is_completed = 1 AND trade_pnl = 0)::integer as breakeven_trades,
          COALESCE(SUM(trade_pnl), 0)::numeric as total_pnl,
          COALESCE(AVG(trade_pnl) FILTER (WHERE is_completed = 1), 0)::numeric as avg_pnl,
          COALESCE(AVG(trade_pnl) FILTER (WHERE is_completed = 1 AND trade_pnl > 0), 0)::numeric as avg_win,
          COALESCE(AVG(trade_pnl) FILTER (WHERE is_completed = 1 AND trade_pnl < 0), 0)::numeric as avg_loss,
          COALESCE(MAX(trade_pnl) FILTER (WHERE is_completed = 1), 0)::numeric as best_trade,
          COALESCE(MIN(trade_pnl) FILTER (WHERE is_completed = 1), 0)::numeric as worst_trade,
          COALESCE(SUM(trade_costs), 0)::numeric as total_costs,
          COALESCE(AVG(avg_return_pct) FILTER (WHERE avg_return_pct IS NOT NULL), 0)::numeric as avg_return_pct,
          COALESCE(STDDEV(trade_pnl) FILTER (WHERE is_completed = 1), 0)::numeric as pnl_stddev,
          COUNT(DISTINCT symbol)::integer as symbols_traded,
          COUNT(DISTINCT trade_date)::integer as trading_days,
          COALESCE(SUM(execution_count), 0)::integer as total_executions
        FROM simple_trades
      ),
      daily_pnl AS (
        SELECT 
          trade_date,
          SUM(trade_pnl) as daily_pnl,
          SUM(SUM(trade_pnl)) OVER (ORDER BY trade_date) as cumulative_pnl,
          COUNT(*) as trade_count
        FROM simple_trades
        GROUP BY trade_date
        ORDER BY trade_date
      ),
      drawdown_calc AS (
        SELECT 
          trade_date,
          cumulative_pnl,
          MAX(cumulative_pnl) OVER (ORDER BY trade_date ROWS UNBOUNDED PRECEDING) as peak,
          cumulative_pnl - MAX(cumulative_pnl) OVER (ORDER BY trade_date ROWS UNBOUNDED PRECEDING) as drawdown
        FROM daily_pnl
      )
      SELECT 
        ts.*,
        COALESCE(dp.max_daily_gain, 0) as max_daily_gain,
        COALESCE(dp.max_daily_loss, 0) as max_daily_loss,
        COALESCE(dd.max_drawdown, 0) as max_drawdown,
        CASE 
          WHEN ts.avg_loss = 0 OR ts.avg_loss IS NULL THEN 0
          ELSE ABS(ts.avg_win / ts.avg_loss)
        END as profit_factor,
        CASE 
          WHEN ts.total_trades = 0 THEN 0
          ELSE (ts.winning_trades * 100.0 / ts.total_trades)
        END as win_rate,
        CASE 
          WHEN ts.pnl_stddev = 0 OR ts.pnl_stddev IS NULL THEN 0
          ELSE (ts.avg_pnl / ts.pnl_stddev)
        END as sharpe_ratio
      FROM trade_stats ts
      LEFT JOIN (
        SELECT 
          MAX(daily_pnl) as max_daily_gain,
          MIN(daily_pnl) as max_daily_loss
        FROM daily_pnl
      ) dp ON true
      LEFT JOIN (
        SELECT MIN(drawdown) as max_drawdown
        FROM drawdown_calc
      ) dd ON true
    `;

    const analyticsResult = await db.query(analyticsQuery, values);
    const analytics = analyticsResult.rows[0];
    
    console.log('Analytics main query result:', analytics);
    console.log(`Executions: ${executionCount}, Trades: ${analytics.total_trades}, Win Rate: ${parseFloat(analytics.win_rate || 0).toFixed(2)}%`);
    console.log('Analytics: Summary stats calculated:', {
      totalTrades: analytics.total_trades,
      winningTrades: analytics.winning_trades,
      losingTrades: analytics.losing_trades,
      totalPnL: analytics.total_pnl
    });

    // Get performance by symbol using simple grouping
    const symbolQuery = `
      WITH symbol_trades AS (
        SELECT 
          symbol,
          trade_date,
          SUM(COALESCE(pnl, 0)) as trade_pnl,
          SUM(quantity) as trade_volume,
          COUNT(*) as execution_count,
          CASE WHEN SUM(pnl) IS NOT NULL THEN 1 ELSE 0 END as is_completed
        FROM trades t
        ${whereClause}
        GROUP BY symbol, trade_date
      )
      SELECT 
        symbol,
        COUNT(*) FILTER (WHERE is_completed = 1) as trades,
        SUM(trade_pnl) as total_pnl,
        AVG(trade_pnl) FILTER (WHERE is_completed = 1) as avg_pnl,
        COUNT(*) FILTER (WHERE is_completed = 1 AND trade_pnl > 0) as wins,
        SUM(trade_volume) as total_volume
      FROM symbol_trades
      GROUP BY symbol
      ORDER BY total_pnl DESC
      LIMIT 10
    `;

    const symbolResult = await db.query(symbolQuery, values);

    // Get daily P&L for charting - simplified to work with any data
    const dailyPnLQuery = `
      SELECT 
        trade_date,
        SUM(COALESCE(pnl, 0)) as daily_pnl,
        SUM(SUM(COALESCE(pnl, 0))) OVER (ORDER BY trade_date) as cumulative_pnl,
        COUNT(*) as trade_count
      FROM trades t
      ${whereClause}
      GROUP BY trade_date
      HAVING COUNT(*) > 0
      ORDER BY trade_date
    `;

    const dailyPnLResult = await db.query(dailyPnLQuery, values);
    console.log('Analytics: Daily P&L query returned', dailyPnLResult.rows.length, 'rows');
    console.log('Analytics: Daily P&L sample data:', dailyPnLResult.rows.slice(0, 3));

    // Get daily win rate data - simplified
    const dailyWinRateQuery = `
      SELECT 
        trade_date,
        COUNT(*) FILTER (WHERE COALESCE(pnl, 0) > 0) as wins,
        COUNT(*) FILTER (WHERE COALESCE(pnl, 0) < 0) as losses,
        COUNT(*) FILTER (WHERE COALESCE(pnl, 0) = 0) as breakeven,
        COUNT(*) as total_trades,
        CASE 
          WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE COALESCE(pnl, 0) > 0)::decimal / COUNT(*)::decimal) * 100, 2)
          ELSE 0 
        END as win_rate
      FROM trades t
      ${whereClause}
      GROUP BY trade_date
      HAVING COUNT(*) > 0
      ORDER BY trade_date
    `;

    const dailyWinRateResult = await db.query(dailyWinRateQuery, values);
    console.log('Analytics: Daily win rate query returned', dailyWinRateResult.rows.length, 'rows');
    console.log('Analytics: Daily win rate sample data:', dailyWinRateResult.rows.slice(0, 3));

    // Get best and worst trades using simple grouping
    const topTradesQuery = `
      WITH trade_summary AS (
        SELECT 
          symbol,
          trade_date,
          SUM(pnl) as trade_pnl,
          AVG(entry_price) as avg_entry_price,
          AVG(exit_price) as avg_exit_price,
          SUM(quantity) as total_quantity
        FROM trades t
        ${whereClause} AND pnl IS NOT NULL
        GROUP BY symbol, trade_date
      )
      (
        SELECT 'best' as type, symbol, avg_entry_price as entry_price, avg_exit_price as exit_price, 
               total_quantity as quantity, trade_pnl as pnl, trade_date
        FROM trade_summary
        ORDER BY trade_pnl DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT 'worst' as type, symbol, avg_entry_price as entry_price, avg_exit_price as exit_price, 
               total_quantity as quantity, trade_pnl as pnl, trade_date
        FROM trade_summary
        ORDER BY trade_pnl ASC
        LIMIT 5
      )
    `;

    const topTradesResult = await db.query(topTradesQuery, values);

    return {
      summary: {
        totalTrades: parseInt(analytics.total_trades) || 0,
        totalExecutions: executionCount,
        winningTrades: parseInt(analytics.winning_trades) || 0,
        losingTrades: parseInt(analytics.losing_trades) || 0,
        breakevenTrades: parseInt(analytics.breakeven_trades) || 0,
        totalPnL: parseFloat(analytics.total_pnl) || 0,
        avgPnL: parseFloat(analytics.avg_pnl) || 0,
        avgWin: parseFloat(analytics.avg_win) || 0,
        avgLoss: parseFloat(analytics.avg_loss) || 0,
        bestTrade: parseFloat(analytics.best_trade) || 0,
        worstTrade: parseFloat(analytics.worst_trade) || 0,
        totalCosts: parseFloat(analytics.total_costs) || 0,
        winRate: parseFloat(analytics.win_rate) || 0,
        profitFactor: parseFloat(analytics.profit_factor) || 0,
        sharpeRatio: parseFloat(analytics.sharpe_ratio) || 0,
        maxDrawdown: parseFloat(analytics.max_drawdown) || 0,
        maxDailyGain: parseFloat(analytics.max_daily_gain) || 0,
        maxDailyLoss: parseFloat(analytics.max_daily_loss) || 0,
        symbolsTraded: parseInt(analytics.symbols_traded) || 0,
        tradingDays: parseInt(analytics.trading_days) || 0,
        avgReturnPercent: parseFloat(analytics.avg_return_pct) || 0
      },
      performanceBySymbol: symbolResult.rows,
      dailyPnL: dailyPnLResult.rows,
      dailyWinRate: dailyWinRateResult.rows,
      topTrades: {
        best: topTradesResult.rows.filter(t => t.type === 'best'),
        worst: topTradesResult.rows.filter(t => t.type === 'worst')
      }
    };
  }

  static async getSymbolList(userId) {
    const query = `
      SELECT DISTINCT symbol
      FROM trades
      WHERE user_id = $1
      ORDER BY symbol
    `;
    const result = await db.query(query, [userId]);
    return result.rows.map(row => row.symbol);
  }

  static async getStrategyList(userId) {
    const query = `
      SELECT DISTINCT strategy
      FROM trades
      WHERE user_id = $1 AND strategy IS NOT NULL
      ORDER BY strategy
    `;
    const result = await db.query(query, [userId]);
    return result.rows.map(row => row.strategy);
  }

  static async updateSymbolForCusip(userId, cusip, ticker) {
    const query = `
      UPDATE trades 
      SET symbol = $3
      WHERE user_id = $1 AND symbol = $2
    `;
    const result = await db.query(query, [userId, cusip, ticker]);
    console.log(`Updated ${result.rowCount} trades: changed symbol from ${cusip} to ${ticker}`);
    return { affectedRows: result.rowCount };
  }
}

module.exports = Trade;