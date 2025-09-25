const db = require('../src/config/database');
const jobQueue = require('../src/utils/jobQueue');

async function testCascadeDelete() {
  try {
    console.log('[CHECK] Testing cascade delete functionality...');
    
    // Get a real user ID
    const userResult = await db.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      throw new Error('No users found in database');
    }
    const userId = userResult.rows[0].id;
    console.log('Using user ID:', userId);
    
    // Create a test trade
    const testTradeResult = await db.query(`
      INSERT INTO trades (user_id, symbol, side, quantity, entry_price, entry_time, trade_date, pnl, enrichment_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      userId, 'TEST', 'long', 100, 10.00, new Date(), 
      new Date().toISOString().split('T')[0], 0, 'pending'
    ]);
    
    const testTradeId = testTradeResult.rows[0].id;
    console.log('[SUCCESS] Created test trade:', testTradeId);
    
    // Create a job for this trade  
    const jobId = await jobQueue.addJob('strategy_classification', {
      tradeId: testTradeId
    }, 3, userId);
    
    console.log('[SUCCESS] Created test job:', jobId);
    
    // Verify job exists
    const jobCheck = await db.query('SELECT * FROM job_queue WHERE id = $1', [jobId]);
    console.log('[SUCCESS] Job exists:', jobCheck.rows.length === 1);
    
    // Delete the trade
    console.log('🗑️ Deleting test trade...');
    const Trade = require('../src/models/Trade');
    const deleteResult = await Trade.delete(testTradeId, userId);
    console.log('[SUCCESS] Trade deleted:', deleteResult !== null);
    
    // Check if job was also deleted
    const jobCheckAfter = await db.query('SELECT * FROM job_queue WHERE id = $1', [jobId]);
    const jobDeleted = jobCheckAfter.rows.length === 0;
    console.log('[SUCCESS] Job automatically deleted:', jobDeleted);
    
    if (jobDeleted) {
      console.log('[SUCCESS] CASCADE DELETE TEST PASSED!');
      console.log('[SUCCESS] Jobs are now automatically deleted when trades are deleted');
    } else {
      console.log('[ERROR] CASCADE DELETE TEST FAILED - job still exists');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testCascadeDelete();