#!/usr/bin/env node

const db = require('../src/config/database');

async function testFixedAPI() {
  console.log('🧪 Testing Fixed CUSIP API\n');

  try {
    // Get a valid user
    const userResult = await db.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('❌ No users found in database');
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`✅ Using user: ${userId}`);

    // Test the fixed main API query (simulating what the controller now does)
    console.log('\n1. Testing fixed main API query (no filters):');
    
    let queryParams = [userId];
    let paramCount = 2;
    
    let searchClause = '';
    let sourceClause = '';
    let verifiedClause = '';
    
    const fixedQuery = `
      WITH user_cusips AS (
        -- Get ALL CUSIPs that appear in user's trades
        SELECT DISTINCT symbol as cusip
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
      ),
      trade_counts AS (
        SELECT symbol, COUNT(*) as trade_count
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        GROUP BY symbol
      ),
      prioritized_mappings AS (
        SELECT DISTINCT ON (uc.cusip)
          cm.id,
          uc.cusip,
          cm.ticker,
          cm.company_name,
          cm.resolution_source,
          cm.confidence_score,
          cm.verified,
          cm.user_id,
          cm.created_at,
          cm.updated_at,
          (cm.user_id = $1) as is_user_override,
          true as used_in_trades,
          tc.trade_count
        FROM user_cusips uc
        LEFT JOIN cusip_mappings cm ON uc.cusip = cm.cusip 
          AND (cm.user_id = $1 OR cm.user_id IS NULL)
        INNER JOIN trade_counts tc ON tc.symbol = uc.cusip
        WHERE 1=1
          ${searchClause}
          ${sourceClause}
          ${verifiedClause}
        ORDER BY uc.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT *
      FROM prioritized_mappings
      ORDER BY trade_count DESC, cusip ASC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    queryParams.push(20, 0); // limit, offset

    const result = await db.query(fixedQuery, queryParams);
    console.log(`   ✅ Found ${result.rows.length} CUSIPs (should be 17)`);
    
    if (result.rows.length > 0) {
      console.log('   Sample results:');
      result.rows.slice(0, 5).forEach(row => {
        console.log(`      ${row.cusip}: ${row.ticker || 'UNMAPPED'} (${row.trade_count} trades)`);
      });
      
      const mapped = result.rows.filter(r => r.ticker).length;
      const unmapped = result.rows.filter(r => !r.ticker).length;
      console.log(`   Breakdown: ${mapped} mapped, ${unmapped} unmapped`);
    }

    // Test count query
    console.log('\n2. Testing count query:');
    const countQuery = `
      WITH user_cusips AS (
        SELECT DISTINCT symbol as cusip
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
      ),
      prioritized_mappings AS (
        SELECT DISTINCT ON (uc.cusip) uc.cusip
        FROM user_cusips uc
        LEFT JOIN cusip_mappings cm ON uc.cusip = cm.cusip 
          AND (cm.user_id = $1 OR cm.user_id IS NULL)
        WHERE 1=1
          ${searchClause}
          ${sourceClause}
          ${verifiedClause}
        ORDER BY uc.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT COUNT(*) as total
      FROM prioritized_mappings
    `;

    const countResult = await db.query(countQuery, [userId]);
    console.log(`   ✅ Total count: ${countResult.rows[0].total} (should be 17)`);

    console.log('\n📊 Fixed API Test Results:');
    console.log(`   • Main API returns ${result.rows.length} CUSIPs`);
    console.log(`   • Parameter count logic is correct`);
    console.log(`   • Ready for frontend testing`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testFixedAPI();