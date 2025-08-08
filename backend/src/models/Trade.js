const db = require('../config/database');

class Trade {
  static async create(userId, tradeData) {
    const {
      symbol, entryTime, exitTime, entryPrice, exitPrice,
      quantity, side, commission, fees, notes, isPublic, broker,
      strategy, setup, tags, pnl: providedPnL, pnlPercent: providedPnLPercent,
      executionData, mae, mfe
    } = tradeData;

    // Convert empty strings to null for optional fields
    const cleanExitTime = exitTime === '' ? null : exitTime;
    const cleanExitPrice = exitPrice === '' ? null : exitPrice;

    // Use provided P&L if available (e.g., from Schwab), otherwise calculate it
    const pnl = providedPnL !== undefined ? providedPnL : this.calculatePnL(entryPrice, cleanExitPrice, quantity, side, commission, fees);
    const pnlPercent = providedPnLPercent !== undefined ? providedPnLPercent : this.calculatePnLPercent(entryPrice, cleanExitPrice, side);

    // Use exit date as trade date if available, otherwise use entry date
    const finalTradeDate = cleanExitTime ? new Date(cleanExitTime).toISOString().split('T')[0] : new Date(entryTime).toISOString().split('T')[0];

    const query = `
      INSERT INTO trades (
        user_id, symbol, trade_date, entry_time, exit_time, entry_price, exit_price,
        quantity, side, commission, fees, pnl, pnl_percent, notes, is_public,
        broker, strategy, setup, tags, executions, mae, mfe
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `;

    const values = [
      userId, symbol.toUpperCase(), finalTradeDate, entryTime, cleanExitTime, entryPrice, cleanExitPrice,
      quantity, side, commission || 0, fees || 0, pnl, pnlPercent, notes, isPublic || false,
      broker, strategy, setup, tags || [], JSON.stringify(executionData || []), mae || null, mfe || null
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findById(id, userId = null) {
    let query = `
      SELECT t.*, u.username, u.avatar_url,
        array_agg(DISTINCT ta.*) FILTER (WHERE ta.id IS NOT NULL) as attachments,
        count(DISTINCT tc.id)::integer as comment_count,
        sc.finnhub_industry as sector,
        sc.company_name as company_name
      FROM trades t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
      WHERE t.id = $1
    `;

    const values = [id];

    if (userId) {
      query += ` AND (t.user_id = $2 OR t.is_public = true)`;
      values.push(userId);
    } else {
      query += ` AND t.is_public = true`;
    }

    query += ` GROUP BY t.id, u.username, u.avatar_url, sc.finnhub_industry, sc.company_name`;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findByUser(userId, filters = {}) {
    let query = `
      SELECT t.*, 
        array_agg(DISTINCT ta.file_url) FILTER (WHERE ta.id IS NOT NULL) as attachment_urls,
        count(DISTINCT tc.id)::integer as comment_count,
        sc.finnhub_industry as sector,
        sc.company_name as company_name
      FROM trades t
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
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

    if (filters.sector) {
      query += ` AND sc.finnhub_industry = $${paramCount}`;
      values.push(filters.sector);
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

    // Broker filter
    if (filters.broker) {
      query += ` AND t.broker = $${paramCount}`;
      values.push(filters.broker);
      paramCount++;
    }

    // Hold time filter
    if (filters.holdTime) {
      query += this.getHoldTimeFilter(filters.holdTime);
    }

    query += ` GROUP BY t.id, sc.finnhub_industry, sc.company_name ORDER BY t.trade_date DESC, t.entry_time DESC`;

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
    
    // Convert empty strings to null for optional fields
    if (updates.exitTime === '') updates.exitTime = null;
    if (updates.exitPrice === '') updates.exitPrice = null;
    
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
        // Handle executionData -> executions mapping
        if (key === 'executionData') {
          fields.push(`executions = $${paramCount}`);
          values.push(JSON.stringify(value));
          paramCount++;
        } else {
          // Convert camelCase to snake_case for database columns
          const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          fields.push(`${dbKey} = $${paramCount}`);
          
          // Handle JSON/JSONB fields that need serialization
          if (key === 'executions' || key === 'classificationMetadata' || key === 'newsEvents') {
            values.push(JSON.stringify(value));
          } else {
            values.push(value);
          }
          paramCount++;
        }
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

    // Apply comprehensive filters (matching findByUser method)
    if (filters.symbol) {
      whereClause += ` AND t.symbol = $${paramCount}`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

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

    if (filters.tags && filters.tags.length > 0) {
      whereClause += ` AND t.tags && $${paramCount}`;
      values.push(filters.tags);
      paramCount++;
    }

    if (filters.strategy) {
      whereClause += ` AND t.strategy = $${paramCount}`;
      values.push(filters.strategy);
      paramCount++;
    }

    // Multi-select filters - strategies
    if (filters.strategies && filters.strategies.length > 0) {
      whereClause += ` AND t.strategy = ANY($${paramCount})`;
      values.push(filters.strategies);
      paramCount++;
    }

    if (filters.sector) {
      whereClause += ` AND sc.finnhub_industry = $${paramCount}`;
      values.push(filters.sector);
      paramCount++;
    }

    // Multi-select filters - sectors
    if (filters.sectors && filters.sectors.length > 0) {
      whereClause += ` AND sc.finnhub_industry = ANY($${paramCount})`;
      values.push(filters.sectors);
      paramCount++;
    }

    // Advanced filters
    if (filters.side) {
      whereClause += ` AND t.side = $${paramCount}`;
      values.push(filters.side);
      paramCount++;
    }

    if (filters.minPrice !== undefined) {
      whereClause += ` AND t.entry_price >= $${paramCount}`;
      values.push(filters.minPrice);
      paramCount++;
    }

    if (filters.maxPrice !== undefined) {
      whereClause += ` AND t.entry_price <= $${paramCount}`;
      values.push(filters.maxPrice);
      paramCount++;
    }

    if (filters.minQuantity !== undefined) {
      whereClause += ` AND t.quantity >= $${paramCount}`;
      values.push(filters.minQuantity);
      paramCount++;
    }

    if (filters.maxQuantity !== undefined) {
      whereClause += ` AND t.quantity <= $${paramCount}`;
      values.push(filters.maxQuantity);
      paramCount++;
    }

    if (filters.status === 'open') {
      whereClause += ` AND t.exit_price IS NULL`;
    } else if (filters.status === 'closed') {
      whereClause += ` AND t.exit_price IS NOT NULL`;
    }

    if (filters.minPnl !== undefined) {
      whereClause += ` AND t.pnl >= $${paramCount}`;
      values.push(filters.minPnl);
      paramCount++;
    }

    if (filters.maxPnl !== undefined) {
      whereClause += ` AND t.pnl <= $${paramCount}`;
      values.push(filters.maxPnl);
      paramCount++;
    }

    if (filters.pnlType === 'profit') {
      whereClause += ` AND t.pnl > 0`;
    } else if (filters.pnlType === 'loss') {
      whereClause += ` AND t.pnl < 0`;
    }

    // Broker filter
    if (filters.broker) {
      whereClause += ` AND t.broker = $${paramCount}`;
      values.push(filters.broker);
      paramCount++;
    }

    // News filter (check for null/empty news_sentiment to determine if news exists)
    if (filters.hasNews === 'true') {
      whereClause += ` AND t.news_sentiment IS NOT NULL AND t.news_sentiment != ''`;
    } else if (filters.hasNews === 'false') {
      whereClause += ` AND (t.news_sentiment IS NULL OR t.news_sentiment = '')`;
    }

    // Hold time filter
    if (filters.holdTime) {
      whereClause += this.getHoldTimeFilter(filters.holdTime);
    }

    // Hold time range filters
    if (filters.minHoldTime !== undefined) {
      whereClause += ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) >= $${paramCount}`;
      values.push(filters.minHoldTime);
      paramCount++;
    }

    if (filters.maxHoldTime !== undefined) {
      whereClause += ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) <= $${paramCount}`;
      values.push(filters.maxHoldTime);
      paramCount++;
    }

    // Days of week filter
    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      whereClause += ` AND EXTRACT(DOW FROM t.trade_date) = ANY($${paramCount})`;
      values.push(filters.daysOfWeek);
      paramCount++;
    }

    console.log('Analytics query - whereClause:', whereClause);
    console.log('Analytics query - values:', values);
    
    // First, let's count executions (individual database records)
    const executionCountQuery = `
      SELECT COUNT(*) as execution_count
      FROM trades t
      LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
      ${whereClause}
    `;
    
    const executionResult = await db.query(executionCountQuery, values);
    const executionCount = parseInt(executionResult.rows[0].execution_count) || 0;
    console.log('Total executions:', executionCount);

    const analyticsQuery = `
      WITH simple_trades AS (
        -- Simple grouping by symbol and date - include both open and closed positions
        SELECT 
          t.symbol,
          t.trade_date,
          SUM(COALESCE(t.pnl, 0)) as trade_pnl,
          SUM(t.commission + t.fees) as trade_costs,
          COUNT(*) as execution_count,
          AVG(t.pnl_percent) as avg_return_pct,
          MIN(t.entry_time) as first_entry,
          MAX(COALESCE(t.exit_time, t.entry_time)) as last_exit,
          -- Only count as a completed trade if there's P&L
          CASE WHEN SUM(t.pnl) IS NOT NULL THEN 1 ELSE 0 END as is_completed
        FROM trades t
        LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
        ${whereClause}
        GROUP BY t.symbol, t.trade_date
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
      ),
      drawdown_debug AS (
        SELECT 
          MIN(drawdown) as calculated_max_drawdown,
          COUNT(*) as drawdown_days,
          MIN(cumulative_pnl) as min_cumulative_pnl,
          MAX(peak) as max_peak
        FROM drawdown_calc
      )
      SELECT 
        ts.*,
        COALESCE(dp.max_daily_gain, 0) as max_daily_gain,
        COALESCE(dp.max_daily_loss, 0) as max_daily_loss,
        COALESCE(dd.max_drawdown, 0) as max_drawdown,
        ddb.calculated_max_drawdown as debug_max_drawdown,
        ddb.drawdown_days,
        ddb.min_cumulative_pnl,
        ddb.max_peak,
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
        SELECT 
          MIN(drawdown) as max_drawdown,
          COUNT(*) as dd_count
        FROM drawdown_calc
      ) dd ON true
      LEFT JOIN drawdown_debug ddb ON true
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
    console.log('Drawdown debug info:', {
      max_drawdown: analytics.max_drawdown,
      debug_max_drawdown: analytics.debug_max_drawdown,
      drawdown_days: analytics.drawdown_days,
      min_cumulative_pnl: analytics.min_cumulative_pnl,
      max_peak: analytics.max_peak,
      dd_count: analytics.dd_count
    });
    
    // Debug: Get first few days of drawdown data
    const drawdownSampleQuery = `
      WITH daily_pnl AS (
        SELECT 
          trade_date,
          COALESCE(SUM(pnl), 0) as daily_pnl
        FROM trades
        WHERE user_id = $1
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
      drawdown_calc AS (
        SELECT 
          trade_date,
          daily_pnl,
          cumulative_pnl,
          MAX(cumulative_pnl) OVER (ORDER BY trade_date ROWS UNBOUNDED PRECEDING) as peak,
          cumulative_pnl - MAX(cumulative_pnl) OVER (ORDER BY trade_date ROWS UNBOUNDED PRECEDING) as drawdown
        FROM cumulative_pnl
      )
      SELECT * FROM drawdown_calc
      ORDER BY drawdown ASC
      LIMIT 5
    `;
    
    const drawdownSample = await db.query(drawdownSampleQuery, [userId]);
    console.log('Worst drawdown days:', drawdownSample.rows);

    // Get performance by symbol using simple grouping
    const symbolQuery = `
      WITH symbol_trades AS (
        SELECT 
          t.symbol,
          t.trade_date,
          SUM(COALESCE(t.pnl, 0)) as trade_pnl,
          SUM(t.quantity) as trade_volume,
          COUNT(*) as execution_count,
          CASE WHEN SUM(t.pnl) IS NOT NULL THEN 1 ELSE 0 END as is_completed
        FROM trades t
        LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
        ${whereClause}
        GROUP BY t.symbol, t.trade_date
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
        t.trade_date,
        SUM(COALESCE(t.pnl, 0)) as daily_pnl,
        SUM(SUM(COALESCE(t.pnl, 0))) OVER (ORDER BY t.trade_date) as cumulative_pnl,
        COUNT(*) as trade_count
      FROM trades t
      LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
      ${whereClause}
      GROUP BY t.trade_date
      HAVING COUNT(*) > 0
      ORDER BY t.trade_date
    `;

    const dailyPnLResult = await db.query(dailyPnLQuery, values);
    console.log('Analytics: Daily P&L query returned', dailyPnLResult.rows.length, 'rows');
    console.log('Analytics: Daily P&L sample data:', dailyPnLResult.rows.slice(0, 3));

    // Get daily win rate data - simplified
    const dailyWinRateQuery = `
      SELECT 
        t.trade_date,
        COUNT(*) FILTER (WHERE COALESCE(t.pnl, 0) > 0) as wins,
        COUNT(*) FILTER (WHERE COALESCE(t.pnl, 0) < 0) as losses,
        COUNT(*) FILTER (WHERE COALESCE(t.pnl, 0) = 0) as breakeven,
        COUNT(*) as total_trades,
        CASE 
          WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE COALESCE(t.pnl, 0) > 0)::decimal / COUNT(*)::decimal) * 100, 2)
          ELSE 0 
        END as win_rate
      FROM trades t
      LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
      ${whereClause}
      GROUP BY t.trade_date
      HAVING COUNT(*) > 0
      ORDER BY t.trade_date
    `;

    const dailyWinRateResult = await db.query(dailyWinRateQuery, values);
    console.log('Analytics: Daily win rate query returned', dailyWinRateResult.rows.length, 'rows');
    console.log('Analytics: Daily win rate sample data:', dailyWinRateResult.rows.slice(0, 3));

    // Get best and worst individual trades (not grouped)
    const topTradesQuery = `
      (
        SELECT 'best' as type, t.id, t.symbol, t.entry_price, t.exit_price, 
               t.quantity, t.pnl, t.trade_date
        FROM trades t
        LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
        ${whereClause} AND t.pnl IS NOT NULL
        ORDER BY t.pnl DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT 'worst' as type, t.id, t.symbol, t.entry_price, t.exit_price, 
               t.quantity, t.pnl, t.trade_date
        FROM trades t
        LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
        ${whereClause} AND t.pnl IS NOT NULL
        ORDER BY t.pnl ASC
        LIMIT 5
      )
    `;

    const topTradesResult = await db.query(topTradesQuery, values);

    // Get individual best and worst trades for the metric cards
    const bestWorstTradesQuery = `
      (
        SELECT 'best' as type, t.id, t.symbol, t.pnl, t.trade_date
        FROM trades t
        LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
        ${whereClause} AND t.pnl IS NOT NULL
        ORDER BY t.pnl DESC
        LIMIT 1
      )
      UNION ALL
      (
        SELECT 'worst' as type, t.id, t.symbol, t.pnl, t.trade_date
        FROM trades t
        LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
        ${whereClause} AND t.pnl IS NOT NULL
        ORDER BY t.pnl ASC
        LIMIT 1
      )
    `;

    const bestWorstResult = await db.query(bestWorstTradesQuery, values);
    const bestTrade = bestWorstResult.rows.find(t => t.type === 'best') || null;
    const worstTrade = bestWorstResult.rows.find(t => t.type === 'worst') || null;

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
      },
      bestTradeDetails: bestTrade,
      worstTradeDetails: worstTrade
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

  static async getRoundTripTradeCount(userId, filters = {}) {
    // Build the same WHERE clause as findByUser method
    let whereClause = 'WHERE t.user_id = $1';
    const values = [userId];
    let paramCount = 2;

    if (filters.symbol) {
      whereClause += ` AND t.symbol = $${paramCount}`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

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

    if (filters.tags && filters.tags.length > 0) {
      whereClause += ` AND t.tags && $${paramCount}`;
      values.push(filters.tags);
      paramCount++;
    }

    if (filters.strategy) {
      whereClause += ` AND t.strategy = $${paramCount}`;
      values.push(filters.strategy);
      paramCount++;
    }

    if (filters.sector) {
      whereClause += ` AND t.symbol IN (SELECT symbol FROM symbol_categories WHERE finnhub_industry = $${paramCount})`;
      values.push(filters.sector);
      paramCount++;
    }

    // Add all other filters from findByUser
    if (filters.side) {
      whereClause += ` AND t.side = $${paramCount}`;
      values.push(filters.side);
      paramCount++;
    }

    if (filters.minPrice !== undefined) {
      whereClause += ` AND t.entry_price >= $${paramCount}`;
      values.push(filters.minPrice);
      paramCount++;
    }

    if (filters.maxPrice !== undefined) {
      whereClause += ` AND t.entry_price <= $${paramCount}`;
      values.push(filters.maxPrice);
      paramCount++;
    }

    if (filters.minQuantity !== undefined) {
      whereClause += ` AND t.quantity >= $${paramCount}`;
      values.push(filters.minQuantity);
      paramCount++;
    }

    if (filters.maxQuantity !== undefined) {
      whereClause += ` AND t.quantity <= $${paramCount}`;
      values.push(filters.maxQuantity);
      paramCount++;
    }

    if (filters.status === 'open') {
      whereClause += ` AND t.exit_price IS NULL`;
    } else if (filters.status === 'closed') {
      whereClause += ` AND t.exit_price IS NOT NULL`;
    }

    if (filters.minPnl !== undefined) {
      whereClause += ` AND t.pnl >= $${paramCount}`;
      values.push(filters.minPnl);
      paramCount++;
    }

    if (filters.maxPnl !== undefined) {
      whereClause += ` AND t.pnl <= $${paramCount}`;
      values.push(filters.maxPnl);
      paramCount++;
    }

    if (filters.pnlType === 'profit') {
      whereClause += ` AND t.pnl > 0`;
    } else if (filters.pnlType === 'loss') {
      whereClause += ` AND t.pnl < 0`;
    }

    if (filters.broker) {
      whereClause += ` AND t.broker = $${paramCount}`;
      values.push(filters.broker);
      paramCount++;
    }

    if (filters.holdTime) {
      whereClause += this.getHoldTimeFilter(filters.holdTime);
    }

    // Use the same round-trip counting logic as analytics
    const query = `
      WITH simple_trades AS (
        -- Group by symbol and date to create round-trip trades
        SELECT 
          symbol,
          trade_date,
          SUM(COALESCE(pnl, 0)) as trade_pnl,
          -- Only count as a completed trade if there's P&L
          CASE WHEN SUM(pnl) IS NOT NULL THEN 1 ELSE 0 END as is_completed
        FROM trades t
        ${whereClause}
        GROUP BY symbol, trade_date
      )
      SELECT 
        COUNT(*) FILTER (WHERE is_completed = 1)::integer as round_trip_count
      FROM simple_trades
    `;

    const result = await db.query(query, values);
    return parseInt(result.rows[0].round_trip_count) || 0;
  }

  static async getRoundTripTrades(userId, filters = {}) {
    // Build the same WHERE clause as findByUser method
    let whereClause = 'WHERE t.user_id = $1';
    const values = [userId];
    let paramCount = 2;

    if (filters.symbol) {
      whereClause += ` AND t.symbol = $${paramCount}`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

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

    if (filters.tags && filters.tags.length > 0) {
      whereClause += ` AND t.tags && $${paramCount}`;
      values.push(filters.tags);
      paramCount++;
    }

    if (filters.strategy) {
      whereClause += ` AND t.strategy = $${paramCount}`;
      values.push(filters.strategy);
      paramCount++;
    }

    if (filters.sector) {
      whereClause += ` AND t.symbol IN (SELECT symbol FROM symbol_categories WHERE finnhub_industry = $${paramCount})`;
      values.push(filters.sector);
      paramCount++;
    }

    // Add pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const query = `
      WITH simple_trades AS (
        SELECT 
          t.symbol,
          t.trade_date,
          SUM(COALESCE(t.pnl, 0)) as pnl,
          SUM(t.commission + t.fees) as total_costs,
          COUNT(*) as execution_count,
          AVG(t.pnl_percent) as avg_return_pct,
          MIN(t.entry_time) as first_entry_time,
          MAX(COALESCE(t.exit_time, t.entry_time)) as last_exit_time,
          MIN(t.entry_price) as min_entry_price,
          MAX(t.exit_price) as max_exit_price,
          SUM(t.quantity) as total_quantity,
          array_agg(DISTINCT t.side) as sides,
          array_agg(DISTINCT t.strategy) FILTER (WHERE t.strategy IS NOT NULL) as strategies,
          array_agg(DISTINCT t.broker) FILTER (WHERE t.broker IS NOT NULL) as brokers,
          string_agg(DISTINCT t.notes, ' | ') FILTER (WHERE t.notes IS NOT NULL) as combined_notes,
          -- Only count as a completed trade if there's P&L
          CASE WHEN SUM(t.pnl) IS NOT NULL THEN 1 ELSE 0 END as is_completed
        FROM trades t
        ${whereClause}
        GROUP BY t.symbol, t.trade_date
        ORDER BY t.trade_date DESC, t.symbol
      ),
      trades_with_sectors AS (
        SELECT 
          st.*,
          sc.finnhub_industry as sector
        FROM simple_trades st
        LEFT JOIN symbol_categories sc ON st.symbol = sc.symbol
        WHERE st.is_completed = 1
      )
      SELECT 
        md5(symbol || trade_date) as id,
        symbol,
        trade_date,
        pnl,
        CASE WHEN pnl > 0 THEN (pnl / NULLIF(min_entry_price * total_quantity, 0)) * 100 ELSE 0 END as pnl_percent,
        total_costs as commission,
        0 as fees,
        execution_count,
        avg_return_pct,
        first_entry_time as entry_time,
        last_exit_time as exit_time,
        min_entry_price as entry_price,
        max_exit_price as exit_price,
        total_quantity as quantity,
        CASE WHEN 'long' = ANY(sides) THEN 'long' ELSE 'short' END as side,
        COALESCE(array_to_string(strategies, ', '), '') as strategy,
        COALESCE(array_to_string(brokers, ', '), '') as broker,
        COALESCE(sector, '') as sector,
        combined_notes as notes,
        is_completed,
        'round-trip' as trade_type,
        0 as comment_count
      FROM trades_with_sectors
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    values.push(limit, offset);

    const result = await db.query(query, values);
    return result.rows;
  }

  static getHoldTimeFilter(holdTimeRange) {
    // Calculate hold time as the difference between entry_time and exit_time
    // For open trades (no exit_time), use current time
    let timeCondition = '';
    
    switch (holdTimeRange) {
      case '< 1 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) < 60`;
        break;
      case '1-5 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 60 AND 300`;
        break;
      case '5-15 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 300 AND 900`;
        break;
      case '15-30 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 900 AND 1800`;
        break;
      case '30-60 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 1800 AND 3600`;
        break;
      case '1-2 hours':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 3600 AND 7200`;
        break;
      case '2-4 hours':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 7200 AND 14400`;
        break;
      case '4-24 hours':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 14400 AND 86400`;
        break;
      case '1-7 days':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 86400 AND 604800`;
        break;
      case '1-4 weeks':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 604800 AND 2419200`;
        break;
      case '1+ months':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) >= 2419200`;
        break;
      default:
        timeCondition = '';
    }
    
    return timeCondition;
  }
}

module.exports = Trade;