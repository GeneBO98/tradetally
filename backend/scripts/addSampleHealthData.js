const db = require('../src/config/database');

async function addSampleHealthData() {
  try {
    console.log('Adding sample health data to existing trades...\n');
    
    // Get all trades
    const trades = await db.query(`
      SELECT id, trade_date, pnl 
      FROM trades 
      ORDER BY trade_date DESC;
    `);
    
    console.log(`Found ${trades.rows.length} trades to update with health data.\n`);
    
    // Generate realistic health data for each trade
    for (const trade of trades.rows) {
      const tradeDate = new Date(trade.trade_date);
      const isProfitable = parseFloat(trade.pnl) > 0;
      
      // Generate health metrics with some correlation to P&L
      // Profitable trades tend to have better health metrics
      let heartRate, sleepScore, sleepHours, stressLevel;
      
      if (isProfitable) {
        // Better health metrics for profitable trades
        heartRate = 65 + Math.random() * 15; // 65-80 BPM (normal)
        sleepScore = 70 + Math.random() * 30; // 70-100 (good to excellent)
        sleepHours = 6.5 + Math.random() * 2.5; // 6.5-9 hours
        stressLevel = Math.random() * 0.4; // 0-0.4 (low to moderate)
      } else {
        // Worse health metrics for losing trades
        heartRate = 75 + Math.random() * 25; // 75-100 BPM (elevated)
        sleepScore = 40 + Math.random() * 40; // 40-80 (poor to good)
        sleepHours = 4 + Math.random() * 4; // 4-8 hours
        stressLevel = 0.3 + Math.random() * 0.6; // 0.3-0.9 (moderate to high)
      }
      
      // Add some randomness to make it realistic
      if (Math.random() > 0.8) {
        // 20% chance to flip the correlation
        heartRate = 60 + Math.random() * 40;
        sleepScore = 30 + Math.random() * 70;
        sleepHours = 3 + Math.random() * 7;
        stressLevel = Math.random();
      }
      
      // Update the trade with health data
      await db.query(`
        UPDATE trades 
        SET 
          heart_rate = $1,
          sleep_score = $2,
          sleep_hours = $3,
          stress_level = $4
        WHERE id = $5;
      `, [
        heartRate.toFixed(2),
        sleepScore.toFixed(2),
        sleepHours.toFixed(2),
        stressLevel.toFixed(3),
        trade.id
      ]);
      
      console.log(`✓ Updated trade ${trade.id} (${isProfitable ? 'Profit' : 'Loss'}) with health data:
        Heart Rate: ${heartRate.toFixed(1)} BPM
        Sleep Score: ${sleepScore.toFixed(1)}/100
        Sleep Hours: ${sleepHours.toFixed(1)} hours
        Stress Level: ${(stressLevel * 100).toFixed(1)}%
      `);
      
      // Also add to health_data table for historical tracking
      const userId = await db.query('SELECT user_id FROM trades WHERE id = $1', [trade.id]);
      if (userId.rows.length > 0) {
        // Add heart rate data
        await db.query(`
          INSERT INTO health_data (user_id, date, data_type, value, metadata)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, date, data_type) DO UPDATE
          SET value = EXCLUDED.value, metadata = EXCLUDED.metadata, updated_at = NOW();
        `, [
          userId.rows[0].user_id,
          tradeDate.toISOString().split('T')[0],
          'heart_rate',
          heartRate,
          JSON.stringify({ source: 'sample_data', hrv: 40 + Math.random() * 30 })
        ]);
        
        // Add sleep data
        await db.query(`
          INSERT INTO health_data (user_id, date, data_type, value, metadata)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, date, data_type) DO UPDATE
          SET value = EXCLUDED.value, metadata = EXCLUDED.metadata, updated_at = NOW();
        `, [
          userId.rows[0].user_id,
          tradeDate.toISOString().split('T')[0],
          'sleep',
          sleepHours,
          JSON.stringify({ 
            source: 'sample_data', 
            sleepQuality: sleepScore,
            deepSleep: sleepHours * 0.2,
            remSleep: sleepHours * 0.25
          })
        ]);
      }
    }
    
    // Verify the update
    const verifyQuery = await db.query(`
      SELECT 
        COUNT(*) as total_trades,
        COUNT(heart_rate) as with_heart_rate,
        COUNT(sleep_score) as with_sleep_score,
        COUNT(sleep_hours) as with_sleep_hours,
        COUNT(stress_level) as with_stress_level,
        AVG(heart_rate) as avg_heart_rate,
        AVG(sleep_score) as avg_sleep_score,
        AVG(sleep_hours) as avg_sleep_hours,
        AVG(stress_level) as avg_stress_level
      FROM trades;
    `);
    
    console.log('\n✅ Health data successfully added!\n');
    console.log('Updated statistics:');
    const stats = verifyQuery.rows[0];
    console.log(`  Total trades: ${stats.total_trades}`);
    console.log(`  Trades with heart rate: ${stats.with_heart_rate}`);
    console.log(`  Trades with sleep score: ${stats.with_sleep_score}`);
    console.log(`  Trades with sleep hours: ${stats.with_sleep_hours}`);
    console.log(`  Trades with stress level: ${stats.with_stress_level}`);
    console.log(`\nAverages:`);
    console.log(`  Avg Heart Rate: ${parseFloat(stats.avg_heart_rate).toFixed(1)} BPM`);
    console.log(`  Avg Sleep Score: ${parseFloat(stats.avg_sleep_score).toFixed(1)}/100`);
    console.log(`  Avg Sleep Hours: ${parseFloat(stats.avg_sleep_hours).toFixed(1)} hours`);
    console.log(`  Avg Stress Level: ${(parseFloat(stats.avg_stress_level) * 100).toFixed(1)}%`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error adding health data:', error);
    process.exit(1);
  }
}

addSampleHealthData();