#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { runMigration: applyMigration, ensureMigrationsTable, syncMigrationsSequence } = require('../src/utils/migrate');

async function runSingleMigration() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('Usage: node run-migration.js <migration-file>');
    console.error('Example: node run-migration.js 018_add_admin_ai_settings.sql');
    process.exit(1);
  }
  
  const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    process.exit(1);
  }
  
  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    
    await ensureMigrationsTable();
    await syncMigrationsSequence();
    await applyMigration(migrationFile, sql, checksum);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runSingleMigration();
