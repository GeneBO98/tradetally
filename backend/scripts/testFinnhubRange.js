#!/usr/bin/env node

/**
 * Test script to troubleshoot Finnhub "increase from and to range" errors
 * This will test different date ranges and see what works
 */

const finnhub = require('../src/utils/finnhub');

async function testFinnhubRanges() {
  console.log('🔬 Testing Finnhub API range requirements...');
  
  // Test symbols that were causing errors
  const testSymbols = ['TQQQ', 'SQQQ', 'VERO', 'NAOV', 'GLXG'];
  
  for (const symbol of testSymbols) {
    console.log(`\n📊 Testing symbol: ${symbol}`);
    
    // Test different date ranges
    const now = Math.floor(Date.now() / 1000);
    const ranges = [
      { name: '1 hour', from: now - 3600, to: now },
      { name: '1 day', from: now - 86400, to: now },
      { name: '3 days', from: now - (3 * 86400), to: now },
      { name: '7 days', from: now - (7 * 86400), to: now },
      { name: '30 days', from: now - (30 * 86400), to: now },
      { name: '90 days', from: now - (90 * 86400), to: now },
    ];
    
    for (const range of ranges) {
      try {
        console.log(`   Testing ${range.name} range (${range.from} to ${range.to}):`);
        
        // Test candles first
        try {
          const candles = await finnhub.getCandles(symbol, '5', range.from, range.to);
          console.log(`     ✅ Candles: ${candles ? candles.c?.length || 0 : 0} data points`);
        } catch (error) {
          console.log(`     ❌ Candles failed: ${error.message}`);
        }
        
        // Test RSI (needs 14+ periods)
        try {
          const rsi = await finnhub.getTechnicalIndicator(symbol, '5', range.from, range.to, 'rsi', { timeperiod: 14 });
          console.log(`     ✅ RSI: ${rsi ? rsi.rsi?.length || 0 : 0} data points`);
        } catch (error) {
          console.log(`     ❌ RSI failed: ${error.message}`);
        }
        
        // Test MACD
        try {
          const macd = await finnhub.getTechnicalIndicator(symbol, '5', range.from, range.to, 'macd', { 
            fastperiod: 12, slowperiod: 26, signalperiod: 9 
          });
          console.log(`     ✅ MACD: ${macd ? macd.macd?.length || 0 : 0} data points`);
        } catch (error) {
          console.log(`     ❌ MACD failed: ${error.message}`);
        }
        
        // Test Bollinger Bands (needs 20+ periods)
        try {
          const bbands = await finnhub.getTechnicalIndicator(symbol, '5', range.from, range.to, 'bbands', { 
            timeperiod: 20, nbdevup: 2, nbdevdn: 2 
          });
          console.log(`     ✅ BBands: ${bbands ? bbands.lower?.length || 0 : 0} data points`);
        } catch (error) {
          console.log(`     ❌ BBands failed: ${error.message}`);
        }
        
        console.log('');
        
        // If this range worked for all indicators, we found a good range
        if (range.name === '30 days' || range.name === '90 days') {
          console.log(`   🎯 ${range.name} range seems to work well for ${symbol}`);
          break;
        }
        
      } catch (error) {
        console.log(`   ❌ Range ${range.name} failed: ${error.message}`);
      }
    }
    
    // Add delay between symbols to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n💡 Recommendations:');
  console.log('   1. Use at least 30-90 days for technical indicators');
  console.log('   2. Use 5-minute resolution instead of 60-minute for more data points');
  console.log('   3. For trades < 1 day old, extend the "from" date to ensure enough data');
  console.log('   4. Consider fallback to basic classification for new/illiquid symbols');
}

// Test the fixed classification on the same trades
async function testFixedClassification() {
  console.log('\n🔧 Testing fixed classification logic...');
  
  const db = require('../src/config/database');
  const Trade = require('../src/models/Trade');
  
  // Get some trades with very short hold times
  const shortTrades = await db.query(`
    SELECT 
      id, symbol, entry_time, exit_time, entry_price, exit_price,
      quantity, side, pnl, strategy,
      EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60 as hold_time_minutes
    FROM trades
    WHERE exit_time IS NOT NULL
      AND EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60 < 60  -- Less than 1 hour
    ORDER BY hold_time_minutes ASC
    LIMIT 5
  `);
  
  console.log(`📊 Testing ${shortTrades.rows.length} short-hold trades:`);
  
  for (const trade of shortTrades.rows) {
    console.log(`\n🔍 Trade ${trade.id}:`);
    console.log(`   Symbol: ${trade.symbol}`);
    console.log(`   Actual hold time: ${Math.round(trade.hold_time_minutes)} minutes`);
    console.log(`   Current strategy: ${trade.strategy || 'none'}`);
    
    const classification = await Trade.classifyTradeBasic(trade);
    
    console.log(`   New classification: ${classification.strategy}`);
    console.log(`   Confidence: ${Math.round(classification.confidence * 100)}%`);
    console.log(`   Expected for ${Math.round(trade.hold_time_minutes)}min: ${
      trade.hold_time_minutes < 15 ? 'scalper' : 
      trade.hold_time_minutes < 240 ? 'day_trading' : 'other'
    }`);
    
    const isCorrect = (
      (trade.hold_time_minutes < 15 && classification.strategy === 'scalper') ||
      (trade.hold_time_minutes >= 15 && trade.hold_time_minutes < 240 && classification.strategy === 'day_trading')
    );
    
    console.log(`   ✅ Classification ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);
  }
}

// Run tests
if (require.main === module) {
  Promise.resolve()
    .then(() => testFixedClassification())
    .then(() => testFinnhubRanges())
    .then(() => {
      console.log('\n✅ All tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Tests failed:', error);
      process.exit(1);
    });
}

module.exports = { testFinnhubRanges, testFixedClassification };