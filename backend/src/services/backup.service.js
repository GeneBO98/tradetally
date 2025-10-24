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
}

module.exports = new BackupService();
