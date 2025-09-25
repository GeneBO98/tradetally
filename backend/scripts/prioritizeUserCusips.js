#!/usr/bin/env node

const db = require('../src/config/database');

async function prioritizeUserCusips() {
  console.log('[TARGET] Prioritizing boverton@tradetally.io CUSIPs\n');

  try {
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'; // boverton@tradetally.io
    
    // Get unmapped CUSIPs for this user
    const unmappedCusips = await db.query(`
      SELECT DISTINCT t.symbol as cusip
      FROM trades t
      WHERE t.user_id = $1
        AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND NOT EXISTS (
          SELECT 1 FROM cusip_mappings cm 
          WHERE cm.cusip = t.symbol 
            AND (cm.user_id = $1 OR cm.user_id IS NULL)
        )
    `, [userId]);

    console.log(`Found ${unmappedCusips.rows.length} unmapped CUSIPs for boverton@tradetally.io:`);
    unmappedCusips.rows.forEach(row => console.log(`  ${row.cusip}`));

    if (unmappedCusips.rows.length === 0) {
      console.log('[SUCCESS] All CUSIPs are already mapped!');
      return;
    }

    // Check if there are already pending jobs for these CUSIPs
    const existingJobs = await db.query(`
      SELECT DISTINCT data->>'cusips' as cusips_json
      FROM job_queue 
      WHERE status = 'pending' 
        AND type = 'cusip_resolution'
        AND user_id = $1
    `, [userId]);

    console.log(`\nFound ${existingJobs.rows.length} existing pending jobs for this user`);

    // Check if our CUSIPs are already in the queue
    const cusipsInQueue = new Set();
    existingJobs.rows.forEach(job => {
      if (job.cusips_json) {
        try {
          const cusips = JSON.parse(job.cusips_json);
          cusips.forEach(cusip => cusipsInQueue.add(cusip));
        } catch (e) {
          // Handle different JSON format
          cusipsInQueue.add(job.cusips_json.replace(/[\[\]"]/g, ''));
        }
      }
    });

    const needsQueueing = unmappedCusips.rows.filter(row => !cusipsInQueue.has(row.cusip));
    
    if (needsQueueing.length === 0) {
      console.log('[SUCCESS] All unmapped CUSIPs are already queued for processing!');
      console.log('They will be resolved automatically as the queue processes.');
      return;
    }

    console.log(`\n${needsQueueing.length} CUSIPs need to be queued:`);
    needsQueueing.forEach(row => console.log(`  ${row.cusip}`));

    // Create high-priority jobs for the missing CUSIPs
    for (const cusipRow of needsQueueing) {
      const jobData = {
        cusips: [cusipRow.cusip],
        userId: userId,
        priority: 'high'
      };

      await db.query(`
        INSERT INTO job_queue (id, type, data, priority, user_id, status, retry_count, created_at)
        VALUES ($1, 'cusip_resolution', $2, 1, $3, 'pending', 0, NOW())
      `, [
        require('crypto').randomUUID(),
        JSON.stringify(jobData),
        userId
      ]);

      console.log(`  [SUCCESS] Queued ${cusipRow.cusip} with high priority`);
    }

    console.log(`\n[TARGET] Queued ${needsQueueing.length} high-priority CUSIP resolution jobs`);
    console.log('These should be processed within the next few minutes.');

  } catch (error) {
    console.error('[ERROR] Prioritization failed:', error.message);
  } finally {
    await db.pool.end();
  }
}

// Run the prioritization
prioritizeUserCusips();