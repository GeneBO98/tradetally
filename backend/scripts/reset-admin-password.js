const bcrypt = require('bcryptjs');
const { Client } = require('pg');
require('dotenv').config();

async function resetAdminPassword() {
  const newPassword = process.argv[2];

  if (!newPassword) {
    console.error('Usage: node reset-admin-password.js <new-password>');
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error('Password must be at least 8 characters long');
    process.exit(1);
  }

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'trader',
    password: process.env.DB_PASSWORD || 'trader123',
    database: process.env.DB_NAME || 'tradetally'
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Generate bcrypt hash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    console.log('Generated password hash');

    // Update admin user
    const result = await client.query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE role = 'admin' AND email = 'brennon.overton@icloud.com'
       RETURNING id, username, email`,
      [hashedPassword]
    );

    if (result.rowCount > 0) {
      console.log('\n[SUCCESS] Admin password reset successfully!');
      console.log('Updated user:', result.rows[0]);
      console.log('\nYou can now login with:');
      console.log('  Email:', result.rows[0].email);
      console.log('  Username:', result.rows[0].username);
      console.log('  Password: <the password you just set>');
    } else {
      console.error('[ERROR] Admin user not found');
    }
  } catch (error) {
    console.error('[ERROR] Failed to reset password:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

resetAdminPassword();
