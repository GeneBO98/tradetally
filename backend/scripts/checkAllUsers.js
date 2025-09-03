#!/usr/bin/env node

const db = require('../src/config/database');

async function checkAllUsers() {
  console.log('👥 Checking All Users and Their CUSIPs\n');

  try {
    // Get all users
    const usersResult = await db.query('SELECT id, email, username FROM users ORDER BY created_at DESC');
    console.log(`Found ${usersResult.rows.length} users:`);

    for (const user of usersResult.rows) {
      console.log(`\n👤 User: ${user.email} (${user.username}) - ID: ${user.id}`);
      
      // Check CUSIP count for this user
      const cusipQuery = `
        SELECT 
          COUNT(DISTINCT symbol) as cusip_count,
          COUNT(*) as total_trades
        FROM trades 
        WHERE user_id = $1 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
      `;
      const cusipResult = await db.query(cusipQuery, [user.id]);
      
      if (cusipResult.rows[0].cusip_count > 0) {
        console.log(`   📊 CUSIPs: ${cusipResult.rows[0].cusip_count}, Trades: ${cusipResult.rows[0].total_trades}`);
        
        // Show sample CUSIPs
        const sampleQuery = `
          SELECT symbol, COUNT(*) as count
          FROM trades 
          WHERE user_id = $1 
            AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
          GROUP BY symbol
          ORDER BY count DESC
          LIMIT 3
        `;
        const sampleResult = await db.query(sampleQuery, [user.id]);
        console.log('   Sample CUSIPs:');
        sampleResult.rows.forEach(row => {
          console.log(`     ${row.symbol}: ${row.count} trades`);
        });
      } else {
        console.log('   📊 No CUSIPs found');
      }
    }

    // Check recent trades to see which user is active
    console.log('\n📈 Recent trades with CUSIPs:');
    const recentQuery = `
      SELECT t.user_id, u.email, t.symbol, t.trade_date
      FROM trades t
      JOIN users u ON u.id = t.user_id
      WHERE t.symbol ~ '^[A-Z0-9]{8}[0-9]$'
      ORDER BY t.trade_date DESC
      LIMIT 10
    `;
    const recentResult = await db.query(recentQuery);
    recentResult.rows.forEach(row => {
      console.log(`   ${row.trade_date.toISOString().split('T')[0]}: ${row.symbol} (${row.email})`);
    });

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  } finally {
    await db.pool.end();
  }
}

// Run the check
checkAllUsers();