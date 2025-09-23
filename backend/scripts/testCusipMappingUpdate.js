#!/usr/bin/env node

const db = require('../src/config/database');

async function testCusipMappingUpdate() {
  console.log('[CHECK] Testing CUSIP mapping manual update\n');

  try {
    // Get a real user ID
    const userQuery = await db.query('SELECT id FROM users LIMIT 1');
    if (userQuery.rows.length === 0) {
      console.log('[ERROR] No users found in database');
      return;
    }
    const userId = userQuery.rows[0].id;
    console.log('👤 Using user ID:', userId);

    // Get an existing global CUSIP mapping
    const globalMappingQuery = await db.query(`
      SELECT * FROM cusip_mappings 
      WHERE user_id IS NULL 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (globalMappingQuery.rows.length === 0) {
      console.log('[ERROR] No global CUSIP mappings found');
      return;
    }
    
    const globalMapping = globalMappingQuery.rows[0];
    console.log('[INFO] Found global mapping:', {
      cusip: globalMapping.cusip,
      ticker: globalMapping.ticker,
      source: globalMapping.resolution_source
    });

    // Test 1: Create a user-specific override (this should work)
    console.log('\n[INFO] Test 1: Creating user-specific override');
    
    const newTicker = 'TEST' + Math.floor(Math.random() * 1000);
    
    const insertQuery = `
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
      globalMapping.cusip,
      newTicker,
      'Test Company Override',
      userId,
      true
    ];
    
    try {
      const result = await db.query(insertQuery, values);
      console.log('[SUCCESS] Successfully created user override:', {
        cusip: result.rows[0].cusip,
        ticker: result.rows[0].ticker,
        isUserOverride: !!result.rows[0].user_id
      });
    } catch (error) {
      console.log('[ERROR] Failed to create user override:', error.message);
    }

    // Test 2: Try to update the override
    console.log('\n[INFO] Test 2: Updating existing user override');
    
    const updatedTicker = 'UPDATED' + Math.floor(Math.random() * 100);
    
    try {
      const updateResult = await db.query(insertQuery, [
        globalMapping.cusip,
        updatedTicker,
        'Updated Test Company',
        userId,
        true
      ]);
      console.log('[SUCCESS] Successfully updated user override:', {
        cusip: updateResult.rows[0].cusip,
        ticker: updateResult.rows[0].ticker,
        updated_at: updateResult.rows[0].updated_at
      });
    } catch (error) {
      console.log('[ERROR] Failed to update user override:', error.message);
    }

    // Test 3: Verify we can retrieve the mapping correctly
    console.log('\n[INFO] Test 3: Retrieving mapping (should prioritize user override)');
    
    const retrieveQuery = `
      SELECT DISTINCT ON (cusip)
        cusip, ticker, resolution_source, user_id,
        (user_id = $2) as is_user_override
      FROM cusip_mappings 
      WHERE cusip = $1 AND (user_id = $2 OR user_id IS NULL)
      ORDER BY cusip, (user_id = $2) DESC, confidence_score DESC
    `;
    
    const retrieveResult = await db.query(retrieveQuery, [globalMapping.cusip, userId]);
    if (retrieveResult.rows.length > 0) {
      const mapping = retrieveResult.rows[0];
      console.log('[SUCCESS] Retrieved mapping:', {
        cusip: mapping.cusip,
        ticker: mapping.ticker,
        isUserOverride: mapping.is_user_override,
        source: mapping.resolution_source
      });
    } else {
      console.log('[ERROR] No mapping found');
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await db.query('DELETE FROM cusip_mappings WHERE user_id = $1 AND resolution_source = $2', [userId, 'manual']);
    console.log('[SUCCESS] Cleanup completed');

  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
  }
}

// Run the test
testCusipMappingUpdate();