const db = require('../src/config/database');
const enrichmentCacheService = require('../src/services/enrichmentCacheService');

async function testEnrichmentCache() {
  console.log('🧪 Testing Enrichment Cache System...\n');
  
  const testSymbol = 'TSLA';
  const testDate = new Date('2024-01-15T14:30:00Z');
  const testTime = '14:30:00';
  
  try {
    // 1. Store some enrichment data
    console.log('📝 Storing enrichment data in cache...');
    
    const enrichmentData = {
      strategy: 'momentum_trading',
      strategy_confidence: 85,
      classification_method: 'finnhub_analysis',
      classification_signals: {
        signals: ['high_volume', 'price_breakout', 'relative_strength'],
        holdTimeMinutes: 45,
        priceMove: 2.3
      },
      entry_price: 185.50,
      sector: 'Technology',
      industry: 'Electric Vehicles',
      rsi_14: 68.5,
      sma_20: 182.30,
      sma_50: 178.90,
      volume_24h: 25000000,
      news_sentiment_score: 0.65,
      news_count_24h: 12,
      typical_mae_percent: -1.2,
      typical_mfe_percent: 3.4,
      mae_confidence: 75,
      api_provider: 'finnhub'
    };
    
    const cacheId = await enrichmentCacheService.storeEnrichmentData(
      testSymbol, 
      testDate, 
      enrichmentData, 
      testTime
    );
    console.log(`✅ Stored enrichment data with cache ID: ${cacheId}`);
    
    // 2. Retrieve the data
    console.log('\n📖 Retrieving cached data...');
    const cachedData = await enrichmentCacheService.getEnrichmentData(
      testSymbol, 
      testDate, 
      testTime
    );
    
    if (cachedData) {
      console.log('✅ Retrieved cached data:');
      console.log(`   Strategy: ${cachedData.strategy} (${cachedData.strategy_confidence}% confidence)`);
      console.log(`   Sector: ${cachedData.sector} | Industry: ${cachedData.industry}`);
      console.log(`   RSI: ${cachedData.rsi_14} | Volume: ${cachedData.volume_24h?.toLocaleString()}`);
      console.log(`   MAE: ${cachedData.typical_mae_percent}% | MFE: ${cachedData.typical_mfe_percent}%`);
      console.log(`   Access Count: ${cachedData.access_count} | Created: ${cachedData.created_at}`);
    } else {
      console.log('❌ No cached data found');
    }
    
    // 3. Test time tolerance (look for data within 30 minutes)
    console.log('\n⏰ Testing time tolerance (looking 20 minutes later)...');
    const tolerantTime = '14:50:00'; // 20 minutes later
    const tolerantData = await enrichmentCacheService.getEnrichmentData(
      testSymbol, 
      testDate, 
      tolerantTime,
      30 // 30-minute tolerance
    );
    
    if (tolerantData) {
      console.log('✅ Found data within time tolerance');
      console.log(`   Access Count: ${tolerantData.access_count} (incremented from cache hit)`);
    } else {
      console.log('❌ No data found within time tolerance');
    }
    
    // 4. Create a test trade to simulate applying cached data
    console.log('\n🔄 Simulating trade creation with cached data...');
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410';
    
    // Create a test trade
    const tradeQuery = `
      INSERT INTO trades (
        user_id, symbol, trade_date, entry_time, entry_price,
        quantity, side, strategy, enrichment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;
    
    const tradeResult = await db.query(tradeQuery, [
      userId,
      testSymbol,
      testDate.toISOString().split('T')[0],
      testDate.toISOString(),
      185.75, // Slightly different price
      100,
      'long',
      'pending_classification',
      'pending'
    ]);
    
    const testTradeId = tradeResult.rows[0].id;
    console.log(`📊 Created test trade: ${testTradeId}`);
    
    // Apply cached enrichment data
    const applied = await enrichmentCacheService.applyEnrichmentDataToTrade(
      testTradeId,
      testSymbol,
      testDate,
      testTime
    );
    
    if (applied) {
      console.log('✅ Applied cached enrichment data to test trade');
      
      // Check the updated trade
      const updatedTrade = await db.query('SELECT * FROM trades WHERE id = $1', [testTradeId]);
      const trade = updatedTrade.rows[0];
      
      console.log(`   Updated Strategy: ${trade.strategy} (${trade.strategy_confidence}% confidence)`);
      console.log(`   Classification Method: ${trade.classification_method}`);
      console.log(`   Enrichment Status: ${trade.enrichment_status}`);
      console.log(`   MAE: ${trade.mae}% | MFE: ${trade.mfe}%`);
    } else {
      console.log('❌ Failed to apply cached enrichment data');
    }
    
    // 5. Test cache statistics
    console.log('\n📊 Cache Statistics:');
    const stats = await enrichmentCacheService.getCacheStats();
    if (stats) {
      console.log(`   Total Entries: ${stats.total_entries}`);
      console.log(`   Active Entries: ${stats.active_entries}`);
      console.log(`   Unique Symbols: ${stats.unique_symbols}`);
      console.log(`   Average Access Count: ${parseFloat(stats.avg_access_count).toFixed(2)}`);
      console.log(`   Max Access Count: ${stats.max_access_count}`);
    }
    
    // 6. Test cache key generation
    console.log('\n🔑 Testing cache key generation:');
    const cacheKey1 = enrichmentCacheService.generateCacheKey(testSymbol, testDate, testTime);
    const cacheKey2 = enrichmentCacheService.generateCacheKey(testSymbol, testDate);
    console.log(`   With time: ${cacheKey1}`);
    console.log(`   Date only: ${cacheKey2}`);
    
    // 7. Clean up test trade
    await db.query('DELETE FROM trades WHERE id = $1', [testTradeId]);
    console.log(`\n🧹 Cleaned up test trade: ${testTradeId}`);
    
    console.log('\n🎉 Enrichment cache test completed successfully!');
    
    // Show example of what happens during bulk import
    console.log('\n💡 Example workflow during bulk trade import:');
    console.log('   1. Trade imported with skipApiCalls=true');
    console.log('   2. System checks enrichment cache for matching symbol/time');
    console.log('   3. If cached data found, applies it immediately (no API calls needed)');
    console.log('   4. If no cached data, queues background job for enrichment');
    console.log('   5. Background job results are cached for future use');
    console.log('   6. Even if trades are deleted, enrichment data remains cached');
    console.log('   7. Future imports of same symbol/timeframe use cached data instantly');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testEnrichmentCache();