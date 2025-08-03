#!/usr/bin/env node

/**
 * Script to examine symbol filtering data and understand CUSIP vs ticker issue
 */

const db = require('../src/config/database');

async function examineSymbolData() {
  console.log('🔍 Examining symbol filtering data...');
  
  try {
    // Test 1: Check what types of symbols are in the trades table
    console.log('\n1. Analyzing symbol formats in trades table...');
    const symbolAnalysisQuery = `
      SELECT 
        LENGTH(symbol) as symbol_length,
        COUNT(*) as count
      FROM trades 
      GROUP BY LENGTH(symbol)
      ORDER BY symbol_length
    `;
    
    const symbolAnalysis = await db.query(symbolAnalysisQuery);
    console.log('Symbol length distribution:');
    symbolAnalysis.rows.forEach(row => {
      console.log(`  Length ${row.symbol_length}: ${row.count} trades`);
    });
    
    // Get sample symbols for each length
    for (const row of symbolAnalysis.rows) {
      const sampleQuery = `
        SELECT DISTINCT symbol 
        FROM trades 
        WHERE LENGTH(symbol) = $1 
        LIMIT 10
      `;
      const sampleResult = await db.query(sampleQuery, [row.symbol_length]);
      const sampleSymbols = sampleResult.rows.map(r => r.symbol).join(', ');
      console.log(`    Sample symbols: ${sampleSymbols}`);
    }
    
    // Test 2: Check for CUSIP patterns (9 characters, alphanumeric)
    console.log('\n2. Identifying potential CUSIPs in trades...');
    const cusipQuery = `
      SELECT 
        symbol,
        COUNT(*) as trade_count
      FROM trades 
      WHERE LENGTH(symbol) = 9 
        AND symbol ~ '^[0-9A-Z]{9}$'
      GROUP BY symbol
      ORDER BY trade_count DESC
      LIMIT 20
    `;
    
    const cusipResult = await db.query(cusipQuery);
    console.log(`Found ${cusipResult.rows.length} potential CUSIPs in trades table:`);
    cusipResult.rows.forEach(row => {
      console.log(`  ${row.symbol}: ${row.trade_count} trades`);
    });
    
    // Test 3: Check symbol_categories table structure and sample data
    console.log('\n3. Examining symbol_categories table...');
    const symbolCategoriesQuery = `
      SELECT 
        symbol,
        ticker,
        company_name,
        created_at
      FROM symbol_categories 
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    const categoriesResult = await db.query(symbolCategoriesQuery);
    console.log(`Found ${categoriesResult.rows.length} entries in symbol_categories table:`);
    categoriesResult.rows.forEach(row => {
      console.log(`  Symbol: ${row.symbol} | Ticker: ${row.ticker} | Company: ${row.company_name}`);
    });
    
    // Test 4: Check for CUSIP to ticker mappings
    console.log('\n4. Looking for CUSIP to ticker mappings...');
    const mappingQuery = `
      SELECT 
        symbol,
        ticker,
        company_name
      FROM symbol_categories 
      WHERE LENGTH(symbol) = 9 
        AND symbol ~ '^[0-9A-Z]{9}$'
        AND ticker IS NOT NULL
      ORDER BY symbol
      LIMIT 20
    `;
    
    const mappingResult = await db.query(mappingQuery);
    console.log(`Found ${mappingResult.rows.length} CUSIP to ticker mappings:`);
    mappingResult.rows.forEach(row => {
      console.log(`  CUSIP: ${row.symbol} → Ticker: ${row.ticker} (${row.company_name})`);
    });
    
    // Test 5: Check for trades that could be affected by symbol filtering
    console.log('\n5. Testing symbol filtering scenarios...');
    
    // Scenario A: Direct ticker search (should work)
    const directTickerQuery = `
      SELECT symbol, COUNT(*) as count
      FROM trades 
      WHERE symbol = 'AAPL'
      GROUP BY symbol
    `;
    const directResult = await db.query(directTickerQuery);
    console.log(`Direct AAPL search: ${directResult.rows.length > 0 ? directResult.rows[0].count : 0} trades`);
    
    // Scenario B: CUSIP that maps to AAPL (this is likely the issue)
    const cusipToAaplQuery = `
      SELECT 
        t.symbol as trade_symbol,
        sc.ticker,
        COUNT(*) as trade_count
      FROM trades t
      JOIN symbol_categories sc ON sc.symbol = t.symbol
      WHERE sc.ticker = 'AAPL'
      GROUP BY t.symbol, sc.ticker
    `;
    const cusipMappingResult = await db.query(cusipToAaplQuery);
    console.log(`CUSIPs that map to AAPL: ${cusipMappingResult.rows.length} different CUSIPs`);
    cusipMappingResult.rows.forEach(row => {
      console.log(`  Trade symbol (CUSIP): ${row.trade_symbol} → Ticker: ${row.ticker} (${row.trade_count} trades)`);
    });
    
    // Test 6: Check the current symbol filtering logic
    console.log('\n6. Testing current symbol filtering logic...');
    const testSymbol = 'AAPL';
    
    // This mimics the current filtering logic from Trade.js
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
    
    const filterResult = await db.query(currentFilterQuery, [testSymbol]);
    console.log(`Current filtering logic for "${testSymbol}" finds:`);
    filterResult.rows.forEach(row => {
      console.log(`  Symbol: ${row.symbol} (${row.trade_count} trades)`);
    });
    
    // Test 7: Check CUSIP lookup queue status
    console.log('\n7. Checking CUSIP lookup queue status...');
    const queueStatsQuery = `
      SELECT 
        status,
        COUNT(*) as count,
        AVG(attempts) as avg_attempts
      FROM cusip_lookup_queue 
      GROUP BY status
      ORDER BY status
    `;
    
    try {
      const queueStats = await db.query(queueStatsQuery);
      console.log('CUSIP lookup queue stats:');
      queueStats.rows.forEach(row => {
        console.log(`  ${row.status}: ${row.count} entries (avg attempts: ${parseFloat(row.avg_attempts || 0).toFixed(1)})`);
      });
    } catch (error) {
      console.log('CUSIP lookup queue table does not exist or is inaccessible');
    }
    
    // Test 8: Show recommendations
    console.log('\n8. Analysis Summary and Recommendations...');
    
    const totalTrades = await db.query('SELECT COUNT(*) as count FROM trades');
    const totalSymbolCategories = await db.query('SELECT COUNT(*) as count FROM symbol_categories');
    
    console.log(`\nDatabase Summary:`);
    console.log(`  Total trades: ${totalTrades.rows[0].count}`);
    console.log(`  Total symbol categories: ${totalSymbolCategories.rows[0].count}`);
    console.log(`  Potential CUSIPs in trades: ${cusipResult.rows.length}`);
    console.log(`  CUSIP to ticker mappings: ${mappingResult.rows.length}`);
    
    console.log('\n✅ Symbol data examination completed');
    
  } catch (error) {
    console.error('❌ Examination failed:', error);
    throw error;
  }
}

// Run the examination
if (require.main === module) {
  examineSymbolData()
    .then(() => {
      console.log('\n🎉 Examination completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Examination failed:', error);
      process.exit(1);
    });
}

module.exports = examineSymbolData;