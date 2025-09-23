#!/usr/bin/env node

const db = require('../src/config/database');

async function testCusipAPI() {
  console.log('[CHECK] Testing CUSIP API Integration\n');

  try {
    // Get a valid user
    const userResult = await db.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('[ERROR] No users found in database');
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`[SUCCESS] Using user: ${userId}`);

    // Test 1: Check unmapped CUSIPs endpoint simulation
    console.log('\n1. Testing unmapped CUSIPs endpoint:');
    const unmappedQuery = `
      SELECT 
        t.symbol as cusip,
        COUNT(*) as trade_count,
        MIN(t.trade_date) as first_trade_date,
        MAX(t.trade_date) as last_trade_date,
        array_agg(DISTINCT t.side) as trade_sides
      FROM trades t
      WHERE t.user_id = $1
        AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND NOT EXISTS (
          SELECT 1 FROM cusip_mappings cm 
          WHERE cm.cusip = t.symbol 
            AND (cm.user_id = $1 OR cm.user_id IS NULL)
        )
      GROUP BY t.symbol
      ORDER BY trade_count DESC
    `;
    
    const unmappedResult = await db.query(unmappedQuery, [userId]);
    console.log(`   Found ${unmappedResult.rows.length} unmapped CUSIPs:`);
    unmappedResult.rows.forEach(row => {
      console.log(`   ${row.cusip}: ${row.trade_count} trades (${row.trade_sides.join(', ')})`);
    });

    // Test 2: Create a test mapping via API simulation
    console.log('\n2. Testing mapping creation:');
    if (unmappedResult.rows.length > 0) {
      const testCusip = unmappedResult.rows[0].cusip;
      const testTicker = 'TEST123';
      
      const createQuery = `
        INSERT INTO cusip_mappings (cusip, ticker, company_name, resolution_source, user_id, confidence_score, verified, created_by)
        VALUES ($1, $2, $3, 'manual', $4, 100, true, $4)
        ON CONFLICT (cusip, user_id) DO UPDATE SET
          ticker = EXCLUDED.ticker,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const createResult = await db.query(createQuery, [testCusip, testTicker, 'Test Company', userId]);
      console.log(`   [SUCCESS] Created mapping: ${testCusip} → ${testTicker}`);

      // Test 3: Update trades with new mapping
      const updateQuery = `UPDATE trades SET symbol = $1 WHERE user_id = $2 AND symbol = $3`;
      const updateResult = await db.query(updateQuery, [testTicker, userId, testCusip]);
      console.log(`   [SUCCESS] Updated ${updateResult.rowCount} trades`);

      // Test 4: Verify mapping query works
      console.log('\n3. Testing mapping lookup:');
      const lookupQuery = `SELECT * FROM get_cusip_mapping($1, $2)`;
      const lookupResult = await db.query(lookupQuery, [testCusip, userId]);
      if (lookupResult.rows.length > 0) {
        const mapping = lookupResult.rows[0];
        console.log(`   [SUCCESS] Lookup found: ${mapping.cusip} → ${mapping.ticker}`);
      }

      // Test 5: Clean up
      await db.query('DELETE FROM cusip_mappings WHERE cusip = $1 AND user_id = $2', [testCusip, userId]);
      await db.query('UPDATE trades SET symbol = $1 WHERE user_id = $2 AND symbol = $3', [testCusip, userId, testTicker]);
      console.log('   🧹 Cleaned up test data');
    } else {
      console.log('   No unmapped CUSIPs to test with');
    }

    // Test 6: Get mappings endpoint simulation
    console.log('\n4. Testing mappings list endpoint:');
    const mappingsQuery = `
      WITH user_cusips AS (
        SELECT DISTINCT symbol as cusip
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
      ),
      prioritized_mappings AS (
        SELECT DISTINCT ON (cm.cusip)
          cm.cusip,
          cm.ticker,
          cm.company_name,
          cm.resolution_source,
          cm.confidence_score,
          cm.verified,
          (cm.user_id = $1) as is_user_override,
          (uc.cusip IS NOT NULL) as used_in_trades
        FROM cusip_mappings cm
        LEFT JOIN user_cusips uc ON uc.cusip = cm.cusip
        WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
        ORDER BY cm.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT *
      FROM prioritized_mappings
      ORDER BY used_in_trades DESC, cusip ASC
      LIMIT 5
    `;
    
    const mappingsResult = await db.query(mappingsQuery, [userId]);
    console.log(`   Found ${mappingsResult.rows.length} mappings for user:`);
    mappingsResult.rows.forEach(row => {
      console.log(`   ${row.cusip} → ${row.ticker} (${row.resolution_source}, ${row.is_user_override ? 'user' : 'global'})`);
    });

    console.log('\n[SUCCESS] CUSIP API integration test completed successfully!');

  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testCusipAPI();