#!/usr/bin/env node

/**
 * Script to restart enrichment for trades that are stuck in pending status
 * This should be run if the background worker fails and trades are stuck
 */

const db = require('../src/config/database');
const jobQueue = require('../src/utils/jobQueue');

async function restartEnrichment() {
  try {
    console.log('[PROCESS] Restarting enrichment for stuck trades...');
    
    // Get all trades that are stuck in pending enrichment status
    const pendingTrades = await db.query(`
      SELECT id, symbol, created_at, user_id
      FROM trades 
      WHERE enrichment_status = 'pending'
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${pendingTrades.rows.length} trades with pending enrichment`);
    
    if (pendingTrades.rows.length === 0) {
      console.log('[SUCCESS] No trades need enrichment restart');
      return;
    }
    
    // Reset stuck jobs back to pending
    const stuckJobs = await db.query(`
      UPDATE job_queue 
      SET status = 'pending', started_at = NULL, completed_at = NULL, error = NULL
      WHERE status IN ('processing', 'failed')
      RETURNING id, type
    `);
    
    if (stuckJobs.rows.length > 0) {
      console.log(`[PROCESS] Reset ${stuckJobs.rows.length} stuck/failed jobs back to pending`);
    }
    
    // Queue enrichment jobs for trades that need them
    let jobsQueued = 0;
    for (const trade of pendingTrades.rows) {
      try {
        // Check if this trade needs CUSIP resolution
        if (trade.symbol && trade.symbol.match(/^[A-Z0-9]{8}[0-9]$/)) {
          await jobQueue.addJob('cusip_resolution', {
            cusips: [trade.symbol],
            userId: trade.user_id
          }, 2);
          jobsQueued++;
        }
        
        // Queue strategy classification
        await jobQueue.addJob('strategy_classification', {
          tradeId: trade.id
        }, 3);
        jobsQueued++;
        
      } catch (error) {
        console.error(`Failed to queue jobs for trade ${trade.id}:`, error.message);
      }
    }
    
    console.log(`[SUCCESS] Queued ${jobsQueued} enrichment jobs`);
    
    // Start background worker if not running
    const backgroundWorker = require('../src/workers/backgroundWorker');
    const status = backgroundWorker.getStatus();
    
    if (!status.isRunning || !status.queueProcessing) {
      console.log('[START] Starting background worker...');
      await backgroundWorker.start();
      console.log('[SUCCESS] Background worker started');
    } else {
      console.log('[SUCCESS] Background worker is already running');
    }
    
    console.log('[SUCCESS] Enrichment restart completed successfully');
    
  } catch (error) {
    console.error('[ERROR] Failed to restart enrichment:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  restartEnrichment()
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = restartEnrichment;