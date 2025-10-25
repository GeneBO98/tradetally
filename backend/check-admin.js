const { Client } = require('pg');
require('dotenv').config();

async function checkAdmin() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'trader',
    password: process.env.DB_PASSWORD || 'trader123',
    database: process.env.DB_NAME || 'tradetally'
  });

  try {
    await client.connect();
    console.log('[INFO] Connected to database');

    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('[ERROR] Users table does not exist! Migrations may not have run.');
      process.exit(1);
    }

    console.log('[CHECK] Users table exists');

    // Check for admin user
    const adminCheck = await client.query(`
      SELECT id, username, email, role, created_at, updated_at
      FROM users
      WHERE role = 'admin' OR email = 'brennon.overton@icloud.com'
      ORDER BY created_at
    `);

    if (adminCheck.rowCount === 0) {
      console.log('[WARNING] No admin user found in database!');
      console.log('[INFO] You may need to create an admin user manually or run initial setup.');
    } else {
      console.log('[INFO] Found admin user(s):');
      adminCheck.rows.forEach(user => {
        console.log(`  - ID: ${user.id}`);
        console.log(`    Username: ${user.username}`);
        console.log(`    Email: ${user.email}`);
        console.log(`    Role: ${user.role}`);
        console.log(`    Created: ${user.created_at}`);
        console.log(`    Updated: ${user.updated_at}`);
        console.log('');
      });
    }

    // Check total users
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    console.log(`[INFO] Total users in database: ${userCount.rows[0].count}`);

    // Check applied migrations
    const migrationCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'migrations'
      );
    `);

    if (migrationCheck.rows[0].exists) {
      const migrations = await client.query('SELECT * FROM migrations ORDER BY id DESC LIMIT 5');
      console.log('\n[INFO] Last 5 applied migrations:');
      migrations.rows.forEach(m => {
        console.log(`  - ${m.name} (applied: ${m.applied_at})`);
      });
    }

  } catch (error) {
    console.error('[ERROR] Database check failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkAdmin();
