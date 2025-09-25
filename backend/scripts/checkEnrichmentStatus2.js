#!/usr/bin/env node

const db = require('../src/config/database');

async function checkEnrichmentStatus() {
  console.log('[CHECK] Checking Trade Enrichment Status\n');

  try {
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'; // boverton@tradetally.io
    
    // Check recent trades and their enrichment status
    console.log('1. Recent trades enrichment status:');
    const recentTrades = await db.query(`
      SELECT 
        id, symbol, trade_date, 
        enrichment_status, has_news, news_events, 
        created_at, updated_at
      FROM trades 
      WHERE user_id = $1
      ORDER BY created_at DESC 
      LIMIT 10
    `, [userId]);

    console.log(`   Found ${recentTrades.rows.length} recent trades:`);
    recentTrades.rows.forEach(trade => {
      const enriched = trade.enrichment_status === 'completed' ? '[SUCCESS] Enriched' : 
                      trade.enrichment_status === 'pending' ? '[PROCESS] Pending' :
                      trade.enrichment_status === 'failed' ? '[ERROR] Failed' : 
                      '❓ Unknown';
      const hasNews = trade.has_news ? ' (has news)' : ' (no news)';
      const age = Math.round((new Date() - trade.created_at) / 1000 / 60);
      console.log(`   ${trade.symbol} (${age}m old): ${enriched}${hasNews}`);
    });

    // Check pending enrichment jobs
    console.log('\n2. Pending enrichment jobs:');
    const pendingJobs = await db.query(`
      SELECT type, COUNT(*) as count
      FROM job_queue 
      WHERE status = 'pending'
        AND user_id = $1
      GROUP BY type
      ORDER BY count DESC
    `, [userId]);

    console.log(`   Pending jobs for user:`);
    if (pendingJobs.rows.length === 0) {
      console.log('   None');
    } else {
      pendingJobs.rows.forEach(job => {
        console.log(`   ${job.type}: ${job.count} jobs`);
      });
    }

    // Check overall job queue status
    console.log('\n3. Overall job queue:');
    const queueStats = await db.query(`
      SELECT 
        status,
        type,
        COUNT(*) as count
      FROM job_queue 
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY status, type
      ORDER BY status, count DESC
    `);

    queueStats.rows.forEach(stat => {
      console.log(`   ${stat.status} ${stat.type}: ${stat.count}`);
    });

    // Check trades that might need enrichment
    console.log('\n4. Checking trades needing enrichment:');
    const needsEnrichment = await db.query(`
      SELECT 
        COUNT(*) filter (WHERE enrichment_status IS NULL) as no_status,
        COUNT(*) filter (WHERE enrichment_status = 'pending') as pending,
        COUNT(*) filter (WHERE enrichment_status = 'completed') as completed,
        COUNT(*) filter (WHERE enrichment_status = 'failed') as failed
      FROM trades 
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '24 hours'
    `, [userId]);

    const enrichStats = needsEnrichment.rows[0];
    console.log(`   Recent trades (24h):`);
    console.log(`     No status: ${enrichStats.no_status}`);
    console.log(`     Pending: ${enrichStats.pending}`);
    console.log(`     Completed: ${enrichStats.completed}`);
    console.log(`     Failed: ${enrichStats.failed}`);

    if (parseInt(enrichStats.pending) > 0) {
      console.log('\n   [PROCESS] Some trades are still pending enrichment');
    } else if (parseInt(enrichStats.no_status) > 0) {
      console.log('\n   [WARNING] Some trades have no enrichment status - may need to be queued');
    } else {
      console.log('\n   [SUCCESS] All recent trades have been enriched');
    }

  } catch (error) {
    console.error('[ERROR] Status check failed:', error.message);
  } finally {
    await db.pool.end();
  }
}

// Run the check
checkEnrichmentStatus();