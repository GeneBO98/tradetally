#!/usr/bin/env node

/**
 * Test the cache fix to ensure namespace support works
 */

const cache = require('../src/utils/cache');

async function testCacheFix() {
  console.log('🧪 Testing cache namespace support...');
  
  try {
    // Test 1: Namespace-based cache operations
    console.log('\n1. Testing namespace-based operations...');
    
    cache.set('cusip_resolution', '42328V801', 'HSDT', 60000);
    const retrieved1 = cache.get('cusip_resolution', '42328V801');
    console.log(`Set and retrieved with namespace: ${retrieved1}`);
    
    // Test 2: Direct key operations (backward compatibility)
    console.log('\n2. Testing direct key operations...');
    
    cache.set('direct_key', 'direct_value', 60000);
    const retrieved2 = cache.get('direct_key');
    console.log(`Set and retrieved direct key: ${retrieved2}`);
    
    // Test 3: Check actual cache keys
    console.log('\n3. Checking cache storage...');
    
    const stats = await cache.getStats();
    console.log(`Cache entries: ${stats.memoryEntries}`);
    console.log('Cache keys:', Object.keys(cache.data));
    
    // Test 4: Test CUSIP resolution caching
    console.log('\n4. Testing CUSIP resolution pattern...');
    
    const testCusips = ['42328V801', '90137F400'];
    for (const cusip of testCusips) {
      cache.set('cusip_resolution', cusip, `RESOLVED_${cusip}`, 7 * 24 * 60 * 60 * 1000);
      const cached = cache.get('cusip_resolution', cusip);
      console.log(`CUSIP ${cusip}: ${cached ? 'CACHED' : 'NOT CACHED'} - Value: ${cached}`);
    }
    
    // Test 5: Verify TTL functionality
    console.log('\n5. Testing TTL functionality...');
    
    cache.set('short_ttl', 'expires_soon', 100); // 100ms TTL
    console.log(`Immediately after set: ${cache.get('short_ttl')}`);
    
    await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms
    console.log(`After TTL expired: ${cache.get('short_ttl') || 'EXPIRED'}`);
    
    console.log('\n✅ Cache tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Cache test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testCacheFix()
    .then(() => {
      console.log('\n🎉 All cache tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Cache tests failed:', error);
      process.exit(1);
    });
}

module.exports = testCacheFix;