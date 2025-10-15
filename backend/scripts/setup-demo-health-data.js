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
    const healthData = [];
    const heartRateData = [];
    const sleepData = [];

    for (let i = 89; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Generate realistic health metrics
      const baseStress = 0.3 + Math.random() * 0.3; // 0.3-0.6
      const sleepQuality = 0.6 + Math.random() * 0.3; // 0.6-0.9
      const sleepHours = 6 + Math.random() * 2.5; // 6-8.5 hours
      const avgHeartRate = 65 + Math.random() * 15; // 65-80 bpm
      const energy = 0.6 + Math.random() * 0.3; // 0.6-0.9

      // Calculate stress based on heart rate and sleep
      let heartRateStress = 0.1;
      if (avgHeartRate >= 100) heartRateStress = 0.8;
      else if (avgHeartRate >= 90) heartRateStress = 0.6;
      else if (avgHeartRate >= 80) heartRateStress = 0.4;
      else if (avgHeartRate >= 70) heartRateStress = 0.2;

      const sleepStressMultiplier = 1 + (1 - sleepQuality);
      const stressLevel = Math.min(1.0, heartRateStress * sleepStressMultiplier);

      healthData.push({
        date: dateStr,
        stress: stressLevel,
        sleepHours: sleepHours,
        sleepScore: Math.round(sleepQuality * 100),
        energy: energy
      });

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

    console.log(`[PROCESS] Generated ${healthData.length} days of health data`);

    // Insert health analytics data
    for (const data of healthData) {
      await pool.query(`
        INSERT INTO health_analytics (user_id, date, stress_level, sleep_hours, sleep_score, energy_level, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (user_id, date) DO UPDATE SET
          stress_level = EXCLUDED.stress_level,
          sleep_hours = EXCLUDED.sleep_hours,
          sleep_score = EXCLUDED.sleep_score,
          energy_level = EXCLUDED.energy_level,
          updated_at = NOW()
      `, [userId, data.date, data.stress, data.sleepHours, data.sleepScore, data.energy]);
    }
    console.log('[SUCCESS] Inserted health analytics data');

    // Insert heart rate data
    for (const hr of heartRateData) {
      await pool.query(`
        INSERT INTO health_data (user_id, metric_type, timestamp, value, created_at)
        VALUES ($1, 'heart_rate', $2, $3, NOW())
        ON CONFLICT (user_id, metric_type, timestamp) DO NOTHING
      `, [userId, hr.timestamp, hr.value]);
    }
    console.log(`[SUCCESS] Inserted ${heartRateData.length} heart rate data points`);

    // Insert sleep data
    for (const sleep of sleepData) {
      await pool.query(`
        INSERT INTO health_data (user_id, metric_type, timestamp, value, metadata, created_at)
        VALUES ($1, 'sleep', $2, $3, $4, NOW())
        ON CONFLICT (user_id, metric_type, timestamp) DO UPDATE SET
          value = EXCLUDED.value,
          metadata = EXCLUDED.metadata
      `, [userId, sleep.startTime, sleep.value, JSON.stringify(sleep.metadata)]);
    }
    console.log(`[SUCCESS] Inserted ${sleepData.length} sleep data points`);

    // Now add health data to some existing trades
    const tradesResult = await pool.query(`
      SELECT id, entry_time, exit_time
      FROM trades
      WHERE user_id = $1
      ORDER BY entry_time DESC
      LIMIT 30
    `, [userId]);

    console.log(`[PROCESS] Adding health data to ${tradesResult.rows.length} trades`);

    for (const trade of tradesResult.rows) {
      const tradeDate = new Date(trade.entry_time).toISOString().split('T')[0];

      // Find matching health data
      const healthMatch = healthData.find(h => h.date === tradeDate);
      if (healthMatch) {
        await pool.query(`
          UPDATE trades
          SET
            stress_level = $1,
            sleep_quality = $2,
            energy_level = $3
          WHERE id = $4
        `, [
          healthMatch.stress,
          healthMatch.sleepScore / 100,
          healthMatch.energy,
          trade.id
        ]);
      }
    }

    console.log('[SUCCESS] Updated trades with health data');
    console.log('[SUCCESS] Demo health data setup complete!');
    console.log('');
    console.log('Summary:');
    console.log(`  - ${healthData.length} days of health analytics`);
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
