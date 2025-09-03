#!/usr/bin/env node

const db = require('../src/config/database');

async function debugCusipRetrieval() {
  console.log('🔍 Debugging CUSIP Retrieval Logic\n');

  try {
    // Get test data
    const userQuery = await db.query('SELECT id FROM users LIMIT 1');
    const userId = userQuery.rows[0].id;
    
    const cusip = '107930109'; // MSFT cusip we know exists
    
    console.log('👤 User ID:', userId);
    console.log('📋 Testing CUSIP:', cusip);

    // Create a user override first
    await db.query(`
      INSERT INTO cusip_mappings (cusip, ticker, resolution_source, user_id, confidence_score, verified, created_by)
      VALUES ($1, 'USERTEST', 'manual', $2, 100, true, $2)
      ON CONFLICT (cusip, user_id) 
      DO UPDATE SET ticker = EXCLUDED.ticker, updated_at = CURRENT_TIMESTAMP
    `, [cusip, userId]);
    
    console.log('✅ Created user override: USERTEST');

    // Debug: Show all mappings for this CUSIP
    console.log('\n🔍 All mappings for this CUSIP:');
    const allMappings = await db.query(`
      SELECT cusip, ticker, resolution_source, user_id, 
             (user_id = $1) as is_user_override,
             confidence_score
      FROM cusip_mappings 
      WHERE cusip = $2
      ORDER BY (user_id = $1) DESC, confidence_score DESC
    `, [userId, cusip]);
    
    console.table(allMappings.rows);

    // Debug: Test the DISTINCT ON query step by step
    console.log('\n🔍 Testing DISTINCT ON behavior:');
    const distinctQuery = `
      SELECT DISTINCT ON (cusip)
        cusip, ticker, resolution_source, user_id,
        (user_id = $1) as is_user_override,
        confidence_score
      FROM cusip_mappings 
      WHERE cusip = $2 AND (user_id = $1 OR user_id IS NULL)
      ORDER BY cusip, (user_id = $1) DESC, confidence_score DESC
    `;
    
    const distinctResult = await db.query(distinctQuery, [userId, cusip]);
    console.table(distinctResult.rows);

    // Debug: Test with explicit TRUE/FALSE comparison
    console.log('\n🔍 Testing with explicit boolean comparison:');
    const explicitQuery = `
      SELECT DISTINCT ON (cusip)
        cusip, ticker, resolution_source, user_id,
        (user_id = $1) as is_user_override,
        CASE WHEN user_id = $1 THEN 1 ELSE 0 END as priority
      FROM cusip_mappings 
      WHERE cusip = $2 AND (user_id = $1 OR user_id IS NULL)
      ORDER BY cusip, 
               CASE WHEN user_id = $1 THEN 1 ELSE 0 END DESC, 
               confidence_score DESC
    `;
    
    const explicitResult = await db.query(explicitQuery, [userId, cusip]);
    console.table(explicitResult.rows);

    // Test the get_cusip_mapping function if it exists
    console.log('\n🔍 Testing get_cusip_mapping function:');
    try {
      const functionResult = await db.query('SELECT * FROM get_cusip_mapping($1, $2)', [cusip, userId]);
      console.table(functionResult.rows);
    } catch (error) {
      console.log('❌ get_cusip_mapping function not available:', error.message);
    }

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await db.query('DELETE FROM cusip_mappings WHERE user_id = $1 AND ticker = $2', [userId, 'USERTEST']);

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

debugCusipRetrieval();