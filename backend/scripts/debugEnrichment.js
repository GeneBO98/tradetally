#!/usr/bin/env node

/**
 * Debug script to check enrichment status and manually trigger processing
 */

const db = require('../src/config/database');
const jobQueue = require('../src/utils/jobQueue');
const backgroundWorker = require('../src/workers/backgroundWorker');

async function debugEnrichment() {
  try {
    console.log('🔍 ENRICHMENT DEBUG REPORT');
    console.log('='.repeat(50));
    
    // 1. Check background worker status
    console.log('\n1. BACKGROUND WORKER STATUS:');
    const workerStatus = backgroundWorker.getStatus();
    console.log('   Status:', workerStatus);
    
    // 2. Check job queue status
    console.log('\n2. JOB QUEUE STATUS:');
    const jobStats = await db.query(`
      SELECT status, type, COUNT(*) as count 
      FROM job_queue 
      GROUP BY status, type 
      ORDER BY status, type
    `);
    
    jobStats.rows.forEach(row => {
      console.log(`   ${row.status.toUpperCase()} ${row.type}: ${row.count}`);
    });
    
    // 3. Check trade enrichment status
    console.log('\n3. TRADE ENRICHMENT STATUS:');
    const tradeStats = await db.query(`
      SELECT enrichment_status, COUNT(*) as count 
      FROM trades 
      GROUP BY enrichment_status 
      ORDER BY enrichment_status
    `);
    
    tradeStats.rows.forEach(row => {
      console.log(`   ${row.enrichment_status?.toUpperCase() || 'NULL'}: ${row.count}`);
    });
    
    // 4. Check recent pending jobs
    console.log('\n4. RECENT PENDING JOBS (last 10):');
    const pendingJobs = await db.query(`
      SELECT id, type, data, created_at, priority
      FROM job_queue 
      WHERE status = 'pending'
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    if (pendingJobs.rows.length === 0) {
      console.log('   No pending jobs found');
    } else {
      pendingJobs.rows.forEach(job => {
        console.log(`   Job ${job.id}: ${job.type} (priority ${job.priority}) - ${job.created_at}`);
        console.log(`     Data: ${JSON.stringify(job.data).substring(0, 100)}...`);
      });
    }
    
    // 5. Check recent failed jobs
    console.log('\n5. RECENT FAILED JOBS (last 5):');
    const failedJobs = await db.query(`
      SELECT id, type, error, created_at, completed_at
      FROM job_queue 
      WHERE status = 'failed'
      ORDER BY completed_at DESC 
      LIMIT 5
    `);
    
    if (failedJobs.rows.length === 0) {
      console.log('   No recent failed jobs');
    } else {
      failedJobs.rows.forEach(job => {
        console.log(`   Job ${job.id}: ${job.type} - Failed at ${job.completed_at}`);
        console.log(`     Error: ${job.error}`);
      });
    }
    
    // 6. Try to manually process one job
    console.log('\n6. MANUAL JOB PROCESSING TEST:');
    
    if (!workerStatus.isRunning) {
      console.log('   ⚠️ Background worker not running - starting it...');
      await backgroundWorker.start();
      console.log('   ✅ Background worker started');
    }
    
    if (pendingJobs.rows.length > 0) {
      console.log('   🔄 Attempting to manually process one job...');
      try {
        const processed = await jobQueue.processNextJob();
        console.log(`   Result: ${processed ? 'Job processed' : 'No job processed'}`);
      } catch (error) {
        console.log(`   ❌ Error processing job: ${error.message}`);
      }
    } else {
      console.log('   📭 No pending jobs to process');
    }
    
    // 7. Check database connectivity
    console.log('\n7. DATABASE CONNECTIVITY:');
    try {
      const dbTest = await db.query('SELECT NOW() as current_time, version() as version');
      console.log('   ✅ Database connected');
      console.log(`   Time: ${dbTest.rows[0].current_time}`);
    } catch (error) {
      console.log(`   ❌ Database error: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('DEBUG COMPLETE');
    
  } catch (error) {
    console.error('❌ Debug script failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run if called directly
if (require.main === module) {
  debugEnrichment()
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = debugEnrichment;