#!/usr/bin/env node

/**
 * Test script to check if trade queries are working after adding new fields
 */

const db = require('../src/config/database');
const Trade = require('../src/models/Trade');

async function testTradeQueries() {
  console.log('[CHECK] Testing trade queries...');
  
  try {
    // Test 1: Check if new columns exist
    console.log('\n1. Checking database schema...');
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'trades' 
        AND column_name IN ('strategy_confidence', 'classification_method', 'classification_metadata', 'manual_override')
      ORDER BY column_name
    `;
    
    const schemaResult = await db.query(schemaQuery);
    console.log('New columns found:', schemaResult.rows);
    
    if (schemaResult.rows.length < 4) {
      console.log('[ERROR] Some new columns are missing. Expected 4, found:', schemaResult.rows.length);
    } else {
      console.log('[SUCCESS] All new columns exist');
    }
    
    // Test 2: Get a sample trade ID
    console.log('\n2. Getting sample trade...');
    const sampleQuery = `
      SELECT id, symbol, strategy, strategy_confidence, manual_override
      FROM trades 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    const sampleResult = await db.query(sampleQuery);
    if (sampleResult.rows.length === 0) {
      console.log('[ERROR] No trades found in database');
      return;
    }
    
    const sampleTrade = sampleResult.rows[0];
    console.log('Sample trade:', {
      id: sampleTrade.id,
      symbol: sampleTrade.symbol,
      strategy: sampleTrade.strategy,
      confidence: sampleTrade.strategy_confidence,
      manual_override: sampleTrade.manual_override
    });
    
    // Test 3: Test Trade.findById method
    console.log('\n3. Testing Trade.findById method...');
    try {
      const trade = await Trade.findById(sampleTrade.id);
      if (trade) {
        console.log('[SUCCESS] Trade.findById works');
        console.log('Retrieved trade fields:', {
          id: trade.id,
          symbol: trade.symbol,
          strategy: trade.strategy,
          strategy_confidence: trade.strategy_confidence,
          classification_method: trade.classification_method,
          manual_override: trade.manual_override,
          hasAttachments: Array.isArray(trade.attachments),
          hasUser: !!trade.username
        });
      } else {
        console.log('[ERROR] Trade.findById returned null');
      }
    } catch (error) {
      console.log('[ERROR] Trade.findById failed:', error.message);
      console.log('Full error:', error);
    }
    
    // Test 4: Test with user ID (as would happen in controller)
    console.log('\n4. Testing Trade.findById with user ID...');
    
    // Get user ID from the trade
    const userQuery = `SELECT user_id FROM trades WHERE id = $1`;
    const userResult = await db.query(userQuery, [sampleTrade.id]);
    
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].user_id;
      console.log('Testing with user ID:', userId);
      
      try {
        const trade = await Trade.findById(sampleTrade.id, userId);
        if (trade) {
          console.log('[SUCCESS] Trade.findById with user ID works');
        } else {
          console.log('[ERROR] Trade.findById with user ID returned null');
        }
      } catch (error) {
        console.log('[ERROR] Trade.findById with user ID failed:', error.message);
      }
    }
    
    // Test 5: Check for any other potential issues
    console.log('\n5. Testing potential problematic fields...');
    
    const problemFields = [
      'classification_metadata',
      'attachments',
      'executions'
    ];
    
    for (const field of problemFields) {
      try {
        const testQuery = `
          SELECT ${field}
          FROM trades 
          WHERE id = $1
        `;
        const result = await db.query(testQuery, [sampleTrade.id]);
        console.log(`[SUCCESS] Field "${field}" is accessible`);
        
        if (field === 'classification_metadata' && result.rows[0][field]) {
          try {
            const parsed = JSON.parse(result.rows[0][field]);
            console.log(`   JSON data in ${field}:`, Object.keys(parsed));
          } catch (e) {
            console.log(`   ${field} is not valid JSON:`, result.rows[0][field]);
          }
        }
      } catch (error) {
        console.log(`[ERROR] Field "${field}" has issues:`, error.message);
      }
    }
    
    console.log('\n[SUCCESS] Trade query tests completed');
    
  } catch (error) {
    console.error('[ERROR] Test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testTradeQueries()
    .then(() => {
      console.log('\n[SUCCESS] All tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n[ERROR] Tests failed:', error);
      process.exit(1);
    });
}

module.exports = testTradeQueries;