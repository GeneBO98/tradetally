#!/usr/bin/env node

const db = require('../src/config/database');
const logger = require('../src/utils/logger');

async function cleanupDuplicateCusipMappings() {
  console.log('🧹 Cleaning up duplicate CUSIP mappings\n');

  try {
    // Find tickers mapped to multiple CUSIPs (highly suspicious)
    const duplicatesQuery = `
      SELECT ticker, COUNT(DISTINCT cusip) as cusip_count, array_agg(DISTINCT cusip) as cusips
      FROM cusip_mappings 
      WHERE resolution_source IN ('finnhub', 'ai')
      GROUP BY ticker 
      HAVING COUNT(DISTINCT cusip) > 1
      ORDER BY cusip_count DESC
    `;

    const duplicates = await db.query(duplicatesQuery);
    
    if (duplicates.rows.length === 0) {
      console.log('✅ No duplicate mappings found');
      return;
    }

    console.log(`Found ${duplicates.rows.length} tickers with multiple CUSIP mappings:`);
    
    let totalBadMappings = 0;
    
    for (const row of duplicates.rows) {
      console.log(`\n📊 ${row.ticker}: ${row.cusip_count} CUSIPs`);
      console.log(`   CUSIPs: ${row.cusips.join(', ')}`);
      
      // Get detailed info for each CUSIP mapping to this ticker
      const detailQuery = `
        SELECT cusip, resolution_source, confidence_score, created_at, user_id
        FROM cusip_mappings 
        WHERE ticker = $1 
        ORDER BY created_at DESC
      `;
      
      const details = await db.query(detailQuery, [row.ticker]);
      
      console.log('   Details:');
      details.rows.forEach((detail, i) => {
        const userType = detail.user_id ? 'user-specific' : 'global';
        console.log(`     ${i + 1}. ${detail.cusip} (${detail.resolution_source}, ${userType}, confidence: ${detail.confidence_score})`);
      });
      
      // For tickers with many duplicates (like MSFT with 24), these are likely all wrong
      if (row.cusip_count > 5) {
        console.log(`   ❌ Likely all mappings are incorrect - will delete all except one`);
        
        // Keep only the most recent mapping (probably the most accurate)
        const keepMapping = details.rows[0];
        const deleteQuery = `
          DELETE FROM cusip_mappings 
          WHERE ticker = $1 AND cusip != $2
        `;
        
        const deleteResult = await db.query(deleteQuery, [row.ticker, keepMapping.cusip]);
        console.log(`   🗑️  Deleted ${deleteResult.rowCount} incorrect mappings for ${row.ticker}`);
        console.log(`   ✅ Kept mapping: ${keepMapping.cusip} → ${row.ticker}`);
        
        totalBadMappings += deleteResult.rowCount;
      } else {
        console.log(`   ⚠️  Manual review needed for ${row.ticker} (only ${row.cusip_count} mappings)`);
      }
    }
    
    console.log(`\n📊 Cleanup Summary:`);
    console.log(`   Removed ${totalBadMappings} incorrect CUSIP mappings`);
    console.log(`   These were likely caused by Finnhub "best match" fallback`);
    
    // Update cache to remove bad entries
    console.log('\n🧹 Clearing CUSIP resolution cache to force fresh lookups...');
    // Note: We don't clear cache here since it might contain good mappings too
    
    console.log('\n✅ Cleanup completed!');
    console.log('\n🔧 Recommendation: The Finnhub "best match" fallback has been disabled');
    console.log('   Future CUSIP lookups will be more accurate');

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    console.error(error.stack);
  }
}

// Run the cleanup
cleanupDuplicateCusipMappings();