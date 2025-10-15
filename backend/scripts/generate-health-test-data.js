const db = require('../src/config/database');

/**
 * Generate test trades with health data for testing health analytics
 *
 * This script creates:
 * - 20 trades (mix of wins and losses)
 * - Corresponding sleep data
 * - Heart rate time-series data
 * - Realistic correlations (better sleep = better performance)
 */

async function generateHealthTestData() {
  try {
    console.log('Starting health test data generation...');

    // Get user ID (you can change this to your user ID)
    const userResult = await db.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    if (userResult.rows.length === 0) {
      console.error('No admin user found. Please create a user first.');
      process.exit(1);
    }
    const userId = userResult.rows[0].id;
    console.log(`Using user ID: ${userId}`);

    // Clear existing test data
    console.log('Clearing existing test data...');
    await db.query(`DELETE FROM trades WHERE user_id = $1 AND notes LIKE '%[TEST DATA]%'`, [userId]);
    await db.query(`DELETE FROM health_data WHERE user_id = $1`, [userId]);

    // Generate data for the last 30 days
    const today = new Date();
    const testData = [];

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Generate sleep data (realistic correlation: better sleep = better trading)
      const sleepHours = 4 + Math.random() * 5; // 4-9 hours
      let sleepQuality;
      if (sleepHours >= 7 && sleepHours <= 9) {
        sleepQuality = 0.8 + Math.random() * 0.2; // 0.8-1.0 (80-100%)
      } else if (sleepHours >= 6 && sleepHours < 7) {
        sleepQuality = 0.6 + Math.random() * 0.2; // 0.6-0.8 (60-80%)
      } else if (sleepHours >= 5 && sleepHours < 6) {
        sleepQuality = 0.4 + Math.random() * 0.2; // 0.4-0.6 (40-60%)
      } else {
        sleepQuality = 0.2 + Math.random() * 0.2; // 0.2-0.4 (20-40%)
      }

      testData.push({
        date: dateStr,
        sleepHours,
        sleepQuality,
        trades: []
      });
    }

    console.log('Inserting sleep data with detailed metrics...');
    for (const day of testData) {
      // Calculate realistic sleep stage distributions
      const deepSleepPercent = 0.15 + Math.random() * 0.10; // 15-25%
      const remSleepPercent = 0.20 + Math.random() * 0.05; // 20-25%
      const coreSleepPercent = 1 - deepSleepPercent - remSleepPercent; // Rest is core sleep

      const deepSleepHours = day.sleepHours * deepSleepPercent;
      const remSleepHours = day.sleepHours * remSleepPercent;
      const coreSleepHours = day.sleepHours * coreSleepPercent;

      // Calculate sleep efficiency (time asleep / time in bed)
      const inBedTime = day.sleepHours + (Math.random() * 0.5 + 0.2); // Add 0.2-0.7 hours in bed but not asleep
      const sleepEfficiency = day.sleepHours / inBedTime;

      // Awake time during sleep
      const awakeHours = Math.random() * 0.15; // 0-15% awake time

      await db.query(`
        INSERT INTO health_data (user_id, date, data_type, value, metadata)
        VALUES ($1, $2, 'sleep', $3, $4)
        ON CONFLICT (user_id, data_type, date) WHERE timestamp IS NULL
        DO UPDATE SET value = EXCLUDED.value, metadata = EXCLUDED.metadata
      `, [
        userId,
        day.date,
        day.sleepHours,
        JSON.stringify({
          sleepQuality: day.sleepQuality,
          sampleCount: Math.floor(Math.random() * 10) + 5,
          deepSleepHours: deepSleepHours,
          remSleepHours: remSleepHours,
          coreSleepHours: coreSleepHours,
          inBedHours: inBedTime,
          awakeHours: awakeHours,
          sleepEfficiency: sleepEfficiency,
          deepSleepPercent: deepSleepPercent * 100,
          remSleepPercent: remSleepPercent * 100
        })
      ]);
    }

    console.log('Generating trades with realistic patterns...');
    const symbols = ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ'];
    let tradeCount = 0;

    // Generate 2-4 trades per day for the last 20 days
    for (let i = 0; i < 20; i++) {
      const day = testData[i];
      const numTrades = Math.floor(Math.random() * 3) + 2; // 2-4 trades per day

      for (let j = 0; j < numTrades; j++) {
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const side = Math.random() > 0.5 ? 'long' : 'short';

        // Entry time between 9:30 AM and 3:30 PM ET
        const entryHour = 9 + Math.floor(Math.random() * 6);
        const entryMinute = Math.floor(Math.random() * 60);
        const exitMinute = entryMinute + Math.floor(Math.random() * 60) + 5;

        const entryTime = new Date(day.date);
        entryTime.setHours(entryHour, entryMinute, 0, 0);

        const exitTime = new Date(entryTime);
        exitTime.setMinutes(exitMinute);

        // Generate heart rate at entry time (correlated with sleep quality)
        // Well-rested = lower heart rate, poor sleep = higher heart rate
        const baseHeartRate = 60 + (1 - day.sleepQuality) * 40; // 60-100 BPM
        const heartRateVariation = (Math.random() - 0.5) * 20;
        const entryHeartRate = Math.round(baseHeartRate + heartRateVariation);

        // Better sleep + lower heart rate = higher win probability
        const winProbability = day.sleepQuality * 0.4 + (1 - entryHeartRate / 120) * 0.3 + Math.random() * 0.3;
        const isWin = winProbability > 0.5;

        // Generate realistic trade details
        const entryPrice = 100 + Math.random() * 400;
        const quantity = Math.floor(Math.random() * 90) + 10;

        let exitPrice;
        let pnl;
        if (isWin) {
          // Winning trade: 0.5% to 3% gain
          const gainPercent = 0.005 + Math.random() * 0.025;
          exitPrice = side === 'long'
            ? entryPrice * (1 + gainPercent)
            : entryPrice * (1 - gainPercent);
          pnl = Math.abs(exitPrice - entryPrice) * quantity - (quantity * 0.01); // Subtract commission
        } else {
          // Losing trade: 0.3% to 2% loss
          const lossPercent = 0.003 + Math.random() * 0.017;
          exitPrice = side === 'long'
            ? entryPrice * (1 - lossPercent)
            : entryPrice * (1 + lossPercent);
          pnl = -Math.abs(exitPrice - entryPrice) * quantity - (quantity * 0.01);
        }

        if (side === 'short') pnl = -pnl;

        // Insert trade
        const tradeResult = await db.query(`
          INSERT INTO trades (
            user_id, symbol, side, quantity, entry_price, exit_price,
            entry_time, exit_time, trade_date, pnl, commission,
            strategy, notes, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          RETURNING id
        `, [
          userId,
          symbol,
          side,
          quantity,
          entryPrice,
          exitPrice,
          entryTime,
          exitTime,
          day.date,
          pnl,
          quantity * 0.01,
          isWin ? 'Momentum' : 'Breakout',
          `[TEST DATA] Sleep: ${day.sleepHours.toFixed(1)}h (Q: ${(day.sleepQuality * 100).toFixed(0)}%), HR: ${entryHeartRate} BPM`
        ]);

        const tradeId = tradeResult.rows[0].id;
        tradeCount++;

        // Generate heart rate time series around the trade time (±10 minutes)
        for (let min = -10; min <= 10; min++) {
          const hrTime = new Date(entryTime);
          hrTime.setMinutes(hrTime.getMinutes() + min);

          const hrValue = entryHeartRate + (Math.random() - 0.5) * 10;

          await db.query(`
            INSERT INTO health_data (user_id, date, data_type, value, timestamp)
            VALUES ($1, $2, 'heartRate', $3, $4)
            ON CONFLICT (user_id, data_type, timestamp) WHERE timestamp IS NOT NULL
            DO UPDATE SET value = EXCLUDED.value
          `, [
            userId,
            day.date,
            Math.round(hrValue),
            hrTime
          ]);
        }

        day.trades.push({
          id: tradeId,
          symbol,
          pnl,
          heartRate: entryHeartRate,
          isWin
        });
      }
    }

    console.log('\n=== Test Data Summary ===');
    console.log(`Total trades created: ${tradeCount}`);
    console.log(`Days with data: ${testData.filter(d => d.trades.length > 0).length}`);
    console.log(`Sleep data entries: 30`);

    const totalPnL = testData.reduce((sum, day) =>
      sum + day.trades.reduce((daySum, t) => daySum + t.pnl, 0), 0
    );
    const winningTrades = testData.reduce((sum, day) =>
      sum + day.trades.filter(t => t.isWin).length, 0
    );
    const winRate = (winningTrades / tradeCount * 100).toFixed(1);

    console.log(`Total P&L: $${totalPnL.toFixed(2)}`);
    console.log(`Win Rate: ${winRate}%`);
    console.log(`Winning trades: ${winningTrades}`);
    console.log(`Losing trades: ${tradeCount - winningTrades}`);

    // Show correlation insights
    console.log('\n=== Correlation Preview ===');
    const wellRestedDays = testData.filter(d => d.sleepHours >= 7);
    const wellRestedPnL = wellRestedDays.reduce((sum, day) =>
      sum + day.trades.reduce((daySum, t) => daySum + t.pnl, 0), 0
    );
    const wellRestedTradeCount = wellRestedDays.reduce((sum, day) => sum + day.trades.length, 0);

    const poorSleepDays = testData.filter(d => d.sleepHours < 6);
    const poorSleepPnL = poorSleepDays.reduce((sum, day) =>
      sum + day.trades.reduce((daySum, t) => daySum + t.pnl, 0), 0
    );
    const poorSleepTradeCount = poorSleepDays.reduce((sum, day) => sum + day.trades.length, 0);

    if (wellRestedTradeCount > 0) {
      console.log(`Well-rested (7+ hours): Avg P&L = $${(wellRestedPnL / wellRestedTradeCount).toFixed(2)} per trade`);
    }
    if (poorSleepTradeCount > 0) {
      console.log(`Poor sleep (<6 hours): Avg P&L = $${(poorSleepPnL / poorSleepTradeCount).toFixed(2)} per trade`);
    }

    console.log('\n✅ Test data generated successfully!');
    console.log('\n📊 Syncing health data with trades...');

    // Now sync health data with trades
    await syncHealthDataToTrades(userId, testData);

    console.log('\n✅ All done! Health data has been synced to trades.');

    process.exit(0);

  } catch (error) {
    console.error('Error generating test data:', error);
    process.exit(1);
  }
}

