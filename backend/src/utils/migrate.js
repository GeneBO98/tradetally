#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

async function ensureMigrationsTable() {
  const tableExistsQuery = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'migrations'
    );
  `;

  const result = await db.query(tableExistsQuery);
  
  if (!result.rows[0].exists) {
    console.log(`${colors.blue}Creating migrations table...${colors.reset}`);
    await db.query(`
      CREATE TABLE migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64) NOT NULL
      );
    `);
    console.log(`${colors.green}[SUCCESS] Migrations table created${colors.reset}`);
  }
}

async function getAppliedMigrations() {
  const result = await db.query('SELECT filename, checksum FROM migrations ORDER BY id');
  return new Map(result.rows.map(row => [row.filename, row.checksum]));
}

async function calculateChecksum(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, '../../migrations');
  
  try {
    const files = await fs.readdir(migrationsDir);
    return files
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure consistent order
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`${colors.yellow}Migrations directory not found. Creating it...${colors.reset}`);
      await fs.mkdir(migrationsDir, { recursive: true });
      return [];
    }
    throw error;
  }
}

async function runMigration(filename, content, checksum) {
  console.log(`${colors.blue}Running migration: ${filename}${colors.reset}`);
  
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Run the migration
    await client.query(content);
    
    // Record the migration
    await client.query(
      'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
      [filename, checksum]
    );
    
    await client.query('COMMIT');
    console.log(`${colors.green}[SUCCESS] Migration ${filename} applied successfully${colors.reset}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrate() {
  try {
    console.log(`${colors.blue}Starting database migration...${colors.reset}\n`);
    
    // Run base schema FIRST (before migrations table to avoid conflicts)
    const schemaPath = path.join(__dirname, 'schema.sql');
    try {
      const schemaContent = await fs.readFile(schemaPath, 'utf8');
      console.log(`${colors.blue}Running base schema initialization...${colors.reset}`);
      await db.query(schemaContent);
      console.log(`${colors.green}[SUCCESS] Base schema initialized${colors.reset}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`${colors.red}[ERROR] Base schema failed:${colors.reset}`, error.message);
        throw error;
      }
    }
    
    // Ensure migrations table exists
    await ensureMigrationsTable();
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();
    
    // Get migration files
    const migrationFiles = await getMigrationFiles();
    
    if (migrationFiles.length === 0) {
      console.log(`${colors.yellow}No migration files found${colors.reset}`);
      return;
    }
    
    let migrationsRun = 0;
    const migrationsDir = path.join(__dirname, '../../migrations');
    
    for (const filename of migrationFiles) {
      const filepath = path.join(migrationsDir, filename);
      const content = await fs.readFile(filepath, 'utf8');
      const checksum = await calculateChecksum(content);
      
      if (appliedMigrations.has(filename)) {
        const appliedChecksum = appliedMigrations.get(filename);
        if (appliedChecksum !== checksum) {
          console.error(`${colors.red}[ERROR] Migration ${filename} has been modified after being applied!${colors.reset}`);
          console.error(`${colors.red}  Expected checksum: ${appliedChecksum}${colors.reset}`);
          console.error(`${colors.red}  Current checksum:  ${checksum}${colors.reset}`);
          throw new Error('Migration checksum mismatch');
        }
        console.log(`${colors.gray}→ Skipping ${filename} (already applied)${colors.reset}`);
      } else {
        await runMigration(filename, content, checksum);
        migrationsRun++;
      }
    }
    
    console.log(`\n${colors.green}[SUCCESS] Migration complete. ${migrationsRun} migration(s) applied.${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.red}[ERROR] Migration failed:${colors.reset}`, error.message);
    if (error.detail) {
      console.error(`${colors.red}  Detail: ${error.detail}${colors.reset}`);
    }
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate };