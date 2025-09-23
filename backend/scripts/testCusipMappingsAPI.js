#!/usr/bin/env node

const db = require('../src/config/database');

async function testCusipMappingsAPI() {
  console.log('[CHECK] Testing CUSIP Mappings API and Database\n');

  try {
    // Test 1: Check database function
    console.log('1. Testing get_cusip_mapping function:');
    const testQuery = `SELECT * FROM get_cusip_mapping('00206R102', NULL)`;
    const result = await db.query(testQuery);
    console.log('   Function result:', result.rows);

    // Test 2: Check existing mappings in database
    console.log('\n2. Checking existing CUSIP mappings:');
    const mappingsQuery = `
      SELECT cusip, ticker, resolution_source, user_id, confidence_score, verified
      FROM cusip_mappings 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    const mappingsResult = await db.query(mappingsQuery);
    console.log(`   Found ${mappingsResult.rows.length} mappings:`);
    mappingsResult.rows.forEach(row => {
      console.log(`   ${row.cusip} → ${row.ticker} (${row.resolution_source}, ${row.user_id ? 'user-specific' : 'global'})`);
    });

    // Test 3: Check for CUSIPs in trades that need mapping
    console.log('\n3. Checking CUSIPs in trades:');
    const cusipTradesQuery = `
      SELECT symbol as cusip, COUNT(*) as trade_count
      FROM trades 
      WHERE symbol ~ '^[A-Z0-9]{8}[0-9]$'
      GROUP BY symbol
      ORDER BY trade_count DESC
      LIMIT 5
    `;
    const cusipTradesResult = await db.query(cusipTradesQuery);
    console.log(`   Found ${cusipTradesResult.rows.length} CUSIPs in trades:`);
    cusipTradesResult.rows.forEach(row => {
      console.log(`   ${row.cusip}: ${row.trade_count} trades`);
    });

    // Test 4: Check for unmapped CUSIPs
    console.log('\n4. Checking unmapped CUSIPs:');
    const unmappedQuery = `
      SELECT t.symbol as cusip, COUNT(*) as trade_count
      FROM trades t
      WHERE t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND NOT EXISTS (
          SELECT 1 FROM cusip_mappings cm 
          WHERE cm.cusip = t.symbol
        )
      GROUP BY t.symbol
      ORDER BY trade_count DESC
      LIMIT 5
    `;
    const unmappedResult = await db.query(unmappedQuery);
    console.log(`   Found ${unmappedResult.rows.length} unmapped CUSIPs:`);
    unmappedResult.rows.forEach(row => {
      console.log(`   ${row.cusip}: ${row.trade_count} trades (unmapped)`);
    });

    // Test 5: Test symbol filtering logic
    console.log('\n5. Testing enhanced symbol filtering:');
    const userId = (await db.query('SELECT id FROM users LIMIT 1')).rows[0]?.id;
    
    if (userId) {
      // Test with a known ticker
      const filterQuery = `
        SELECT COUNT(*) as trade_count
        FROM trades t
        WHERE t.user_id = $1
          AND (
            t.symbol = $2 OR
            EXISTS (
              SELECT 1 FROM cusip_mappings cm
              WHERE cm.cusip = t.symbol 
              AND cm.ticker = $2
              AND (cm.user_id = $1 OR cm.user_id IS NULL)
            )
          )
      `;
      
      const testTicker = 'AAPL';
      const filterResult = await db.query(filterQuery, [userId, testTicker]);
      console.log(`   Filtering for "${testTicker}": ${filterResult.rows[0].trade_count} trades found`);
      
      // Test the database function approach
      const functionQuery = `
        SELECT t.symbol, COUNT(*) as trade_count
        FROM trades t
        WHERE t.user_id = $1
          AND EXISTS (
            SELECT 1 FROM get_cusip_mapping(t.symbol, $1) gm
            WHERE gm.ticker = $2
          )
        GROUP BY t.symbol
      `;
      
      const functionResult = await db.query(functionQuery, [userId, testTicker]);
      console.log(`   Function-based filtering: ${functionResult.rows.length} symbol groups found`);
    }

    console.log('\n[SUCCESS] CUSIP Mappings API test completed successfully');

  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testCusipMappingsAPI();