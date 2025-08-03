#!/usr/bin/env node

const Trade = require('../src/models/Trade');
const db = require('../src/config/database');

async function testSymbolFiltering() {
  console.log('🧪 Testing Symbol Filtering Fix\n');

  try {
    // First, get a valid user ID
    console.log('0. Getting valid user ID:');
    const userQuery = `SELECT id FROM users LIMIT 1`;
    const userResult = await db.query(userQuery);
    if (userResult.rows.length === 0) {
      console.log('   No users found in database');
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`   Using user ID: ${userId}`);

    // Test 1: Check if AAPL filtering works (should work with direct symbol match)
    console.log('\n1. Testing AAPL filtering:');
    const aaplTrades = await Trade.findByUser(userId, { symbol: 'AAPL' });
    console.log(`   Found ${aaplTrades.length} AAPL trades`);
    
    // Test 2: Check what symbols exist in the database
    console.log('\n2. Checking available symbols in trades:');
    const symbolQuery = `
      SELECT symbol, COUNT(*) as trade_count 
      FROM trades 
      WHERE user_id = $1 
      GROUP BY symbol 
      ORDER BY trade_count DESC 
      LIMIT 10
    `;
    const symbolResult = await db.query(symbolQuery, [userId]);
    symbolResult.rows.forEach(row => {
      const isCusip = row.symbol.match(/^[A-Z0-9]{8}[0-9]$/);
      console.log(`   ${row.symbol} (${row.trade_count} trades)${isCusip ? ' [CUSIP]' : ' [TICKER]'}`);
    });

    // Test 3: Check symbol_categories for CUSIP mappings
    console.log('\n3. Checking symbol_categories for CUSIP to ticker mappings:');
    const mappingQuery = `
      SELECT symbol, ticker, company_name
      FROM symbol_categories 
      WHERE symbol != ticker
      AND ticker IS NOT NULL
      AND symbol IN (
        SELECT DISTINCT symbol FROM trades WHERE user_id = $1
      )
      LIMIT 10
    `;
    const mappingResult = await db.query(mappingQuery, [userId]);
    if (mappingResult.rows.length > 0) {
      console.log('   Found CUSIP to ticker mappings:');
      mappingResult.rows.forEach(row => {
        console.log(`   ${row.symbol} → ${row.ticker} (${row.company_name || 'Unknown Company'})`);
      });

      // Test 4: Try filtering by one of the mapped tickers
      if (mappingResult.rows.length > 0) {
        const testTicker = mappingResult.rows[0].ticker;
        console.log(`\n4. Testing filtering by mapped ticker "${testTicker}":`);
        const mappedTrades = await Trade.findByUser(userId, { symbol: testTicker });
        console.log(`   Found ${mappedTrades.length} trades for ${testTicker}`);
        
        if (mappedTrades.length > 0) {
          console.log('   ✅ Symbol filtering fix is working!');
        } else {
          console.log('   ❌ Symbol filtering fix needs improvement');
        }
      }
    } else {
      console.log('   No CUSIP to ticker mappings found for user trades');
    }

    // Test 5: Check raw symbol vs symbol_categories join
    console.log('\n5. Testing the SQL logic directly:');
    const testQuery = `
      SELECT t.id, t.symbol, sc.ticker, sc.company_name
      FROM trades t
      LEFT JOIN symbol_categories sc ON sc.symbol = t.symbol
      WHERE t.user_id = $1 
      AND (
        t.symbol = $2 OR
        EXISTS (
          SELECT 1 FROM symbol_categories sc2 
          WHERE sc2.symbol = t.symbol 
          AND sc2.ticker = $2
        )
      )
      LIMIT 5
    `;
    
    const testSymbol = 'AAPL';
    const testResult = await db.query(testQuery, [userId, testSymbol]);
    console.log(`   Testing with symbol "${testSymbol}":`);
    testResult.rows.forEach(row => {
      console.log(`   Trade ID: ${row.id}, Symbol: ${row.symbol}, Mapped Ticker: ${row.ticker || 'None'}`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testSymbolFiltering();