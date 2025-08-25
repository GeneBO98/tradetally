const db = require('../config/database');

class StockSplit {
  static async create(splitData) {
    const { symbol, splitDate, fromFactor, toFactor, ratio } = splitData;
    
    const query = `
      INSERT INTO stock_splits (symbol, split_date, from_factor, to_factor, ratio)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (symbol, split_date) DO UPDATE SET
        from_factor = EXCLUDED.from_factor,
        to_factor = EXCLUDED.to_factor,
        ratio = EXCLUDED.ratio,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [symbol, splitDate, fromFactor, toFactor, ratio];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findUnprocessed() {
    const query = `
      SELECT * FROM stock_splits
      WHERE processed = FALSE
      ORDER BY split_date DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  static async findBySymbol(symbol, startDate = null) {
    let query = `
      SELECT * FROM stock_splits
      WHERE symbol = $1
    `;
    const values = [symbol];
    
    if (startDate) {
      query += ` AND split_date >= $2`;
      values.push(startDate);
    }
    
    query += ` ORDER BY split_date DESC`;
    
    const result = await db.query(query, values);
    return result.rows;
  }

  static async markAsProcessed(splitId) {
    const query = `
      UPDATE stock_splits
      SET processed = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [splitId]);
    return result.rows[0];
  }

  static async logSplitAdjustment(adjustmentData) {
    const { tradeId, splitId, originalQuantity, adjustedQuantity, originalPrice, adjustedPrice, adjustmentRatio } = adjustmentData;
    
    const query = `
      INSERT INTO trade_split_adjustments 
      (trade_id, split_id, original_quantity, adjusted_quantity, original_price, adjusted_price, adjustment_ratio)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (trade_id, split_id) DO NOTHING
      RETURNING *
    `;
    
    const values = [tradeId, splitId, originalQuantity, adjustedQuantity, originalPrice, adjustedPrice, adjustmentRatio];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async getAdjustmentsForTrade(tradeId) {
    const query = `
      SELECT tsa.*, ss.symbol, ss.split_date, ss.from_factor, ss.to_factor
      FROM trade_split_adjustments tsa
      JOIN stock_splits ss ON tsa.split_id = ss.id
      WHERE tsa.trade_id = $1
      ORDER BY ss.split_date DESC
    `;
    
    const result = await db.query(query, [tradeId]);
    return result.rows;
  }

  static async updateCheckLog(symbol, splitsFound = 0, errorMessage = null) {
    const query = `
      INSERT INTO stock_split_check_log (symbol, last_checked_at, splits_found, error_message)
      VALUES ($1, CURRENT_TIMESTAMP, $2, $3)
      ON CONFLICT (symbol) DO UPDATE SET
        last_checked_at = CURRENT_TIMESTAMP,
        splits_found = stock_split_check_log.splits_found + EXCLUDED.splits_found,
        error_message = EXCLUDED.error_message
      RETURNING *
    `;
    
    const values = [symbol, splitsFound, errorMessage];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async getSymbolsToCheck(hoursAgo = 24) {
    const query = `
      SELECT DISTINCT t.symbol 
      FROM trades t
      WHERE t.exit_price IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM stock_split_check_log l
        WHERE l.symbol = t.symbol
        AND l.last_checked_at > NOW() - INTERVAL '${hoursAgo} hours'
      )
      ORDER BY t.symbol
    `;
    
    const result = await db.query(query);
    return result.rows.map(row => row.symbol);
  }

  static async adjustTradeForSplit(tradeId, splitRatio) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the current trade
      const tradeQuery = 'SELECT * FROM trades WHERE id = $1';
      const tradeResult = await client.query(tradeQuery, [tradeId]);
      const trade = tradeResult.rows[0];
      
      if (!trade) {
        throw new Error(`Trade ${tradeId} not found`);
      }
      
      // Store original values if not already stored
      if (!trade.split_adjusted) {
        const storeOriginalQuery = `
          UPDATE trades
          SET original_quantity = quantity,
              original_entry_price = entry_price,
              original_exit_price = exit_price
          WHERE id = $1 AND original_quantity IS NULL
        `;
        await client.query(storeOriginalQuery, [tradeId]);
      }
      
      // Adjust the trade values
      const adjustQuery = `
        UPDATE trades
        SET quantity = quantity * $1,
            entry_price = entry_price / $1,
            exit_price = CASE WHEN exit_price IS NOT NULL THEN exit_price / $1 ELSE NULL END,
            split_adjusted = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      
      const adjustResult = await client.query(adjustQuery, [splitRatio, tradeId]);
      
      await client.query('COMMIT');
      
      return adjustResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = StockSplit;