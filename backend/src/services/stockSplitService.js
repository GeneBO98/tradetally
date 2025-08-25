const StockSplit = require('../models/StockSplit');
const Trade = require('../models/Trade');
const finnhub = require('../utils/finnhub');
const db = require('../config/database');

class StockSplitService {
  constructor() {
    this.checkInterval = null;
  }

  /**
   * Check for stock splits for all open positions
   */
  async checkForStockSplits() {
    console.log('[StockSplitService] Starting stock split check...');
    
    try {
      // Get symbols that need checking (haven't been checked in last 24 hours)
      const symbolsToCheck = await StockSplit.getSymbolsToCheck(24);
      
      if (symbolsToCheck.length === 0) {
        console.log('[StockSplitService] No symbols need checking');
        return { checked: 0, splitsFound: 0 };
      }
      
      console.log(`[StockSplitService] Checking ${symbolsToCheck.length} symbols for splits`);
      
      let totalSplitsFound = 0;
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      
      // Format dates for Finnhub API (YYYY-MM-DD)
      const fromDate = this.formatDate(oneYearAgo);
      const toDate = this.formatDate(today);
      
      for (const symbol of symbolsToCheck) {
        try {
          console.log(`[StockSplitService] Checking ${symbol} for splits from ${fromDate} to ${toDate}`);
          
          // Get splits from Finnhub
          const splits = await finnhub.getStockSplits(symbol, fromDate, toDate);
          
          if (splits && splits.length > 0) {
            console.log(`[StockSplitService] Found ${splits.length} splits for ${symbol}`);
            
            // Process each split
            for (const split of splits) {
              await this.processSplit(symbol, split);
              totalSplitsFound++;
            }
          }
          
          // Update check log
          await StockSplit.updateCheckLog(symbol, splits ? splits.length : 0);
          
          // Small delay between API calls to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`[StockSplitService] Error checking ${symbol}:`, error.message);
          await StockSplit.updateCheckLog(symbol, 0, error.message);
        }
      }
      
      // Process any unprocessed splits
      await this.processUnprocessedSplits();
      
      console.log(`[StockSplitService] Check complete. Found ${totalSplitsFound} total splits`);
      return { checked: symbolsToCheck.length, splitsFound: totalSplitsFound };
      
    } catch (error) {
      console.error('[StockSplitService] Error in checkForStockSplits:', error);
      throw error;
    }
  }

