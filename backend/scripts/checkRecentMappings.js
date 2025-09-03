#!/usr/bin/env node

const db = require('../src/config/database');

async function checkRecentMappings() {
  console.log('🔍 Checking Recent CUSIP Mappings\n');

  try {
    // Check very recent mappings
    console.log('1. Recent CUSIP mappings (last 10 minutes):');
    const recentMappings = await db.query(`
      SELECT cusip, ticker, resolution_source, confidence_score, user_id, created_at
      FROM cusip_mappings 
      WHERE created_at > NOW() - INTERVAL '10 minutes'
      ORDER BY created_at DESC 
      LIMIT 20
    `);

    console.log(`   Found ${recentMappings.rows.length} recent mappings`);
    recentMappings.rows.forEach(mapping => {
      const age = Math.round((new Date() - mapping.created_at) / 1000);
      const userType = mapping.user_id ? 'user' : 'global';
      console.log(`   ${mapping.cusip} → ${mapping.ticker} (${mapping.resolution_source}, ${userType}, ${age}s ago)`);
    });

    // Check if any trades have been updated with ticker symbols recently
    console.log('\n2. Recent trades with ticker symbols (from CUSIP resolution):');
    const recentTickers = await db.query(`
      SELECT DISTINCT symbol, COUNT(*) as count, MAX(updated_at) as last_updated
      FROM trades 
      WHERE symbol !~ '^[A-Z0-9]{8}[0-9]$'  -- Not CUSIPs
        AND updated_at > NOW() - INTERVAL '30 minutes'
      GROUP BY symbol
      ORDER BY last_updated DESC
      LIMIT 10
    `);

    console.log(`   Found ${recentTickers.rows.length} ticker symbols from recent updates`);
    recentTickers.rows.forEach(ticker => {
      const age = Math.round((new Date() - ticker.last_updated) / 1000 / 60);
      console.log(`   ${ticker.symbol}: ${ticker.count} trades (${age}m ago)`);
    });

    // Check trades that still have CUSIPs but mappings exist
    console.log('\n3. Trades that should be updated but still have CUSIPs:');
    const unmappedTrades = await db.query(`
      SELECT t.id, t.symbol as cusip, cm.ticker, t.updated_at, cm.created_at as mapping_created
      FROM trades t
      JOIN cusip_mappings cm ON t.symbol = cm.cusip
      WHERE t.symbol ~ '^[A-Z0-9]{8}[0-9]$'  -- Still CUSIPs
        AND cm.created_at > NOW() - INTERVAL '30 minutes'  -- Recent mappings
        AND (cm.user_id = t.user_id OR cm.user_id IS NULL)
      ORDER BY cm.created_at DESC
      LIMIT 10
    `);

    console.log(`   Found ${unmappedTrades.rows.length} trades that should be updated`);
    unmappedTrades.rows.forEach(trade => {
      const tradeAge = Math.round((new Date() - trade.updated_at) / 1000 / 60);
      const mappingAge = Math.round((new Date() - trade.mapping_created) / 1000 / 60);
      console.log(`   Trade ${trade.id}: ${trade.cusip} → ${trade.ticker} (mapping ${mappingAge}m ago, trade ${tradeAge}m ago)`);
    });

    // Check the user's specific situation
    console.log('\n4. Checking boverton@tradetally.io user specifically:');
    const userTrades = await db.query(`
      SELECT 
        COUNT(*) filter (WHERE symbol ~ '^[A-Z0-9]{8}[0-9]$') as cusip_count,
        COUNT(*) filter (WHERE symbol !~ '^[A-Z0-9]{8}[0-9]$') as ticker_count,
        COUNT(*) as total_trades
      FROM trades 
      WHERE user_id = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'  -- boverton@tradetally.io
    `);

    const stats = userTrades.rows[0];
    console.log(`   Total trades: ${stats.total_trades}`);
    console.log(`   Still CUSIPs: ${stats.cusip_count}`);
    console.log(`   Ticker symbols: ${stats.ticker_count}`);

    if (stats.cusip_count > 0) {
      console.log('\n   Sample CUSIPs that should be mapped:');
      const sampleCusips = await db.query(`
        SELECT t.symbol as cusip, COUNT(*) as count, cm.ticker
        FROM trades t
        LEFT JOIN cusip_mappings cm ON t.symbol = cm.cusip 
          AND (cm.user_id = t.user_id OR cm.user_id IS NULL)
        WHERE t.user_id = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'
          AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
        GROUP BY t.symbol, cm.ticker
        ORDER BY count DESC
        LIMIT 5
      `);

      sampleCusips.rows.forEach(cusip => {
        const status = cusip.ticker ? `mapped to ${cusip.ticker}` : 'unmapped';
        console.log(`     ${cusip.cusip}: ${cusip.count} trades (${status})`);
      });
    }

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  } finally {
    await db.pool.end();
  }
}

// Run the check
checkRecentMappings();