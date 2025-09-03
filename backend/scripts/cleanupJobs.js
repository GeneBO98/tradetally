#!/usr/bin/env node

/**
 * Script to clean up old completed and failed jobs
 * Helps maintain database performance and disk space
 */

const db = require('../src/config/database');

async function cleanupJobs() {
  try {
    console.log('🧹 Starting job queue cleanup...');
    
    // 1. Delete old completed jobs (older than 30 days)
    const oldCompleted = await db.query(`
      DELETE FROM job_queue 
      WHERE status = 'completed'
      AND completed_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `);
    
    console.log(`✅ Deleted ${oldCompleted.rows.length} old completed jobs (>30 days)`);
    
    // 2. Delete old failed jobs (older than 7 days)
    const oldFailed = await db.query(`
      DELETE FROM job_queue 
      WHERE status = 'failed'
      AND completed_at < NOW() - INTERVAL '7 days'
      RETURNING id
    `);
    
    console.log(`✅ Deleted ${oldFailed.rows.length} old failed jobs (>7 days)`);
    
    // 3. Show current status
    const currentStatus = await db.query(`
      SELECT 
        status, 
        COUNT(*) as count,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM job_queue 
      GROUP BY status 
      ORDER BY status
    `);
    
    console.log('\n📊 Current job queue status:');
    currentStatus.rows.forEach(row => {
      console.log(`  ${row.status.toUpperCase()}: ${row.count} jobs`);
      if (row.oldest) {
        console.log(`    Oldest: ${row.oldest}`);
        console.log(`    Newest: ${row.newest}`);
      }
    });
    
    // 4. Show database size info
    const sizeInfo = await db.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables 
      WHERE tablename = 'job_queue'
    `);
    
    if (sizeInfo.rows.length > 0) {
      console.log(`\n💾 Job queue table size: ${sizeInfo.rows[0].size}`);
    }
    
    console.log('\n🎉 Cleanup completed successfully');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  cleanupJobs()
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = cleanupJobs;