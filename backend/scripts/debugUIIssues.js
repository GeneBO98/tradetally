#!/usr/bin/env node

const db = require('../src/config/database');

async function debugUIIssues() {
  console.log('[CHECK] Debugging UI Issues - CUSIP Mappings Not Showing\n');

  try {
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'; // boverton@tradetally.io
    
    // 1. Check if CUSIP mappings were actually created
    console.log('1. Recent CUSIP mappings in database:');
    const recentMappings = await db.query(`
      SELECT cusip, ticker, resolution_source, confidence_score, user_id, created_at
      FROM cusip_mappings 
      WHERE created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY created_at DESC 
      LIMIT 20
    `);

    console.log(`   Found ${recentMappings.rows.length} recent mappings:`);
    recentMappings.rows.forEach(mapping => {
      const age = Math.round((new Date() - mapping.created_at) / 1000 / 60);
      const userType = mapping.user_id ? `user-${mapping.user_id.substring(0,8)}` : 'global';
      console.log(`   ${mapping.cusip} → ${mapping.ticker} (${mapping.resolution_source}, ${userType}, ${age}m ago)`);
    });

    // 2. Check what the API endpoint returns for this user
    console.log('\n2. Testing the main CUSIP mappings API query:');
    const apiQuery = `
      WITH user_cusips AS (
        SELECT DISTINCT symbol as cusip
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
      ),
      trade_counts AS (
        SELECT symbol, COUNT(*) as trade_count
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        GROUP BY symbol
      ),
      prioritized_mappings AS (
        SELECT DISTINCT ON (uc.cusip)
          cm.id,
          uc.cusip,
          cm.ticker,
          cm.company_name,
          cm.resolution_source,
          cm.confidence_score,
          cm.verified,
          cm.user_id,
          cm.created_at,
          cm.updated_at,
          (cm.user_id = $1) as is_user_override,
          true as used_in_trades,
          tc.trade_count
        FROM user_cusips uc
        LEFT JOIN cusip_mappings cm ON uc.cusip = cm.cusip 
          AND (cm.user_id = $1 OR cm.user_id IS NULL)
        INNER JOIN trade_counts tc ON tc.symbol = uc.cusip
        WHERE 1=1
        ORDER BY uc.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT *
      FROM prioritized_mappings
      ORDER BY trade_count DESC, cusip ASC
      LIMIT 20
    `;

    const apiResult = await db.query(apiQuery, [userId]);
    console.log(`   API would return ${apiResult.rows.length} CUSIPs:`);
    apiResult.rows.forEach(row => {
      const status = row.ticker ? `→ ${row.ticker}` : 'UNMAPPED';
      console.log(`   ${row.cusip}: ${row.trade_count} trades ${status}`);
    });

    // 3. Check if trades were updated with new ticker symbols
    console.log('\n3. Checking if trades were updated:');
    const tradeUpdateQuery = `
      SELECT 
        COUNT(*) filter (WHERE symbol ~ '^[A-Z0-9]{8}[0-9]$') as still_cusips,
        COUNT(*) filter (WHERE symbol !~ '^[A-Z0-9]{8}[0-9]$') as now_tickers,
        COUNT(*) as total
      FROM trades 
      WHERE user_id = $1
    `;

    const tradeStats = await db.query(tradeUpdateQuery, [userId]);
    const stats = tradeStats.rows[0];
    console.log(`   Total trades: ${stats.total}`);
    console.log(`   Still CUSIPs: ${stats.still_cusips}`);
    console.log(`   Now tickers: ${stats.now_tickers}`);

    // 4. Check specific CUSIPs that were supposed to be resolved
    console.log('\n4. Checking specific CUSIPs we saw being resolved:');
    const specificCusips = ['501506703', '73017P102', '83006G203', '89458T205', '97382D501'];
    
    for (const cusip of specificCusips) {
      // Check if mapping exists
      const mappingCheck = await db.query(`
        SELECT cusip, ticker, resolution_source FROM cusip_mappings 
        WHERE cusip = $1
      `, [cusip]);

      // Check if trades were updated
      const tradeCheck = await db.query(`
        SELECT symbol, COUNT(*) as count FROM trades 
        WHERE user_id = $1 AND (symbol = $2 OR symbol IN (
          SELECT ticker FROM cusip_mappings WHERE cusip = $2
        ))
        GROUP BY symbol
      `, [userId, cusip]);

      if (mappingCheck.rows.length > 0) {
        const mapping = mappingCheck.rows[0];
        console.log(`   [SUCCESS] ${cusip} → ${mapping.ticker} (${mapping.resolution_source})`);
        
        if (tradeCheck.rows.length > 0) {
          tradeCheck.rows.forEach(trade => {
            const status = trade.symbol === cusip ? 'still CUSIP' : 'updated to ticker';
            console.log(`     ${trade.count} trades: ${trade.symbol} (${status})`);
          });
        }
      } else {
        console.log(`   [ERROR] ${cusip}: No mapping found`);
      }
    }

    // 5. Check unmapped CUSIPs API
    console.log('\n5. Testing unmapped CUSIPs API:');
    const unmappedQuery = `
      SELECT 
        t.symbol as cusip,
        COUNT(*) as trade_count
      FROM trades t
      WHERE t.user_id = $1
        AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND NOT EXISTS (
          SELECT 1 FROM cusip_mappings cm 
          WHERE cm.cusip = t.symbol 
            AND (cm.user_id = $1 OR cm.user_id IS NULL)
        )
      GROUP BY t.symbol
      ORDER BY trade_count DESC
    `;

    const unmappedResult = await db.query(unmappedQuery, [userId]);
    console.log(`   Unmapped API would return ${unmappedResult.rows.length} CUSIPs:`);
    unmappedResult.rows.slice(0, 10).forEach(row => {
      console.log(`   ${row.cusip}: ${row.trade_count} trades`);
    });

    // 6. Check if the issue is with trade updates not happening
    console.log('\n6. Checking for trades that should be updated but weren\'t:');
    const shouldBeUpdatedQuery = `
      SELECT t.id, t.symbol as cusip, cm.ticker, t.updated_at, cm.created_at as mapping_created
      FROM trades t
      JOIN cusip_mappings cm ON t.symbol = cm.cusip
      WHERE t.user_id = $1
        AND t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND (cm.user_id = $1 OR cm.user_id IS NULL)
        AND cm.created_at > NOW() - INTERVAL '1 hour'
      LIMIT 10
    `;

    const shouldBeUpdated = await db.query(shouldBeUpdatedQuery, [userId]);
    console.log(`   Found ${shouldBeUpdated.rows.length} trades that should be updated:`);
    shouldBeUpdated.rows.forEach(trade => {
      const mappingAge = Math.round((new Date() - trade.mapping_created) / 1000 / 60);
      console.log(`   Trade ${trade.id}: ${trade.cusip} should be ${trade.ticker} (mapping ${mappingAge}m old)`);
    });

  } catch (error) {
    console.error('[ERROR] Debug failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the debug
debugUIIssues();