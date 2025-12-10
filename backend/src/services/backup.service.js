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

    // Fetch data from all main tables
    const [
      users,
      trades,
      tradeAttachments,
      tradeComments,
      symbolCategories,
      achievements,
      userAchievements,
      watchlists,
      watchlistItems,
      diaryEntries,
      healthData
    ] = await Promise.all([
      db.query('SELECT * FROM users'),
      db.query('SELECT * FROM trades'),
      db.query('SELECT * FROM trade_attachments'),
      db.query('SELECT * FROM trade_comments'),
      db.query('SELECT * FROM symbol_categories'),
      db.query('SELECT * FROM achievements'),
      db.query('SELECT * FROM user_achievements'),
      db.query('SELECT * FROM watchlists'),
      db.query('SELECT * FROM watchlist_items'),
      db.query('SELECT * FROM diary_entries'),
      db.query('SELECT * FROM health_data')
    ]);

    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      tables: {
        users: users.rows,
        trades: trades.rows,
        tradeAttachments: tradeAttachments.rows,
        tradeComments: tradeComments.rows,
        symbolCategories: symbolCategories.rows,
        achievements: achievements.rows,
        userAchievements: userAchievements.rows,
        watchlists: watchlists.rows,
        watchlistItems: watchlistItems.rows,
        diaryEntries: diaryEntries.rows,
        healthData: healthData.rows
      },
      statistics: {
        totalUsers: users.rows.length,
        totalTrades: trades.rows.length,
        totalAttachments: tradeAttachments.rows.length,
        totalComments: tradeComments.rows.length,
        totalDiaryEntries: diaryEntries.rows.length
      }
    };

    console.log('[BACKUP] Data fetched successfully:', data.statistics);
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
            // User doesn't exist - insert new user
            const result = await safeInsert(async () => {
              await client.query(
                `INSERT INTO users (
                  id, email, username, password_hash, full_name, avatar_url,
                  is_verified, is_active, timezone, created_at, updated_at,
                  role, admin_approved, tier, trial_used
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
                [
                  user.id, user.email, user.username, user.password_hash,
                  user.full_name, user.avatar_url, user.is_verified, user.is_active,
                  user.timezone || 'UTC', user.created_at, user.updated_at,
                  user.role || 'user', user.admin_approved || false,
                  user.tier || 'free', user.trial_used || false
                ]
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
              // Overwrite existing user with backup data
              const result = await safeInsert(async () => {
                await client.query(
                  `UPDATE users SET
                    username = $1, password_hash = $2, full_name = $3, avatar_url = $4,
                    is_verified = $5, is_active = $6, timezone = $7, updated_at = NOW(),
                    role = $8, admin_approved = $9, tier = $10, trial_used = $11
                  WHERE id = $12`,
                  [
                    user.username, user.password_hash, user.full_name, user.avatar_url,
                    user.is_verified, user.is_active, user.timezone || 'UTC',
                    user.role || 'user', user.admin_approved || false,
                    user.tier || 'free', user.trial_used || false,
                    existingUserId
                  ]
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
      if (tables.diaryEntries && tables.diaryEntries.length > 0) {
        console.log(`[RESTORE] Processing ${tables.diaryEntries.length} diary entries...`);
        for (const entry of tables.diaryEntries) {
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

      // Restore other tables (trade_attachments, trade_comments, etc.)
      const otherTables = [
        { name: 'tradeAttachments', table: 'trade_attachments', idField: 'id' },
        { name: 'tradeComments', table: 'trade_comments', idField: 'id' },
        { name: 'symbolCategories', table: 'symbol_categories', idField: 'id' },
        { name: 'watchlists', table: 'watchlists', idField: 'id' },
        { name: 'watchlistItems', table: 'watchlist_items', idField: 'id' },
        { name: 'healthData', table: 'health_data', idField: 'id' }
      ];

      for (const tableInfo of otherTables) {
        if (tables[tableInfo.name] && tables[tableInfo.name].length > 0) {
          console.log(`[RESTORE] Processing ${tables[tableInfo.name].length} ${tableInfo.name}...`);
          for (const row of tables[tableInfo.name]) {
            const existing = await client.query(
              `SELECT ${tableInfo.idField} FROM ${tableInfo.table} WHERE ${tableInfo.idField} = $1`,
              [row[tableInfo.idField]]
            );

            if (existing.rows.length === 0) {
              // Build dynamic insert query
              const columns = Object.keys(row);
              const values = Object.values(row).map(v => {
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                  return JSON.stringify(v);
                }
                return v;
              });
              const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

              const result = await safeInsert(async () => {
                await client.query(
                  `INSERT INTO ${tableInfo.table} (${columns.join(', ')}) VALUES (${placeholders})`,
                  values
                );
              }, `[RESTORE] Error restoring ${tableInfo.name}`);

              if (result.success) {
                results.other.added++;
              } else {
                results.other.errors++;
              }
            } else {
              results.other.skipped++;
            }
          }
        }
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
