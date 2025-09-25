#!/usr/bin/env node

const db = require('../src/config/database');

async function testAPIEndpoints() {
  console.log('[CONFIG] Testing CUSIP API Endpoints\n');

  try {
    // Get a valid user
    const userResult = await db.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('[ERROR] No users found in database');
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`[SUCCESS] Using user: ${userId}`);

    // Test the main API query that the frontend is using
    console.log('\n1. Testing main mappings API query:');
    const mainQuery = `
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
          'mapped' as status
        FROM cusip_mappings cm
        WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
        ORDER BY cm.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT 
        uc.cusip,
        pm.ticker,
        pm.company_name,
        pm.resolution_source,
        pm.confidence_score,
        pm.verified,
        pm.is_user_override,
        pm.status,
        (
          SELECT COUNT(*)
          FROM trades t
          WHERE t.user_id = $1 
            AND t.symbol = uc.cusip
        ) as trade_count
      FROM user_cusips uc
      LEFT JOIN prioritized_mappings pm ON uc.cusip = pm.cusip
      ORDER BY trade_count DESC, uc.cusip
    `;

    const mainResult = await db.query(mainQuery, [userId]);
    console.log(`   Found ${mainResult.rows.length} CUSIPs from main query`);
    if (mainResult.rows.length > 0) {
      console.log('   Sample results:');
      mainResult.rows.slice(0, 3).forEach(row => {
        console.log(`      ${row.cusip}: ${row.ticker || 'UNMAPPED'} (${row.trade_count} trades)`);
      });
    }

    // Test the unmapped API query
    console.log('\n2. Testing unmapped CUSIPs API query:');
    const unmappedQuery = `
      SELECT 
        t.symbol as cusip,
        COUNT(*) as trade_count
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
    console.log(`   Found ${unmappedResult.rows.length} unmapped CUSIPs`);
    if (unmappedResult.rows.length > 0) {
      console.log('   Sample unmapped:');
      unmappedResult.rows.slice(0, 3).forEach(row => {
        console.log(`      ${row.cusip}: ${row.trade_count} trades`);
      });
    }

    // Compare what the frontend should receive
    console.log('\n3. Frontend integration test:');
    console.log('   Expected behavior:');
    console.log(`   • /api/cusip-mappings should return: ${mainResult.rows.filter(r => r.ticker).length} mapped CUSIPs`);
    console.log(`   • /api/cusip-mappings/unmapped should return: ${unmappedResult.rows.length} unmapped CUSIPs`);
    console.log(`   • Combined total in modal: ${mainResult.rows.length} CUSIPs`);
    
    if (mainResult.rows.length === 0) {
      console.log('\n[ERROR] PROBLEM: No CUSIPs found by main query - this explains empty modal');
    } else {
      console.log('\n[SUCCESS] Data is available - problem likely in API endpoint or frontend');
    }

  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testAPIEndpoints();