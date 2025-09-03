const db = require('../src/config/database');

async function updateEnrichmentStatus() {
  console.log('🔄 Updating enrichment status for completed jobs...');
  
  try {
    // Update enrichment status to 'completed' for trades that have completed strategy classification jobs
    const updateQuery = `
      UPDATE trades 
      SET enrichment_status = 'completed' 
      WHERE id IN (
        SELECT DISTINCT (jq.data->>'tradeId')::uuid as trade_id
        FROM job_queue jq
        WHERE jq.type = 'strategy_classification'
          AND jq.status = 'completed'
          AND jq.data->>'tradeId' IS NOT NULL
      )
      AND enrichment_status != 'completed'
    `;
    
    const result = await db.query(updateQuery);
    console.log(`✅ Updated ${result.rowCount} trades to 'completed' status`);
    
    // Get current status counts
    const statusQuery = `
      SELECT enrichment_status, COUNT(*) as count
      FROM trades 
      WHERE user_id = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'
      GROUP BY enrichment_status
      ORDER BY enrichment_status
    `;
    
    const statusResult = await db.query(statusQuery);
    console.log('\n📊 Current enrichment status:');
    statusResult.rows.forEach(row => {
      console.log(`  ${row.enrichment_status}: ${row.count}`);
    });
    
  } catch (error) {
    console.error('❌ Error updating enrichment status:', error);
  } finally {
    process.exit(0);
  }
}

updateEnrichmentStatus();