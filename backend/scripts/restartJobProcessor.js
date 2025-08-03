#!/usr/bin/env node

const db = require('../src/config/database');

async function restartJobProcessor() {
  console.log('🔄 Restarting Job Processor\n');

  try {
    // First, let's see what's in the queue
    const pendingCount = await db.query(`
      SELECT COUNT(*) as count 
      FROM job_queue 
      WHERE status = 'pending'
    `);
    
    console.log(`Found ${pendingCount.rows[0].count} pending jobs`);

    // Check if any jobs are stuck in "processing" status for too long
    const stuckJobs = await db.query(`
      SELECT id, type, started_at, created_at
      FROM job_queue 
      WHERE status = 'processing' 
        AND started_at < NOW() - INTERVAL '10 minutes'
    `);

    console.log(`Found ${stuckJobs.rows.length} stuck jobs (processing > 10 min)`);

    if (stuckJobs.rows.length > 0) {
      // Reset stuck jobs back to pending
      const resetResult = await db.query(`
        UPDATE job_queue 
        SET status = 'pending', started_at = NULL 
        WHERE status = 'processing' 
          AND started_at < NOW() - INTERVAL '10 minutes'
        RETURNING id
      `);
      
      console.log(`Reset ${resetResult.rows.length} stuck jobs back to pending`);
    }

    // Check the most recent job activity
    const recentActivity = await db.query(`
      SELECT 
        MAX(completed_at) as last_completed,
        MAX(started_at) as last_started,
        COUNT(*) filter (WHERE status = 'pending') as pending_count,
        COUNT(*) filter (WHERE status = 'processing') as processing_count,
        COUNT(*) filter (WHERE status = 'completed') as completed_count
      FROM job_queue 
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);

    const activity = recentActivity.rows[0];
    console.log('\nJob Activity (last hour):');
    console.log(`  Last completed: ${activity.last_completed || 'None'}`);
    console.log(`  Last started: ${activity.last_started || 'None'}`);
    console.log(`  Pending: ${activity.pending_count}`);
    console.log(`  Processing: ${activity.processing_count}`);
    console.log(`  Completed: ${activity.completed_count}`);

    // The job processor should automatically pick up pending jobs
    // If there are pending jobs but no recent activity, there might be an issue
    const timeSinceLastActivity = activity.last_completed ? 
      Math.round((new Date() - activity.last_completed) / 1000 / 60) : 
      'N/A';
    
    console.log(`\nMinutes since last completion: ${timeSinceLastActivity}`);

    if (activity.pending_count > 0 && timeSinceLastActivity > 5) {
      console.log('\n⚠️  There are pending jobs but no recent activity.');
      console.log('The job processor may need to be restarted manually.');
      console.log('This usually happens automatically, but you may need to restart the server.');
    } else {
      console.log('\n✅ Job processor appears to be working normally.');
    }

  } catch (error) {
    console.error('❌ Restart failed:', error.message);
  } finally {
    await db.pool.end();
  }
}

// Run the restart check
restartJobProcessor();