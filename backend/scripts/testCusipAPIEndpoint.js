#!/usr/bin/env node

const db = require('../src/config/database');

async function testCusipAPIController() {
  console.log('[CHECK] Testing CUSIP API Controller Logic\n');

  try {
    // Get a real user and a global mapping
    const userQuery = await db.query('SELECT id FROM users LIMIT 1');
    const userId = userQuery.rows[0].id;
    
    const globalMappingQuery = await db.query(`
      SELECT * FROM cusip_mappings 
      WHERE user_id IS NULL 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    const globalMapping = globalMappingQuery.rows[0];
    
    console.log('👤 User ID:', userId);
    console.log('[INFO] Testing with CUSIP:', globalMapping.cusip, '→', globalMapping.ticker);

    // Test the controller's createOrUpdateCusipMapping logic
    console.log('\n[INFO] Test: Controller logic for creating user override');
    
    const testTicker = 'TESTAPI' + Math.floor(Math.random() * 100);
    const testCompany = 'Test API Company';
    
    // Simulate the controller's query
    const query = `
      INSERT INTO cusip_mappings (
        cusip, ticker, company_name, resolution_source, user_id, 
        confidence_score, verified, created_by
      )
      VALUES ($1, $2, $3, 'manual', $4, 100, $5, $4)
      ON CONFLICT (cusip, user_id) 
      DO UPDATE SET
        ticker = EXCLUDED.ticker,
        company_name = EXCLUDED.company_name,
        verified = EXCLUDED.verified,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [
      globalMapping.cusip.toUpperCase(),
      testTicker.toUpperCase(),
      testCompany,
      userId,
      true
    ];
    
    const result = await db.query(query, values);
    console.log('[SUCCESS] Controller logic succeeded:', {
      cusip: result.rows[0].cusip,
      ticker: result.rows[0].ticker,
      user_id: result.rows[0].user_id,
      verified: result.rows[0].verified
    });

    // Test the controller's retrieval logic used in getUserCusipMappings
    console.log('\n[INFO] Test: Controller retrieval logic');
    
    const retrievalQuery = `
      WITH all_user_cusips AS (
        SELECT DISTINCT cusip, 'test' as cusip_type
        FROM cusip_mappings 
        WHERE cusip = $1
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
          (cm.user_id = $2) as is_user_override,
          true as used_in_trades,
          0 as trade_count
        FROM all_user_cusips uc
        LEFT JOIN cusip_mappings cm ON uc.cusip = cm.cusip 
          AND (cm.user_id = $2 OR cm.user_id IS NULL)
        ORDER BY uc.cusip, (cm.user_id = $2) DESC, cm.confidence_score DESC
      )
      SELECT * FROM prioritized_mappings
    `;
    
    const retrievalResult = await db.query(retrievalQuery, [globalMapping.cusip, userId]);
    if (retrievalResult.rows.length > 0) {
      const mapping = retrievalResult.rows[0];
      console.log('[SUCCESS] Retrieval logic found:', {
        cusip: mapping.cusip,
        ticker: mapping.ticker,
        isUserOverride: mapping.is_user_override,
        source: mapping.resolution_source
      });
    } else {
      console.log('[ERROR] Retrieval logic found no mappings');
    }

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await db.query('DELETE FROM cusip_mappings WHERE user_id = $1 AND resolution_source = $2', [userId, 'manual']);

  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

testCusipAPIController();