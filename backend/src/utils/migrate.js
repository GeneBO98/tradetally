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
  } else {
    await db.query(`
      ALTER TABLE migrations
      ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)
    `);

    await db.query(`
      UPDATE migrations
      SET checksum = repeat('0', 64)
      WHERE checksum IS NULL
    `);

    await db.query(`
      ALTER TABLE migrations
      ALTER COLUMN checksum SET NOT NULL
    `);
  }
}

async function syncMigrationsSequence(client = db) {
  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('migrations', 'id'),
      COALESCE((SELECT MAX(id) FROM migrations), 1),
      COALESCE((SELECT MAX(id) IS NOT NULL FROM migrations), false)
    );
  `);
}

async function recordMigration(client, filename, checksum) {
  try {
    await client.query(
      'INSERT INTO migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING',
      [filename, checksum]
    );
  } catch (error) {
    // If the serial sequence drifted behind existing IDs, resync and retry once.
    if (error.code === '23505' && error.constraint === 'migrations_pkey') {
      await syncMigrationsSequence(client);
      await client.query(
        'INSERT INTO migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING',
        [filename, checksum]
      );
      return;
    }
    throw error;
  }
}

async function getAppliedMigrations() {
  const result = await db.query('SELECT filename, checksum FROM migrations ORDER BY id');
  return new Map(result.rows.map(row => [row.filename, row.checksum]));
}

function isLegacyChecksum(checksum) {
  return !checksum || checksum === '0'.repeat(64);
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

    await client.query(content);

    // Record the migration
    await recordMigration(client, filename, checksum);

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

    // Skip base schema for production database imports
    // The production backup already has the complete schema
    const skipBaseSchema = process.env.SKIP_BASE_SCHEMA === 'true';

    if (!skipBaseSchema) {
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
    } else {
      console.log(`${colors.yellow}Skipping base schema (production import mode)${colors.reset}`);
    }
    
    // Ensure migrations table exists
    await ensureMigrationsTable();
    await syncMigrationsSequence();
    
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
        if (isLegacyChecksum(appliedChecksum)) {
          await db.query('UPDATE migrations SET checksum = $1 WHERE filename = $2', [checksum, filename]);
          appliedMigrations.set(filename, checksum);
        } else if (appliedChecksum !== checksum) {
          throw new Error(`Migration checksum mismatch for ${filename}. Refusing to run with edited applied migration.`);
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
    throw error;
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate, runMigration, ensureMigrationsTable, syncMigrationsSequence };
