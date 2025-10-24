const backupService = require('../services/backup.service');
const path = require('path');
const fs = require('fs').promises;

/**
 * Backup Controller
 * Handles backup-related requests (admin only)
 */
class BackupController {
  /**
   * Create a manual backup
   * POST /api/admin/backup
   */
  async createBackup(req, res, next) {
    try {
      const userId = req.user.id;

      console.log(`[BACKUP] Manual backup requested by user ${userId}`);

      const result = await backupService.createFullSiteBackup(userId, 'manual');

      res.json({
        message: 'Backup created successfully',
        backup: result.backup,
        filename: result.filename,
        size: result.size
      });
    } catch (error) {
      console.error('[BACKUP] Error creating backup:', error);
      next(error);
    }
  }

  /**
   * Get all backups
   * GET /api/admin/backup
   */
  async getBackups(req, res, next) {
    try {
      const { type, limit } = req.query;

      const filters = {};
      if (type) filters.type = type;
      if (limit) filters.limit = parseInt(limit);

      const backups = await backupService.getBackups(filters);

      res.json({
        backups,
        count: backups.length
      });
    } catch (error) {
      console.error('[BACKUP] Error fetching backups:', error);
      next(error);
    }
  }

  /**
   * Download a backup file
   * GET /api/admin/backup/:id/download
   */
  async downloadBackup(req, res, next) {
    try {
      const { id } = req.params;

      const backup = await backupService.getBackupById(id);

      if (backup.status !== 'completed') {
        return res.status(400).json({
          error: 'Backup is not completed',
          status: backup.status
        });
      }

      // Check if file exists
      try {
        await fs.access(backup.file_path);
      } catch (error) {
        return res.status(404).json({
          error: 'Backup file not found on disk'
        });
      }

      // Send file
      res.download(backup.file_path, backup.filename, (err) => {
        if (err) {
          console.error('[BACKUP] Error downloading file:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error downloading backup file' });
          }
        }
      });
    } catch (error) {
      console.error('[BACKUP] Error downloading backup:', error);
      next(error);
    }
  }

  /**
   * Delete a backup
   * DELETE /api/admin/backup/:id
   */
  async deleteBackup(req, res, next) {
    try {
      const { id } = req.params;

      const backup = await backupService.getBackupById(id);

      // Delete file if it exists
      try {
        await fs.unlink(backup.file_path);
      } catch (error) {
        console.warn('[BACKUP] File not found on disk, continuing with database deletion');
      }

      // Delete from database
      const db = require('../config/database');
      await db.query('DELETE FROM backups WHERE id = $1', [id]);

      res.json({
        message: 'Backup deleted successfully'
      });
    } catch (error) {
      console.error('[BACKUP] Error deleting backup:', error);
      next(error);
    }
  }

  /**
   * Get backup settings
   * GET /api/admin/backup/settings
   */
  async getSettings(req, res, next) {
    try {
      const settings = await backupService.getBackupSettings();

      res.json(settings);
    } catch (error) {
      console.error('[BACKUP] Error fetching settings:', error);
      next(error);
    }
  }

  /**
   * Update backup settings
   * PUT /api/admin/backup/settings
   */
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const { enabled, schedule, retention_days } = req.body;

      // Validate schedule
      const validSchedules = ['hourly', 'daily', 'weekly', 'monthly'];
      if (schedule && !validSchedules.includes(schedule)) {
        return res.status(400).json({
          error: 'Invalid schedule. Must be one of: hourly, daily, weekly, monthly'
        });
      }

      // Validate retention_days
      if (retention_days && (retention_days < 1 || retention_days > 365)) {
        return res.status(400).json({
          error: 'Retention days must be between 1 and 365'
        });
      }

      const settings = await backupService.updateBackupSettings(
        { enabled, schedule, retention_days },
        userId
      );

      res.json({
        message: 'Backup settings updated successfully',
        settings
      });
    } catch (error) {
      console.error('[BACKUP] Error updating settings:', error);
      next(error);
    }
  }

  /**
   * Delete old backups
   * POST /api/admin/backup/cleanup
   */
  async cleanupOldBackups(req, res, next) {
    try {
      const { days } = req.body;
      const daysToKeep = days || 30;

      const deletedCount = await backupService.deleteOldBackups(daysToKeep);

      res.json({
        message: `Deleted ${deletedCount} old backup(s)`,
        deletedCount
      });
    } catch (error) {
      console.error('[BACKUP] Error cleaning up backups:', error);
      next(error);
    }
  }
}

module.exports = new BackupController();
