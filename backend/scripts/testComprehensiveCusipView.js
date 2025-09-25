#!/usr/bin/env node

const db = require('../src/config/database');

async function testComprehensiveCusipView() {
  console.log('[CHECK] Testing Comprehensive CUSIP View\n');

  try {
    // Get a valid user
    const userResult = await db.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('[ERROR] No users found in database');
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`[SUCCESS] Using user: ${userId}`);

    // Test 1: Get all CUSIPs from trades (both mapped and unmapped)
    console.log('\n1. All CUSIPs in user trades:');
    const allCusipsQuery = `
      SELECT 
        t.symbol as cusip,
        COUNT(*) as trade_count,
        MIN(t.trade_date) as first_trade_date,
        MAX(t.trade_date) as last_trade_date,
        array_agg(DISTINCT t.side) as trade_sides
      FROM trades t
      WHERE t.user_id = $1
        AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
      GROUP BY t.symbol
      ORDER BY trade_count DESC
    `;
    
    const allCusipsResult = await db.query(allCusipsQuery, [userId]);
    console.log(`   Found ${allCusipsResult.rows.length} total CUSIPs in trades:`);
    allCusipsResult.rows.forEach(row => {
      console.log(`   ${row.cusip}: ${row.trade_count} trades`);
    });

    // Test 2: Get existing mappings
    console.log('\n2. Existing CUSIP mappings:');
    const mappingsQuery = `
      SELECT cusip, ticker, resolution_source, user_id, verified, confidence_score
      FROM cusip_mappings 
      WHERE (user_id = $1 OR user_id IS NULL)
      ORDER BY user_id NULLS LAST, cusip
    `;
    
    const mappingsResult = await db.query(mappingsQuery, [userId]);
    console.log(`   Found ${mappingsResult.rows.length} existing mappings:`);
    mappingsResult.rows.forEach(row => {
      console.log(`   ${row.cusip} → ${row.ticker} (${row.resolution_source}, ${row.user_id ? 'user' : 'global'})`);
    });

    // Test 3: Comprehensive view - combine mapped and unmapped
    console.log('\n3. Comprehensive view (mapped + unmapped):');
    
    // Get mapped CUSIPs
    const mappedQuery = `
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
          (uc.cusip IS NOT NULL) as used_in_trades,
          COALESCE(trade_counts.trade_count, 0) as trade_count,
          'mapped' as status
        FROM cusip_mappings cm
        LEFT JOIN user_cusips uc ON uc.cusip = cm.cusip
        LEFT JOIN (
          SELECT symbol, COUNT(*) as trade_count
          FROM trades 
          WHERE user_id = $1 
            AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
          GROUP BY symbol
        ) trade_counts ON trade_counts.symbol = cm.cusip
        WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
        ORDER BY cm.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT * FROM prioritized_mappings
    `;
    
    // Get unmapped CUSIPs
    const unmappedQuery = `
      SELECT 
        t.symbol as cusip,
        NULL as ticker,
        NULL as company_name,
        NULL as resolution_source,
        NULL as confidence_score,
        FALSE as verified,
        FALSE as is_user_override,
        TRUE as used_in_trades,
        COUNT(*) as trade_count,
        'unmapped' as status
      FROM trades t
      WHERE t.user_id = $1
        AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND NOT EXISTS (
          SELECT 1 FROM cusip_mappings cm 
          WHERE cm.cusip = t.symbol 
            AND (cm.user_id = $1 OR cm.user_id IS NULL)
        )
      GROUP BY t.symbol
    `;
    
    const [mappedResult, unmappedResult] = await Promise.all([
      db.query(mappedQuery, [userId]),
      db.query(unmappedQuery, [userId])
    ]);
    
    const comprehensive = [...mappedResult.rows, ...unmappedResult.rows];
    console.log(`   Comprehensive view: ${comprehensive.length} total entries`);
    
    const mappedCount = mappedResult.rows.length;
    const unmappedCount = unmappedResult.rows.length;
    console.log(`   - Mapped: ${mappedCount}`);
    console.log(`   - Unmapped: ${unmappedCount}`);
    
    comprehensive.forEach(row => {
      if (row.status === 'mapped') {
        console.log(`   [SUCCESS] ${row.cusip} → ${row.ticker} (${row.resolution_source}, ${row.trade_count} trades)`);
      } else {
        console.log(`   [ERROR] ${row.cusip} → UNMAPPED (${row.trade_count} trades)`);
      }
    });

    // Test 4: Test filtering capabilities
    console.log('\n4. Testing filter capabilities:');
    
    console.log('   Filter by status=unmapped:');
    const unmappedOnly = comprehensive.filter(c => c.status === 'unmapped');
    console.log(`   Found ${unmappedOnly.length} unmapped entries`);
    
    console.log('   Filter by status=mapped:');
    const mappedOnly = comprehensive.filter(c => c.status === 'mapped');
    console.log(`   Found ${mappedOnly.length} mapped entries`);
    
    console.log('   Filter by source=manual:');
    const manualOnly = comprehensive.filter(c => c.resolution_source === 'manual');
    console.log(`   Found ${manualOnly.length} manual entries`);

    console.log('\n[SUCCESS] Comprehensive CUSIP view test completed!');
    console.log('\n[STATS] Summary:');
    console.log(`   • Total CUSIPs in trades: ${allCusipsResult.rows.length}`);
    console.log(`   • Mapped CUSIPs: ${mappedCount}`);
    console.log(`   • Unmapped CUSIPs: ${unmappedCount}`);
    console.log(`   • Total for comprehensive view: ${comprehensive.length}`);

  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testComprehensiveCusipView();