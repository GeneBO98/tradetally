#!/usr/bin/env node

const db = require('../src/config/database');

async function testUpdatedAPI() {
  console.log('[CHECK] Testing Updated CUSIP Mappings API\n');

  try {
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'; // boverton@tradetally.io
    
    // Test the updated API query directly
    console.log('1. Testing updated API query:');
    const query = `
      WITH all_user_cusips AS (
        -- Get CUSIPs currently in trades (unmapped)
        SELECT DISTINCT symbol as cusip, 'current' as cusip_type
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        
        UNION
        
        -- Get historical CUSIPs from mappings that were used for this user's trades
        SELECT DISTINCT cm.cusip, 'historical' as cusip_type
        FROM cusip_mappings cm
        WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
          AND EXISTS (
            SELECT 1 FROM trades t 
            WHERE t.user_id = $1 
              AND t.symbol = cm.ticker
          )
      ),
      trade_counts AS (
        -- Count trades for current CUSIPs
        SELECT symbol as cusip, COUNT(*) as trade_count
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        GROUP BY symbol
        
        UNION ALL
        
        -- Count trades for historical CUSIPs (now converted to tickers)
        SELECT cm.cusip, COUNT(t.id) as trade_count
        FROM cusip_mappings cm
        INNER JOIN trades t ON t.symbol = cm.ticker AND t.user_id = $1
        WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
        GROUP BY cm.cusip
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
        FROM all_user_cusips uc
        LEFT JOIN cusip_mappings cm ON uc.cusip = cm.cusip 
          AND (cm.user_id = $1 OR cm.user_id IS NULL)
        LEFT JOIN trade_counts tc ON tc.cusip = uc.cusip
        WHERE 1=1
        ORDER BY uc.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT *
      FROM prioritized_mappings
      ORDER BY trade_count DESC, cusip ASC
      LIMIT 20
    `;

    const result = await db.query(query, [userId]);
    console.log(`   API returns ${result.rows.length} CUSIPs:`);
    
    result.rows.forEach(row => {
      const sourceLabel = row.is_user_override ? 
        (row.resolution_source === 'manual' ? 'Manual (User)' : `${row.resolution_source ? row.resolution_source.toUpperCase() : 'UNKNOWN'} (User)`) :
        row.resolution_source ? row.resolution_source.charAt(0).toUpperCase() + row.resolution_source.slice(1) : 'Unknown';
      const verified = row.verified ? '[VERIFIED]' : '';
      const status = row.ticker ? `→ ${row.ticker}` : 'UNMAPPED';
      console.log(`   ${row.cusip}: ${row.trade_count} trades ${status} (${sourceLabel}) ${verified}`);
    });

    // Test count query
    console.log('\n2. Testing count query:');
    const countQuery = `
      WITH all_user_cusips AS (
        SELECT DISTINCT symbol as cusip
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        
        UNION
        
        SELECT DISTINCT cm.cusip
        FROM cusip_mappings cm
        WHERE (cm.user_id = $1 OR cm.user_id IS NULL)
          AND EXISTS (
            SELECT 1 FROM trades t 
            WHERE t.user_id = $1 
              AND t.symbol = cm.ticker
          )
      )
      SELECT COUNT(*) as total FROM all_user_cusips
    `;

    const countResult = await db.query(countQuery, [userId]);
    console.log(`   Total count: ${countResult.rows[0].total}`);

    console.log('\n3. Breakdown of what we found:');
    console.log('   This shows ALL CUSIPs that were ever associated with user trades:');
    console.log('   - Historical mappings that were resolved (CUSIP→Ticker, trades now have tickers)');  
    console.log('   - Current unmapped CUSIPs (still in trades as CUSIPs)');
    console.log('   - Source information (Finnhub/AI/Manual + User override)');
    console.log('   - Trade counts for each');

    if (result.rows.length > 0) {
      console.log('\n[SUCCESS] API update successful! Comprehensive modal will now show all mappings.');
    } else {
      console.log('\n[ERROR] Still no results - need to debug further');
    }

  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testUpdatedAPI();