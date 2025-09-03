const AnalyticsCache = require('../services/analyticsCache');

async function testCache() {
  console.log('Testing Analytics Cache...');
  
  try {
    const userId = 'test-user-123';
    const testData = {
      topMissedTrades: [
        { symbol: 'AAPL', missedProfit: 100 },
        { symbol: 'TSLA', missedProfit: 200 }
      ],
      totalAnalyzed: 50,
      totalMissedProfit: 300
    };
    
    // Test setting cache
    console.log('1. Setting cache...');
    await AnalyticsCache.set(userId, 'test_analysis', testData, 1); // 1 minute TTL
    
    // Test getting cache
    console.log('2. Getting cache...');
    const cachedData = await AnalyticsCache.get(userId, 'test_analysis');
    console.log('Cached data:', cachedData);
    
    // Test cache miss
    console.log('3. Testing cache miss...');
    const missedData = await AnalyticsCache.get(userId, 'nonexistent_key');
    console.log('Missed data (should be null):', missedData);
    
    // Test cache stats
    console.log('4. Getting cache stats...');
    const stats = await AnalyticsCache.getStats(userId);
    console.log('User cache stats:', stats);
    
    // Test global stats
    const globalStats = await AnalyticsCache.getStats();
    console.log('Global cache stats:', globalStats);
    
    // Test cache invalidation
    console.log('5. Testing cache invalidation...');
    await AnalyticsCache.invalidateUserCache(userId, ['test_analysis']);
    
    const afterInvalidation = await AnalyticsCache.get(userId, 'test_analysis');
    console.log('After invalidation (should be null):', afterInvalidation);
    
    console.log('✅ Cache test completed successfully!');
    
  } catch (error) {
    console.error('❌ Cache test failed:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCache().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
}

module.exports = testCache;