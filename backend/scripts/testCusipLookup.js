require('dotenv').config({ path: './.env' });
const finnhub = require('../src/utils/finnhub');

async function testCusipLookup() {
  console.log('[CHECK] Testing CUSIP lookup with AI fallback...');
  
  try {
    console.log('Finnhub configured:', finnhub.isConfigured());
    console.log('Testing CUSIP: 28059P303');
    
    const result = await finnhub.lookupCusip('28059P303');
    console.log('[SUCCESS] CUSIP lookup result:', result);
    
    // Test a known Apple CUSIP that should work
    console.log('\nTesting known Apple CUSIP: 037833100');
    const appleResult = await finnhub.lookupCusip('037833100');
    console.log('[SUCCESS] Apple CUSIP lookup result:', appleResult);
    
  } catch (error) {
    console.error('[ERROR] CUSIP lookup failed:', error.message);
    console.error('Error details:', error);
  }
  
  process.exit(0);
}

testCusipLookup();