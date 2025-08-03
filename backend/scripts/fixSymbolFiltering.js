#!/usr/bin/env node

/**
 * Comprehensive fix for symbol filtering issues
 * This script will:
 * 1. Try to resolve CUSIPs using multiple methods
 * 2. Update trades table with resolved tickers
 * 3. Clean up incorrect symbol_categories entries
 * 4. Reset failed CUSIP resolutions for retry
 */

const db = require('../src/config/database');
const finnhub = require('../src/utils/finnhub');
const cache = require('../src/utils/cache');

class SymbolFilteringFixer {
  constructor() {
    this.results = {
      cusipsResolved: 0,
      tradesUpdated: 0,
      categoriesFixed: 0,
      queueReset: 0
    };
  }

  /**
   * Try to resolve a CUSIP using multiple methods
   */
  async resolveCUSIP(cusip) {
    console.log(`Attempting to resolve CUSIP: ${cusip}`);
    
    // Method 1: Try Finnhub
    try {
      const ticker = await finnhub.lookupCusip(cusip);
      if (ticker && ticker !== cusip) {
        console.log(`  ✅ Finnhub resolved ${cusip} → ${ticker}`);
        return ticker;
      }
    } catch (error) {
      console.log(`  ❌ Finnhub failed for ${cusip}: ${error.message}`);
    }
    
    // Method 2: Try manual lookup for common patterns
    const manualMapping = this.getManualMapping(cusip);
    if (manualMapping) {
      console.log(`  ✅ Manual mapping ${cusip} → ${manualMapping}`);
      return manualMapping;
    }
    
    // Method 3: Try to extract from existing data patterns
    const extracted = await this.extractFromExistingData(cusip);
    if (extracted) {
      console.log(`  ✅ Extracted from data ${cusip} → ${extracted}`);
      return extracted;
    }
    
    console.log(`  ❌ Could not resolve ${cusip}`);
    return null;
  }

  /**
   * Manual mappings for known CUSIPs (you can expand this)
   */
  getManualMapping(cusip) {
    const knownMappings = {
      // Add known CUSIP to ticker mappings here
      // '037833100': 'AAPL',  // Example: Apple Inc
      // '594918104': 'MSFT',  // Example: Microsoft Corp
      // Add more as you discover them
    };
    
    return knownMappings[cusip] || null;
  }

  /**
   * Try to extract ticker from existing data patterns
   */
  async extractFromExistingData(cusip) {
    // Check if there are any symbol_categories entries with company names 
    // that might give us a clue
    try {
      const query = `
        SELECT company_name, ticker
        FROM symbol_categories
        WHERE symbol = $1 AND company_name IS NOT NULL
      `;
      const result = await db.query(query, [cusip]);
      
      if (result.rows.length > 0 && result.rows[0].company_name) {
        // Could try to match company name to known tickers
        // This is a placeholder for more sophisticated matching
        return null;
      }
    } catch (error) {
      // Ignore errors in this method
    }
    
    return null;
  }

