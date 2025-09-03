#!/usr/bin/env node

const db = require('../src/config/database');

async function checkAllMappings() {
  console.log('🔍 Checking All CUSIP Mappings for Comprehensive View\n');

  try {
    const userId = 'f7ffbef5-7ec4-4972-be3f-439233ef8410'; // boverton@tradetally.io
    
    // 1. Show all existing mappings in the database
    console.log('1. All CUSIP mappings in database:');
    const allMappings = await db.query(`
      SELECT cusip, ticker, resolution_source, confidence_score, user_id, created_at, verified
      FROM cusip_mappings 
      ORDER BY created_at DESC
    `);

    console.log(`   Found ${allMappings.rows.length} total mappings:`);
    allMappings.rows.forEach(mapping => {
      const userType = mapping.user_id ? 'user-specific' : 'global';
      const verified = mapping.verified ? '✓' : '?';
      console.log(`   ${mapping.cusip} → ${mapping.ticker} (${mapping.resolution_source}, ${userType}) ${verified}`);
    });

    // 2. Show what CUSIPs the user had historically (even if converted to tickers)
    console.log('\n2. Historical CUSIPs from user trades (now converted to tickers):');
    
    // We need to look at trade history to see what CUSIPs were converted
    // Since all trades are now ticker symbols, we need to find mappings that were used
    const historicalQuery = `
      SELECT DISTINCT 
        cm.cusip,
        cm.ticker,
        cm.resolution_source,
        cm.confidence_score,
        cm.verified,
        (cm.user_id = $1) as is_user_override,
        COUNT(t.id) as trade_count
      FROM cusip_mappings cm
      LEFT JOIN trades t ON t.symbol = cm.ticker AND t.user_id = $1
      WHERE cm.cusip ~ '^[A-Z0-9]{8}[0-9]$'  -- Valid CUSIP format
      GROUP BY cm.cusip, cm.ticker, cm.resolution_source, cm.confidence_score, cm.verified, cm.user_id
      ORDER BY trade_count DESC, cm.cusip
    `;

    const historicalResult = await db.query(historicalQuery, [userId]);
    console.log(`   Found ${historicalResult.rows.length} historical CUSIPs that were mapped:`);
    historicalResult.rows.forEach(row => {
      const sourceLabel = row.is_user_override ? 
        (row.resolution_source === 'manual' ? 'Manual (User)' : 'AI (User)') :
        (row.resolution_source === 'finnhub' ? 'Finnhub' : row.resolution_source);
      const verified = row.verified ? '✓' : '?';
      console.log(`   ${row.cusip} → ${row.ticker} (${sourceLabel}) ${verified} [${row.trade_count} trades]`);
    });

    // 3. Test the current API query
    console.log('\n3. Testing current API query (what frontend gets):');
    const apiQuery = `
      WITH user_cusips AS (
        -- Get ALL CUSIPs that appeared in user's trades (from mappings)
        SELECT DISTINCT cm.cusip
        FROM cusip_mappings cm
        LEFT JOIN trades t ON t.symbol = cm.ticker AND t.user_id = $1
        WHERE cm.cusip ~ '^[A-Z0-9]{8}[0-9]$'
          AND t.id IS NOT NULL  -- Only CUSIPs that were actually used in trades
      ),
      trade_counts AS (
        SELECT cm.ticker as symbol, COUNT(t.id) as trade_count
        FROM cusip_mappings cm
        INNER JOIN trades t ON t.symbol = cm.ticker AND t.user_id = $1
        WHERE cm.cusip ~ '^[A-Z0-9]{8}[0-9]$'
        GROUP BY cm.ticker
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
        LEFT JOIN trade_counts tc ON tc.symbol = cm.ticker
        WHERE 1=1
        ORDER BY uc.cusip, (cm.user_id = $1) DESC, cm.confidence_score DESC
      )
      SELECT *
      FROM prioritized_mappings
      ORDER BY trade_count DESC, cusip ASC
    `;

    const apiResult = await db.query(apiQuery, [userId]);
    console.log(`   Current API returns ${apiResult.rows.length} CUSIPs:`);
    apiResult.rows.forEach(row => {
      const sourceLabel = row.is_user_override ? 
        (row.resolution_source === 'manual' ? 'Manual (User)' : 'AI (User)') :
        (row.resolution_source === 'finnhub' ? 'Finnhub' : row.resolution_source);
      const verified = row.verified ? '✓' : '?';
      console.log(`   ${row.cusip} → ${row.ticker || 'UNMAPPED'} (${sourceLabel || 'N/A'}) ${verified} [${row.trade_count} trades]`);
    });

    // 4. What we want the comprehensive view to show
    console.log('\n4. What comprehensive view SHOULD show:');
    console.log('   - All CUSIPs that were ever in user trades (even if now converted to tickers)');
    console.log('   - Their current mappings with source (Finnhub/AI/Manual)');
    console.log('   - Whether they are user overrides or global');
    console.log('   - How many trades were affected');
    console.log('   - Verification status');

    if (apiResult.rows.length === 0) {
      console.log('\n❌ API returns 0 results - this is why "Manage All" shows empty!');
      console.log('Need to fix the API query to show historical mappings.');
    }

  } catch (error) {
    console.error('❌ Check failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the check
checkAllMappings();