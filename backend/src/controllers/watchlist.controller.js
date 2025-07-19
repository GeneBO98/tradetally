const db = require('../config/database');
const logger = require('../utils/logger');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');
const { v4: uuidv4 } = require('uuid');

const watchlistController = {
  // Get all watchlists for a user
  async getUserWatchlists(req, res, next) {
    try {
      const userId = req.user.id;
      
      const query = `
        SELECT 
          w.id,
          w.name,
          w.description,
          w.is_default,
          w.created_at,
          w.updated_at,
          COUNT(wi.id) as item_count,
          COUNT(pa.id) as alert_count
        FROM watchlists w
        LEFT JOIN watchlist_items wi ON w.id = wi.watchlist_id
        LEFT JOIN price_alerts pa ON w.user_id = pa.user_id 
          AND pa.symbol IN (SELECT symbol FROM watchlist_items WHERE watchlist_id = w.id)
          AND pa.is_active = TRUE
        WHERE w.user_id = $1
        GROUP BY w.id, w.name, w.description, w.is_default, w.created_at, w.updated_at
        ORDER BY w.is_default DESC, w.name ASC
      `;
      
      const result = await db.query(query, [userId]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.logError('Error fetching user watchlists:', error);
      next(error);
    }
  },

  // Get a specific watchlist with items
  async getWatchlist(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Get watchlist info
      const watchlistQuery = `
        SELECT id, name, description, is_default, created_at, updated_at
        FROM watchlists 
        WHERE id = $1 AND user_id = $2
      `;
      
      const watchlistResult = await db.query(watchlistQuery, [id, userId]);
      
      if (watchlistResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Watchlist not found'
        });
      }
      
      // Get watchlist items with current prices
      const itemsQuery = `
        SELECT 
          wi.id,
          wi.symbol,
          wi.added_at,
          wi.notes,
          pm.current_price,
          pm.previous_price,
          pm.price_change,
          pm.percent_change,
          pm.volume,
          pm.last_updated as price_last_updated
        FROM watchlist_items wi
        LEFT JOIN price_monitoring pm ON wi.symbol = pm.symbol
        WHERE wi.watchlist_id = $1
        ORDER BY wi.added_at DESC
      `;
      
      const itemsResult = await db.query(itemsQuery, [id]);
      
      const watchlist = watchlistResult.rows[0];
      watchlist.items = itemsResult.rows;
      
      res.json({
        success: true,
        data: watchlist
      });
    } catch (error) {
      logger.logError('Error fetching watchlist:', error);
      next(error);
    }
  },

  // Create a new watchlist
  async createWatchlist(req, res, next) {
    try {
      const userId = req.user.id;
      const { name, description, is_default = false } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Watchlist name is required'
        });
      }
      
      // If setting as default, unset other default watchlists
      if (is_default) {
        await db.query(
          'UPDATE watchlists SET is_default = FALSE WHERE user_id = $1',
          [userId]
        );
      }
      
      const query = `
        INSERT INTO watchlists (id, user_id, name, description, is_default)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, description, is_default, created_at, updated_at
      `;
      
      const id = uuidv4();
      const result = await db.query(query, [id, userId, name.trim(), description, is_default]);
      
      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'watchlists_name_user_unique') {
        return res.status(400).json({
          success: false,
          error: 'A watchlist with this name already exists'
        });
      }
      logger.logError('Error creating watchlist:', error);
      next(error);
    }
  },

  // Update a watchlist
  async updateWatchlist(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { name, description, is_default } = req.body;
      
      // Check if watchlist exists
      const existsQuery = 'SELECT id FROM watchlists WHERE id = $1 AND user_id = $2';
      const existsResult = await db.query(existsQuery, [id, userId]);
      
      if (existsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Watchlist not found'
        });
      }
      
      // If setting as default, unset other default watchlists
      if (is_default === true) {
        await db.query(
          'UPDATE watchlists SET is_default = FALSE WHERE user_id = $1',
          [userId]
        );
      }
      
      const updates = [];
      const values = [];
      let paramIndex = 1;
      
      if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(name.trim());
      }
      
      if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(description);
      }
      
      if (is_default !== undefined) {
        updates.push(`is_default = $${paramIndex++}`);
        values.push(is_default);
      }
      
      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields to update'
        });
      }
      
      values.push(id, userId);
      
      const query = `
        UPDATE watchlists 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
        RETURNING id, name, description, is_default, created_at, updated_at
      `;
      
      const result = await db.query(query, values);
      
      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'watchlists_name_user_unique') {
        return res.status(400).json({
          success: false,
          error: 'A watchlist with this name already exists'
        });
      }
      logger.logError('Error updating watchlist:', error);
      next(error);
    }
  },

  // Delete a watchlist
  async deleteWatchlist(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const query = 'DELETE FROM watchlists WHERE id = $1 AND user_id = $2 RETURNING id';
      const result = await db.query(query, [id, userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Watchlist not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Watchlist deleted successfully'
      });
    } catch (error) {
      logger.logError('Error deleting watchlist:', error);
      next(error);
    }
  },

  // Add symbol to watchlist
  async addSymbolToWatchlist(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { symbol, notes } = req.body;
      
      if (!symbol || !symbol.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Symbol is required'
        });
      }
      
      const symbolUpper = symbol.trim().toUpperCase();
      
      // Verify watchlist exists and belongs to user
      const watchlistQuery = 'SELECT id FROM watchlists WHERE id = $1 AND user_id = $2';
      const watchlistResult = await db.query(watchlistQuery, [id, userId]);
      
      if (watchlistResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Watchlist not found'
        });
      }
      
      // Get current price for the symbol
      let currentPrice = null;
      try {
        const priceData = await finnhub.getQuote(symbolUpper);
        if (priceData && priceData.c) {
          currentPrice = priceData.c;
          
          // Update or insert price monitoring data
          await db.query(`
            INSERT INTO price_monitoring (symbol, current_price, previous_price, price_change, percent_change, volume, data_source)
            VALUES ($1, $2, $3, $4, $5, $6, 'finnhub')
            ON CONFLICT (symbol) DO UPDATE SET
              previous_price = price_monitoring.current_price,
              current_price = $2,
              price_change = $2 - price_monitoring.current_price,
              percent_change = CASE 
                WHEN price_monitoring.current_price > 0 
                THEN (($2 - price_monitoring.current_price) / price_monitoring.current_price) * 100 
                ELSE 0 
              END,
              volume = $6,
              last_updated = CURRENT_TIMESTAMP,
              data_source = 'finnhub'
          `, [symbolUpper, currentPrice, null, 0, 0, priceData.pc || 0]);
        }
      } catch (priceError) {
        logger.logWarn(`Could not fetch price for symbol ${symbolUpper}:`, priceError.message);
      }
      
      const itemId = uuidv4();
      const query = `
        INSERT INTO watchlist_items (id, watchlist_id, symbol, notes)
        VALUES ($1, $2, $3, $4)
        RETURNING id, symbol, added_at, notes
      `;
      
      const result = await db.query(query, [itemId, id, symbolUpper, notes]);
      
      const item = result.rows[0];
      item.current_price = currentPrice;
      
      res.status(201).json({
        success: true,
        data: item
      });
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'watchlist_items_symbol_unique') {
        return res.status(400).json({
          success: false,
          error: 'Symbol is already in this watchlist'
        });
      }
      logger.logError('Error adding symbol to watchlist:', error);
      next(error);
    }
  },

  // Remove symbol from watchlist
  async removeSymbolFromWatchlist(req, res, next) {
    try {
      const { id, itemId } = req.params;
      const userId = req.user.id;
      
      // Verify watchlist belongs to user and item exists
      const query = `
        DELETE FROM watchlist_items wi
        USING watchlists w
        WHERE wi.id = $1 
        AND wi.watchlist_id = w.id 
        AND w.id = $2 
        AND w.user_id = $3
        RETURNING wi.id
      `;
      
      const result = await db.query(query, [itemId, id, userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Watchlist item not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Symbol removed from watchlist'
      });
    } catch (error) {
      logger.logError('Error removing symbol from watchlist:', error);
      next(error);
    }
  },

  // Update watchlist item notes
  async updateWatchlistItem(req, res, next) {
    try {
      const { id, itemId } = req.params;
      const userId = req.user.id;
      const { notes } = req.body;
      
      const query = `
        UPDATE watchlist_items wi
        SET notes = $1
        FROM watchlists w
        WHERE wi.id = $2 
        AND wi.watchlist_id = w.id 
        AND w.id = $3 
        AND w.user_id = $4
        RETURNING wi.id, wi.symbol, wi.added_at, wi.notes
      `;
      
      const result = await db.query(query, [notes, itemId, id, userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Watchlist item not found'
        });
      }
      
      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.logError('Error updating watchlist item:', error);
      next(error);
    }
  }
};

module.exports = watchlistController;