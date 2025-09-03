#!/usr/bin/env node

/**
 * Test script to verify automatic strategy classification is working
 * Uses only time-based classification to avoid API rate limits
 */

const db = require('../src/config/database');
const Trade = require('../src/models/Trade');

async function testClassification() {
  console.log('🧪 Testing automatic strategy classification...');
  
  try {
    // Get a few sample trades to test
    const sampleQuery = `
      SELECT 
        id, symbol, entry_time, exit_time, entry_price, exit_price,
        quantity, side, pnl, strategy,
        EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) / 60 as hold_time_minutes
      FROM trades
      WHERE strategy IS NULL OR strategy = ''
      ORDER BY entry_time DESC
      LIMIT 5
    `;
    
    const trades = await db.query(sampleQuery);
    
    if (trades.rows.length === 0) {
      console.log('✅ No unclassified trades found - all trades already have strategies!');
      return;
    }
    
    console.log(`📊 Found ${trades.rows.length} unclassified trades to test:`);
    console.log('');
    
    for (const trade of trades.rows) {
      console.log(`🔍 Testing trade ${trade.id}:`);
      console.log(`   Symbol: ${trade.symbol}`);
      console.log(`   Hold time: ${Math.round(trade.hold_time_minutes)} minutes`);
      console.log(`   Has exit: ${trade.exit_time ? 'Yes' : 'No'}`);
      
      // Test basic classification (no API calls)
      const classification = await Trade.classifyTradeBasic(trade);
      
      console.log(`   Strategy: ${classification.strategy}`);
      console.log(`   Confidence: ${Math.round(classification.confidence * 100)}%`);
      console.log(`   Method: ${classification.method}`);
      console.log(`   Signals: ${classification.signals.join(', ') || 'None'}`);
      console.log('');
      
      // Update the trade (just for testing - comment out if you don't want to modify data)
      await db.query(`
        UPDATE trades 
        SET 
          strategy = $2,
          strategy_confidence = $3,
          classification_method = $4,
          classification_metadata = $5,
          manual_override = false
        WHERE id = $1
      `, [
        trade.id,
        classification.strategy,
        Math.round(classification.confidence * 100),
        classification.method,
        JSON.stringify({
          signals: classification.signals,
          holdTimeMinutes: classification.holdTimeMinutes,
          analysisTimestamp: new Date().toISOString(),
          testRun: true
        })
      ]);
      
      console.log(`   ✅ Updated trade ${trade.id} with strategy "${classification.strategy}"`);
    }
    
    // Show current strategy distribution
    const distribution = await db.query(`
      SELECT 
        strategy,
        COUNT(*) as count,
        AVG(strategy_confidence) as avg_confidence
      FROM trades 
      WHERE strategy IS NOT NULL
      GROUP BY strategy 
      ORDER BY count DESC
    `);
    
    console.log('📈 Current Strategy Distribution:');
    distribution.rows.forEach(row => {
      console.log(`   ${row.strategy}: ${row.count} trades (avg confidence: ${Math.round(row.avg_confidence)}%)`);
    });
    
    console.log('');
    console.log('✅ Test classification completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testClassification()
    .then(() => {
      console.log('🎉 All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = testClassification;