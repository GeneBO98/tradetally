const db = require('../src/config/database');

async function monitorHealthData() {
  console.log('\n📊 HEALTH DATA MONITORING DASHBOARD');
  console.log('='.repeat(60));
  
  try {
    // 1. Check health_data table for recent entries
    const recentHealthData = await db.query(`
      SELECT 
        hd.*,
        u.email as user_email
      FROM health_data hd
      LEFT JOIN users u ON hd.user_id = u.id
      ORDER BY hd.created_at DESC
      LIMIT 10;
    `);
    
    console.log('\n📱 Recent Health Data Submissions (from mobile app):');
    if (recentHealthData.rows.length === 0) {
      console.log('  ❌ No health data submissions found in health_data table');
      console.log('  → Mobile app may not be sending data to /api/health/data endpoint');
    } else {
      console.table(recentHealthData.rows.map(row => ({
        Date: new Date(row.date).toLocaleDateString(),
        Type: row.data_type,
        Value: row.value,
        User: row.user_email,
        Created: new Date(row.created_at).toLocaleString()
      })));
    }
    
    // 2. Check trades with health data
    const tradesWithHealth = await db.query(`
      SELECT 
        COUNT(*) as total_trades,
        COUNT(heart_rate) as with_heart_rate,
        COUNT(sleep_score) as with_sleep_score,
        COUNT(sleep_hours) as with_sleep_hours,
        COUNT(stress_level) as with_stress_level,
        MIN(updated_at) as oldest_update,
        MAX(updated_at) as newest_update
      FROM trades;
    `);
    
    const stats = tradesWithHealth.rows[0];
    console.log('\n📈 Trade Health Data Statistics:');
    console.log(`  Total Trades: ${stats.total_trades}`);
    console.log(`  With Heart Rate: ${stats.with_heart_rate} (${(stats.with_heart_rate/stats.total_trades*100).toFixed(1)}%)`);
    console.log(`  With Sleep Score: ${stats.with_sleep_score} (${(stats.with_sleep_score/stats.total_trades*100).toFixed(1)}%)`);
    console.log(`  With Sleep Hours: ${stats.with_sleep_hours} (${(stats.with_sleep_hours/stats.total_trades*100).toFixed(1)}%)`);
    console.log(`  With Stress Level: ${stats.with_stress_level} (${(stats.with_stress_level/stats.total_trades*100).toFixed(1)}%)`);
    
    // 3. Check recent trade updates with health data
    const recentTradeUpdates = await db.query(`
      SELECT 
        id,
        symbol,
        trade_date,
        heart_rate,
        sleep_score,
        sleep_hours,
        stress_level,
        updated_at
      FROM trades
      WHERE (heart_rate IS NOT NULL 
         OR sleep_score IS NOT NULL 
         OR sleep_hours IS NOT NULL 
         OR stress_level IS NOT NULL)
      ORDER BY updated_at DESC
      LIMIT 5;
    `);
    
    console.log('\n🔄 Most Recently Updated Trades with Health Data:');
    if (recentTradeUpdates.rows.length > 0) {
      console.table(recentTradeUpdates.rows.map(row => ({
        Symbol: row.symbol,
        Date: new Date(row.trade_date).toLocaleDateString(),
        'Heart Rate': row.heart_rate ? `${parseFloat(row.heart_rate).toFixed(1)} BPM` : '-',
        'Sleep Score': row.sleep_score ? `${parseFloat(row.sleep_score).toFixed(1)}/100` : '-',
        'Sleep Hours': row.sleep_hours ? `${parseFloat(row.sleep_hours).toFixed(1)}h` : '-',
        'Stress': row.stress_level ? `${(parseFloat(row.stress_level)*100).toFixed(0)}%` : '-',
        'Last Updated': new Date(row.updated_at).toLocaleString()
      })));
    }
    
    // 4. Check for today's health data
    const today = new Date().toISOString().split('T')[0];
    const todayData = await db.query(`
      SELECT * FROM health_data 
      WHERE date = $1
      ORDER BY created_at DESC;
    `, [today]);
    
    console.log(`\n📅 Today's Health Data (${today}):`);
    if (todayData.rows.length === 0) {
      console.log('  ⚠️  No health data for today');
      console.log('  → Mobile app should send data when you open it');
    } else {
      console.log(`  ✅ Found ${todayData.rows.length} health data entries for today`);
    }
    
    // 5. API Endpoint Status
    console.log('\n🔌 API Endpoints Status:');
    console.log('  POST /api/health/data - Submit health data from mobile');
    console.log('  GET  /api/health/data - Retrieve health data');
    console.log('  POST /api/health/analyze - Analyze correlations');
    console.log('  GET  /api/health/insights - Get health insights');
    
    // 6. Troubleshooting Tips
    console.log('\n💡 Troubleshooting Tips:');
    console.log('  1. Ensure mobile app has permissions to access HealthKit/Google Fit');
    console.log('  2. Check mobile app is authenticated (valid JWT token)');
    console.log('  3. Mobile app should POST to: http://your-server:3000/api/health/data');
    console.log('  4. Expected payload format:');
    console.log(`     {
       "healthData": [
         {
           "date": "2025-09-14",
           "type": "heart_rate",
           "value": 72,
           "metadata": { "source": "apple_health" }
         },
         {
           "date": "2025-09-14", 
           "type": "sleep",
           "value": 7.5,
           "metadata": { "sleepQuality": 85 }
         }
       ]
     }`);
    
    // 7. Check logs for errors
    console.log('\n📝 To monitor incoming requests in real-time:');
    console.log('  Watch server logs: tail -f backend/src/logs/*.log');
    console.log('  Or check console output for "[INFO] Receiving X health data points"');
    
    console.log('\n' + '='.repeat(60));
    console.log('✨ Monitoring complete. Re-run this script after mobile app sync.');
    
  } catch (error) {
    console.error('\n❌ Error during monitoring:', error.message);
  } finally {
    process.exit(0);
  }
}

// Add timestamp
console.log(`\n🕐 Timestamp: ${new Date().toLocaleString()}`);
monitorHealthData();