const db = require('../src/config/database');

async function checkHealthData() {
  try {
    console.log('Checking health data in database...\n');
    
    // Check if health columns exist in trades table
    const columnsQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'trades' 
      AND column_name IN ('heart_rate', 'sleep_score', 'sleep_hours', 'stress_level')
      ORDER BY column_name;
    `;
    
    const columns = await db.query(columnsQuery);
    console.log('Health columns in trades table:');
    console.table(columns.rows);
    
    // Check how many trades have health data
    const healthDataCount = await db.query(`
      SELECT 
        COUNT(*) as total_trades,
        COUNT(heart_rate) as with_heart_rate,
        COUNT(sleep_score) as with_sleep_score,
        COUNT(sleep_hours) as with_sleep_hours,
        COUNT(stress_level) as with_stress_level
      FROM trades;
    `);
    
    console.log('\nHealth data statistics:');
    console.table(healthDataCount.rows);
    
    // Get sample trades with health data
    const samplesQuery = await db.query(`
      SELECT id, symbol, trade_date, heart_rate, sleep_score, sleep_hours, stress_level
      FROM trades
      WHERE heart_rate IS NOT NULL 
         OR sleep_score IS NOT NULL 
         OR sleep_hours IS NOT NULL 
         OR stress_level IS NOT NULL
      LIMIT 5;
    `);
    
    if (samplesQuery.rows.length > 0) {
      console.log('\nSample trades with health data:');
      console.table(samplesQuery.rows);
    } else {
      console.log('\n❌ No trades with health data found!');
    }
    
    // Check health_data table
    const healthDataTable = await db.query(`
      SELECT COUNT(*) as count FROM health_data;
    `);
    
    console.log('\nHealth_data table records:', healthDataTable.rows[0].count);
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking health data:', error);
    process.exit(1);
  }
}

checkHealthData();