  /**
   * Update trades table with resolved ticker
   */
  async updateTradesWithTicker(cusip, ticker) {
    try {
      const query = `
        UPDATE trades 
        SET symbol = $2
        WHERE symbol = $1
      `;
      const result = await db.query(query, [cusip, ticker]);
      
      console.log(`  📝 Updated ${result.rowCount} trades: ${cusip} → ${ticker}`);
      this.results.tradesUpdated += result.rowCount;
      
      // Cache the resolution
      await cache.set('cusip_resolution', cusip, ticker, 7 * 24 * 60 * 60); // 7 days TTL
      
      return result.rowCount;
    } catch (error) {
      console.error(`  ❌ Failed to update trades for ${cusip}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Update symbol_categories table with resolved ticker
   */
  async updateSymbolCategories(cusip, ticker) {
    try {
      const query = `
        UPDATE symbol_categories 
        SET ticker = $2
        WHERE symbol = $1
      `;
      const result = await db.query(query, [cusip, ticker]);
      
      if (result.rowCount > 0) {
        console.log(`  📝 Updated symbol_categories: ${cusip} → ${ticker}`);
        this.results.categoriesFixed += result.rowCount;
      }
      
      return result.rowCount;
    } catch (error) {
      console.error(`  ❌ Failed to update symbol_categories for ${cusip}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Process all CUSIPs in trades
   */
  async processAllCUSIPs() {
    console.log('\n🔄 Processing all CUSIPs in trades...');
    
    // Get all CUSIPs from trades
    const cusipsQuery = `
      SELECT symbol as cusip, COUNT(*) as trade_count
      FROM trades
      WHERE LENGTH(symbol) = 9 
        AND symbol ~ '^[0-9A-Z]{9}$'
      GROUP BY symbol
      ORDER BY trade_count DESC
    `;
    
    const cusipsResult = await db.query(cusipsQuery);
    console.log(`Found ${cusipsResult.rows.length} unique CUSIPs in trades`);
    
    for (const row of cusipsResult.rows) {
      const cusip = row.cusip;
      const tradeCount = row.trade_count;
      
      console.log(`\nProcessing ${cusip} (${tradeCount} trades)...`);
      
      // Try to resolve the CUSIP
      const ticker = await this.resolveCUSIP(cusip);
      
      if (ticker) {
        // Update trades
        await this.updateTradesWithTicker(cusip, ticker);
        
        // Update symbol_categories if exists
        await this.updateSymbolCategories(cusip, ticker);
        
        // Mark as completed in queue
        await this.markQueueCompleted(cusip, ticker);
        
        this.results.cusipsResolved++;
        
        // Add small delay to avoid overwhelming APIs
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // Mark as failed in queue
        await this.markQueueFailed(cusip, 'No resolution found after comprehensive retry');
      }
    }
  }

  /**
   * Mark CUSIP as completed in lookup queue
   */
  async markQueueCompleted(cusip, ticker) {
    try {
      const query = `
        UPDATE cusip_lookup_queue 
        SET status = 'completed', error_message = NULL
        WHERE cusip = $1
      `;
      await db.query(query, [cusip]);
    } catch (error) {
      // Queue might not exist, that's ok
    }
  }

  /**
   * Mark CUSIP as failed in lookup queue
   */
  async markQueueFailed(cusip, errorMessage) {
    try {
      const query = `
        UPDATE cusip_lookup_queue 
        SET status = 'failed', error_message = $2
        WHERE cusip = $1
      `;
      await db.query(query, [cusip, errorMessage]);
    } catch (error) {
      // Queue might not exist, that's ok
    }
  }

  /**
   * Clean up incorrect symbol_categories entries
   */
  async cleanupSymbolCategories() {
    console.log('\n🧹 Cleaning up incorrect symbol_categories entries...');
    
    // Remove entries where ticker = symbol for CUSIPs (these are incorrect)
    const cleanupQuery = `
      DELETE FROM symbol_categories 
      WHERE LENGTH(symbol) = 9 
        AND symbol ~ '^[0-9A-Z]{9}$'
        AND ticker = symbol
        AND company_name IS NULL
    `;
    
    const result = await db.query(cleanupQuery);
    console.log(`Removed ${result.rowCount} incorrect CUSIP entries from symbol_categories`);
    this.results.categoriesFixed += result.rowCount;
  }

  /**
   * Reset failed CUSIPs in queue for retry
   */
  async resetFailedQueue() {
    console.log('\n🔄 Resetting failed CUSIPs in queue...');
    
    const resetQuery = `
      UPDATE cusip_lookup_queue 
      SET status = 'pending', attempts = 0, error_message = NULL
      WHERE status = 'failed'
    `;
    
    const result = await db.query(resetQuery);
    console.log(`Reset ${result.rowCount} failed CUSIPs for retry`);
    this.results.queueReset = result.rowCount;
  }

  /**
   * Run the complete fix process
   */
  async run() {
    console.log('🚀 Starting comprehensive symbol filtering fix...');
    
    try {
      // Step 1: Clean up incorrect data first
      await this.cleanupSymbolCategories();
      
      // Step 2: Reset failed queue entries
      await this.resetFailedQueue();
      
      // Step 3: Process all CUSIPs
      await this.processAllCUSIPs();
      
      // Step 4: Show results
      console.log('\n📊 RESULTS SUMMARY:');
      console.log(`✅ CUSIPs resolved: ${this.results.cusipsResolved}`);
      console.log(`📝 Trades updated: ${this.results.tradesUpdated}`);
      console.log(`🧹 Categories fixed: ${this.results.categoriesFixed}`);
      console.log(`🔄 Queue entries reset: ${this.results.queueReset}`);
      
      console.log('\n✅ Symbol filtering fix completed successfully!');
      
      return this.results;
      
    } catch (error) {
      console.error('❌ Fix process failed:', error);
      throw error;
    }
  }
}

// Add a test mode
async function testCurrentFiltering() {
  console.log('\n🧪 Testing current symbol filtering...');
  
  const testCases = ['AAPL', 'MSFT', 'TSLA', 'GOOGL'];
  
  for (const symbol of testCases) {
    const query = `
      SELECT t.symbol, COUNT(*) as trade_count
      FROM trades t
      WHERE t.symbol = $1 OR
        EXISTS (
          SELECT 1 FROM symbol_categories sc2 
          WHERE sc2.symbol = t.symbol 
          AND sc2.ticker = $1
        )
      GROUP BY t.symbol
      ORDER BY trade_count DESC
    `;
    
    const result = await db.query(query, [symbol]);
    console.log(`${symbol}: ${result.rows.length} symbol matches, ${result.rows.reduce((sum, row) => sum + parseInt(row.trade_count), 0)} total trades`);
  }
}

// Main execution
if (require.main === module) {
  const fixer = new SymbolFilteringFixer();
  
  const mode = process.argv[2];
  
  if (mode === '--test') {
    testCurrentFiltering()
      .then(() => process.exit(0))
      .catch(error => {
        console.error('Test failed:', error);
        process.exit(1);
      });
  } else {
    fixer.run()
      .then(() => {
        console.log('\n🎉 All done! Try testing your symbol filtering now.');
        process.exit(0);
      })
      .catch((error) => {
        console.error('\n💥 Fix failed:', error);
        process.exit(1);
      });
  }
}

module.exports = SymbolFilteringFixer;