  /**
   * Process a single stock split
   */
  async processSplit(symbol, splitData) {
    try {
      // Calculate the split ratio
      const ratio = splitData.toFactor / splitData.fromFactor;
      
      // Store the split in database
      const split = await StockSplit.create({
        symbol: symbol,
        splitDate: splitData.date,
        fromFactor: splitData.fromFactor,
        toFactor: splitData.toFactor,
        ratio: ratio
      });
      
      console.log(`[StockSplitService] Stored split for ${symbol}: ${splitData.toFactor}:${splitData.fromFactor} on ${splitData.date}`);
      
      return split;
    } catch (error) {
      console.error(`[StockSplitService] Error processing split for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Process all unprocessed splits and adjust trades
   */
  async processUnprocessedSplits() {
    const unprocessedSplits = await StockSplit.findUnprocessed();
    
    if (unprocessedSplits.length === 0) {
      console.log('[StockSplitService] No unprocessed splits to handle');
      return;
    }
    
    console.log(`[StockSplitService] Processing ${unprocessedSplits.length} unprocessed splits`);
    
    for (const split of unprocessedSplits) {
      await this.adjustTradesForSplit(split);
    }
  }

  /**
   * Adjust all affected trades for a specific split
   */
  async adjustTradesForSplit(split) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Find all open trades for this symbol that were entered before the split date
      const tradesQuery = `
        SELECT * FROM trades
        WHERE symbol = $1
        AND exit_price IS NULL
        AND entry_date <= $2
        AND NOT EXISTS (
          SELECT 1 FROM trade_split_adjustments
          WHERE trade_id = trades.id
          AND split_id = $3
        )
      `;
      
      const tradesResult = await client.query(tradesQuery, [split.symbol, split.split_date, split.id]);
      const trades = tradesResult.rows;
      
      if (trades.length === 0) {
        console.log(`[StockSplitService] No trades to adjust for ${split.symbol} split on ${split.split_date}`);
        await StockSplit.markAsProcessed(split.id);
        await client.query('COMMIT');
        return;
      }
      
      console.log(`[StockSplitService] Adjusting ${trades.length} trades for ${split.symbol} split (${split.to_factor}:${split.from_factor})`);
      
      for (const trade of trades) {
        // Store original values before adjustment
        const originalQuantity = trade.quantity;
        const originalEntryPrice = trade.entry_price;
        const originalExitPrice = trade.exit_price;
        
        // Adjust the trade
        const adjustedTrade = await StockSplit.adjustTradeForSplit(trade.id, split.ratio);
        
        // Log the adjustment
        await StockSplit.logSplitAdjustment({
          tradeId: trade.id,
          splitId: split.id,
          originalQuantity: originalQuantity,
          adjustedQuantity: adjustedTrade.quantity,
          originalPrice: originalEntryPrice,
          adjustedPrice: adjustedTrade.entry_price,
          adjustmentRatio: split.ratio
        });
        
        console.log(`[StockSplitService] Adjusted trade ${trade.id}: Qty ${originalQuantity} -> ${adjustedTrade.quantity}, Price ${originalEntryPrice} -> ${adjustedTrade.entry_price}`);
      }
      
      // Mark split as processed
      await StockSplit.markAsProcessed(split.id);
      
      await client.query('COMMIT');
      
      console.log(`[StockSplitService] Successfully processed split for ${split.symbol}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[StockSplitService] Error adjusting trades for split:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Start daily check for stock splits
   */
  startDailyCheck() {
    // Run immediately on startup
    this.checkForStockSplits().catch(error => {
      console.error('[StockSplitService] Initial check failed:', error);
    });
    
    // Then run daily at 2 AM
    const checkTime = new Date();
    checkTime.setHours(2, 0, 0, 0);
    
    // If it's past 2 AM today, schedule for tomorrow
    if (checkTime < new Date()) {
      checkTime.setDate(checkTime.getDate() + 1);
    }
    
    const timeUntilCheck = checkTime.getTime() - Date.now();
    
    console.log(`[StockSplitService] Next stock split check scheduled for ${checkTime.toISOString()}`);
    
    // Schedule the first check
    setTimeout(() => {
      this.checkForStockSplits().catch(error => {
        console.error('[StockSplitService] Scheduled check failed:', error);
      });
      
      // Then schedule daily checks
      this.checkInterval = setInterval(() => {
        this.checkForStockSplits().catch(error => {
          console.error('[StockSplitService] Daily check failed:', error);
        });
      }, 24 * 60 * 60 * 1000); // 24 hours
      
    }, timeUntilCheck);
  }

  /**
   * Stop daily checks
   */
  stopDailyCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[StockSplitService] Daily stock split checks stopped');
    }
  }

  /**
   * Format date for Finnhub API (YYYY-MM-DD)
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Manually trigger a stock split check for a specific symbol
   */
  async checkSymbolForSplits(symbol, fromDate = null, toDate = null) {
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    
    const from = fromDate || this.formatDate(oneYearAgo);
    const to = toDate || this.formatDate(today);
    
    console.log(`[StockSplitService] Manual check for ${symbol} from ${from} to ${to}`);
    
    try {
      const splits = await finnhub.getStockSplits(symbol, from, to);
      
      if (splits && splits.length > 0) {
        console.log(`[StockSplitService] Found ${splits.length} splits for ${symbol}`);
        
        for (const split of splits) {
          await this.processSplit(symbol, split);
        }
        
        // Process the splits immediately
        await this.processUnprocessedSplits();
      }
      
      await StockSplit.updateCheckLog(symbol, splits ? splits.length : 0);
      
      return splits || [];
    } catch (error) {
      console.error(`[StockSplitService] Error in manual check for ${symbol}:`, error);
      await StockSplit.updateCheckLog(symbol, 0, error.message);
      throw error;
    }
  }
}

module.exports = new StockSplitService();