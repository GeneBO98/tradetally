#!/usr/bin/env node

// Script to make a user an admin
// Usage: node scripts/make-admin.js <email>

const db = require('../src/config/database');

async function makeAdmin(email) {
  if (!email) {
    console.error('Usage: node scripts/make-admin.js <email>');
    process.exit(1);
  }

  try {
    const result = await db.query(
      'UPDATE users SET role = $1 WHERE email = $2 RETURNING id, email, username, role',
      ['admin', email]
    );

    if (result.rows.length === 0) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    const user = result.rows[0];
    console.log(`[SUCCESS] Successfully made ${user.username} (${user.email}) an admin`);
    console.log(`User ID: ${user.id}`);
  } catch (error) {
    console.error('Error making user admin:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

const email = process.argv[2];
makeAdmin(email);