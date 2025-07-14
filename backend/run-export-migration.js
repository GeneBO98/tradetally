#!/usr/bin/env node

/**
 * Manual migration runner for data export functionality
 * This script specifically runs the 012_add_missing_export_fields.sql migration
 * Use this if you need to manually ensure export/import functionality works
 */

const fs = require('fs').promises;
const path = require('path');
const db = require('./src/config/database');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

async function runExportMigration() {
  try {
    console.log(`${colors.blue}🚀 Running data export migration...${colors.reset}\n`);
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '012_add_missing_export_fields.sql');
    const migrationContent = await fs.readFile(migrationPath, 'utf8');
    
    console.log(`${colors.blue}📄 Found migration: 012_add_missing_export_fields.sql${colors.reset}`);
    
    // Run the migration
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      console.log(`${colors.blue}🔄 Executing migration...${colors.reset}`);
      await client.query(migrationContent);
      
      await client.query('COMMIT');
      console.log(`${colors.green}✅ Migration completed successfully!${colors.reset}`);
      
      // Test the export functionality
      console.log(`${colors.blue}🧪 Testing export functionality...${colors.reset}`);
      
      // Check if required tables exist
      const tableChecks = [
        'users',
        'user_settings', 
        'trades',
        'tags',
        'equity_history'
      ];
      
      for (const table of tableChecks) {
        const result = await client.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [table]
        );
        
        if (result.rows[0].exists) {
          console.log(`${colors.green}  ✓ Table '${table}' exists${colors.reset}`);
        } else {
          console.log(`${colors.yellow}  ⚠ Table '${table}' not found${colors.reset}`);
        }
      }
      
      // Check if required columns exist in user_settings
      const columnChecks = [
        'account_equity',
        'trading_strategies',
        'trading_styles',
        'risk_tolerance',
        'primary_markets',
        'experience_level',
        'average_position_size',
        'trading_goals',
        'preferred_sectors'
      ];
      
      const columnResult = await client.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND table_name = 'user_settings'
         AND column_name = ANY($1)`,
        [columnChecks]
      );
      
      const foundColumns = columnResult.rows.map(row => row.column_name);
      
      for (const column of columnChecks) {
        if (foundColumns.includes(column)) {
          console.log(`${colors.green}  ✓ Column 'user_settings.${column}' exists${colors.reset}`);
        } else {
          console.log(`${colors.yellow}  ⚠ Column 'user_settings.${column}' not found${colors.reset}`);
        }
      }
      
      console.log(`\n${colors.green}🎉 Export/import functionality is ready!${colors.reset}`);
      console.log(`${colors.gray}   You can now use the export/import features in the Settings page.${colors.reset}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Migration failed:${colors.reset}`, error.message);
    if (error.detail) {
      console.error(`${colors.red}   Detail: ${error.detail}${colors.reset}`);
    }
    if (error.code === 'ENOENT') {
      console.error(`${colors.red}   Make sure you're running this from the backend directory${colors.reset}`);
    }
    process.exit(1);
  } finally {
    // Close the database connection
    await db.pool.end();
  }
}

// Run the migration
runExportMigration()
  .then(() => {
    console.log(`\n${colors.blue}👋 Migration complete. Exiting...${colors.reset}`);
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });