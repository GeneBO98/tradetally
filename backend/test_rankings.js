const LeaderboardService = require('./src/services/leaderboardService');

async function testRankings() {
  try {
    console.log('Testing getUserRankings with strategy filter...');
    
    // Get a real user ID first
    const db = require('./src/config/database');
    const usersResult = await db.query('SELECT id FROM users LIMIT 1');
    
    if (usersResult.rows.length === 0) {
      console.log('No users found in database');
      return;
    }
    
    const userId = usersResult.rows[0].id;
    console.log('Using user ID:', userId);
    
    // Test with strategy filter like the frontend is sending
    const filters = { strategy: 'scalper' };
    console.log('Testing with filters:', filters);
    
    const rankings = await LeaderboardService.getUserRankings(userId, filters);
    console.log('Success! Got rankings:', rankings.length);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testRankings();