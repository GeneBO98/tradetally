const db = require('../src/config/database');
const jobQueue = require('../src/utils/jobQueue');

async function demonstrateSSEEnrichmentUpdates() {
  console.log('🎯 Demonstrating Real-time SSE Enrichment Updates...\n');
  
  const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410';
  
  try {
    // Get current status
    console.log('📊 Current Trade Enrichment Status:');
    let statusResult = await db.query(`
      SELECT enrichment_status, COUNT(*) as count
      FROM trades WHERE user_id = $1
      GROUP BY enrichment_status ORDER BY enrichment_status
    `, [userId]);
    
    statusResult.rows.forEach(row => {
      console.log(`  ${row.enrichment_status}: ${row.count}`);
    });
    
    // Get some pending trades to process
    const pendingTrades = await db.query(`
      SELECT id FROM trades 
      WHERE user_id = $1 AND enrichment_status = 'pending'
      ORDER BY created_at ASC
      LIMIT 10
    `, [userId]);
    
    if (pendingTrades.rows.length === 0) {
      console.log('\n❌ No pending trades to demonstrate with');
      console.log('💡 Try importing some trades first to see SSE notifications');
      process.exit(1);
    }
    
    console.log(`\n🔄 Processing ${pendingTrades.rows.length} trades with SSE notifications...\n`);
    console.log('💡 If you have the frontend open as a Pro user, you should see:');
    console.log('   - Real-time enrichment status updates');
    console.log('   - Progress bar updating automatically');
    console.log('   - Console logs showing "SSE enrichment update received"');
    console.log('   - No need for manual page refresh\n');
    
    // Process trades one by one with delay to show real-time updates
    for (let i = 0; i < pendingTrades.rows.length; i++) {
      const tradeId = pendingTrades.rows[i].id;
      
      console.log(`⏳ Step ${i + 1}/${pendingTrades.rows.length}: Processing trade ${tradeId.substring(0, 8)}...`);
      
      // Move to processing status
      await db.query(`
        UPDATE trades 
        SET enrichment_status = 'processing'
        WHERE id = $1
      `, [tradeId]);
      
      // Wait a moment to show processing status
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Complete the enrichment (this will send SSE notification)
      await jobQueue.checkAndUpdateTradeEnrichmentStatus(tradeId);
      
      // Show updated status
      statusResult = await db.query(`
        SELECT enrichment_status, COUNT(*) as count
        FROM trades WHERE user_id = $1
        GROUP BY enrichment_status ORDER BY enrichment_status
      `, [userId]);
      
      const status = {};
      statusResult.rows.forEach(row => {
        status[row.enrichment_status] = parseInt(row.count);
      });
      
      console.log(`   ✅ Completed! Status: ${status.completed || 0} completed, ${status.processing || 0} processing, ${status.pending || 0} pending`);
      
      // Wait before next trade
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n🎉 SSE Demo Complete!');
    console.log('\n📈 What should have happened on the frontend:');
    console.log('   ✅ Enrichment indicator updated in real-time');
    console.log('   ✅ Progress bar moved smoothly without page refresh');
    console.log('   ✅ Status messages updated automatically');
    console.log('   ✅ Console showed "SSE enrichment update received" messages');
    console.log('   ✅ No manual polling needed - instant updates via WebSocket-style SSE');
    
    console.log('\n🔍 Technical Details:');
    console.log('   - Backend job completion triggers SSE notification');
    console.log('   - Frontend receives enrichment_update events immediately');
    console.log('   - EnrichmentStatus component uses SSE data when available');
    console.log('   - Falls back to polling only when SSE unavailable/stale');
    console.log('   - Works only for Pro users (billing enabled or disabled)');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    process.exit(0);
  }
}

demonstrateSSEEnrichmentUpdates();