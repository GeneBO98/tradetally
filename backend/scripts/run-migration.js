#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

async function runMigration() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('Usage: node run-migration.js <migration-file>');
    console.error('Example: node run-migration.js 018_add_admin_ai_settings.sql');
    process.exit(1);
  }
  
  const migrationPath = path.join(__dirname, '..', 'src', 'migrations', migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    process.exit(1);
  }
  
  try {
    console.log(`Running migration: ${migrationFile}`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await db.query(sql);
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();