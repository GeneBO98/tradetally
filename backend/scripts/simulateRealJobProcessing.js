const db = require('../src/config/database');

async function simulateRealJobProcessing() {
  console.log('🔄 Simulating real job processing with enrichment updates...');
  
  const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410';
  let totalProcessed = 0;
  
  while (totalProcessed < 50) { // Process 50 trades to demonstrate
    try {
      // Get some pending trades to "process"
      const pendingTrades = await db.query(`
        SELECT id FROM trades 
        WHERE user_id = $1 AND enrichment_status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `, [userId]);
      
      if (pendingTrades.rows.length === 0) {
        console.log('✅ No more pending trades to process');
        break;
      }
      
      // Move trades to processing
      const tradeIds = pendingTrades.rows.map(row => row.id);
      await db.query(`
        UPDATE trades 
        SET enrichment_status = 'processing'
        WHERE id = ANY($1)
      `, [tradeIds]);
      
      console.log(`⏳ Started processing ${tradeIds.length} trades`);
      
      // Wait 3 seconds to simulate processing time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Complete the processing
      await db.query(`
        UPDATE trades 
        SET enrichment_status = 'completed'
        WHERE id = ANY($1)
      `, [tradeIds]);
      
      totalProcessed += tradeIds.length;
      console.log(`✅ Completed ${tradeIds.length} trades (total: ${totalProcessed})`);
      
      // Show current status
      const statusResult = await db.query(`
        SELECT enrichment_status, COUNT(*) as count
        FROM trades 
        WHERE user_id = $1
        GROUP BY enrichment_status
        ORDER BY enrichment_status
      `, [userId]);
      
      const status = {};
      statusResult.rows.forEach(row => {
        status[row.enrichment_status] = parseInt(row.count);
      });
      
      console.log(`📊 Current: ${status.completed || 0} completed, ${status.processing || 0} processing, ${status.pending || 0} pending`);
      
      // Wait 2 more seconds before next batch
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('❌ Error processing trades:', error);
      break;
    }
  }
  
  console.log(`🏁 Simulation complete - processed ${totalProcessed} trades`);
  process.exit(0);
}

simulateRealJobProcessing();