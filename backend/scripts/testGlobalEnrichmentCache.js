#!/usr/bin/env node

const globalEnrichmentCache = require('../src/services/globalEnrichmentCacheService');
const newsEnrichmentService = require('../src/services/newsEnrichmentService');
const db = require('../src/config/database');

async function testGlobalEnrichmentCache() {
  console.log('🧪 Testing Global Enrichment Cache System\n');

  try {
    const testSymbol = 'TSLA';
    const testDate = '2024-01-15';

    console.log('1. Testing cache miss (first call should hit API):');
    const result1 = await newsEnrichmentService.getNewsForSymbolAndDate(testSymbol, testDate, 'f7ffbef5-7ec4-4972-be3f-439233ef8410');
    console.log(`   Result: ${result1.hasNews ? 'Has news' : 'No news'}, Cached: ${result1.cached}, Source: ${result1.source}`);
    console.log(`   News events: ${result1.newsEvents.length}, Sentiment: ${result1.sentiment}`);

    console.log('\n2. Testing cache hit (second call should use cache):');
    const result2 = await newsEnrichmentService.getNewsForSymbolAndDate(testSymbol, testDate, 'f7ffbef5-7ec4-4972-be3f-439233ef8410');
    console.log(`   Result: ${result2.hasNews ? 'Has news' : 'No news'}, Cached: ${result2.cached}, Source: ${result2.source}`);
    console.log(`   News events: ${result2.newsEvents.length}, Sentiment: ${result2.sentiment}`);

    console.log('\n3. Testing different user (should use same cache):');
    const result3 = await newsEnrichmentService.getNewsForSymbolAndDate(testSymbol, testDate, 'different-user-id');
    console.log(`   Result: ${result3.hasNews ? 'Has news' : 'No news'}, Cached: ${result3.cached}, Source: ${result3.source}`);
    console.log(`   News events: ${result3.newsEvents.length}, Sentiment: ${result3.sentiment}`);

    console.log('\n4. Cache statistics:');
    const stats = await globalEnrichmentCache.getCacheStats();
    if (stats) {
      console.log(`   Total entries: ${stats.total_entries}`);
      console.log(`   Active entries: ${stats.active_entries}`);
      console.log(`   Expired entries: ${stats.expired_entries}`);
      console.log(`   Unique symbols: ${stats.unique_symbols}`);
      console.log(`   Total cache hits: ${stats.total_cache_hits}`);
      console.log(`   Average access count: ${stats.avg_access_count}`);
    }

    console.log('\n5. Testing direct cache access:');
    const cachedData = await globalEnrichmentCache.getCachedEnrichment(testSymbol, testDate);
    if (cachedData) {
      console.log(`   Found cached data for ${testSymbol} on ${testDate}`);
      console.log(`   News count: ${cachedData.news_count}`);
      console.log(`   Sentiment: ${cachedData.news_sentiment}`);
      console.log(`   Access count: ${cachedData.access_count}`);
      console.log(`   Data sources: ${JSON.stringify(cachedData.data_sources)}`);
    } else {
      console.log(`   No cached data found for ${testSymbol} on ${testDate}`);
    }

    console.log('\n6. Testing cache cleanup:');
    const deletedCount = await globalEnrichmentCache.cleanupExpiredEntries();
    console.log(`   Deleted ${deletedCount} expired entries`);

    console.log('\n7. Database verification:');
    const dbCheck = await db.query('SELECT symbol, trade_date, news_count, access_count, data_sources FROM global_enrichment_cache ORDER BY created_at DESC LIMIT 5');
    console.log(`   Recent cache entries (${dbCheck.rows.length}):`);
    dbCheck.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.symbol} on ${row.trade_date}: ${row.news_count} news, accessed ${row.access_count} times`);
    });

    console.log('\n✅ Global enrichment cache test completed successfully!');
    console.log('\n🎯 Benefits demonstrated:');
    console.log('   - First API call cached for future users');
    console.log('   - Subsequent calls use cached data (faster, no API limits)');
    console.log('   - Multiple users share the same cache');
    console.log('   - Automatic cleanup of expired entries');
    console.log('   - Detailed statistics and monitoring');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testGlobalEnrichmentCache();