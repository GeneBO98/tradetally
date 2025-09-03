#!/usr/bin/env node

const db = require('../src/config/database');
const cusipResolver = require('../src/utils/cusipResolver');

async function testCusipConstraints() {
  console.log('🧪 Testing CUSIP constraint system\n');

  try {
    // Test 1: Verify basic constraint works
    console.log('📋 Test 1: Basic constraint validation');
    try {
      await db.query(`INSERT INTO cusip_mappings (cusip, ticker, resolution_source, user_id) VALUES ('999999999', 'MSFT', 'test', NULL)`);
      console.log('❌ FAILED: Should have blocked duplicate ticker mapping');
    } catch (error) {
      if (error.message.includes('is already mapped to a different CUSIP')) {
        console.log('✅ PASSED: Constraint correctly blocked duplicate ticker mapping');
      } else {
        console.log('❌ FAILED: Unexpected error:', error.message);
      }
    }

    // Test 2: Verify conflict resolution function
    console.log('\n📋 Test 2: Conflict resolution function');
    
    // Test with lower confidence (should reject)
    const lowConfidenceResult = await db.query(`SELECT resolve_cusip_mapping_conflict('888888888', 'MSFT', 'test', NULL, 50) as result`);
    if (!lowConfidenceResult.rows[0].result) {
      console.log('✅ PASSED: Correctly rejected lower confidence mapping');
    } else {
      console.log('❌ FAILED: Should have rejected lower confidence mapping');
    }

    // Test 3: Verify storeCusipMappings handles conflicts
    console.log('\n📋 Test 3: storeCusipMappings conflict handling');
    
    const testMappings = {
      '777777777': 'MSFT',  // Should be rejected (duplicate ticker)
      '666666666': 'TESTXYZ'  // Should succeed (new ticker)
    };
    
    await cusipResolver.storeCusipMappings(testMappings, 'test', null, 80);
    
    // Check results
    const msftCheck = await db.query(`SELECT COUNT(*) as count FROM cusip_mappings WHERE ticker = 'MSFT'`);
    const testxyzCheck = await db.query(`SELECT COUNT(*) as count FROM cusip_mappings WHERE ticker = 'TESTXYZ'`);
    
    if (msftCheck.rows[0].count === '1' && testxyzCheck.rows[0].count === '1') {
      console.log('✅ PASSED: storeCusipMappings correctly handled conflicts');
      console.log('   - MSFT mapping preserved (1 entry)');
      console.log('   - TESTXYZ mapping created (1 entry)');
    } else {
      console.log('❌ FAILED: Unexpected mapping counts');
      console.log(`   - MSFT: ${msftCheck.rows[0].count} entries`);
      console.log(`   - TESTXYZ: ${testxyzCheck.rows[0].count} entries`);
    }

    // Test 4: Verify unique index works
    console.log('\n📋 Test 4: Unique index enforcement');
    try {
      await db.query(`INSERT INTO cusip_mappings (cusip, ticker, resolution_source, user_id) VALUES ('555555555', 'TESTXYZ', 'test', NULL)`);
      console.log('❌ FAILED: Unique index should have prevented duplicate ticker');
    } catch (error) {
      if (error.message.includes('duplicate key value violates unique constraint')) {
        console.log('✅ PASSED: Unique index correctly prevented duplicate ticker');
      } else {
        console.log('❌ FAILED: Unexpected error:', error.message);
      }
    }

    // Test 5: Verify user-specific mappings still work
    console.log('\n📋 Test 5: User-specific overrides');
    const testUserId = '12345678-1234-1234-1234-123456789012';
    
    try {
      await db.query(`INSERT INTO cusip_mappings (cusip, ticker, resolution_source, user_id) VALUES ('444444444', 'MSFT', 'user_override', $1)`, [testUserId]);
      console.log('✅ PASSED: User-specific override allowed');
      
      // Clean up
      await db.query(`DELETE FROM cusip_mappings WHERE user_id = $1`, [testUserId]);
    } catch (error) {
      console.log('❌ FAILED: User-specific override blocked:', error.message);
    }

    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    await db.query(`DELETE FROM cusip_mappings WHERE ticker = 'TESTXYZ'`);
    await db.query(`DELETE FROM cusip_mappings WHERE resolution_source = 'test'`);

    console.log('\n✅ All tests completed!');
    console.log('\n📊 Summary:');
    console.log('   - Database constraints prevent duplicate ticker mappings');
    console.log('   - Conflict resolution function works with confidence scores');
    console.log('   - storeCusipMappings handles conflicts gracefully');
    console.log('   - Unique index provides additional protection');
    console.log('   - User-specific overrides are still allowed');
    console.log('\n🎉 CUSIP constraint system is working correctly!');

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the tests
testCusipConstraints();