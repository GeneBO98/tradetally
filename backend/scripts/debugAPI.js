#!/usr/bin/env node

const db = require('../src/config/database');

async function debugAPI() {
  console.log('[CHECK] Debugging CUSIP API Issue\n');

  try {
    // Get a valid user
    const userResult = await db.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('[ERROR] No users found in database');
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`[SUCCESS] Using user: ${userId}`);

    // Check if user has trades with CUSIPs
    console.log('\n1. Checking user trades with CUSIPs:');
    const tradesQuery = `
      SELECT symbol, COUNT(*) as count
      FROM trades 
      WHERE user_id = $1 
        AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
      GROUP BY symbol
      ORDER BY count DESC
      LIMIT 5
    `;
    const tradesResult = await db.query(tradesQuery, [userId]);
    console.log(`   Found ${tradesResult.rows.length} CUSIPs in trades`);
    tradesResult.rows.forEach(row => {
      console.log(`   ${row.symbol}: ${row.count} trades`);
    });

    // Test the exact query from the controller
    console.log('\n2. Testing controller query step by step:');
    
    // Step 1: user_cusips CTE
    const userCusipsQuery = `
      SELECT DISTINCT symbol as cusip
      FROM trades 
      WHERE user_id = $1 
        AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
    `;
    const userCusipsResult = await db.query(userCusipsQuery, [userId]);
    console.log(`   user_cusips CTE: ${userCusipsResult.rows.length} CUSIPs`);

    // Step 2: trade_counts CTE
    const tradeCountsQuery = `
      SELECT symbol, COUNT(*) as trade_count
      FROM trades 
      WHERE user_id = $1 
        AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
      GROUP BY symbol
    `;
    const tradeCountsResult = await db.query(tradeCountsQuery, [userId]);
    console.log(`   trade_counts CTE: ${tradeCountsResult.rows.length} entries`);

    // Step 3: Check for existing mappings
    const mappingsQuery = `
      SELECT cusip, ticker, resolution_source
      FROM cusip_mappings 
      WHERE (user_id = $1 OR user_id IS NULL)
    `;
    const mappingsResult = await db.query(mappingsQuery, [userId]);
    console.log(`   existing mappings: ${mappingsResult.rows.length} entries`);

    // Step 4: Full controller query
    console.log('\n3. Testing full controller query:');
    const fullQuery = `
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
      LIMIT 20 OFFSET 0
    `;

    const fullResult = await db.query(fullQuery, [userId]);
    console.log(`   [SUCCESS] Full query result: ${fullResult.rows.length} rows`);

    if (fullResult.rows.length > 0) {
      console.log('   Sample results:');
      fullResult.rows.slice(0, 3).forEach(row => {
        console.log(`   ${row.cusip}: ${row.ticker || 'UNMAPPED'} (${row.trade_count} trades)`);
      });
    } else {
      console.log('   [ERROR] No results returned - this is the problem!');
    }

    // Check if there's a simpler issue
    console.log('\n4. Checking for simple JOIN issues:');
    const simpleQuery = `
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
      )
      SELECT uc.cusip, tc.trade_count
      FROM user_cusips uc
      INNER JOIN trade_counts tc ON tc.symbol = uc.cusip
      ORDER BY tc.trade_count DESC
    `;

    const simpleResult = await db.query(simpleQuery, [userId]);
    console.log(`   Simple JOIN test: ${simpleResult.rows.length} rows`);

  } catch (error) {
    console.error('[ERROR] Debug failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the debug
debugAPI();