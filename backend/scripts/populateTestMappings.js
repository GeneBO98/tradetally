#!/usr/bin/env node

const db = require('../src/config/database');

async function populateTestMappings() {
  console.log('🧪 Creating Test CUSIP Mappings for Comprehensive View\n');

  try {
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'; // boverton@tradetally.io
    
    // Get some of the user's current ticker symbols and create fake historical mappings
    // This simulates what would have been stored if the mapping bug hadn't existed
    const currentTickers = await db.query(`
      SELECT symbol, COUNT(*) as count
      FROM trades 
      WHERE user_id = $1
        AND symbol !~ '^[A-Z0-9]{8}[0-9]$'
      GROUP BY symbol
      ORDER BY count DESC
      LIMIT 10
    `, [userId]);

    console.log('Creating test mappings for demonstration:');
    
    const testMappings = [
      { cusip: '12345ABCD', ticker: currentTickers.rows[0]?.symbol || 'VVPR', source: 'finnhub', userSpecific: false },
      { cusip: '67890EFGH', ticker: currentTickers.rows[1]?.symbol || 'OSRH', source: 'ai', userSpecific: false },
      { cusip: '11111TEST', ticker: currentTickers.rows[2]?.symbol || 'SQQQ', source: 'manual', userSpecific: true },
      { cusip: '22222DEMO', ticker: currentTickers.rows[3]?.symbol || 'TQQQ', source: 'ai', userSpecific: true },
      { cusip: '33333SAMPLE', ticker: 'UNKN', source: 'finnhub', userSpecific: false, unmapped: true }
    ];

    for (const mapping of testMappings) {
      if (mapping.unmapped) {
        // Create an unmapped CUSIP by adding a fake trade
        console.log(`   Creating unmapped CUSIP: ${mapping.cusip}`);
        await db.query(`
          INSERT INTO trades (id, user_id, symbol, trade_date, entry_time, entry_price, quantity, side, pnl)
          VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_TIMESTAMP, 100.00, 10, 'long', 0)
        `, [require('crypto').randomUUID(), userId, mapping.cusip]);
      } else {
        // Create the mapping
        console.log(`   Creating mapping: ${mapping.cusip} → ${mapping.ticker} (${mapping.source}, ${mapping.userSpecific ? 'user' : 'global'})`);
        await db.query(`
          INSERT INTO cusip_mappings (cusip, ticker, company_name, resolution_source, user_id, confidence_score, verified)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (cusip, user_id) DO UPDATE SET
            ticker = EXCLUDED.ticker,
            resolution_source = EXCLUDED.resolution_source,
            updated_at = CURRENT_TIMESTAMP
        `, [
          mapping.cusip,
          mapping.ticker,
          `${mapping.ticker} Company`,
          mapping.source,
          mapping.userSpecific ? userId : null,
          mapping.source === 'finnhub' ? 95 : mapping.source === 'ai' ? 75 : 100,
          mapping.source === 'manual'
        ]);
      }
    }

    console.log('\n✅ Test mappings created!');
    
    // Now test what the API returns
    console.log('\nTesting API with test data:');
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
          COALESCE(tc.trade_count, 0) as trade_count
        FROM user_cusips uc
        LEFT JOIN cusip_mappings cm ON uc.cusip = cm.cusip 
          AND (cm.user_id = $1 OR cm.user_id IS NULL)
        LEFT JOIN trade_counts tc ON tc.symbol = uc.cusip
        WHERE 1=1
        ORDER BY uc.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT *
      FROM prioritized_mappings
      ORDER BY trade_count DESC, cusip ASC
    `;

    const apiResult = await db.query(apiQuery, [userId]);
    console.log(`\nAPI now returns ${apiResult.rows.length} CUSIPs:`);
    apiResult.rows.forEach(row => {
      const sourceLabel = row.is_user_override ? 
        (row.resolution_source === 'manual' ? 'Manual (User)' : `${row.resolution_source.toUpperCase()} (User)`) :
        row.resolution_source ? row.resolution_source.charAt(0).toUpperCase() + row.resolution_source.slice(1) : 'Unknown';
      const verified = row.verified ? '✓' : '?';
      const status = row.ticker ? `→ ${row.ticker}` : 'UNMAPPED';
      console.log(`   ${row.cusip}: ${row.trade_count} trades ${status} (${sourceLabel}) ${verified}`);
    });

    console.log('\n🎯 This is what the comprehensive modal should show:');
    console.log('   - All CUSIPs that were in user trades');
    console.log('   - Their mapped ticker symbols (or UNMAPPED)');
    console.log('   - Source: Finnhub/AI/Manual with user override indication');
    console.log('   - Verification status');
    console.log('   - Trade count for each');

  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test setup
populateTestMappings();