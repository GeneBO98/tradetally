const db = require('../src/config/database');
const logger = require('../src/utils/logger');

async function fixEnrichmentStatus() {
  try {
    console.log('🔧 Fixing enrichment status for trades...');
    
    // First, get all trades that are stuck in 'pending' status
    const pendingTradesQuery = `
      SELECT id, symbol, created_at, user_id
      FROM trades
      WHERE enrichment_status = 'pending'
      AND created_at < NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC
      LIMIT 1000
    `;
    
    const pendingResult = await db.query(pendingTradesQuery);
    console.log(`Found ${pendingResult.rows.length} trades stuck in pending status`);
    
    if (pendingResult.rows.length === 0) {
      console.log('✅ No trades need enrichment status update');
      return;
    }
    
    // Check if there are any pending jobs for these trades
    const tradeIds = pendingResult.rows.map(t => t.id);
    const jobCheckQuery = `
      SELECT DISTINCT
        CASE 
          WHEN data->>'tradeId' IS NOT NULL THEN data->>'tradeId'
          WHEN data->'tradeIds' IS NOT NULL THEN jsonb_array_elements_text(data->'tradeIds')
        END as trade_id
      FROM job_queue
      WHERE status IN ('pending', 'processing')
      AND (
        data->>'tradeId' = ANY($1::text[])
        OR data->'tradeIds' ?| $1::text[]
      )
    `;
    
    const jobResult = await db.query(jobCheckQuery, [tradeIds]);
    const tradesWithPendingJobs = new Set(jobResult.rows.map(r => r.trade_id).filter(Boolean));
    
    console.log(`${tradesWithPendingJobs.size} trades have pending jobs`);
    
    // Update trades that have no pending jobs to 'completed'
    let updatedCount = 0;
    for (const trade of pendingResult.rows) {
      if (!tradesWithPendingJobs.has(trade.id)) {
        const updateQuery = `
          UPDATE trades
          SET enrichment_status = 'completed',
              enrichment_completed_at = CURRENT_TIMESTAMP
          WHERE id = $1
          AND enrichment_status = 'pending'
        `;
        
        const result = await db.query(updateQuery, [trade.id]);
        if (result.rowCount > 0) {
          updatedCount++;
          console.log(`Updated trade ${trade.id} (${trade.symbol}) to completed`);
        }
      }
    }
    
    console.log(`✅ Updated ${updatedCount} trades to completed status`);
    
    // Also check for trades that might need enrichment jobs created
    const needsEnrichmentQuery = `
      SELECT id, symbol, strategy, user_id
      FROM trades
      WHERE enrichment_status = 'pending'
      AND created_at < NOW() - INTERVAL '5 minutes'
      AND (
        symbol ~ '^[A-Z0-9]{8}[0-9]$' -- CUSIP pattern
        OR strategy IS NULL
        OR strategy = 'day_trading'
      )
      LIMIT 100
    `;
    
    const needsEnrichmentResult = await db.query(needsEnrichmentQuery);
    
    if (needsEnrichmentResult.rows.length > 0) {
      console.log(`\n🔄 Creating enrichment jobs for ${needsEnrichmentResult.rows.length} trades that need processing`);
      
      const jobQueue = require('../src/utils/jobQueue');
      
      // Group trades by user for CUSIP resolution
      const cusipsByUser = {};
      const tradesNeedingClassification = [];
      
      for (const trade of needsEnrichmentResult.rows) {
        // Check if it's a CUSIP
        if (trade.symbol && trade.symbol.match(/^[A-Z0-9]{8}[0-9]$/)) {
          if (!cusipsByUser[trade.user_id]) {
            cusipsByUser[trade.user_id] = new Set();
          }
          cusipsByUser[trade.user_id].add(trade.symbol);
        }
        
        // Check if needs strategy classification
        if (!trade.strategy || trade.strategy === 'day_trading') {
          tradesNeedingClassification.push({
            tradeId: trade.id,
            userId: trade.user_id
          });
        }
      }
      
      // Create CUSIP resolution jobs
      for (const [userId, cusips] of Object.entries(cusipsByUser)) {
        await jobQueue.addJob(
          'cusip_resolution',
          {
            cusips: Array.from(cusips),
            userId: userId
          },
          2, // High priority
          userId
        );
        console.log(`Created CUSIP resolution job for user ${userId} with ${cusips.size} CUSIPs`);
      }
      
      // Create strategy classification jobs
      if (tradesNeedingClassification.length > 0) {
        for (const trade of tradesNeedingClassification) {
          await jobQueue.addJob(
            'strategy_classification',
            {
              tradeId: trade.tradeId
            },
            3, // Medium priority
            trade.userId
          );
        }
        console.log(`Created ${tradesNeedingClassification.length} strategy classification jobs`);
      }
    }
    
  } catch (error) {
    console.error('Error fixing enrichment status:', error);
  } finally {
    await db.end();
  }
}

// Run the fix
fixEnrichmentStatus().catch(console.error);