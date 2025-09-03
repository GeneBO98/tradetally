#!/usr/bin/env node

const db = require('../src/config/database');
const jobQueue = require('../src/utils/jobQueue');

async function testFixedCusipResolution() {
  console.log('🧪 Testing Fixed CUSIP Resolution\n');

  try {
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'; // boverton@tradetally.io
    
    // Get a few unmapped CUSIPs to test with
    const unmappedResult = await db.query(`
      SELECT DISTINCT t.symbol as cusip
      FROM trades t
      WHERE t.user_id = $1
        AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND NOT EXISTS (
          SELECT 1 FROM cusip_mappings cm 
          WHERE cm.cusip = t.symbol 
            AND (cm.user_id = $1 OR cm.user_id IS NULL)
        )
      LIMIT 3
    `, [userId]);

    if (unmappedResult.rows.length === 0) {
      console.log('✅ No unmapped CUSIPs found - all are resolved!');
      return;
    }

    const testCusips = unmappedResult.rows.map(row => row.cusip);
    console.log(`Testing with CUSIPs: ${testCusips.join(', ')}`);

    // Check current mapping count
    const beforeCount = await db.query('SELECT COUNT(*) as count FROM cusip_mappings');
    console.log(`Current mappings in database: ${beforeCount.rows[0].count}`);

    // Add a test job
    console.log('\nAdding test CUSIP resolution job...');
    await jobQueue.addJob(
      'cusip_resolution',
      {
        cusips: testCusips,
        userId: userId
      },
      1, // High priority
      userId
    );

    console.log('Job added. Waiting for processing...');
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds

    // Check if mappings were created
    const afterCount = await db.query('SELECT COUNT(*) as count FROM cusip_mappings');
    const newMappings = afterCount.rows[0].count - beforeCount.rows[0].count;
    
    console.log(`\nAfter processing:`);
    console.log(`  Total mappings: ${afterCount.rows[0].count} (${newMappings >= 0 ? '+' : ''}${newMappings})`);

    if (newMappings > 0) {
      // Show the new mappings
      const recentMappings = await db.query(`
        SELECT cusip, ticker, resolution_source, confidence_score, user_id
        FROM cusip_mappings 
        WHERE created_at > NOW() - INTERVAL '30 seconds'
        ORDER BY created_at DESC
      `);

      console.log(`\nNew mappings created:`);
      recentMappings.rows.forEach(mapping => {
        const userType = mapping.user_id ? 'user-specific' : 'global';
        console.log(`  ${mapping.cusip} → ${mapping.ticker} (${mapping.resolution_source}, ${userType})`);
      });

      // Check if trades were updated
      const updatedTrades = await db.query(`
        SELECT symbol, COUNT(*) as count
        FROM trades
        WHERE user_id = $1 
          AND symbol IN (${recentMappings.rows.map(m => `'${m.ticker}'`).join(', ')})
        GROUP BY symbol
      `, [userId]);

      console.log(`\nTrades updated:`);
      updatedTrades.rows.forEach(trade => {
        console.log(`  ${trade.symbol}: ${trade.count} trades`);
      });

      console.log('\n✅ CUSIP resolution fix is working!');
    } else {
      console.log('\n❌ No new mappings created - fix may not be working');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testFixedCusipResolution();