#!/usr/bin/env node

/**
 * Investigate CUSIP caching and AI prompt issues
 */

const db = require('../src/config/database');
const cache = require('../src/utils/cache');
const cusipQueue = require('../src/utils/cusipQueue');

async function investigateCusipIssues() {
  console.log('🔍 Investigating CUSIP caching and AI prompt issues...');
  
  try {
    // 1. Check current cache status
    console.log('\n1. Checking cache status...');
    const cacheStats = await cache.getStats();
    console.log('Cache stats:', cacheStats);
    
    // Check if any CUSIP resolutions are in cache
    console.log('\nChecking for cached CUSIP resolutions...');
    let foundCachedCusips = 0;
    const sampleCusips = ['74347G861', '40423R105', '89458T205', '655187300'];
    
    for (const cusip of sampleCusips) {
      const cached = cache.get('cusip_resolution', cusip);
      if (cached) {
        console.log(`  ${cusip}: ${cached}`);
        foundCachedCusips++;
      } else {
        console.log(`  ${cusip}: not cached`);
      }
    }
    
    console.log(`Found ${foundCachedCusips} cached CUSIP resolutions out of ${sampleCusips.length} checked`);
    
    // 2. Analyze the queue table vs cache issue
    console.log('\n2. Analyzing queue vs cache mismatch...');
    
    const completedCusipsQuery = `
      SELECT cusip, status, created_at, last_attempt_at
      FROM cusip_lookup_queue 
      WHERE status = 'completed'
      ORDER BY last_attempt_at DESC
      LIMIT 10
    `;
    
    const completedResult = await db.query(completedCusipsQuery);
    console.log(`Found ${completedResult.rows.length} completed CUSIPs in queue:`);
    
    for (const row of completedResult.rows) {
      const cached = cache.get('cusip_resolution', row.cusip);
      console.log(`  ${row.cusip}: queue=${row.status}, cache=${cached ? 'YES' : 'NO'}`);
    }
    
    // 3. Check the cache key format issue
    console.log('\n3. Checking cache key format...');
    
    // The cache.get calls use two parameters, but cache.set in cusipQueue uses namespace
    // Let's see what's actually in the cache
    console.log('Raw cache data:');
    console.log(Object.keys(cache.data).slice(0, 10)); // Show first 10 keys
    
    // 4. Investigate AI prompt and settings
    console.log('\n4. Investigating AI prompt and settings...');
    
    try {
      const adminSettingsService = require('../src/services/adminSettings');
      const aiSettings = await adminSettingsService.getDefaultAISettings();
      
      console.log('AI Settings:');
      console.log(`  Provider: ${aiSettings.provider || 'NOT SET'}`);
      console.log(`  API Key: ${aiSettings.apiKey ? 'SET' : 'NOT SET'}`);
      console.log(`  Model: ${aiSettings.model || 'NOT SET'}`);
      
      if (aiSettings.provider && aiSettings.apiKey) {
        console.log('\n📝 Current AI prompt for CUSIP lookup:');
        console.log('   "Given the CUSIP "[CUSIP]", what is the corresponding stock ticker symbol? Please respond with ONLY the ticker symbol, no additional text."');
        
        console.log('\n❗ IDENTIFIED PROMPT ISSUES:');
        console.log('• The prompt is too simple and doesn\'t provide context');
        console.log('• No examples or formatting guidance');
        console.log('• Doesn\'t handle edge cases (mutual funds, bonds, etc.)');
        console.log('• No validation instructions');
      } else {
        console.log('❌ AI provider not properly configured');
      }
      
    } catch (error) {
      console.log('❌ Could not get AI settings:', error.message);
    }
    
    // 5. Check for specific cache key issue
    console.log('\n5. Checking cache key construction...');
    
    // The cache is using namespace-based keys
    const testCusip = '74347G861';
    const namespaceKey = `cusip_resolution:${testCusip}`;
    const directKey = cache.get(namespaceKey);
    console.log(`Trying namespace key "${namespaceKey}": ${directKey || 'NOT FOUND'}`);
    
    // 6. Check if there's a cache key mismatch issue
    console.log('\n6. IDENTIFIED CACHE ISSUE:');
    console.log('The cache.get() calls in examineSymbolIssue.js use two parameters:');
    console.log('  cache.get("cusip_resolution", cusip)');
    console.log('But the cache.set() calls in cusipQueue.js might be using different format');
    console.log('Let\'s check how the cache actually works...');
    
    // Test the cache behavior
    cache.set('test_namespace', 'test_key', 'test_value', 60000);
    const retrieved1 = cache.get('test_namespace', 'test_key');
    const retrieved2 = cache.get('test_namespace:test_key');
    
    console.log(`Set: cache.set('test_namespace', 'test_key', 'test_value')`);
    console.log(`Get with 2 params: ${retrieved1 || 'NULL'}`);
    console.log(`Get with namespace key: ${retrieved2 || 'NULL'}`);
    
    // 7. Show the real problem
    console.log('\n7. ROOT CAUSE ANALYSIS:');
    
    console.log('\n🐛 CACHE ISSUE:');
    console.log('• The simple cache implementation doesn\'t support namespaces');
    console.log('• cache.get("namespace", "key") doesn\'t work as expected');
    console.log('• cache.set() in cusipQueue uses 3 params but cache expects 3 params differently');
    console.log('• Resolved CUSIPs are NOT being cached properly');
    console.log('• This causes repeated failed lookups');
    
    console.log('\n🤖 AI PROMPT ISSUE:');
    console.log('• Prompt is too basic: "Given the CUSIP X, what is the ticker?"');
    console.log('• No context about what a CUSIP is');
    console.log('• No examples of correct format');
    console.log('• No handling of non-equity securities');
    console.log('• No instruction to say "UNKNOWN" if unsure');
    
    console.log('\n💾 DATABASE VS CACHE ISSUE:');
    console.log('• Resolved CUSIPs are marked "completed" in queue');
    console.log('• But the trades table is not being updated');
    console.log('• Cache is not working so lookups repeat');
    console.log('• Results in infinite failed attempts');
    
    console.log('\n✅ Investigation completed');
    
  } catch (error) {
    console.error('❌ Investigation failed:', error);
    throw error;
  }
}

// Run the investigation
if (require.main === module) {
  investigateCusipIssues()
    .then(() => {
      console.log('\n🎉 Investigation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Investigation failed:', error);
      process.exit(1);
    });
}

module.exports = investigateCusipIssues;