#!/usr/bin/env node

/**
 * Deep dive into the symbol filtering issue
 */

const db = require('../src/config/database');

async function examineSymbolIssue() {
  console.log('🔍 Deep dive into symbol filtering issue...');
  
  try {
    // 1. Check the CUSIPs that are in trades but not resolved
    console.log('\n1. CUSIPs in trades that are not resolved to tickers...');
    const unresolvedCusipsQuery = `
      SELECT DISTINCT
        t.symbol as cusip_in_trades,
        clq.status as queue_status,
        clq.attempts,
        clq.error_message,
        COUNT(t.id) as trade_count
      FROM trades t
      LEFT JOIN cusip_lookup_queue clq ON clq.cusip = t.symbol
      WHERE LENGTH(t.symbol) = 9 
        AND t.symbol ~ '^[0-9A-Z]{9}$'
      GROUP BY t.symbol, clq.status, clq.attempts, clq.error_message
      ORDER BY trade_count DESC
    `;
    
    const unresolvedResult = await db.query(unresolvedCusipsQuery);
    console.log('CUSIPs in trades and their resolution status:');
    unresolvedResult.rows.forEach(row => {
      console.log(`  ${row.cusip_in_trades}: ${row.trade_count} trades, queue status: ${row.queue_status || 'not queued'}`);
      if (row.queue_status === 'pending' && row.attempts > 0) {
        console.log(`    → Failed ${row.attempts} times, error: ${row.error_message || 'none'}`);
      }
    });
    
    // 2. Check what happens when we lookup one of these CUSIPs manually
    console.log('\n2. Checking cache for CUSIP resolutions...');
    const cache = require('../src/utils/cache');
    
    const sampleCusips = ['74347G861', '40423R105', '89458T205']; // Top 3 by trade count
    for (const cusip of sampleCusips) {
      try {
        const cached = await cache.get('cusip_resolution', cusip);
        console.log(`  ${cusip}: ${cached ? `cached as ${cached}` : 'not in cache'}`);
      } catch (error) {
        console.log(`  ${cusip}: cache error - ${error.message}`);
      }
    }
    
    // 3. Check the symbol_categories for any CUSIP entries that should be tickers
    console.log('\n3. Symbol categories with CUSIP patterns that should be tickers...');
    const cusipInCategoriesQuery = `
      SELECT 
        symbol,
        ticker,
        company_name
      FROM symbol_categories
      WHERE LENGTH(symbol) = 9 
        AND symbol ~ '^[0-9A-Z]{9}$'
        AND ticker = symbol
      ORDER BY symbol
    `;
    
    const cusipCategoriesResult = await db.query(cusipInCategoriesQuery);
    console.log(`Found ${cusipCategoriesResult.rows.length} CUSIP entries in symbol_categories where ticker = symbol (these are wrong):`);
    cusipCategoriesResult.rows.forEach(row => {
      console.log(`  ${row.symbol} → ${row.ticker} (${row.company_name || 'No company name'})`);
    });
    
    // 4. Test what happens when we search for a symbol that should match via CUSIP
    console.log('\n4. Testing realistic search scenarios...');
    
    // Let's see if we can find a real example
    const realExampleQuery = `
      SELECT DISTINCT
        t.symbol as trade_symbol,
        sc.ticker,
        sc.company_name,
        COUNT(t.id) as trade_count
      FROM trades t
      LEFT JOIN symbol_categories sc ON sc.symbol = t.symbol
      WHERE LENGTH(t.symbol) = 9 
        AND t.symbol ~ '^[0-9A-Z]{9}$'
        AND sc.ticker IS NOT NULL
        AND sc.ticker != sc.symbol
      GROUP BY t.symbol, sc.ticker, sc.company_name
      ORDER BY trade_count DESC
      LIMIT 5
    `;
    
    const realExampleResult = await db.query(realExampleQuery);
    console.log(`Found ${realExampleResult.rows.length} CUSIPs that have proper ticker mappings:`);
    realExampleResult.rows.forEach(row => {
      console.log(`  CUSIP ${row.trade_symbol} → Ticker ${row.ticker} (${row.company_name}) - ${row.trade_count} trades`);
    });
    
    if (realExampleResult.rows.length > 0) {
      const testTicker = realExampleResult.rows[0].ticker;
      console.log(`\nTesting symbol filter for "${testTicker}":`);
      
      // Current filter logic
      const currentFilterQuery = `
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
      
      const currentResult = await db.query(currentFilterQuery, [testTicker]);
      console.log(`  Current logic finds ${currentResult.rows.length} symbol matches:`);
      currentResult.rows.forEach(row => {
        console.log(`    ${row.symbol}: ${row.trade_count} trades`);
      });
    }
    
    // 5. Check if there are any CUSIPs that were successfully resolved but trades weren't updated
    console.log('\n5. Checking for resolved CUSIPs that should update trades...');
    const resolvedButNotUpdatedQuery = `
      SELECT 
        clq.cusip,
        COUNT(t.id) as trades_still_using_cusip
      FROM cusip_lookup_queue clq
      JOIN trades t ON t.symbol = clq.cusip
      WHERE clq.status = 'completed'
      GROUP BY clq.cusip
      ORDER BY trades_still_using_cusip DESC
    `;
    
    const resolvedNotUpdatedResult = await db.query(resolvedButNotUpdatedQuery);
    console.log(`Found ${resolvedNotUpdatedResult.rows.length} resolved CUSIPs still being used in trades:`);
    resolvedNotUpdatedResult.rows.forEach(row => {
      console.log(`  ${row.cusip}: ${row.trades_still_using_cusip} trades still using CUSIP`);
    });
    
    // 6. Show the actual problem and solution
    console.log('\n6. DIAGNOSIS AND SOLUTION...');
    
    const totalCusipTrades = unresolvedResult.rows.reduce((sum, row) => sum + parseInt(row.trade_count), 0);
    const pendingCusips = unresolvedResult.rows.filter(row => row.queue_status === 'pending').length;
    const notQueuedCusips = unresolvedResult.rows.filter(row => !row.queue_status).length;
    
    console.log('\nPROBLEM SUMMARY:');
    console.log(`• ${totalCusipTrades} trades are using CUSIPs instead of ticker symbols`);
    console.log(`• ${pendingCusips} CUSIPs are pending resolution in the lookup queue`);
    console.log(`• ${notQueuedCusips} CUSIPs are not even in the lookup queue`);
    console.log(`• ${resolvedNotUpdatedResult.rows.length} CUSIPs were resolved but trades weren't updated`);
    
    console.log('\nWHY SYMBOL FILTERING IS BROKEN:');
    console.log('• Users search for "AAPL" but their trades are stored with CUSIPs like "037833100"');
    console.log('• The current filter logic tries to find ticker mappings, but:');
    console.log('  - Many CUSIPs are not resolved yet (pending in queue)');
    console.log('  - Some resolved CUSIPs didn\'t update the trades table');
    console.log('  - Some CUSIPs failed resolution and are stored incorrectly');
    
    console.log('\nSOLUTION NEEDED:');
    console.log('1. Force process all pending CUSIPs in the lookup queue');
    console.log('2. Update trades table to replace resolved CUSIPs with tickers');
    console.log('3. Add any missing CUSIPs to the lookup queue');
    console.log('4. Fix the symbol filtering logic to be more robust');
    
    console.log('\n✅ Symbol issue analysis completed');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  }
}

// Run the analysis
if (require.main === module) {
  examineSymbolIssue()
    .then(() => {
      console.log('\n🎉 Analysis completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Analysis failed:', error);
      process.exit(1);
    });
}

module.exports = examineSymbolIssue;