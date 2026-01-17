/**
 * Holdings Service
 * Manages long-term investment portfolio positions, lots, and dividends
 */

const db = require('../config/database');
const finnhub = require('../utils/finnhub');

class HoldingsService {
  /**
   * Get all holdings for a user (combines investment_holdings and open trades)
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of holdings
   */
  static async getHoldings(userId) {
    // Get manually created investment holdings
    const holdingsQuery = `
      SELECT h.*,
        (SELECT COUNT(*) FROM investment_lots l WHERE l.holding_id = h.id) as lot_count,
        (SELECT SUM(total_amount) FROM investment_dividends d WHERE d.holding_id = h.id) as total_dividends,
        'investment' as source
      FROM investment_holdings h
      WHERE h.user_id = $1
    `;
    const holdingsResult = await db.query(holdingsQuery, [userId]);
    const investmentHoldings = holdingsResult.rows.map(row => this.rowToHolding(row));

    // Get open trades (no exit price) grouped by symbol
    // Calculate both net position (shares held) and total shares traded from executions
    const openTradesQuery = `
      WITH trade_executions AS (
        SELECT
          t.id as trade_id,
          t.symbol,
          t.side,
          t.quantity as trade_quantity,
          t.entry_price,
          t.entry_time,
          t.broker,
          t.executions,
          -- Calculate net position from executions (buys - sells)
          COALESCE(
            (SELECT SUM(
              CASE
                WHEN COALESCE(exec->>'action', exec->>'side', '') IN ('buy', 'long') THEN (exec->>'quantity')::numeric
                WHEN COALESCE(exec->>'action', exec->>'side', '') IN ('sell', 'short') THEN -(exec->>'quantity')::numeric
                ELSE 0
              END
            )
            FROM jsonb_array_elements(COALESCE(t.executions, '[]'::jsonb)) AS exec
            WHERE exec->>'quantity' IS NOT NULL),
            t.quantity  -- Fallback to trade quantity if no executions
          ) as net_position,
          -- Calculate total shares traded (sum of all quantities)
          COALESCE(
            (SELECT SUM(ABS((exec->>'quantity')::numeric))
            FROM jsonb_array_elements(COALESCE(t.executions, '[]'::jsonb)) AS exec
            WHERE exec->>'quantity' IS NOT NULL),
            t.quantity  -- Fallback to trade quantity if no executions
          ) as shares_traded
        FROM trades t
        WHERE t.user_id = $1
          AND t.exit_price IS NULL
          AND t.side = 'long'
      )
      SELECT
        symbol,
        SUM(net_position) as net_shares_held,
        SUM(shares_traded) as total_shares_traded,
        SUM(trade_quantity) as total_shares,
        SUM(trade_quantity * entry_price) / NULLIF(SUM(trade_quantity), 0) as average_cost_basis,
        -- Fix: total_cost_basis should sum each trade's (net_position * entry_price)
        -- This ensures correct unrealized P&L when trades have different entry prices
        COALESCE(SUM(net_position * COALESCE(entry_price, 0)), 0) as total_cost_basis,
        COUNT(*) as trade_count,
        MIN(entry_time) as first_entry,
        MAX(entry_time) as last_entry,
        STRING_AGG(DISTINCT broker, ', ') as brokers
      FROM trade_executions
      GROUP BY symbol
      HAVING SUM(net_position) > 0
    `;
    const openTradesResult = await db.query(openTradesQuery, [userId]);

    // Convert open trades to holding format
    const openTradeHoldings = openTradesResult.rows.map(row => ({
      id: `trade-${row.symbol}`, // Synthetic ID for open trades
      userId: userId,
      symbol: row.symbol,
      totalShares: parseFloat(row.net_shares_held) || 0,  // Net position (shares actually held)
      totalSharesTraded: parseFloat(row.total_shares_traded) || 0,  // Total volume traded
      averageCostBasis: parseFloat(row.average_cost_basis) || null,
      totalCostBasis: parseFloat(row.total_cost_basis) || 0,
      currentPrice: null, // Will be refreshed
      currentValue: null,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
      priceUpdatedAt: null,
      totalDividendsReceived: 0,
      dividendYieldOnCost: null,
      lastDividendDate: null,
      targetAllocationPercent: null,
      notes: null,
      sector: null,
      lotCount: parseInt(row.trade_count) || 0,
      createdAt: row.first_entry,
      updatedAt: row.last_entry,
      source: 'trades', // Mark as coming from trades
      brokers: row.brokers
    }));

    // Combine and deduplicate (prefer investment_holdings over open trades for same symbol)
    const holdingsMap = new Map();

    // Add investment holdings first
    for (const holding of investmentHoldings) {
      holdingsMap.set(holding.symbol, holding);
    }

    // Add open trade holdings only if not already in investment holdings
    for (const holding of openTradeHoldings) {
      if (!holdingsMap.has(holding.symbol)) {
        holdingsMap.set(holding.symbol, holding);
      }
    }

    // Convert back to array and sort
    const combined = Array.from(holdingsMap.values());
    combined.sort((a, b) => {
      // Sort by current value descending, then by symbol
      if (a.currentValue !== null && b.currentValue !== null) {
        return b.currentValue - a.currentValue;
      }
      if (a.currentValue !== null) return -1;
      if (b.currentValue !== null) return 1;
      return a.symbol.localeCompare(b.symbol);
    });

    return combined;
  }

