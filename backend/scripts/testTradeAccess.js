#!/usr/bin/env node

/**
 * Test script to verify the trade access fix works
 */

const db = require('../src/config/database');
const Trade = require('../src/models/Trade');

async function testTradeAccess() {
  console.log('[CHECK] Testing trade access after fix...');
  
  try {
    // Get a sample trade with its user
    const sampleQuery = `
      SELECT t.id, t.user_id, t.symbol, u.username
      FROM trades t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT 1
    `;
    
    const sampleResult = await db.query(sampleQuery);
    if (sampleResult.rows.length === 0) {
      console.log('[ERROR] No trades found');
      return;
    }
    
    const sample = sampleResult.rows[0];
    console.log('\nSample trade:', {
      id: sample.id,
      symbol: sample.symbol,
      userId: sample.user_id,
      username: sample.username
    });
    
    // Test 1: findById without user ID (should only return public trades)
    console.log('\n1. Testing findById without user ID...');
    const trade1 = await Trade.findById(sample.id);
    console.log('Result without user ID:', trade1 ? '[SUCCESS] Found (trade is public)' : '[ERROR] Not found (trade is private)');
    
    // Test 2: findById with correct user ID (should work)
    console.log('\n2. Testing findById with correct user ID...');
    const trade2 = await Trade.findById(sample.id, sample.user_id);
    console.log('Result with correct user ID:', trade2 ? '[SUCCESS] Found' : '[ERROR] Not found');
    
    if (trade2) {
      console.log('Trade details:', {
        symbol: trade2.symbol,
        hasUsername: !!trade2.username,
        hasAttachments: Array.isArray(trade2.attachments),
        hasStrategy: !!trade2.strategy,
        hasConfidence: trade2.strategy_confidence !== null,
        classificationMethod: trade2.classification_method
      });
    }
    
    // Test 3: findById with wrong user ID (should not work)
    console.log('\n3. Testing findById with wrong user ID...');
    const wrongUserId = 'f0000000-0000-0000-0000-000000000000'; // Fake UUID
    const trade3 = await Trade.findById(sample.id, wrongUserId);
    console.log('Result with wrong user ID:', trade3 ? '[ERROR] Found (security issue!)' : '[SUCCESS] Not found (correct)');
    
    // Test 4: Check if trade is public
    console.log('\n4. Checking if trade is public...');
    const publicQuery = `SELECT is_public FROM trades WHERE id = $1`;
    const publicResult = await db.query(publicQuery, [sample.id]);
    const isPublic = publicResult.rows[0]?.is_public || false;
    console.log(`Trade is public: ${isPublic}`);
    
    console.log('\n[SUCCESS] Trade access tests completed');
    
  } catch (error) {
    console.error('[ERROR] Test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testTradeAccess()
    .then(() => {
      console.log('\n[SUCCESS] Access tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n[ERROR] Tests failed:', error);
      process.exit(1);
    });
}

module.exports = testTradeAccess;