// FIXED TIME CALCULATION LOGIC FOR parseLightspeedTransactions
// This shows the corrected logic that should replace the buggy version

console.log('=== FIXED TIME CALCULATION LOGIC ===\n');

// Example of what the FIXED logic should look like:

function fixedTradeProcessing() {
  console.log('CORRECTED LOGIC:\n');
  
  console.log('1. When closing a position (currentPosition === 0):');
  console.log('');
  console.log('   // FIXED: Calculate proper entry and exit times from executions');
  console.log('   const executionTimes = currentTrade.executions.map(e => new Date(e.datetime));');
  console.log('   const sortedTimes = executionTimes.sort((a, b) => a - b);');
  console.log('   ');
  console.log('   currentTrade.entryTime = sortedTimes[0].toISOString();  // EARLIEST execution');
  console.log('   currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();  // LATEST execution');
  console.log('');
  
  console.log('2. When starting with existing position:');
  console.log('');
  console.log('   // FIXED: Don\'t use database times, determine from CSV transactions');
  console.log('   let currentTrade = existingPosition ? {');
  console.log('     symbol: symbol,');
  console.log('     entryTime: null,  // Will be set from first CSV transaction');
  console.log('     tradeDate: null,  // Will be set from first CSV transaction');
  console.log('     side: existingPosition.side,');
  console.log('     executions: [],');
  console.log('     // ... other fields');
  console.log('   } : null;');
  console.log('');
  
  console.log('3. When processing first transaction for existing position:');
  console.log('');
  console.log('   if (currentTrade && currentTrade.entryTime === null) {');
  console.log('     // Set entry time from first CSV transaction, not database');
  console.log('     currentTrade.entryTime = transaction.entryTime;');
  console.log('     currentTrade.tradeDate = transaction.tradeDate;');
  console.log('   }');
  console.log('');
  
  console.log('4. Preserve ALL executions:');
  console.log('');
  console.log('   // FIXED: Don\'t overwrite executions field');
  console.log('   currentTrade.executionData = [...currentTrade.executions];  // Preserve all');
  console.log('   // Don\'t do: currentTrade.executionData = currentTrade.executions; (reference)');
  console.log('');
}

fixedTradeProcessing();

console.log('SPECIFIC FIXES NEEDED IN csvParser.js:\n');

console.log('BUG 1 - Line 710:');
console.log('REPLACE:');
console.log('  currentTrade.exitTime = transaction.entryTime;');
console.log('WITH:');
console.log('  const executionTimes = currentTrade.executions.map(e => new Date(e.datetime));');
console.log('  const sortedTimes = executionTimes.sort((a, b) => a - b);');
console.log('  currentTrade.entryTime = sortedTimes[0].toISOString();');
console.log('  currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();\n');

console.log('BUG 2 - Lines 611-612:');
console.log('REPLACE:');
console.log('  entryTime: existingPosition.entryTime,');
console.log('  tradeDate: existingPosition.tradeDate,');
console.log('WITH:');
console.log('  entryTime: null,  // Will be set from first CSV transaction');
console.log('  tradeDate: null,  // Will be set from first CSV transaction\n');

console.log('BUG 3 - Line 712:');
console.log('REPLACE:');
console.log('  currentTrade.executionData = currentTrade.executions;');
console.log('WITH:');
console.log('  currentTrade.executionData = [...currentTrade.executions];  // Deep copy\n');

console.log('ADDITIONAL FIX - Add logic to set entry time on first transaction:');
console.log('ADD after line 633:');
console.log('  if (currentTrade && currentTrade.entryTime === null) {');
console.log('    currentTrade.entryTime = transaction.entryTime;');
console.log('    currentTrade.tradeDate = transaction.tradeDate;');
console.log('  }');

process.exit(0);