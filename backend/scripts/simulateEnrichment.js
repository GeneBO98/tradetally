const db = require('../src/config/database');

async function simulateEnrichment() {
  console.log('🚀 Starting enrichment simulation...');
  
  const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410';
  let processed = 0;
  
  while (true) {
    try {
      // Check current status
      const statusQuery = `
        SELECT enrichment_status, COUNT(*) as count
        FROM trades 
        WHERE user_id = $1
        GROUP BY enrichment_status
        ORDER BY enrichment_status
      `;
      
      const statusResult = await db.query(statusQuery, [userId]);
      const statusMap = {};
      statusResult.rows.forEach(row => {
        statusMap[row.enrichment_status] = parseInt(row.count);
      });
      
      const pending = statusMap.pending || 0;
      const processing = statusMap.processing || 0;
      const completed = statusMap.completed || 0;
      
      console.log(`📊 Status: ${completed} completed, ${processing} processing, ${pending} pending`);
      
      // If there are no pending or processing trades, we're done
      if (pending === 0 && processing === 0) {
        console.log('✅ All trades enriched!');
        break;
      }
      
      // Move some pending to processing
      if (pending > 0 && processing < 25) {
        const toProcess = Math.min(5, pending);
        await db.query(`
          UPDATE trades 
          SET enrichment_status = 'processing' 
          WHERE user_id = $1 
            AND enrichment_status = 'pending' 
            AND id IN (
              SELECT id 
              FROM trades 
              WHERE user_id = $1 AND enrichment_status = 'pending' 
              ORDER BY created_at ASC 
              LIMIT $2
            )
        `, [userId, toProcess]);
        
        console.log(`⏳ Moved ${toProcess} trades to processing`);
      }
      
      // Move some processing to completed
      if (processing > 0) {
        const toComplete = Math.min(3, processing);
        await db.query(`
          UPDATE trades 
          SET enrichment_status = 'completed' 
          WHERE user_id = $1 
            AND enrichment_status = 'processing' 
            AND id IN (
              SELECT id 
              FROM trades 
              WHERE user_id = $1 AND enrichment_status = 'processing' 
              ORDER BY created_at ASC 
              LIMIT $2
            )
        `, [userId, toComplete]);
        
        processed += toComplete;
        console.log(`✅ Completed ${toComplete} trades (total: ${processed})`);
      }
      
      // Wait 5 seconds before next update
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error('❌ Error in simulation:', error);
      break;
    }
  }
  
  console.log('🏁 Enrichment simulation complete');
  process.exit(0);
}

simulateEnrichment();