  /**
   * Get a single holding by ID
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   * @returns {Promise<Object|null>} Holding or null
   */
  static async getHolding(userId, holdingId) {
    const query = `
      SELECT h.*,
        (SELECT COUNT(*) FROM investment_lots l WHERE l.holding_id = h.id) as lot_count,
        (SELECT SUM(total_amount) FROM investment_dividends d WHERE d.holding_id = h.id) as total_dividends
      FROM investment_holdings h
      WHERE h.id = $1 AND h.user_id = $2
    `;

    const result = await db.query(query, [holdingId, userId]);
    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToHolding(result.rows[0]);
  }

  /**
   * Get a holding by symbol
   * @param {string} userId - User ID
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object|null>} Holding or null
   */
  static async getHoldingBySymbol(userId, symbol) {
    const query = `
      SELECT h.*
      FROM investment_holdings h
      WHERE h.user_id = $1 AND h.symbol = $2
    `;

    const result = await db.query(query, [userId, symbol.toUpperCase()]);
    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToHolding(result.rows[0]);
  }

  /**
   * Create a new holding
   * @param {string} userId - User ID
   * @param {Object} data - Holding data
   * @returns {Promise<Object>} Created holding
   */
  static async createHolding(userId, data) {
    const { symbol, shares, costPerShare, purchaseDate, notes, broker, accountIdentifier } = data;
    const symbolUpper = symbol.toUpperCase();

    // Check if holding already exists
    const existing = await this.getHoldingBySymbol(userId, symbolUpper);
    if (existing) {
      throw new Error(`Holding for ${symbolUpper} already exists. Add a new lot instead.`);
    }

    const totalCost = shares * costPerShare;

    // Create holding
    const holdingQuery = `
      INSERT INTO investment_holdings (
        user_id, symbol, total_shares, average_cost_basis, total_cost_basis, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const holdingResult = await db.query(holdingQuery, [
      userId,
      symbolUpper,
      shares,
      costPerShare,
      totalCost,
      notes || null
    ]);

    const holding = holdingResult.rows[0];

    // Create initial lot
    const lotQuery = `
      INSERT INTO investment_lots (
        holding_id, user_id, shares, cost_per_share, total_cost, purchase_date, broker, account_identifier
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await db.query(lotQuery, [
      holding.id,
      userId,
      shares,
      costPerShare,
      totalCost,
      purchaseDate || new Date(),
      broker || null,
      accountIdentifier || null
    ]);

    // Get current price and update
    await this.refreshHoldingPrice(userId, holding.id);

    return this.getHolding(userId, holding.id);
  }

  /**
   * Update a holding
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated holding
   */
  static async updateHolding(userId, holdingId, data) {
    const { notes, targetAllocationPercent, sector } = data;

    const query = `
      UPDATE investment_holdings
      SET
        notes = COALESCE($3, notes),
        target_allocation_percent = COALESCE($4, target_allocation_percent),
        sector = COALESCE($5, sector),
        updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, [
      holdingId,
      userId,
      notes,
      targetAllocationPercent,
      sector
    ]);

    if (result.rows.length === 0) {
      throw new Error('Holding not found');
    }

    return this.rowToHolding(result.rows[0]);
  }

  /**
   * Delete a holding and all related data
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   * @returns {Promise<boolean>} Success
   */
  static async deleteHolding(userId, holdingId) {
    // Lots and dividends are deleted via CASCADE
    const query = `
      DELETE FROM investment_holdings
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await db.query(query, [holdingId, userId]);
    return result.rows.length > 0;
  }

  /**
   * Add a lot to an existing holding
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   * @param {Object} data - Lot data
   * @returns {Promise<Object>} Created lot
   */
  static async addLot(userId, holdingId, data) {
    const { shares, costPerShare, purchaseDate, broker, accountIdentifier, notes } = data;
    const totalCost = shares * costPerShare;

    // Verify holding exists and belongs to user
    const holding = await this.getHolding(userId, holdingId);
    if (!holding) {
      throw new Error('Holding not found');
    }

    // Insert lot
    const lotQuery = `
      INSERT INTO investment_lots (
        holding_id, user_id, shares, cost_per_share, total_cost, purchase_date, broker, account_identifier, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const lotResult = await db.query(lotQuery, [
      holdingId,
      userId,
      shares,
      costPerShare,
      totalCost,
      purchaseDate || new Date(),
      broker || null,
      accountIdentifier || null,
      notes || null
    ]);

    // Update holding totals
    await this.recalculateHolding(userId, holdingId);

    return this.rowToLot(lotResult.rows[0]);
  }

  /**
   * Get lots for a holding
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   * @returns {Promise<Array>} Array of lots
   */
  static async getLots(userId, holdingId) {
    const query = `
      SELECT *
      FROM investment_lots
      WHERE holding_id = $1 AND user_id = $2
      ORDER BY purchase_date DESC
    `;

    const result = await db.query(query, [holdingId, userId]);
    return result.rows.map(row => this.rowToLot(row));
  }

  /**
   * Delete a lot
   * @param {string} userId - User ID
   * @param {string} lotId - Lot ID
   * @returns {Promise<boolean>} Success
   */
  static async deleteLot(userId, lotId) {
    // Get holding ID before deleting
    const lotQuery = `SELECT holding_id FROM investment_lots WHERE id = $1 AND user_id = $2`;
    const lotResult = await db.query(lotQuery, [lotId, userId]);

    if (lotResult.rows.length === 0) {
      return false;
    }

    const holdingId = lotResult.rows[0].holding_id;

    // Delete the lot
    const deleteQuery = `DELETE FROM investment_lots WHERE id = $1 AND user_id = $2`;
    await db.query(deleteQuery, [lotId, userId]);

    // Check if holding has any remaining lots
    const remainingQuery = `SELECT COUNT(*) as count FROM investment_lots WHERE holding_id = $1`;
    const remainingResult = await db.query(remainingQuery, [holdingId]);

    if (parseInt(remainingResult.rows[0].count) === 0) {
      // Delete holding if no lots remain
      await db.query(`DELETE FROM investment_holdings WHERE id = $1`, [holdingId]);
    } else {
      // Recalculate holding
      await this.recalculateHolding(userId, holdingId);
    }

    return true;
  }

  /**
   * Record a dividend payment
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   * @param {Object} data - Dividend data
   * @returns {Promise<Object>} Created dividend
   */
  static async recordDividend(userId, holdingId, data) {
    const { dividendPerShare, sharesHeld, paymentDate, exDividendDate, isDrip, dripShares, dripPrice, notes } = data;

    const holding = await this.getHolding(userId, holdingId);
    if (!holding) {
      throw new Error('Holding not found');
    }

    const totalAmount = dividendPerShare * sharesHeld;

    const query = `
      INSERT INTO investment_dividends (
        holding_id, user_id, symbol, dividend_per_share, shares_held, total_amount,
        ex_dividend_date, payment_date, is_drip, drip_shares, drip_price, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await db.query(query, [
      holdingId,
      userId,
      holding.symbol,
      dividendPerShare,
      sharesHeld,
      totalAmount,
      exDividendDate || null,
      paymentDate,
      isDrip || false,
      dripShares || null,
      dripPrice || null,
      notes || null
    ]);

    // Update holding dividend totals
    await this.updateDividendTotals(userId, holdingId);

    // If DRIP, add shares
    if (isDrip && dripShares && dripPrice) {
      await this.addLot(userId, holdingId, {
        shares: dripShares,
        costPerShare: dripPrice,
        purchaseDate: paymentDate,
        notes: 'DRIP reinvestment'
      });
    }

    return this.rowToDividend(result.rows[0]);
  }

  /**
   * Get dividend history for a holding
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   * @returns {Promise<Array>} Array of dividends
   */
  static async getDividendHistory(userId, holdingId) {
    const query = `
      SELECT *
      FROM investment_dividends
      WHERE holding_id = $1 AND user_id = $2
      ORDER BY payment_date DESC
    `;

    const result = await db.query(query, [holdingId, userId]);
    return result.rows.map(row => this.rowToDividend(row));
  }

  /**
   * Get portfolio summary for a user
   * @param {string} userId - User ID
   * @param {Array} [holdingsWithPrices] - Optional pre-fetched holdings with prices already populated
   * @returns {Promise<Object>} Portfolio summary
   */
  static async getPortfolioSummary(userId, holdingsWithPrices = null) {
    // Use provided holdings (with prices) or fetch fresh (will have null prices for trade-based)
    const holdings = holdingsWithPrices || await this.getHoldings(userId);

    const totals = holdings.reduce((acc, h) => {
      acc.totalValue += h.currentValue || 0;
      acc.totalCost += h.totalCostBasis || 0;
      acc.totalDividends += h.totalDividendsReceived || 0;
      return acc;
    }, { totalValue: 0, totalCost: 0, totalDividends: 0 });

    const unrealizedPnL = totals.totalValue - totals.totalCost;
    const unrealizedPnLPercent = totals.totalCost > 0
      ? (unrealizedPnL / totals.totalCost) * 100
      : 0;

    // Calculate allocation by symbol
    const allocation = holdings.map(h => ({
      symbol: h.symbol,
      value: h.currentValue || 0,
      percent: totals.totalValue > 0
        ? ((h.currentValue || 0) / totals.totalValue) * 100
        : 0
    }));

    return {
      holdingCount: holdings.length,
      totalValue: totals.totalValue,
      totalCostBasis: totals.totalCost,
      unrealizedPnL,
      unrealizedPnLPercent,
      totalDividends: totals.totalDividends,
      totalReturn: unrealizedPnL + totals.totalDividends,
      allocation
    };
  }

  /**
   * Refresh prices for all user holdings
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Updated holdings with current prices
   */
  static async refreshPrices(userId) {
    const holdings = await this.getHoldings(userId);
    const updatedHoldings = [];

    for (const holding of holdings) {
      try {
        // Use crypto quote for crypto symbols
        const quote = finnhub.isCryptoSymbol(holding.symbol)
          ? await finnhub.getCryptoQuote(holding.symbol)
          : await finnhub.getQuote(holding.symbol);
        if (quote && quote.c) {
          const currentPrice = quote.c;
          const currentValue = holding.totalShares * currentPrice;
          const unrealizedPnl = currentValue - holding.totalCostBasis;
          const unrealizedPnlPercent = holding.totalCostBasis > 0
            ? (unrealizedPnl / holding.totalCostBasis) * 100
            : 0;

          // Update the holding object
          holding.currentPrice = currentPrice;
          holding.currentValue = currentValue;
          holding.unrealizedPnl = unrealizedPnl;
          holding.unrealizedPnlPercent = unrealizedPnlPercent;
          holding.priceUpdatedAt = new Date();

          // If this is an investment_holdings record (not from trades), update the database
          if (holding.source !== 'trades' && !String(holding.id).startsWith('trade-')) {
            await this.refreshHoldingPrice(userId, holding.id);
          }
        }
        updatedHoldings.push(holding);
      } catch (error) {
        console.error(`[HOLDINGS] Failed to refresh price for ${holding.symbol}: ${error.message}`);
        updatedHoldings.push(holding);
      }
    }

    return updatedHoldings;
  }

  /**
   * Refresh price for a single holding
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   */
  static async refreshHoldingPrice(userId, holdingId) {
    const holding = await this.getHolding(userId, holdingId);
    if (!holding) return;

    try {
      // Use crypto quote for crypto symbols
      const quote = finnhub.isCryptoSymbol(holding.symbol)
        ? await finnhub.getCryptoQuote(holding.symbol)
        : await finnhub.getQuote(holding.symbol);
      if (!quote || !quote.c) return;

      const currentPrice = quote.c;
      const currentValue = holding.totalShares * currentPrice;
      const unrealizedPnL = currentValue - holding.totalCostBasis;
      const unrealizedPnLPercent = holding.totalCostBasis > 0
        ? (unrealizedPnL / holding.totalCostBasis) * 100
        : 0;

      const query = `
        UPDATE investment_holdings
        SET
          current_price = $3,
          current_value = $4,
          unrealized_pnl = $5,
          unrealized_pnl_percent = $6,
          price_updated_at = NOW(),
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `;

      await db.query(query, [
        holdingId,
        userId,
        currentPrice,
        currentValue,
        unrealizedPnL,
        unrealizedPnLPercent
      ]);
    } catch (error) {
      console.error(`[HOLDINGS] Error refreshing price for ${holding.symbol}: ${error.message}`);
    }
  }

  /**
   * Recalculate holding totals from lots
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   */
  static async recalculateHolding(userId, holdingId) {
    const query = `
      UPDATE investment_holdings h
      SET
        total_shares = (
          SELECT COALESCE(SUM(shares), 0)
          FROM investment_lots l
          WHERE l.holding_id = h.id
        ),
        total_cost_basis = (
          SELECT COALESCE(SUM(total_cost), 0)
          FROM investment_lots l
          WHERE l.holding_id = h.id
        ),
        average_cost_basis = (
          SELECT CASE
            WHEN SUM(shares) > 0 THEN SUM(total_cost) / SUM(shares)
            ELSE 0
          END
          FROM investment_lots l
          WHERE l.holding_id = h.id
        ),
        updated_at = NOW()
      WHERE h.id = $1 AND h.user_id = $2
    `;

    await db.query(query, [holdingId, userId]);

    // Also refresh price
    await this.refreshHoldingPrice(userId, holdingId);
  }

  /**
   * Update dividend totals for a holding
   * @param {string} userId - User ID
   * @param {string} holdingId - Holding ID
   */
  static async updateDividendTotals(userId, holdingId) {
    const query = `
      UPDATE investment_holdings h
      SET
        total_dividends_received = (
          SELECT COALESCE(SUM(total_amount), 0)
          FROM investment_dividends d
          WHERE d.holding_id = h.id
        ),
        last_dividend_date = (
          SELECT MAX(payment_date)
          FROM investment_dividends d
          WHERE d.holding_id = h.id
        ),
        dividend_yield_on_cost = (
          SELECT CASE
            WHEN h.total_cost_basis > 0 THEN
              (SELECT COALESCE(SUM(total_amount), 0) FROM investment_dividends d WHERE d.holding_id = h.id) / h.total_cost_basis * 100
            ELSE 0
          END
        ),
        updated_at = NOW()
      WHERE h.id = $1 AND h.user_id = $2
    `;

    await db.query(query, [holdingId, userId]);
  }

  /**
   * Convert database row to holding object (camelCase)
   */
  static rowToHolding(row) {
    return {
      id: row.id,
      userId: row.user_id,
      symbol: row.symbol,
      totalShares: parseFloat(row.total_shares) || 0,
      averageCostBasis: parseFloat(row.average_cost_basis) || null,
      totalCostBasis: parseFloat(row.total_cost_basis) || 0,
      currentPrice: parseFloat(row.current_price) || null,
      currentValue: parseFloat(row.current_value) || null,
      unrealizedPnl: parseFloat(row.unrealized_pnl) || null,
      unrealizedPnlPercent: parseFloat(row.unrealized_pnl_percent) || null,
      priceUpdatedAt: row.price_updated_at,
      totalDividendsReceived: parseFloat(row.total_dividends_received) || 0,
      dividendYieldOnCost: parseFloat(row.dividend_yield_on_cost) || null,
      lastDividendDate: row.last_dividend_date,
      targetAllocationPercent: parseFloat(row.target_allocation_percent) || null,
      notes: row.notes,
      sector: row.sector,
      lotCount: parseInt(row.lot_count) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      source: row.source || 'investment' // 'investment' or 'trades'
    };
  }

  /**
   * Convert database row to lot object (camelCase)
   */
  static rowToLot(row) {
    return {
      id: row.id,
      holdingId: row.holding_id,
      shares: parseFloat(row.shares),
      costPerShare: parseFloat(row.cost_per_share),
      totalCost: parseFloat(row.total_cost),
      purchaseDate: row.purchase_date,
      broker: row.broker,
      accountIdentifier: row.account_identifier,
      notes: row.notes,
      createdAt: row.created_at
    };
  }

  /**
   * Convert database row to dividend object (camelCase)
   */
  static rowToDividend(row) {
    return {
      id: row.id,
      holdingId: row.holding_id,
      symbol: row.symbol,
      dividendPerShare: parseFloat(row.dividend_per_share),
      sharesHeld: parseFloat(row.shares_held),
      totalAmount: parseFloat(row.total_amount),
      exDividendDate: row.ex_dividend_date,
      paymentDate: row.payment_date,
      isDrip: row.is_drip,
      dripShares: row.drip_shares ? parseFloat(row.drip_shares) : null,
      dripPrice: row.drip_price ? parseFloat(row.drip_price) : null,
      notes: row.notes,
      createdAt: row.created_at
    };
  }
}

module.exports = HoldingsService;
