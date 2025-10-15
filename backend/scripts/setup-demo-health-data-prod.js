const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'trader',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'tradetally',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function setupDemoHealthData() {
  try {
    console.log('[START] Setting up health data for demo@example.com...');

    // Get demo user
    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = 'demo@example.com'"
    );

    if (userResult.rows.length === 0) {
      console.log('[ERROR] Demo user not found');
      process.exit(1);
    }

    const userId = userResult.rows[0].id;
    console.log('[SUCCESS] Found demo user:', userId);

    // Generate health data for the past 90 days
    const today = new Date();
    const heartRateData = [];
    const sleepData = [];

    for (let i = 89; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Generate realistic health metrics
      const sleepQuality = 0.6 + Math.random() * 0.3; // 0.6-0.9
      const sleepHours = 6 + Math.random() * 2.5; // 6-8.5 hours
      const avgHeartRate = 65 + Math.random() * 15; // 65-80 bpm

      // Heart rate data points (3-5 per day)
      const numHeartRatePoints = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < numHeartRatePoints; j++) {
        const hour = 8 + Math.floor(Math.random() * 12); // 8am - 8pm
        const minute = Math.floor(Math.random() * 60);
        const timestamp = new Date(date);
        timestamp.setHours(hour, minute, 0, 0);

        const variance = -10 + Math.random() * 20;
        const heartRate = Math.round(avgHeartRate + variance);

        heartRateData.push({
          date: dateStr,
          timestamp: timestamp.toISOString(),
          value: heartRate
        });
      }

      // Sleep data (1 per day)
      const bedtime = new Date(date);
      bedtime.setHours(22 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);

      const wakeTime = new Date(date);
      wakeTime.setDate(wakeTime.getDate() + 1);
      wakeTime.setHours(6 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);

      sleepData.push({
        date: dateStr,
        startTime: bedtime.toISOString(),
        endTime: wakeTime.toISOString(),
        value: sleepHours,
        metadata: {
          sleepQuality: sleepQuality,
          deepSleep: sleepHours * (0.2 + Math.random() * 0.1),
          remSleep: sleepHours * (0.2 + Math.random() * 0.1),
          lightSleep: sleepHours * (0.4 + Math.random() * 0.2)
        }
      });
    }

    console.log(`[PROCESS] Generated ${sleepData.length} days of health data`);

    // Insert heart rate data
    let hrInserted = 0;
    for (const hr of heartRateData) {
      try {
        await pool.query(`
          INSERT INTO health_data (user_id, data_type, date, timestamp, value, created_at)
          VALUES ($1, 'heart_rate', $2, $3, $4, NOW())
        `, [userId, hr.date, hr.timestamp, hr.value]);
        hrInserted++;
      } catch (err) {
        // Skip duplicates
        if (err.code !== '23505') throw err;
      }
    }
    console.log(`[SUCCESS] Inserted ${hrInserted} heart rate data points`);

    // Insert sleep data
    let sleepInserted = 0;
    for (const sleep of sleepData) {
      try {
        await pool.query(`
          INSERT INTO health_data (user_id, data_type, date, timestamp, value, metadata, created_at)
          VALUES ($1, 'sleep', $2, $3, $4, $5, NOW())
        `, [userId, sleep.date, sleep.startTime, sleep.value, JSON.stringify(sleep.metadata)]);
        sleepInserted++;
      } catch (err) {
        // Skip duplicates
        if (err.code !== '23505') throw err;
      }
    }
    console.log(`[SUCCESS] Inserted ${sleepInserted} sleep data points`);

    // Now add health data to some existing trades
    const tradesResult = await pool.query(`
      SELECT id, entry_time, exit_time
      FROM trades
      WHERE user_id = $1
      ORDER BY entry_time DESC
      LIMIT 30
    `, [userId]);

    console.log(`[PROCESS] Adding health data to ${tradesResult.rows.length} trades`);

    let tradesUpdated = 0;
    for (const trade of tradesResult.rows) {
      const tradeDate = new Date(trade.entry_time).toISOString().split('T')[0];

      // Find matching sleep data for this date
      const sleepMatch = sleepData.find(s => s.date === tradeDate);
      if (sleepMatch) {
        const sleepQuality = sleepMatch.metadata.sleepQuality;
        const sleepHours = sleepMatch.value;

        // Find heart rate data for this date
        const dayHeartRates = heartRateData.filter(hr => hr.date === tradeDate);
        if (dayHeartRates.length > 0) {
          const avgHeartRate = dayHeartRates.reduce((sum, hr) => sum + hr.value, 0) / dayHeartRates.length;

          // Calculate stress
          let heartRateStress = 0.1;
          if (avgHeartRate >= 100) heartRateStress = 0.8;
          else if (avgHeartRate >= 90) heartRateStress = 0.6;
          else if (avgHeartRate >= 80) heartRateStress = 0.4;
          else if (avgHeartRate >= 70) heartRateStress = 0.2;

          const sleepStressMultiplier = 1 + (1 - sleepQuality);
          const stressLevel = Math.min(1.0, heartRateStress * sleepStressMultiplier);
          const sleepScore = sleepQuality * 100;

          await pool.query(`
            UPDATE trades
            SET
              heart_rate = $1,
              sleep_score = $2,
              sleep_hours = $3,
              stress_level = $4
            WHERE id = $5
          `, [
            avgHeartRate,
            sleepScore,
            sleepHours,
            stressLevel,
            trade.id
          ]);
          tradesUpdated++;
        }
      }
    }

    console.log(`[SUCCESS] Updated ${tradesUpdated} trades with health data`);
    console.log('[SUCCESS] Demo health data setup complete!');
    console.log('');
    console.log('Summary:');
    console.log(`  - ${heartRateData.length} heart rate measurements`);
    console.log(`  - ${sleepData.length} sleep records`);
    console.log(`  - ${tradesResult.rows.length} trades updated with health metrics`);

    await pool.end();
  } catch (error) {
    console.error('[ERROR]', error);
    process.exit(1);
  }
}

setupDemoHealthData();
