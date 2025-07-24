const db = require('./src/config/database');
(async () => {
  try {
    console.log('Testing the exact filter query...');
    
    // Simulate exactly what getFilteredRankings should generate
    const strategy = 'scalper';
    let whereConditions = [];
    let havingConditions = [];
    let queryParams = [];
    let paramIndex = 1;
    
    // Strategy filter goes in WHERE clause (before grouping)
    if (strategy && strategy !== 'all') {
      whereConditions.push(`t.strategy = $${paramIndex}`);
      queryParams.push(strategy);
      paramIndex++;
    }
    
    console.log('whereConditions:', whereConditions);
    console.log('queryParams:', queryParams);
    console.log('paramIndex:', paramIndex);
    
    // Build the WHERE clause
    let whereClause = `t.user_id IN (
      SELECT DISTINCT user_id 
      FROM leaderboard_entries 
      WHERE DATE(recorded_at) = CURRENT_DATE
    )`;
    
    if (whereConditions.length > 0) {
      whereClause += ` AND ${whereConditions.join(' AND ')}`;
    }
    
    // Build the HAVING clause
    let havingClause = 'COUNT(*) >= 1';
    
    const userFilterQuery = `
      SELECT DISTINCT t.user_id
      FROM trades t
      WHERE ${whereClause}
      GROUP BY t.user_id
      HAVING ${havingClause}
    `;
    
    console.log('\nGenerated query:');
    console.log(userFilterQuery);
    console.log('\nParams:', queryParams);
    
    const result = await db.query(userFilterQuery, queryParams);
    console.log('\nSuccess! Found', result.rows.length, 'users with scalper strategy');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
})();