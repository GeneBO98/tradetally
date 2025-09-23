#!/usr/bin/env node

const db = require('../src/config/database');

async function findHistoricalCusips() {
  console.log('[CHECK] Finding All Historical CUSIPs for User\n');

  try {
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'; // boverton@tradetally.io
    
    // Let's look at our earlier debug output to see what CUSIPs were resolved
    // We know from logs that CUSIPs like 501506703→TSLA, 73017P102→BLK were resolved
    
    console.log('1. Current ticker symbols in user trades:');
    const currentTickers = await db.query(`
      SELECT symbol, COUNT(*) as count
      FROM trades 
      WHERE user_id = $1
        AND symbol !~ '^[A-Z0-9]{8}[0-9]$'  -- Not CUSIPs, these are tickers
      GROUP BY symbol
      ORDER BY count DESC
      LIMIT 20
    `, [userId]);

    console.log(`   Found ${currentTickers.rows.length} unique ticker symbols:`);
    currentTickers.rows.forEach(ticker => {
      console.log(`   ${ticker.symbol}: ${ticker.count} trades`);
    });

    // Let's check if any of these tickers match known CUSIP→ticker mappings from logs
    const knownMappings = {
      '501506703': 'TSLA',
      '73017P102': 'BLK', 
      '83006G203': 'TMUS',
      '89458T205': 'TCMD',
      '97382D501': 'VTRS',
      'G33277131': 'BHG',
      '40423R105': null, // We saw this in earlier debug
      '655187300': null,
      'G2161Y125': null,
      'M97838128': 'M7900A102' // This one was odd
    };

    console.log('\n2. Checking if resolved tickers match known mappings:');
    const foundMappings = [];
    for (const [cusip, expectedTicker] of Object.entries(knownMappings)) {
      if (expectedTicker) {
        const found = currentTickers.rows.find(t => t.symbol === expectedTicker);
        if (found) {
          console.log(`   [SUCCESS] ${cusip} → ${expectedTicker} (${found.count} trades)`);
          foundMappings.push({ cusip, ticker: expectedTicker, trade_count: found.count, source: 'inferred' });
        } else {
          console.log(`   ❓ ${cusip} → ${expectedTicker} (not found in current trades)`);
        }
      }
    }

    console.log('\n3. What we should do:');
    console.log('   Since the mappings were lost due to the earlier bug, we have two options:');
    console.log('   A) Retroactively create mappings based on known resolutions');
    console.log('   B) Update the API to show current ticker symbols as "resolved CUSIPs"');
    
    console.log('\nOption A - Create retroactive mappings:');
    foundMappings.forEach(mapping => {
      console.log(`   INSERT mapping: ${mapping.cusip} → ${mapping.ticker} (${mapping.trade_count} trades)`);
    });

    console.log('\nOption B - Update API to show ticker symbols that came from CUSIP resolution');
    console.log('   This would show all tickers with a note that they were resolved from CUSIPs');

    // Check what the frontend is actually calling
    console.log('\n4. Testing what frontend calls:');
    console.log('   The frontend calls /api/cusip-mappings which should return ALL historical mappings');
    console.log('   Currently it only returns mappings from cusip_mappings table');
    console.log('   We need to include inferred/historical mappings too');

  } catch (error) {
    console.error('[ERROR] Check failed:', error.message);
  } finally {
    await db.pool.end();
  }
}

// Run the check
findHistoricalCusips();