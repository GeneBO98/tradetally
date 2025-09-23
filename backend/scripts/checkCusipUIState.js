#!/usr/bin/env node

const db = require('../src/config/database');

async function checkCusipUIState() {
  console.log('[CHECK] Checking CUSIP UI State\n');

  try {
    // Get a valid user
    const userResult = await db.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('[ERROR] No users found in database');
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`[SUCCESS] Using user: ${userId}`);

    // Check unmapped CUSIPs count (for the yellow button)
    console.log('\n1. Unmapped CUSIPs (should show yellow button):');
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
    console.log(`   Unmapped count: ${unmappedResult.rows.length} CUSIPs`);
    
    if (unmappedResult.rows.length > 0) {
      console.log('   [SUCCESS] Yellow "Unmapped" button should be visible');
      console.log('   Top unmapped CUSIPs:');
      unmappedResult.rows.slice(0, 5).forEach(row => {
        console.log(`      ${row.cusip}: ${row.trade_count} trades`);
      });
    } else {
      console.log('   ⚪ Yellow "Unmapped" button should be hidden');
    }

    // Check all CUSIPs for comprehensive view
    console.log('\n2. All CUSIPs (for comprehensive modal):');
    const allCusipsQuery = `
      SELECT 
        t.symbol as cusip,
        COUNT(*) as trade_count
      FROM trades t
      WHERE t.user_id = $1
        AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
      GROUP BY t.symbol
      ORDER BY trade_count DESC
    `;
    
    const allCusipsResult = await db.query(allCusipsQuery, [userId]);
    console.log(`   Total CUSIPs: ${allCusipsResult.rows.length}`);
    console.log('   [SUCCESS] "Manage All" button should always be visible');

    // Check existing mappings
    console.log('\n3. Existing mappings:');
    const mappingsQuery = `
      SELECT cusip, ticker, resolution_source, user_id
      FROM cusip_mappings 
      WHERE (user_id = $1 OR user_id IS NULL)
      ORDER BY user_id NULLS LAST, cusip
    `;
    
    const mappingsResult = await db.query(mappingsQuery, [userId]);
    console.log(`   Mapped count: ${mappingsResult.rows.length} CUSIPs`);
    
    if (mappingsResult.rows.length > 0) {
      console.log('   Existing mappings:');
      mappingsResult.rows.forEach(row => {
        console.log(`      ${row.cusip} → ${row.ticker} (${row.resolution_source}, ${row.user_id ? 'user' : 'global'})`);
      });
    }

    console.log('\n[STATS] UI State Summary:');
    console.log(`   • "Manage All" button: Always visible`);
    console.log(`   • "Unmapped" button: ${unmappedResult.rows.length > 0 ? 'Visible' : 'Hidden'} (${unmappedResult.rows.length} unmapped)`);
    console.log(`   • Warning message: ${unmappedResult.rows.length > 0 ? 'Visible' : 'Hidden'}`);
    console.log(`   • Total CUSIPs in comprehensive view: ${allCusipsResult.rows.length}`);
    console.log(`   • Mapped CUSIPs: ${mappingsResult.rows.length}`);
    console.log(`   • Unmapped CUSIPs: ${unmappedResult.rows.length}`);

    console.log('\n🎨 Button Styling:');
    console.log('   • "Manage All": btn-secondary (gray/white)');
    console.log('   • "Unmapped": btn-yellow (yellow warning style)');

  } catch (error) {
    console.error('[ERROR] Check failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the check
checkCusipUIState();