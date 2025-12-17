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

    // Define all tables to backup (excluding system tables like backups, backup_settings)
    // Tables are organized by category for better organization
    const tableQueries = {
      // Core user data
      users: 'SELECT * FROM users',
      user_settings: 'SELECT * FROM user_settings',
      
      // Trade data
      trades: 'SELECT * FROM trades',
      trade_attachments: 'SELECT * FROM trade_attachments',
      trade_comments: 'SELECT * FROM trade_comments',
      trade_charts: 'SELECT * FROM trade_charts',
      round_trip_trades: 'SELECT * FROM round_trip_trades',
      trade_split_adjustments: 'SELECT * FROM trade_split_adjustments',
      
      // Tags and categories
      tags: 'SELECT * FROM tags',
      symbol_categories: 'SELECT * FROM symbol_categories',
      
      // Diary system
      diary_entries: 'SELECT * FROM diary_entries',
      diary_attachments: 'SELECT * FROM diary_attachments',
      diary_templates: 'SELECT * FROM diary_templates',
      
      // Watchlists and alerts
      watchlists: 'SELECT * FROM watchlists',
      watchlist_items: 'SELECT * FROM watchlist_items',
      price_alerts: 'SELECT * FROM price_alerts',
      price_monitoring: 'SELECT * FROM price_monitoring',
      
      // Gamification
      achievements: 'SELECT * FROM achievements',
      user_achievements: 'SELECT * FROM user_achievements',
      gamification_profile: 'SELECT * FROM gamification_profile',
      
      // Health data
      health_data: 'SELECT * FROM health_data',
      health_trading_correlations: 'SELECT * FROM health_trading_correlations',
      health_insights: 'SELECT * FROM health_insights',
      
      // Mobile and devices
      devices: 'SELECT * FROM devices',
      refresh_tokens: 'SELECT * FROM refresh_tokens',
      sync_metadata: 'SELECT * FROM sync_metadata',
      device_tokens: 'SELECT * FROM device_tokens',
      
      // API and authentication
      api_keys: 'SELECT * FROM api_keys',
      api_usage_tracking: 'SELECT * FROM api_usage_tracking',
      oauth_clients: 'SELECT * FROM oauth_clients',
      oauth_authorization_codes: 'SELECT * FROM oauth_authorization_codes',
      oauth_access_tokens: 'SELECT * FROM oauth_access_tokens',
      oauth_refresh_tokens: 'SELECT * FROM oauth_refresh_tokens',
      oauth_user_consents: 'SELECT * FROM oauth_user_consents',
      
      // Subscriptions and billing
      subscriptions: 'SELECT * FROM subscriptions',
      tier_overrides: 'SELECT * FROM tier_overrides',
      features: 'SELECT * FROM features',
      subscription_features: 'SELECT * FROM subscription_features',
      user_subscription_features: 'SELECT * FROM user_subscription_features',
      apple_transactions: 'SELECT * FROM apple_transactions',
      
      // Analytics and behavioral data
      behavioral_patterns: 'SELECT * FROM behavioral_patterns',
      behavioral_alerts: 'SELECT * FROM behavioral_alerts',
      behavioral_settings: 'SELECT * FROM behavioral_settings',
      revenge_trading_events: 'SELECT * FROM revenge_trading_events',
      loss_aversion_events: 'SELECT * FROM loss_aversion_events',
      trade_hold_patterns: 'SELECT * FROM trade_hold_patterns',
      overconfidence_events: 'SELECT * FROM overconfidence_events',
      overconfidence_settings: 'SELECT * FROM overconfidence_settings',
      win_loss_streaks: 'SELECT * FROM win_loss_streaks',
      
      // Trading personality
      trading_personality_profiles: 'SELECT * FROM trading_personality_profiles',
      personality_drift_tracking: 'SELECT * FROM personality_drift_tracking',
      personality_peer_comparison: 'SELECT * FROM personality_peer_comparison',
      personality_trade_analysis: 'SELECT * FROM personality_trade_analysis',
      
      // Tick data
      tick_data: 'SELECT * FROM tick_data',
      tick_data_cache: 'SELECT * FROM tick_data_cache',
      revenge_trade_tick_analysis: 'SELECT * FROM revenge_trade_tick_analysis',
      
      // Strategy classification
      strategy_classification_history: 'SELECT * FROM strategy_classification_history',
      
      // Stock splits
      stock_splits: 'SELECT * FROM stock_splits',
      stock_split_check_log: 'SELECT * FROM stock_split_check_log',
      
      // Equity tracking
      equity_history: 'SELECT * FROM equity_history',
      equity_snapshots: 'SELECT * FROM equity_snapshots',
      
      // Notifications
      notification_preferences: 'SELECT * FROM notification_preferences',
      notification_read_status: 'SELECT * FROM notification_read_status',
      alert_notifications: 'SELECT * FROM alert_notifications',
      
      // Import and CSV
      import_logs: 'SELECT * FROM import_logs',
      custom_csv_mappings: 'SELECT * FROM custom_csv_mappings',
      broker_fee_settings: 'SELECT * FROM broker_fee_settings',
      
      // CUSIP mappings
      cusip_mappings: 'SELECT * FROM cusip_mappings',
      cusip_lookup_queue: 'SELECT * FROM cusip_lookup_queue',
      
      // General notes
      general_notes: 'SELECT * FROM general_notes',
      
      // Admin and instance config
      admin_settings: 'SELECT * FROM admin_settings',
      instance_config: 'SELECT * FROM instance_config',
      
      // Job queue (may contain important pending jobs)
      job_queue: 'SELECT * FROM job_queue',
      
      // Cache tables (optional but included for completeness)
      enrichment_cache: 'SELECT * FROM enrichment_cache',
      global_enrichment_cache: 'SELECT * FROM global_enrichment_cache',
      news_cache: 'SELECT * FROM news_cache'
    };

    // Execute all queries in parallel
    const tableNames = Object.keys(tableQueries);
    const queries = tableNames.map(tableName => 
      db.query(tableQueries[tableName]).catch(error => {
        // If table doesn't exist, return empty result
        console.warn(`[BACKUP] Table ${tableName} not found or error: ${error.message}`);
        return { rows: [] };
      })
    );

    const results = await Promise.all(queries);

    // Build tables object
    const tables = {};
    const statistics = {};
    
    tableNames.forEach((tableName, index) => {
      const camelCaseName = tableName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      tables[camelCaseName] = results[index].rows;
      statistics[tableName] = results[index].rows.length;
    });

    // Calculate summary statistics
    const data = {
      version: '2.0', // Updated version to indicate comprehensive backup
      exportDate: new Date().toISOString(),
      tables,
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
    const safeInsert = async (queryFn, errorPrefix) => {
      const savepointName = `sp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      try {
        await client.query(`SAVEPOINT ${savepointName}`);
        await queryFn();
        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
        return { success: true };
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
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
            const userColumns = Object.keys(user).filter(col => user[col] !== undefined);
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
              const updateColumns = Object.keys(user).filter(col => 
                col !== 'id' && col !== 'created_at' && user[col] !== undefined
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
            const columns = [];
            const values = [];
            const placeholders = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(tradeData)) {
              // Skip excluded columns
              if (excludeColumns.includes(key)) continue;

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
            const columns = [];
            const values = [];
            const placeholders = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(entry)) {
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

      // Helper function to get primary key field for a table
      const getPrimaryKeyField = (tableName) => {
        // Most tables use 'id' as primary key
        // Some tables might have different primary keys, handle special cases
        const specialCases = {
          'user_settings': 'user_id',
          'sync_metadata': 'user_id'
        };
        return specialCases[tableName] || 'id';
      };

      // Helper function to restore a generic table
      // tableName: database table name (snake_case)
      // tableDataKey: key in backupData.tables (can be camelCase or snake_case)
      const restoreTable = async (tableName, tableDataKey, resultKey) => {
        // Get table data, handling both camelCase and snake_case formats
        const tableData = getTableData(tableDataKey, tableName);
        
        if (!tableData || tableData.length === 0) {
          return;
        }

        console.log(`[RESTORE] Processing ${tableData.length} ${tableName}...`);
        const idField = getPrimaryKeyField(tableName);
        
        // Initialize table results if not exists
        if (!tableResults[tableName]) {
          tableResults[tableName] = { added: 0, skipped: 0, errors: 0 };
        }
        
        for (const row of tableData) {
          // Check if record already exists
            const existing = await client.query(
            `SELECT ${idField} FROM ${tableName} WHERE ${idField} = $1`,
            [row[idField]]
          ).catch(() => ({ rows: [] })); // If table doesn't exist, skip

            if (existing.rows.length === 0) {
            // Map user_id if it exists and we have a mapping
            const rowData = { ...row };
            if (rowData.user_id && userIdMapping.has(rowData.user_id)) {
              rowData.user_id = userIdMapping.get(rowData.user_id);
            }
            
            // Also check for other foreign key fields that might reference users
            if (rowData.created_by && userIdMapping.has(rowData.created_by)) {
              rowData.created_by = userIdMapping.get(rowData.created_by);
            }
            if (rowData.updated_by && userIdMapping.has(rowData.updated_by)) {
              rowData.updated_by = userIdMapping.get(rowData.updated_by);
            }

              // Build dynamic insert query
            const columns = Object.keys(rowData).filter(col => rowData[col] !== undefined);
            const values = [];
            const placeholders = [];
            let paramIndex = 1;

            for (const col of columns) {
              const value = rowData[col];
              
              // Handle JSON/JSONB fields
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

              const result = await safeInsert(async () => {
                await client.query(
                `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
                  values
                );
            }, `[RESTORE] Error restoring ${tableName} record`);

              if (result.success) {
              results[resultKey].added++;
              tableResults[tableName].added++;
              } else {
              results[resultKey].errors++;
              tableResults[tableName].errors++;
              }
            } else {
            results[resultKey].skipped++;
            tableResults[tableName].skipped++;
          }
        }
        
        console.log(`[RESTORE] ${tableName}: ${tableResults[tableName].added} added, ${tableResults[tableName].skipped} skipped, ${tableResults[tableName].errors} errors`);
      };

      // Define table restore order and categorization
      // Tables that depend on users should be restored after users
      // Tables that depend on trades should be restored after trades
      
      // User-related tables (restore after users)
      await restoreTable('user_settings', 'userSettings', 'other');
      await restoreTable('devices', 'devices', 'other');
      await restoreTable('refresh_tokens', 'refreshTokens', 'other');
      await restoreTable('sync_metadata', 'syncMetadata', 'other');
      await restoreTable('device_tokens', 'deviceTokens', 'other');
      await restoreTable('api_keys', 'apiKeys', 'other');
      await restoreTable('api_usage_tracking', 'apiUsageTracking', 'other');
      await restoreTable('subscriptions', 'subscriptions', 'other');
      await restoreTable('tier_overrides', 'tierOverrides', 'other');
      await restoreTable('user_subscription_features', 'userSubscriptionFeatures', 'other');
      await restoreTable('apple_transactions', 'appleTransactions', 'other');
      await restoreTable('notification_preferences', 'notificationPreferences', 'other');
      await restoreTable('notification_read_status', 'notificationReadStatus', 'other');
      await restoreTable('custom_csv_mappings', 'customCsvMappings', 'other');
      await restoreTable('broker_fee_settings', 'brokerFeeSettings', 'other');
      await restoreTable('general_notes', 'generalNotes', 'other');
      await restoreTable('trading_personality_profiles', 'tradingPersonalityProfiles', 'other');
      await restoreTable('personality_drift_tracking', 'personalityDriftTracking', 'other');
      await restoreTable('personality_peer_comparison', 'personalityPeerComparison', 'other');
      await restoreTable('personality_trade_analysis', 'personalityTradeAnalysis', 'other');
      await restoreTable('behavioral_patterns', 'behavioralPatterns', 'other');
      await restoreTable('behavioral_alerts', 'behavioralAlerts', 'other');
      await restoreTable('behavioral_settings', 'behavioralSettings', 'other');
      await restoreTable('revenge_trading_events', 'revengeTradingEvents', 'other');
      await restoreTable('loss_aversion_events', 'lossAversionEvents', 'other');
      await restoreTable('trade_hold_patterns', 'tradeHoldPatterns', 'other');
      await restoreTable('overconfidence_events', 'overconfidenceEvents', 'other');
      await restoreTable('overconfidence_settings', 'overconfidenceSettings', 'other');
      await restoreTable('win_loss_streaks', 'winLossStreaks', 'other');
      await restoreTable('health_data', 'healthData', 'other');
      await restoreTable('health_trading_correlations', 'healthTradingCorrelations', 'other');
      await restoreTable('health_insights', 'healthInsights', 'other');
      await restoreTable('watchlists', 'watchlists', 'other');
      await restoreTable('watchlist_items', 'watchlistItems', 'other');
      await restoreTable('price_alerts', 'priceAlerts', 'other');
      await restoreTable('price_monitoring', 'priceMonitoring', 'other');
      await restoreTable('alert_notifications', 'alertNotifications', 'other');
      await restoreTable('achievements', 'achievements', 'other');
      await restoreTable('user_achievements', 'userAchievements', 'other');
      await restoreTable('gamification_profile', 'gamificationProfile', 'other');

      // Trade-related tables (restore after trades)
      await restoreTable('trade_attachments', 'tradeAttachments', 'other');
      await restoreTable('trade_comments', 'tradeComments', 'other');
      await restoreTable('trade_charts', 'tradeCharts', 'other');
      await restoreTable('round_trip_trades', 'roundTripTrades', 'other');
      await restoreTable('trade_split_adjustments', 'tradeSplitAdjustments', 'other');
      await restoreTable('tick_data', 'tickData', 'other');
      await restoreTable('tick_data_cache', 'tickDataCache', 'other');
      await restoreTable('revenge_trade_tick_analysis', 'revengeTradeTickAnalysis', 'other');
      await restoreTable('strategy_classification_history', 'strategyClassificationHistory', 'other');

      // Diary-related tables
      await restoreTable('diary_attachments', 'diaryAttachments', 'other');
      await restoreTable('diary_templates', 'diaryTemplates', 'other');

      // Other independent tables
      await restoreTable('tags', 'tags', 'other');
      await restoreTable('symbol_categories', 'symbolCategories', 'other');
      await restoreTable('stock_splits', 'stockSplits', 'other');
      await restoreTable('stock_split_check_log', 'stockSplitCheckLog', 'other');
      await restoreTable('equity_history', 'equityHistory', 'other');
      await restoreTable('equity_snapshots', 'equitySnapshots', 'other');
      await restoreTable('import_logs', 'importLogs', 'other');
      await restoreTable('cusip_mappings', 'cusipMappings', 'other');
      await restoreTable('cusip_lookup_queue', 'cusipLookupQueue', 'other');
      await restoreTable('features', 'features', 'other');
      await restoreTable('subscription_features', 'subscriptionFeatures', 'other');
      await restoreTable('oauth_clients', 'oauthClients', 'other');
      await restoreTable('oauth_authorization_codes', 'oauthAuthorizationCodes', 'other');
      await restoreTable('oauth_access_tokens', 'oauthAccessTokens', 'other');
      await restoreTable('oauth_refresh_tokens', 'oauthRefreshTokens', 'other');
      await restoreTable('oauth_user_consents', 'oauthUserConsents', 'other');
      await restoreTable('admin_settings', 'adminSettings', 'other');
      await restoreTable('instance_config', 'instanceConfig', 'other');
      await restoreTable('job_queue', 'jobQueue', 'other');
      
      // Cache tables (optional, but included for completeness)
      await restoreTable('enrichment_cache', 'enrichmentCache', 'other');
      await restoreTable('global_enrichment_cache', 'globalEnrichmentCache', 'other');
      await restoreTable('news_cache', 'newsCache', 'other');

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
