#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { Pool } = require('pg');
const crypto = require('crypto');

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function main() {
  const baseName = process.env.FRESH_MIGRATION_DB_NAME
    || `tradetally_fresh_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const adminPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_ADMIN_NAME || 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000
  });

  const dbName = baseName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60);
  try {
    await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`);
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);

    const result = spawnSync(process.execPath, ['src/utils/migrate.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DB_NAME: dbName,
        SKIP_BASE_SCHEMA: 'false'
      },
      stdio: 'inherit'
    });
    if (result.status !== 0) {
      throw new Error(`Fresh migration rebuild failed with status ${result.status}`);
    }
    console.log(`[FRESH_MIGRATION] Rebuilt ${dbName} from base schema plus migrations`);
  } finally {
    await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`);
    await adminPool.end();
  }
}

main().catch(error => {
  console.error(`[FRESH_MIGRATION] ${error.message}`);
  process.exit(1);
});
