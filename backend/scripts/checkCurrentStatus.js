#!/usr/bin/env node

const db = require('../src/config/database');

async function checkCurrentStatus() {
  console.log('[STATS] Checking Current CUSIP Resolution Status\n');

  try {
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'; // boverton@tradetally.io
    
    // Check total mappings
    const totalMappings = await db.query('SELECT COUNT(*) as count FROM cusip_mappings');
    console.log(`Total CUSIP mappings in database: ${totalMappings.rows[0].count}`);

    // Check user's trade status
    const tradeStats = await db.query(`
      SELECT 
        COUNT(*) filter (WHERE symbol ~ '^[A-Z0-9]{8}[0-9]$') as still_cusips,
        COUNT(*) filter (WHERE symbol !~ '^[A-Z0-9]{8}[0-9]$') as now_tickers,
        COUNT(*) as total
      FROM trades 
      WHERE user_id = $1
    `, [userId]);

    const stats = tradeStats.rows[0];
    console.log(`\nUser's trades:`);
    console.log(`  Total: ${stats.total}`);
    console.log(`  Still CUSIPs: ${stats.still_cusips}`);
    console.log(`  Now tickers: ${stats.now_tickers}`);

    // Check what the API would return
    const apiQuery = `
      WITH user_cusips AS (
        SELECT DISTINCT symbol as cusip
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
      ),
      trade_counts AS (
        SELECT symbol, COUNT(*) as trade_count
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        GROUP BY symbol
      ),
      prioritized_mappings AS (
        SELECT DISTINCT ON (uc.cusip)
          uc.cusip,
          cm.ticker,
          cm.resolution_source,
          tc.trade_count
        FROM user_cusips uc
        LEFT JOIN cusip_mappings cm ON uc.cusip = cm.cusip 
          AND (cm.user_id = $1 OR cm.user_id IS NULL)
        INNER JOIN trade_counts tc ON tc.symbol = uc.cusip
        ORDER BY uc.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT *
      FROM prioritized_mappings
      ORDER BY trade_count DESC, cusip ASC
    `;

    const apiResult = await db.query(apiQuery, [userId]);
    console.log(`\nAPI would return ${apiResult.rows.length} CUSIPs:`);
    
    let mapped = 0, unmapped = 0;
    apiResult.rows.forEach(row => {
      const status = row.ticker ? `→ ${row.ticker} (${row.resolution_source})` : 'UNMAPPED';
      console.log(`  ${row.cusip}: ${row.trade_count} trades ${status}`);
      if (row.ticker) mapped++; else unmapped++;
    });

    console.log(`\nSummary for UI:`);
    console.log(`  Mapped CUSIPs: ${mapped}`);
    console.log(`  Unmapped CUSIPs: ${unmapped}`);
    console.log(`  Total in comprehensive view: ${apiResult.rows.length}`);

    if (unmapped > 0) {
      console.log(`\n[PROCESS] ${unmapped} CUSIPs are still being processed in the job queue`);
    } else {
      console.log(`\n[SUCCESS] All CUSIPs have been resolved!`);
    }

  } catch (error) {
    console.error('[ERROR] Status check failed:', error.message);
  } finally {
    await db.pool.end();
  }
}

// Run the status check
checkCurrentStatus();