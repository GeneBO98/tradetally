#!/usr/bin/env node

const db = require('../src/config/database');

async function checkEnrichmentStatus() {
  console.log('[CHECK] Checking Trade Enrichment Status\n');

  try {
    // Check recent trade imports and their enrichment status
    console.log('1. Recent trade imports and enrichment status:');
    const recentTrades = await db.query(`
      SELECT 
        id, user_id, symbol, trade_date, entry_time,
        enrichment_status, has_news, news_events, news_sentiment,
        created_at
      FROM trades 
      WHERE created_at > NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    console.log(`   Found ${recentTrades.rows.length} recent trades (last hour)`);
    recentTrades.rows.forEach(trade => {
      const enriched = trade.enrichment_status === 'completed' ? '[SUCCESS] Enriched' : 
                      trade.enrichment_status === 'pending' ? '[PROCESS] Pending' :
                      trade.enrichment_status === 'failed' ? '[ERROR] Failed' : 
                      '❓ Unknown';
      const hasNews = trade.has_news ? ' (has news)' : ' (no news)';
      console.log(`   ${trade.symbol} (${trade.trade_date.toISOString().split('T')[0]}): ${enriched}${hasNews}`);
    });

    // Check trade jobs
    console.log('\n2. Trade enrichment jobs status:');
    const jobs = await db.query(`
      SELECT 
        id, user_id, status, type, 
        created_at, started_at, completed_at,
        error
      FROM job_queue 
      WHERE created_at > NOW() - INTERVAL '2 hours'
      ORDER BY created_at DESC 
      LIMIT 15
    `);

    console.log(`   Found ${jobs.rows.length} recent jobs (last 2 hours)`);
    if (jobs.rows.length > 0) {
      jobs.rows.forEach(job => {
        const duration = job.completed_at ? 
          Math.round((job.completed_at - job.started_at) / 1000) + 's' : 
          'Running...';
        console.log(`   ${job.type}: ${job.status} (${duration})`);
        if (job.error) {
          console.log(`     Error: ${job.error}`);
        }
      });
    }

    // Check CUSIP mappings
    console.log('\n3. Recent CUSIP mappings:');
    const mappings = await db.query(`
      SELECT cusip, ticker, resolution_source, created_at
      FROM cusip_mappings 
      WHERE created_at > NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    console.log(`   Found ${mappings.rows.length} recent CUSIP mappings (last hour)`);
    mappings.rows.forEach(mapping => {
      console.log(`   ${mapping.cusip} → ${mapping.ticker} (${mapping.resolution_source})`);
    });

    // Check if CUSIPs are being processed
    console.log('\n4. CUSIP queue status:');
    const cusipQueue = await db.query(`
      SELECT cusip, status, attempts, created_at, processed_at
      FROM cusip_queue 
      WHERE created_at > NOW() - INTERVAL '2 hours'
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    console.log(`   Found ${cusipQueue.rows.length} CUSIP queue entries (last 2 hours)`);
    cusipQueue.rows.forEach(entry => {
      console.log(`   ${entry.cusip}: ${entry.status} (${entry.attempts} attempts)`);
    });

    // Check for trades that should be updated with ticker symbols
    console.log('\n5. Trades with CUSIPs that have mappings but trades not updated:');
    const unmappedTrades = await db.query(`
      SELECT t.id, t.symbol as cusip, cm.ticker, t.user_id
      FROM trades t
      JOIN cusip_mappings cm ON t.symbol = cm.cusip
      WHERE t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND t.symbol != cm.ticker
        AND (cm.user_id = t.user_id OR cm.user_id IS NULL)
        AND t.created_at > NOW() - INTERVAL '2 hours'
      LIMIT 10
    `);

    console.log(`   Found ${unmappedTrades.rows.length} trades that should be updated`);
    unmappedTrades.rows.forEach(trade => {
      console.log(`   Trade ${trade.id}: ${trade.cusip} should be ${trade.ticker}`);
    });

  } catch (error) {
    console.error('[ERROR] Check failed:', error.message);
  } finally {
    await db.pool.end();
  }
}

// Run the check
checkEnrichmentStatus();