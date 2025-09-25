#!/usr/bin/env node

/**
 * Retroactive Fix for Lightspeed Timezone Issue
 * 
 * This script fixes existing Lightspeed trades that have incorrect timezone conversion.
 * The issue: Lightspeed export times were stored as UTC+1 hour instead of the correct UTC time.
 * 
 * Fix: Subtract 1 hour from all entry_time and exit_time values for Lightspeed trades.
 */

const db = require('./src/config/database');

async function fixLightspeedTimezone() {
  console.log('[CONFIG] Starting Lightspeed Timezone Correction...\n');
  
  try {
    // Start transaction
    await db.query('BEGIN');
    
    // Get count of affected trades
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM trades WHERE broker = $1 AND (entry_time IS NOT NULL OR exit_time IS NOT NULL)', 
      ['lightspeed']
    );
    const totalTrades = parseInt(countResult.rows[0].count);
    console.log(`[STATS] Found ${totalTrades} Lightspeed trades with timing data to fix`);
    
    if (totalTrades === 0) {
      console.log('[SUCCESS] No trades to fix!');
      await db.query('ROLLBACK');
      return;
    }
    
    // Get sample of trades before fixing (for verification)
    console.log('\n[INFO] Sample trades BEFORE fixing:');
    const beforeSample = await db.query(`
      SELECT id, symbol, entry_time, exit_time 
      FROM trades 
      WHERE broker = $1 AND entry_time IS NOT NULL 
      ORDER BY entry_time DESC 
      LIMIT 3
    `, ['lightspeed']);
    
    beforeSample.rows.forEach((trade, i) => {
      console.log(`  ${i + 1}. ${trade.symbol} (${trade.id.substr(0, 8)}...)`);
      console.log(`     Entry: ${trade.entry_time} -> ${new Date(trade.entry_time).toISOString()}`);
      if (trade.exit_time) {
        console.log(`     Exit:  ${trade.exit_time} -> ${new Date(trade.exit_time).toISOString()}`);
      }
    });
    
    // Perform the fix: subtract 1 hour (3600000 milliseconds) from timestamps
    console.log('\n[PROCESS] Applying timezone correction (subtracting 1 hour)...');
    
    // Update entry_time - subtract 1 hour
    const entryUpdateResult = await db.query(`
      UPDATE trades 
      SET entry_time = entry_time - INTERVAL '1 hour',
          updated_at = NOW()
      WHERE broker = $1 AND entry_time IS NOT NULL
    `, ['lightspeed']);
    
    console.log(`   [SUCCESS] Updated entry_time for ${entryUpdateResult.rowCount} trades`);
    
    // Update exit_time - subtract 1 hour  
    const exitUpdateResult = await db.query(`
      UPDATE trades 
      SET exit_time = exit_time - INTERVAL '1 hour',
          updated_at = NOW()
      WHERE broker = $1 AND exit_time IS NOT NULL
    `, ['lightspeed']);
    
    console.log(`   [SUCCESS] Updated exit_time for ${exitUpdateResult.rowCount} trades`);
    
    // Verify the fix with the same sample trades
    console.log('\n[INFO] Sample trades AFTER fixing:');
    const afterSample = await db.query(`
      SELECT id, symbol, entry_time, exit_time 
      FROM trades 
      WHERE broker = $1 AND entry_time IS NOT NULL 
      ORDER BY entry_time DESC 
      LIMIT 3
    `, ['lightspeed']);
    
    afterSample.rows.forEach((trade, i) => {
      console.log(`  ${i + 1}. ${trade.symbol} (${trade.id.substr(0, 8)}...)`);
      console.log(`     Entry: ${trade.entry_time} -> ${new Date(trade.entry_time).toISOString()}`);
      if (trade.exit_time) {
        console.log(`     Exit:  ${trade.exit_time} -> ${new Date(trade.exit_time).toISOString()}`);
      }
    });
    
    // Check the specific BLIV trade we discussed
    console.log('\n[TARGET] Checking the specific BLIV trade we discussed:');
    const blivTrade = await db.query(
      'SELECT id, symbol, entry_time, exit_time FROM trades WHERE id = $1',
      ['e7f1472e-2c5d-4d34-89a7-6ae3682365c8']
    );
    
    if (blivTrade.rows.length > 0) {
      const trade = blivTrade.rows[0];
      const entryUTC = new Date(trade.entry_time);
      const exitUTC = new Date(trade.exit_time);
      
      console.log(`   BLIV trade: ${trade.id.substr(0, 8)}...`);
      console.log(`   Entry: ${entryUTC.toISOString()} (should be 20:33 UTC)`);
      console.log(`   Exit:  ${exitUTC.toISOString()} (should be 20:47 UTC)`);
      
      // Verify it's correct
      if (entryUTC.toISOString() === '2025-04-09T20:33:00.000Z') {
        console.log('   [SUCCESS] BLIV entry time is now CORRECT!');
      } else {
        console.log('   [ERROR] BLIV entry time is still incorrect');
      }
      
      if (exitUTC.toISOString() === '2025-04-09T20:47:00.000Z') {
        console.log('   [SUCCESS] BLIV exit time is now CORRECT!');
      } else {
        console.log('   [ERROR] BLIV exit time is still incorrect');
      }
    }
    
    // Commit the transaction
    await db.query('COMMIT');
    
    console.log(`\n[SUCCESS] SUCCESS! Fixed ${totalTrades} Lightspeed trades`);
    console.log('   [CONFIG] All entry_time and exit_time values corrected by -1 hour');
    console.log('   [CONFIG] updated_at timestamps refreshed');
    console.log('   [STATS] Charts will now display trades at the correct times');
    
    console.log('\n[INFO] What this fix did:');
    console.log('   • Subtracted 1 hour from all Lightspeed trade timestamps');
    console.log('   • 16:33 Central -> 20:33 UTC (was incorrectly 21:33 UTC)');
    console.log('   • Charts will now show buy/sell indicators at expected times');
    
  } catch (error) {
    console.error('\n[ERROR] ERROR during timezone fix:', error.message);
    console.log('[PROCESS] Rolling back changes...');
    
    try {
      await db.query('ROLLBACK');
      console.log('[SUCCESS] Changes rolled back successfully');
    } catch (rollbackError) {
      console.error('[ERROR] Rollback failed:', rollbackError.message);
    }
    
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await fixLightspeedTimezone();
    console.log('\n[SUCCESS] Lightspeed timezone correction completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n[ERROR] Script failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { fixLightspeedTimezone };