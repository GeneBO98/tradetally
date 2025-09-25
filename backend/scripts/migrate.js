#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

async function createMigrationsTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  await db.query(createTableSQL);
}

async function getExecutedMigrations() {
  try {
    const result = await db.query('SELECT filename FROM migrations ORDER BY id');
    return result.rows.map(row => row.filename);
  } catch (error) {
    console.error('Error getting executed migrations:', error);
    return [];
  }
}

async function markMigrationAsExecuted(filename) {
  await db.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
}

async function runMigration(migrationFile) {
  const migrationPath = path.join(__dirname, '..', 'src', 'migrations', migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    return false;
  }
  
  try {
    console.log(`Running migration: ${migrationFile}`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await db.query(sql);
    
    await markMigrationAsExecuted(migrationFile);
    console.log(`[SUCCESS] Migration completed: ${migrationFile}`);
    return true;
  } catch (error) {
    console.error(`[ERROR] Migration failed: ${migrationFile}`, error);
    return false;
  }
}

async function runAllMigrations() {
  try {
    console.log('[PROCESS] Starting database migrations...');
    
    // Create migrations table if it doesn't exist
    await createMigrationsTable();
    
    // Get list of executed migrations
    const executedMigrations = await getExecutedMigrations();
    console.log(`[INFO] Previously executed migrations: ${executedMigrations.length}`);
    
    // Get all migration files
    const migrationsDir = path.join(__dirname, '..', 'src', 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('[INFO] No migrations directory found, skipping migrations');
      return;
    }
    
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure consistent order
    
    console.log(`[INFO] Found ${migrationFiles.length} migration files`);
    
    // Run pending migrations
    let pendingMigrations = migrationFiles.filter(file => !executedMigrations.includes(file));
    
    if (pendingMigrations.length === 0) {
      console.log('[SUCCESS] No pending migrations, database is up to date');
      return;
    }
    
    console.log(`[START] Running ${pendingMigrations.length} pending migrations...`);
    
    for (const migrationFile of pendingMigrations) {
      const success = await runMigration(migrationFile);
      if (!success) {
        console.error('[ERROR] Migration failed, stopping migration process');
        process.exit(1);
      }
    }
    
    console.log('[SUCCESS] All migrations completed successfully!');
    
  } catch (error) {
    console.error('[ERROR] Migration process failed:', error);
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runAllMigrations().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Migration process failed:', error);
    process.exit(1);
  });
}

module.exports = { runAllMigrations };