// Helper function to sync health data to trades
async function syncHealthDataToTrades(userId, testData) {
  try {
    // Get all trades for this user
    const tradesQuery = `
      SELECT id, trade_date, entry_time
      FROM trades
      WHERE user_id = $1
      AND notes LIKE '%[TEST DATA]%'
      AND entry_time IS NOT NULL
      ORDER BY entry_time
    `;
    const tradesResult = await db.query(tradesQuery, [userId]);
    console.log(`Found ${tradesResult.rows.length} test trades to sync`);

    // Get time-series heart rate data
    const heartRateQuery = `
      SELECT timestamp, value
      FROM health_data
      WHERE user_id = $1
      AND data_type = 'heartRate'
      AND timestamp IS NOT NULL
      ORDER BY timestamp
    `;
    const heartRateResult = await db.query(heartRateQuery, [userId]);
    console.log(`Found ${heartRateResult.rows.length} heart rate samples`);

    // Group sleep data by date
    const sleepByDate = {};
    for (const day of testData) {
      sleepByDate[day.date] = {
        value: day.sleepHours,
        metadata: { sleepQuality: day.sleepQuality }
      };
    }

    // Update trades with health data
    let updatedCount = 0;
    for (const trade of tradesResult.rows) {
      const tradeTime = new Date(trade.entry_time);

      // Find closest heart rate sample within ±2 minutes
      const matchWindow = 2 * 60 * 1000; // 2 minutes in milliseconds
      let closestHR = null;
      let minDiff = Infinity;

      for (const hrSample of heartRateResult.rows) {
        const hrTime = new Date(hrSample.timestamp);
        const timeDiff = Math.abs(tradeTime - hrTime);

        if (timeDiff <= matchWindow && timeDiff < minDiff) {
          minDiff = timeDiff;
          closestHR = hrSample.value;
        }
      }

      // Get sleep data for the trade date
      const tradeDateKey = trade.trade_date.toISOString().split('T')[0];
      const sleep = sleepByDate[tradeDateKey];

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      let heartRateStress = null;
      if (closestHR !== null) {
        updateFields.push(`heart_rate = $${paramIndex++}`);
        updateValues.push(closestHR);

        // Calculate heart rate component of stress
        if (closestHR >= 100) {
          heartRateStress = 0.8;
        } else if (closestHR >= 90) {
          heartRateStress = 0.6;
        } else if (closestHR >= 80) {
          heartRateStress = 0.4;
        } else if (closestHR >= 70) {
          heartRateStress = 0.2;
        } else {
          heartRateStress = 0.1;
        }
      }

      let sleepQualityFactor = null;
      if (sleep) {
        updateFields.push(`sleep_hours = $${paramIndex++}`);
        updateValues.push(sleep.value);

        if (sleep.metadata && sleep.metadata.sleepQuality) {
          updateFields.push(`sleep_score = $${paramIndex++}`);
          updateValues.push(sleep.metadata.sleepQuality * 100);
          sleepQualityFactor = sleep.metadata.sleepQuality;
        }
      }

      // Calculate composite stress level
      if (heartRateStress !== null || sleepQualityFactor !== null) {
        let stressLevel = 0;

        if (heartRateStress !== null && sleepQualityFactor !== null) {
          // Both metrics available: combine them
          const sleepStressMultiplier = 1 + (1 - sleepQualityFactor);
          stressLevel = Math.min(1.0, heartRateStress * sleepStressMultiplier);
        } else if (heartRateStress !== null) {
          // Only heart rate available
          stressLevel = heartRateStress;
        } else if (sleepQualityFactor !== null) {
          // Only sleep quality available
          stressLevel = Math.max(0.1, 1 - sleepQualityFactor);
        }

        updateFields.push(`stress_level = $${paramIndex++}`);
        updateValues.push(stressLevel);
      }

      if (updateFields.length > 0) {
        updateValues.push(trade.id);
        const updateQuery = `
          UPDATE trades
          SET ${updateFields.join(', ')}, updated_at = NOW()
          WHERE id = $${paramIndex++}
          RETURNING id
        `;

        await db.query(updateQuery, updateValues);
        updatedCount++;
      }
    }

    console.log(`✅ Updated ${updatedCount} trades with health data`);
  } catch (error) {
    console.error('Error syncing health data to trades:', error);
    throw error;
  }
}

// Run the script
generateHealthTestData();
