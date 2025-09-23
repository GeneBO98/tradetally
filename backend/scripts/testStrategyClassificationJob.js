#!/usr/bin/env node

// Test strategy classification job processing
const jobQueue = require('../src/utils/jobQueue');

async function testStrategyClassificationJob() {
  console.log('[CHECK] Testing Strategy Classification Job Processing\n');

  try {
    // Test the processStrategyClassification method directly
    const testData = {
      "tradeId": "479810f0-d5df-448d-b3e8-58755dc89533"
    };

    console.log('1. Testing strategy classification processing directly:');
    console.log('   Processing trade ID:', testData.tradeId);

    const result = await jobQueue.processStrategyClassification(testData);
    console.log('[SUCCESS] Strategy classification completed successfully');
    console.log('   Result:', result);

  } catch (error) {
    console.error('[ERROR] Strategy classification failed:', error.message);
    console.error('   Stack:', error.stack);
  }

  // DON'T close the database pool since the main server is running
  console.log('\n[PROCESS] Test completed (database pool left open for main server)');
}

// Run the test
testStrategyClassificationJob();