const db = require('../config/database');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { createWriteStream } = require('fs');

/**
 * Backup Service
 * Handles full site data export and automatic backups
 */
class BackupService {
  constructor() {
    this.backupDir = path.join(__dirname, '../data/backups');
    this.ensureBackupDirectory();
  }

  /**
   * Ensure backup directory exists
   */
  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.error('[BACKUP] Error creating backup directory:', error);
    }
  }

  /**
   * Create a full site backup (admin only)
   * @param {string} userId - Admin user ID
   * @param {string} type - 'manual' or 'automatic'
   * @returns {Promise<Object>} Backup metadata
   */
  async createFullSiteBackup(userId, type = 'manual') {
    console.log(`[BACKUP] Starting full site backup (type: ${type})`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `tradetally-backup-${timestamp}.json`;
    const backupFilePath = path.join(this.backupDir, backupFileName);

    try {
      // Fetch all data from database
      const data = await this.fetchAllData();

      // Write data to file
      await fs.writeFile(backupFilePath, JSON.stringify(data, null, 2));

      // Get file stats
      const stats = await fs.stat(backupFilePath);

      // Save backup metadata to database
      const result = await db.query(
        `INSERT INTO backups (user_id, filename, file_path, file_size, backup_type, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [userId, backupFileName, backupFilePath, stats.size, type, 'completed']
      );

      console.log(`[BACKUP] Backup completed successfully: ${backupFileName}`);

      return {
        success: true,
        backup: result.rows[0],
        filename: backupFileName,
        size: stats.size
      };
    } catch (error) {
      console.error('[BACKUP] Error creating backup:', error);

      // Save failed backup to database
      await db.query(
        `INSERT INTO backups (user_id, filename, file_path, backup_type, status, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [userId, backupFileName, backupFilePath, type, 'failed', error.message]
      );

      throw error;
    }
  }

  /**
   * Fetch all data from database
   * @returns {Promise<Object>} All site data
   */
  async fetchAllData() {
    console.log('[BACKUP] Fetching all site data...');

    // Dynamically discover all tables from the database schema
    // This ensures new tables from migrations are automatically included
    const EXCLUDED_TABLES = new Set([
      'backups',
      'backup_settings',
      'schema_migrations'
    ]);

    const tablesResult = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tableNames = tablesResult.rows
      .map(row => row.table_name)
      .filter(name => !EXCLUDED_TABLES.has(name));

    console.log(`[BACKUP] Discovered ${tableNames.length} tables to backup`);

    // Execute all queries in parallel
    const queries = tableNames.map(tableName =>
      db.query(`SELECT * FROM "${tableName}"`).catch(error => {
        console.warn(`[BACKUP] Table ${tableName} error: ${error.message}`);
        return { rows: [] };
      })
    );

    const results = await Promise.all(queries);

    // Build tables object with camelCase keys for backward compatibility
    // Also build a mapping so restore can convert back precisely
    const tables = {};
    const statistics = {};
    const tableNameMapping = {}; // camelCase -> snake_case

    tableNames.forEach((tableName, index) => {
      const camelCaseName = tableName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      tables[camelCaseName] = results[index].rows;
      statistics[tableName] = results[index].rows.length;
      tableNameMapping[camelCaseName] = tableName;
    });

    // Calculate summary statistics
    const data = {
      version: '3.0',
      exportDate: new Date().toISOString(),
      tables,
      tableNameMapping,
      statistics: {
        ...statistics,
        totalTables: tableNames.length,
        totalRecords: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0)
      }
    };

    console.log('[BACKUP] Data fetched successfully. Tables:', tableNames.length, 'Total records:', data.statistics.totalRecords);
    return data;
  }

  /**
   * Get all backups
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} List of backups
   */
  async getBackups(filters = {}) {
    let query = 'SELECT * FROM backups';
    const params = [];

    if (filters.type) {
      params.push(filters.type);
      query += ` WHERE backup_type = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      params.push(filters.limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get backup by ID
   * @param {string} backupId - Backup ID
   * @returns {Promise<Object>} Backup metadata
   */
  async getBackupById(backupId) {
    const result = await db.query(
      'SELECT * FROM backups WHERE id = $1',
      [backupId]
    );

    if (result.rows.length === 0) {
      throw new Error('Backup not found');
    }

    return result.rows[0];
  }

  /**
   * Delete old backups
   * @param {number} daysToKeep - Number of days to keep backups
   * @returns {Promise<number>} Number of backups deleted
   */
  async deleteOldBackups(daysToKeep = 30) {
    console.log(`[BACKUP] Deleting backups older than ${daysToKeep} days...`);

    // Get old backups
    const result = await db.query(
      `SELECT * FROM backups
       WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`,
      []
    );

    const oldBackups = result.rows;
    let deletedCount = 0;

    for (const backup of oldBackups) {
      try {
        // Delete file if it exists
        if (backup.file_path) {
          await fs.unlink(backup.file_path);
        }

        // Delete from database
        await db.query('DELETE FROM backups WHERE id = $1', [backup.id]);
        deletedCount++;
      } catch (error) {
        console.error(`[BACKUP] Error deleting backup ${backup.id}:`, error);
      }
    }

    console.log(`[BACKUP] Deleted ${deletedCount} old backups`);
    return deletedCount;
  }

  /**
   * Get backup settings
   * @returns {Promise<Object>} Backup settings
   */
  async getBackupSettings() {
    const result = await db.query(
      `SELECT * FROM backup_settings
       ORDER BY updated_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Return default settings
      return {
        enabled: false,
        schedule: 'daily',
        retention_days: 30,
        last_backup: null
      };
    }

    return result.rows[0];
  }

  /**
   * Update backup settings
   * @param {Object} settings - New settings
   * @param {string} userId - Admin user ID
   * @returns {Promise<Object>} Updated settings
   */
  async updateBackupSettings(settings, userId) {
    const { enabled, schedule, retention_days } = settings;

    // Check if settings exist
    const existing = await db.query('SELECT * FROM backup_settings LIMIT 1');

    let result;
    if (existing.rows.length === 0) {
      // Insert new settings
      result = await db.query(
        `INSERT INTO backup_settings (enabled, schedule, retention_days, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING *`,
        [enabled, schedule, retention_days, userId]
      );
    } else {
      // Update existing settings
      result = await db.query(
        `UPDATE backup_settings
         SET enabled = $1, schedule = $2, retention_days = $3, updated_by = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [enabled, schedule, retention_days, userId, existing.rows[0].id]
      );
    }

    console.log('[BACKUP] Settings updated:', result.rows[0]);
    return result.rows[0];
  }

  /**
   * Restore from a backup file
   * @param {Object} backupData - Parsed backup JSON data
   * @param {Object} options - Restore options
   * @returns {Promise<Object>} Restore results
   */
  async restoreFromBackup(backupData, options = {}) {
    const {
      clearExisting = false,   // Whether to clear existing data before restore
      skipUsers = false,       // Whether to skip user restoration (use existing users)
      overwriteUsers = false   // Whether to overwrite existing users with backup data
    } = options;

    console.log('[RESTORE] Starting backup restoration...');
    console.log('[RESTORE] Options:', { clearExisting, skipUsers, overwriteUsers });

    const client = await db.connect();
    const results = {
      users: { added: 0, skipped: 0, updated: 0, errors: 0 },
      trades: { added: 0, skipped: 0, errors: 0 },
      diaryEntries: { added: 0, skipped: 0, errors: 0 },
      other: { added: 0, skipped: 0, errors: 0 }
    };
    
    // Track results per table for detailed reporting
    const tableResults = {};

    // Helper function to safely insert a record using SAVEPOINT
    // This allows individual records to fail without aborting the entire transaction
    // NOTE: Only used for users/trades/diary_entries (small record counts).
    // For generic tables, restoreTable uses ON CONFLICT instead to avoid shared memory exhaustion.
    const safeInsert = async (queryFn, errorPrefix) => {
      const savepointName = `sp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      try {
        await client.query(`SAVEPOINT ${savepointName}`);
        await queryFn();
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
        return { success: true };
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
        console.error(`${errorPrefix}:`, error.message);
        return { success: false, error: error.message };
      }
    };

    try {
      await client.query('BEGIN');

      const tables = backupData.tables;

      // Helper function to get table data with backward compatibility
      // Handles both camelCase (new format) and snake_case (old format) table names
      const getTableData = (camelCaseName, snakeCaseName) => {
        return tables[camelCaseName] || tables[snakeCaseName] || [];
      };

      // Column schema cache - validates backup columns against target DB
      const schemaCache = {};
      const getValidColumns = async (tableName) => {
        if (schemaCache[tableName]) return schemaCache[tableName];
        try {
          const result = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
          `, [tableName]);
          const cols = new Set(result.rows.map(r => r.column_name));
          schemaCache[tableName] = cols;
          return cols;
        } catch (error) {
          return null; // Table doesn't exist
        }
      };

      // Clear existing data if requested (true snapshot restore)
      if (clearExisting) {
        console.log('[RESTORE] Clearing existing data for snapshot restore...');
        const SKIP_CLEAR = new Set(['backups', 'backup_settings', 'schema_migrations']);
        const allTablesResult = await client.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);
        for (const row of allTablesResult.rows) {
          if (SKIP_CLEAR.has(row.table_name)) continue;
          await client.query(`TRUNCATE TABLE "${row.table_name}" CASCADE`);
        }
        console.log(`[RESTORE] Cleared ${allTablesResult.rows.length - SKIP_CLEAR.size} tables`);
      }

      // Create a mapping of backup user IDs to current database user IDs
      const userIdMapping = new Map();

      // Restore users first (if not skipping)
      if (!skipUsers && tables.users && tables.users.length > 0) {
        console.log(`[RESTORE] Processing ${tables.users.length} users...`);
        for (const user of tables.users) {
          // Check if user already exists by ID or email
          const existingUser = await client.query(
            'SELECT id, email, username FROM users WHERE id = $1 OR email = $2',
            [user.id, user.email]
          );

          if (existingUser.rows.length === 0) {
            // User doesn't exist - insert new user using dynamic columns
            const validCols = await getValidColumns('users');
            const userColumns = Object.keys(user).filter(col => user[col] !== undefined && (!validCols || validCols.has(col)));
            const userValues = [];
            const userPlaceholders = [];
            let userParamIndex = 1;

            for (const col of userColumns) {
              const value = user[col];
              if (Array.isArray(value)) {
                userValues.push(value);
              } else if (value && typeof value === 'object' && !(value instanceof Date)) {
                userValues.push(JSON.stringify(value));
              } else {
                userValues.push(value);
              }
              userPlaceholders.push(`$${userParamIndex}`);
              userParamIndex++;
            }

            const result = await safeInsert(async () => {
              await client.query(
                `INSERT INTO users (${userColumns.join(', ')}) VALUES (${userPlaceholders.join(', ')})`,
                userValues
              );
            }, `[RESTORE] Error restoring user ${user.email}`);

            if (result.success) {
              results.users.added++;
              // Map backup user ID to itself (successfully inserted)
              userIdMapping.set(user.id, user.id);
            } else {
              // User failed to insert - try to find existing user by email or username
              const findExisting = await client.query(
                'SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1',
                [user.email, user.username]
              );

              if (findExisting.rows.length > 0) {
                // Map backup user ID to existing user ID
                userIdMapping.set(user.id, findExisting.rows[0].id);
                console.log(`[RESTORE] Mapping user ${user.email} (${user.id}) to existing user (${findExisting.rows[0].id})`);
              }

              results.users.errors++;
            }
          } else {
            // User already exists
            const existingUserId = existingUser.rows[0].id;
            userIdMapping.set(user.id, existingUserId);

            if (overwriteUsers) {
              // Overwrite existing user with backup data using dynamic columns
              const validColsUpdate = await getValidColumns('users');
              const updateColumns = Object.keys(user).filter(col =>
                col !== 'id' && col !== 'created_at' && user[col] !== undefined && (!validColsUpdate || validColsUpdate.has(col))
              );
              const updateValues = [];
              const updateSet = [];
              let updateParamIndex = 1;

              for (const col of updateColumns) {
                const value = user[col];
                if (Array.isArray(value)) {
                  updateValues.push(value);
                } else if (value && typeof value === 'object' && !(value instanceof Date)) {
                  updateValues.push(JSON.stringify(value));
                } else {
                  updateValues.push(value);
                }
                updateSet.push(`${col} = $${updateParamIndex}`);
                updateParamIndex++;
              }
              
              // Always update updated_at
              updateSet.push(`updated_at = NOW()`);
              updateValues.push(existingUserId);

              const result = await safeInsert(async () => {
                await client.query(
                  `UPDATE users SET ${updateSet.join(', ')} WHERE id = $${updateParamIndex}`,
                  updateValues
                );
              }, `[RESTORE] Error updating user ${user.email}`);

              if (result.success) {
                console.log(`[RESTORE] Updated user ${user.email} (${existingUserId})`);
                results.users.updated++;
              } else {
                results.users.errors++;
              }
            } else {
              // Just skip and map
              console.log(`[RESTORE] User ${user.email} already exists (${existingUserId})`);
              results.users.skipped++;
            }
          }
        }
        console.log(`[RESTORE] Users: ${results.users.added} added, ${results.users.updated} updated, ${results.users.skipped} skipped, ${results.users.errors} errors, ${userIdMapping.size} mapped`);
      }

      // Build set of valid user IDs for FK pre-validation
      // Includes all mapped users + all existing users in DB
      const validUserIds = new Set(userIdMapping.values());
      const existingUsersResult = await client.query('SELECT id FROM users');
      for (const row of existingUsersResult.rows) {
        validUserIds.add(row.id);
      }
      console.log(`[RESTORE] Valid user IDs for FK validation: ${validUserIds.size}`);

      // Restore trades using dynamic column insertion
      if (tables.trades && tables.trades.length > 0) {
        console.log(`[RESTORE] Processing ${tables.trades.length} trades...`);

        // Columns to exclude from dynamic insert (handled specially or should be null)
        const excludeColumns = ['import_id', 'round_trip_id'];

        for (const trade of tables.trades) {
          // Check if trade already exists
          const existingTrade = await client.query(
            'SELECT id FROM trades WHERE id = $1',
            [trade.id]
          );

          if (existingTrade.rows.length === 0) {
            // Map the user_id if a mapping exists
            let mappedUserId = trade.user_id;
            if (userIdMapping.has(trade.user_id)) {
              mappedUserId = userIdMapping.get(trade.user_id);
            }

            // Check if mapped user exists
            const userExists = await client.query(
              'SELECT id FROM users WHERE id = $1',
              [mappedUserId]
            );

            if (userExists.rows.length === 0) {
              console.log(`[RESTORE] Skipping trade - user not found: ${trade.user_id} (mapped: ${mappedUserId})`);
              results.trades.skipped++;
              continue;
            }

            // Update user_id if it was mapped
            const tradeData = { ...trade };
            if (mappedUserId !== trade.user_id) {
              tradeData.user_id = mappedUserId;
            }

            // Build dynamic insert with all columns from backup (using mapped tradeData)
            const validTradeCols = await getValidColumns('trades');
            const columns = [];
            const values = [];
            const placeholders = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(tradeData)) {
              // Skip excluded columns or columns not in target schema
              if (excludeColumns.includes(key)) continue;
              if (validTradeCols && !validTradeCols.has(key)) continue;

              columns.push(key);

              // Handle special cases
              if (key === 'executions' && value && typeof value === 'object') {
                values.push(JSON.stringify(value));
              } else if (key === 'tags' && Array.isArray(value)) {
                values.push(value);
              } else if (key === 'news_events' && value && typeof value === 'object') {
                values.push(JSON.stringify(value));
              } else if (key === 'classification_metadata' && value && typeof value === 'object') {
                values.push(JSON.stringify(value));
              } else {
                values.push(value);
              }

              placeholders.push(`$${paramIndex}`);
              paramIndex++;
            }

            const result = await safeInsert(async () => {
              await client.query(
                `INSERT INTO trades (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
                values
              );
            }, `[RESTORE] Error restoring trade ${trade.id}`);

            if (result.success) {
              results.trades.added++;
            } else {
              results.trades.errors++;
            }
          } else {
            results.trades.skipped++;
          }
        }
        console.log(`[RESTORE] Trades: ${results.trades.added} added, ${results.trades.skipped} skipped, ${results.trades.errors} errors`);
      }

      // Restore diary entries
      const diaryEntriesData = getTableData('diaryEntries', 'diary_entries');
      if (diaryEntriesData && diaryEntriesData.length > 0) {
        console.log(`[RESTORE] Processing ${diaryEntriesData.length} diary entries...`);
        for (const entry of diaryEntriesData) {
          const existingEntry = await client.query(
            'SELECT id FROM diary_entries WHERE id = $1',
            [entry.id]
          );

          if (existingEntry.rows.length === 0) {
            // Build dynamic insert for diary entries too
            const validDiaryCols = await getValidColumns('diary_entries');
            const columns = [];
            const values = [];
            const placeholders = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(entry)) {
              if (validDiaryCols && !validDiaryCols.has(key)) continue;
              columns.push(key);

              if (Array.isArray(value)) {
                values.push(value);
              } else {
                values.push(value);
              }

              placeholders.push(`$${paramIndex}`);
              paramIndex++;
            }

            const result = await safeInsert(async () => {
              await client.query(
                `INSERT INTO diary_entries (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
                values
              );
            }, `[RESTORE] Error restoring diary entry ${entry.id}`);

            if (result.success) {
              results.diaryEntries.added++;
            } else {
              results.diaryEntries.errors++;
            }
          } else {
            results.diaryEntries.skipped++;
          }
        }
        console.log(`[RESTORE] Diary entries: ${results.diaryEntries.added} added, ${results.diaryEntries.skipped} skipped, ${results.diaryEntries.errors} errors`);
      }

      // Helper function to convert camelCase to snake_case
      const camelToSnake = (str) => {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      };

      // Dynamic primary key detection via information_schema (cached per restore session)
      const pkCache = {};
      const getPrimaryKeyField = async (tableName) => {
        if (pkCache[tableName]) return pkCache[tableName];
        try {
          const pkResult = await client.query(`
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = 'public'
              AND tc.table_name = $1
            ORDER BY kcu.ordinal_position
            LIMIT 1
          `, [tableName]);
          const pk = pkResult.rows.length > 0 ? pkResult.rows[0].column_name : 'id';
          pkCache[tableName] = pk;
          return pk;
        } catch (error) {
          pkCache[tableName] = 'id';
          return 'id';
        }
      };

      // Helper function to restore a generic table
      // Uses ON CONFLICT DO NOTHING instead of per-record SAVEPOINTs to avoid
      // PostgreSQL shared memory exhaustion on tables with many records.
      // One savepoint wraps the entire table - if a non-conflict error occurs,
      // the whole table is rolled back and reported.
      const restoreTable = async (tableName, tableDataKey, resultKey) => {
        // Get table data, handling both camelCase and snake_case formats
        const tableData = getTableData(tableDataKey, tableName);

        if (!tableData || tableData.length === 0) {
          return;
        }

        console.log(`[RESTORE] Processing ${tableData.length} ${tableName}...`);
        const idField = await getPrimaryKeyField(tableName);
        const validTableCols = await getValidColumns(tableName);

        // If table doesn't exist in target DB, skip entirely
        if (!validTableCols) {
          console.warn(`[RESTORE] Table ${tableName} does not exist in target DB, skipping`);
          return;
        }

        // Initialize table results if not exists
        if (!tableResults[tableName]) {
          tableResults[tableName] = { added: 0, skipped: 0, errors: 0 };
        }

        // Single savepoint per table (not per record) to avoid shared memory exhaustion
        const tableSavepoint = `sp_${tableName.replace(/[^a-z0-9_]/g, '')}`;
        await client.query(`SAVEPOINT ${tableSavepoint}`);

        try {
          for (const row of tableData) {
            // Map user_id if it exists and we have a mapping
            const rowData = { ...row };
            if (rowData.user_id && userIdMapping.has(rowData.user_id)) {
              rowData.user_id = userIdMapping.get(rowData.user_id);
            }
            if (rowData.created_by && userIdMapping.has(rowData.created_by)) {
              rowData.created_by = userIdMapping.get(rowData.created_by);
            }
            if (rowData.updated_by && userIdMapping.has(rowData.updated_by)) {
              rowData.updated_by = userIdMapping.get(rowData.updated_by);
            }

            // Skip records with user_id that doesn't exist (prevents FK violations)
            if (rowData.user_id && !validUserIds.has(rowData.user_id)) {
              results[resultKey].skipped++;
              tableResults[tableName].skipped++;
              continue;
            }

            // Build dynamic insert query - filter columns against target DB schema
            const columns = Object.keys(rowData).filter(col => rowData[col] !== undefined && validTableCols.has(col));
            const values = [];
            const placeholders = [];
            let paramIndex = 1;

            for (const col of columns) {
              const value = rowData[col];
              if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                values.push(JSON.stringify(value));
              } else if (Array.isArray(value)) {
                values.push(value);
              } else {
                values.push(value);
              }
              placeholders.push(`$${paramIndex}`);
              paramIndex++;
            }

            // ON CONFLICT DO NOTHING (no column target) handles ALL unique constraint violations
            const insertResult = await client.query(
              `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
               ON CONFLICT DO NOTHING
               RETURNING ${idField}`,
              values
            );

            if (insertResult.rows.length > 0) {
              results[resultKey].added++;
              tableResults[tableName].added++;
            } else {
              results[resultKey].skipped++;
              tableResults[tableName].skipped++;
            }
          }

          await client.query(`RELEASE SAVEPOINT ${tableSavepoint}`);
        } catch (error) {
          // Non-conflict error (schema mismatch, FK violation, etc.) - roll back entire table
          console.error(`[RESTORE] Error restoring ${tableName}: ${error.message}`);
          await client.query(`ROLLBACK TO SAVEPOINT ${tableSavepoint}`);
          await client.query(`RELEASE SAVEPOINT ${tableSavepoint}`);
          const processed = tableResults[tableName].added + tableResults[tableName].skipped;
          const remaining = tableData.length - processed;
          tableResults[tableName].errors += remaining;
          results[resultKey].errors += remaining;
        }

        console.log(`[RESTORE] ${tableName}: ${tableResults[tableName].added} added, ${tableResults[tableName].skipped} skipped, ${tableResults[tableName].errors} errors`);
      };

      // Dynamically restore all remaining tables from the backup
      // Tables already handled: users, trades, diary_entries
      const ALREADY_RESTORED = new Set(['users', 'trades', 'diaryEntries', 'diary_entries']);
      // Tables that should never be restored (system/meta tables)
      const SKIP_RESTORE = new Set(['backups', 'backupSettings', 'backup_settings', 'schemaMigrations', 'schema_migrations']);

      // Priority order for tables with foreign key dependencies
      // These are restored first (in order) before all remaining tables
      const PRIORITY_ORDER = [
        'user_settings', 'tags', 'symbol_categories', 'features',
        'achievements', 'watchlists', 'subscriptions',
        'devices', 'oauth_clients', 'broker_connections',
        // Tables that depend on priority tables above
        'subscription_features', 'user_subscription_features',
        'watchlist_items', 'user_achievements',
        'trade_attachments', 'trade_comments', 'trade_charts',
        'round_trip_trades', 'diary_attachments', 'diary_templates',
      ];

      // Build the list of all camelCase keys in the backup (excluding already-handled tables)
      const allBackupKeys = Object.keys(tables).filter(key =>
        !ALREADY_RESTORED.has(key) && !SKIP_RESTORE.has(key)
      );

      // v3.0 backups include tableNameMapping for precise camelCase -> snake_case conversion
      const tableNameMapping = backupData.tableNameMapping || {};

      // Resolve snake_case table name from a camelCase key
      const resolveSnakeName = (camelKey) => {
        if (tableNameMapping[camelKey]) return tableNameMapping[camelKey];
        // Fallback: convert camelCase to snake_case
        return camelKey.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      };

      // Build ordered list: priority tables first, then remaining in backup order
      const prioritySet = new Set(PRIORITY_ORDER);
      const orderedKeys = [];
      const remainingKeys = [];

      for (const key of allBackupKeys) {
        const snakeName = resolveSnakeName(key);
        if (prioritySet.has(snakeName)) {
          // Will be added in priority order below
        } else {
          remainingKeys.push(key);
        }
      }

      // Add priority tables in defined order (if they exist in backup)
      for (const snakeName of PRIORITY_ORDER) {
        // Find the matching camelCase key in backup
        const matchingKey = allBackupKeys.find(key => resolveSnakeName(key) === snakeName);
        if (matchingKey) {
          orderedKeys.push(matchingKey);
        }
      }

      // Append all remaining tables
      orderedKeys.push(...remainingKeys);

      console.log(`[RESTORE] Restoring ${orderedKeys.length} additional tables dynamically...`);

      for (const camelKey of orderedKeys) {
        const snakeName = resolveSnakeName(camelKey);
        await restoreTable(snakeName, camelKey, 'other');
      }

      await client.query('COMMIT');
      console.log('[RESTORE] Restore completed successfully');

      // Check totals
      const totalErrors = results.users.errors + results.trades.errors + results.diaryEntries.errors + results.other.errors;
      const totalAdded = results.users.added + results.trades.added + results.diaryEntries.added + results.other.added;
      const totalSkipped = results.users.skipped + results.trades.skipped + results.diaryEntries.skipped + results.other.skipped;

      // Build message based on what happened
      const totalUpdated = results.users.updated || 0;
      let message = '';

      if (totalAdded === 0 && totalUpdated === 0 && totalSkipped > 0) {
        message = `Restore completed. All ${totalSkipped} records already exist in the database (nothing to restore).`;
      } else if (totalAdded > 0 || totalUpdated > 0) {
        const parts = [];
        if (results.users.added > 0) parts.push(`${results.users.added} users`);
        if (results.trades.added > 0) parts.push(`${results.trades.added} trades`);
        if (results.diaryEntries.added > 0) parts.push(`${results.diaryEntries.added} diary entries`);
        if (results.other.added > 0) parts.push(`${results.other.added} other records`);

        message = 'Restored: ' + parts.join(', ');

        if (totalUpdated > 0) {
          message += ` | Updated: ${results.users.updated} users`;
        }

        if (totalSkipped > 0) {
          message += ` (${totalSkipped} skipped - already exist)`;
        }
      } else {
        message = 'Restore completed. No records added.';
      }

      if (totalErrors > 0) {
        message += ` [${totalErrors} non-critical errors occurred]`;
      }

      return {
        success: true,
        results,
        tableResults, // Include detailed per-table results
        message
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[RESTORE] Restore failed, transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new BackupService();
