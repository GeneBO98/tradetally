const db = require('../src/config/database');

async function demonstrateRealTimeUpdates() {
  console.log('[TARGET] Demonstrating real-time enrichment updates...');
  
  const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410';
  
  // First, reset some completed trades to pending to simulate fresh imports
  console.log('[CONFIG] Resetting some trades to pending status...');
  await db.query(`
    UPDATE trades 
    SET enrichment_status = 'pending'
    WHERE user_id = $1 
      AND enrichment_status = 'completed'
      AND id IN (
        SELECT id FROM trades 
        WHERE user_id = $1 AND enrichment_status = 'completed'
        ORDER BY created_at DESC 
        LIMIT 20
      )
  `, [userId, userId]);
  
  // Show initial status
  let statusResult = await db.query(`
    SELECT enrichment_status, COUNT(*) as count
    FROM trades WHERE user_id = $1
    GROUP BY enrichment_status ORDER BY enrichment_status
  `, [userId]);
  
  console.log('[START] Initial status:');
  statusResult.rows.forEach(row => {
    console.log(`  ${row.enrichment_status}: ${row.count}`);
  });
  
  console.log('\n⏰ Starting enrichment simulation (watch your frontend!)...\n');
  
  // Now simulate processing
  for (let i = 0; i < 10; i++) {
    // Move some pending to processing
    await db.query(`
      UPDATE trades 
      SET enrichment_status = 'processing'
      WHERE user_id = $1 
        AND enrichment_status = 'pending'
        AND id IN (
          SELECT id FROM trades 
          WHERE user_id = $1 AND enrichment_status = 'pending'
          ORDER BY created_at ASC 
          LIMIT 3
        )
    `, [userId, userId]);
    
    // Wait 4 seconds
    console.log(`⏳ Step ${i+1}: Moved 3 trades to processing...`);
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Complete the processing trades
    await db.query(`
      UPDATE trades 
      SET enrichment_status = 'completed'
      WHERE user_id = $1 
        AND enrichment_status = 'processing'
    `, [userId]);
    
    // Show current status
    statusResult = await db.query(`
      SELECT enrichment_status, COUNT(*) as count
      FROM trades WHERE user_id = $1
      GROUP BY enrichment_status ORDER BY enrichment_status
    `, [userId]);
    
    const status = {};
    statusResult.rows.forEach(row => {
      status[row.enrichment_status] = parseInt(row.count);
    });
    
    console.log(`[SUCCESS] Step ${i+1}: Completed batch - ${status.completed || 0} completed, ${status.processing || 0} processing, ${status.pending || 0} pending`);
    
    // Wait 3 seconds before next batch
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\n[SUCCESS] Demo complete! The frontend should have shown real-time updates.');
  process.exit(0);
}

demonstrateRealTimeUpdates();