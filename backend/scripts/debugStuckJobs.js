#!/usr/bin/env node

const db = require('../src/config/database');

async function debugStuckJobs() {
  console.log('[CHECK] Debugging Stuck CUSIP Resolution Jobs\n');

  try {
    // Check pending jobs
    console.log('1. Checking pending jobs:');
    const pendingJobs = await db.query(`
      SELECT id, type, data, status, retry_count, created_at, started_at, error
      FROM job_queue 
      WHERE status = 'pending' AND type = 'cusip_resolution'
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    console.log(`   Found ${pendingJobs.rows.length} pending CUSIP resolution jobs`);
    pendingJobs.rows.forEach(job => {
      const data = typeof job.data === 'string' ? JSON.parse(job.data) : job.data;
      const age = Math.round((new Date() - job.created_at) / 1000 / 60);
      console.log(`   Job ${job.id}: ${age}m old, retries: ${job.retry_count}`);
      console.log(`     CUSIPs: ${data.cusips ? data.cusips.join(', ') : 'unknown'}`);
      if (job.error) {
        console.log(`     Error: ${job.error}`);
      }
    });

    // Check completed jobs
    console.log('\n2. Recent completed jobs:');
    const completedJobs = await db.query(`
      SELECT id, type, status, retry_count, created_at, completed_at, error
      FROM job_queue 
      WHERE status = 'completed' AND type = 'cusip_resolution'
      AND completed_at > NOW() - INTERVAL '2 hours'
      ORDER BY completed_at DESC 
      LIMIT 5
    `);

    console.log(`   Found ${completedJobs.rows.length} recently completed jobs`);
    completedJobs.rows.forEach(job => {
      const duration = Math.round((job.completed_at - job.created_at) / 1000);
      console.log(`   Job ${job.id}: completed in ${duration}s`);
    });

    // Check CUSIP lookup queue
    console.log('\n3. CUSIP lookup queue:');
    const cusipQueue = await db.query(`
      SELECT cusip, status, attempts, created_at, processed_at, error_message
      FROM cusip_lookup_queue 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    console.log(`   Found ${cusipQueue.rows.length} entries in CUSIP lookup queue`);
    cusipQueue.rows.forEach(entry => {
      console.log(`   ${entry.cusip}: ${entry.status} (${entry.attempts} attempts)`);
      if (entry.error_message) {
        console.log(`     Error: ${entry.error_message}`);
      }
    });

    // Check recent CUSIP mappings
    console.log('\n4. All CUSIP mappings (recent first):');
    const allMappings = await db.query(`
      SELECT cusip, ticker, resolution_source, confidence_score, created_at
      FROM cusip_mappings 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    console.log(`   Found ${allMappings.rows.length} total CUSIP mappings`);
    allMappings.rows.forEach(mapping => {
      const age = Math.round((new Date() - mapping.created_at) / 1000 / 60);
      console.log(`   ${mapping.cusip} → ${mapping.ticker} (${mapping.resolution_source}, ${age}m ago)`);
    });

    // Check if there are any failed jobs
    console.log('\n5. Failed jobs:');
    const failedJobs = await db.query(`
      SELECT id, type, status, retry_count, error, created_at
      FROM job_queue 
      WHERE status = 'failed' AND type = 'cusip_resolution'
      AND created_at > NOW() - INTERVAL '6 hours'
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    console.log(`   Found ${failedJobs.rows.length} failed jobs`);
    failedJobs.rows.forEach(job => {
      console.log(`   Job ${job.id}: ${job.error}`);
    });

  } catch (error) {
    console.error('[ERROR] Debug failed:', error.message);
  } finally {
    await db.pool.end();
  }
}

// Run the debug
debugStuckJobs();