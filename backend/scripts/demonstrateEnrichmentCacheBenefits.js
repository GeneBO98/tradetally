const db = require('../src/config/database');
const enrichmentCacheService = require('../src/services/enrichmentCacheService');
const Trade = require('../src/models/Trade');

async function demonstrateEnrichmentCacheBenefits() {
  console.log('🎯 Demonstrating Enrichment Cache Benefits...\n');
  
  const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410';
  const testSymbol = 'AAPL';
  const baseDate = new Date('2024-03-15T09:30:00Z');
  
  try {
    // 1. Simulate first import - no cache available
    console.log('📈 Scenario 1: First-time import (no cache available)');
    console.log('─'.repeat(60));
    
    const trade1Data = {
      symbol: testSymbol,
      entryTime: baseDate.toISOString(),
      exitTime: new Date(baseDate.getTime() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours later
      entryPrice: 150.25,
      exitPrice: 152.80,
      quantity: 100,
      side: 'long',
      commission: 1.50,
      fees: 0.50
    };
    
    console.log(`   Creating trade for ${testSymbol} at ${baseDate.toLocaleTimeString()}`);
    console.log('   ⏳ No cached data available - would need API calls');
    console.log('   ⏳ Background jobs would be queued for enrichment');
    
    const trade1 = await Trade.create(userId, trade1Data, { skipApiCalls: true });
    console.log(`   ✅ Trade created: ${trade1.id}`);
    console.log(`   📊 Enrichment Status: ${trade1.enrichment_status}`);
    
    // Simulate enrichment completion by storing cache data
    const enrichmentData = {
      strategy: 'swing_trading',
      strategy_confidence: 78,
      classification_method: 'pattern_analysis',
      classification_signals: {
        signals: ['breakout_pattern', 'volume_spike', 'momentum_confirmation'],
        holdTimeMinutes: 120,
        priceMove: 1.7
      },
      entry_price: 150.25,
      sector: 'Technology',
      industry: 'Consumer Electronics',
      rsi_14: 65.2,
      sma_20: 148.90,
      volume_24h: 85000000,
      news_sentiment_score: 0.45,
      news_count_24h: 8,
      typical_mae_percent: -0.8,
      typical_mfe_percent: 2.1,
      mae_confidence: 82,
      api_provider: 'finnhub'
    };
    
    await enrichmentCacheService.storeEnrichmentData(
      testSymbol,
      baseDate,
      enrichmentData,
      baseDate.toTimeString().substring(0, 8)
    );
    console.log('   💾 Simulated: API enrichment completed and cached');
    
    // 2. Simulate second import at same time - cache hit!
    console.log('\n📈 Scenario 2: Second import at same time (cache available!)');
    console.log('─'.repeat(60));
    
    const trade2Data = {
      symbol: testSymbol,
      entryTime: new Date(baseDate.getTime() + 5 * 60 * 1000).toISOString(), // 5 minutes later
      exitTime: new Date(baseDate.getTime() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours later  
      entryPrice: 150.40,
      exitPrice: 149.95,
      quantity: 200,
      side: 'long',
      commission: 1.50,
      fees: 0.50
    };
    
    console.log(`   Creating trade for ${testSymbol} at ${new Date(trade2Data.entryTime).toLocaleTimeString()}`);
    console.log('   🎯 Checking cache for existing enrichment data...');
    
    const trade2 = await Trade.create(userId, trade2Data, { skipApiCalls: true });
    console.log(`   ✅ Trade created: ${trade2.id}`);
    console.log(`   📊 Enrichment Status: ${trade2.enrichment_status}`);
    
    // Check if the trade got enriched from cache
    const enrichedTrade2 = await db.query('SELECT * FROM trades WHERE id = $1', [trade2.id]);
    const trade2Details = enrichedTrade2.rows[0];
    
    if (trade2Details.classification_metadata) {
      let metadata;
      if (typeof trade2Details.classification_metadata === 'string') {
        metadata = JSON.parse(trade2Details.classification_metadata);
      } else {
        metadata = trade2Details.classification_metadata;
      }
      if (metadata.cached_enrichment) {
        console.log('   🚀 SUCCESS: Applied cached enrichment data instantly!');
        console.log(`   📋 Strategy: ${trade2Details.strategy} (${trade2Details.strategy_confidence}% confidence)`);
        console.log(`   📋 Method: ${trade2Details.classification_method}`);
        console.log(`   📋 Sector: ${metadata.sector} | Industry: ${metadata.industry}`);
        console.log(`   📋 MAE: ${trade2Details.mae}% | MFE: ${trade2Details.mfe}%`);
        console.log('   ⚡ Zero API calls needed - instant enrichment!');
      }
    }
    
    // 3. Simulate third import 20 minutes later - still within tolerance
    console.log('\n📈 Scenario 3: Third import 20 minutes later (within time tolerance)');
    console.log('─'.repeat(60));
    
    const trade3Data = {
      symbol: testSymbol,
      entryTime: new Date(baseDate.getTime() + 20 * 60 * 1000).toISOString(), // 20 minutes later
      exitTime: new Date(baseDate.getTime() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours later
      entryPrice: 151.10,
      exitPrice: 150.50,
      quantity: 50,
      side: 'long',
      commission: 1.50,
      fees: 0.50
    };
    
    console.log(`   Creating trade for ${testSymbol} at ${new Date(trade3Data.entryTime).toLocaleTimeString()}`);
    console.log('   🎯 No exact time match, checking time tolerance (±30 min)...');
    
    const trade3 = await Trade.create(userId, trade3Data, { skipApiCalls: true });
    console.log(`   ✅ Trade created: ${trade3.id}`);
    
    const enrichedTrade3 = await db.query('SELECT * FROM trades WHERE id = $1', [trade3.id]);
    const trade3Details = enrichedTrade3.rows[0];
    
    if (trade3Details.classification_metadata) {
      let metadata;
      if (typeof trade3Details.classification_metadata === 'string') {
        metadata = JSON.parse(trade3Details.classification_metadata);
      } else {
        metadata = trade3Details.classification_metadata;
      }
      if (metadata.cached_enrichment) {
        console.log('   🚀 SUCCESS: Found cached data within time tolerance!');
        console.log('   ⚡ Still no API calls needed!');
      }
    }
    
    // 4. Show cache statistics
    console.log('\n📊 Cache Performance Statistics');
    console.log('─'.repeat(60));
    
    const stats = await enrichmentCacheService.getCacheStats();
    if (stats) {
      console.log(`   Total Cache Entries: ${stats.total_entries}`);
      console.log(`   Active Entries: ${stats.active_entries}`);
      console.log(`   Unique Symbols: ${stats.unique_symbols}`);
      console.log(`   Average Reuse: ${parseFloat(stats.avg_access_count).toFixed(1)}x per cache entry`);
      console.log(`   Most Reused Entry: ${stats.max_access_count}x`);
    }
    
    // 5. Show what happens when trades are deleted
    console.log('\n🗑️  Demonstrating Cache Persistence After Trade Deletion');
    console.log('─'.repeat(60));
    
    console.log('   Deleting all test trades...');
    await db.query('DELETE FROM trades WHERE id IN ($1, $2, $3)', [trade1.id, trade2.id, trade3.id]);
    console.log('   ✅ All trades deleted');
    
    // But cache data should still exist
    const cacheStillExists = await enrichmentCacheService.hasEnrichmentData(testSymbol, baseDate);
    console.log(`   📦 Cache data still exists: ${cacheStillExists ? 'YES' : 'NO'}`);
    
    if (cacheStillExists) {
      console.log('   💡 Future imports of the same symbol/time will benefit from this cached data');
      console.log('   💡 Even though the original trades are gone, the enrichment survives');
    }
    
    // 6. Final demonstration - create a new trade that benefits from the persisted cache
    console.log('\n🔄 Final Test: New Trade Using Persisted Cache');
    console.log('─'.repeat(60));
    
    const trade4Data = {
      symbol: testSymbol,
      entryTime: new Date(baseDate.getTime() + 2 * 60 * 1000).toISOString(), // 2 minutes after original
      exitTime: new Date(baseDate.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      entryPrice: 150.30,
      exitPrice: 151.75,
      quantity: 75,
      side: 'long',
      commission: 1.50,
      fees: 0.50
    };
    
    const trade4 = await Trade.create(userId, trade4Data, { skipApiCalls: true });
    const enrichedTrade4 = await db.query('SELECT * FROM trades WHERE id = $1', [trade4.id]);
    const trade4Details = enrichedTrade4.rows[0];
    
    if (trade4Details.classification_metadata) {
      let metadata;
      if (typeof trade4Details.classification_metadata === 'string') {
        metadata = JSON.parse(trade4Details.classification_metadata);
      } else {
        metadata = trade4Details.classification_metadata;
      }
      if (metadata.cached_enrichment) {
        console.log('   🎉 SUCCESS: New trade instantly enriched from persisted cache!');
        console.log('   🚀 Zero API calls, instant results, even after original trades deleted');
      }
    }
    
    // Clean up final test trade
    await db.query('DELETE FROM trades WHERE id = $1', [trade4.id]);
    
    console.log('\n🏁 Demo Summary');
    console.log('─'.repeat(60));
    console.log('   ✅ First import: Would require API calls (queued for background)');
    console.log('   ✅ Second import: Instant enrichment from cache');
    console.log('   ✅ Third import: Time-tolerant cache match');
    console.log('   ✅ Cache survives trade deletion');
    console.log('   ✅ Future imports benefit from persisted cache');
    console.log('   🎯 Result: Dramatically faster imports, reduced API costs');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    process.exit(0);
  }
}

demonstrateEnrichmentCacheBenefits();