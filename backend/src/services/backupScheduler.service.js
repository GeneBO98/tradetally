const cron = require('node-cron');
const backupService = require('./backup.service');
const db = require('../config/database');

/**
 * Backup Scheduler Service
 * Manages automatic scheduled backups based on admin configuration
 */
class BackupScheduler {
  constructor() {
    this.jobs = new Map();
    this.systemUserId = null;
  }

  /**
   * Initialize the scheduler
   * Starts the scheduler based on current settings
   */
  async initialize() {
    try {
      console.log('[BACKUP SCHEDULER] Initializing...');

      // Get system admin user for automatic backups
      const adminResult = await db.query(
        `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`
      );

      if (adminResult.rows.length > 0) {
        this.systemUserId = adminResult.rows[0].id;
      } else {
        console.warn('[BACKUP SCHEDULER] No admin user found, automatic backups disabled');
        return;
      }

      // Load current settings and start scheduler
      await this.reloadSchedule();

      console.log('[BACKUP SCHEDULER] Initialized successfully');
    } catch (error) {
      console.error('[BACKUP SCHEDULER] Error initializing:', error);
    }
  }

  /**
   * Reload schedule from database settings
   * Stops existing jobs and starts new ones based on current config
   */
  async reloadSchedule() {
    try {
      // Stop all existing jobs
      this.stopAll();

      // Get current settings
      const settings = await backupService.getBackupSettings();

      if (!settings.enabled) {
        console.log('[BACKUP SCHEDULER] Automatic backups disabled');
        return;
      }

      // Start job based on schedule
      this.startScheduledBackup(settings.schedule);

      // Start cleanup job (runs daily at 3 AM)
      this.startCleanupJob(settings.retention_days);

      console.log(`[BACKUP SCHEDULER] Schedule reloaded: ${settings.schedule} backups, ${settings.retention_days} days retention`);
    } catch (error) {
      console.error('[BACKUP SCHEDULER] Error reloading schedule:', error);
    }
  }

  /**
   * Start scheduled backup job based on schedule type
   * @param {string} schedule - hourly, daily, weekly, or monthly
   */
  startScheduledBackup(schedule) {
    let cronExpression;

    switch (schedule) {
      case 'hourly':
        // Every hour at minute 0
        cronExpression = '0 * * * *';
        break;
      case 'daily':
        // Every day at 2 AM
        cronExpression = '0 2 * * *';
        break;
      case 'weekly':
        // Every Sunday at 2 AM
        cronExpression = '0 2 * * 0';
        break;
      case 'monthly':
        // First day of every month at 2 AM
        cronExpression = '0 2 1 * *';
        break;
      default:
        console.error(`[BACKUP SCHEDULER] Invalid schedule: ${schedule}`);
        return;
    }

    const job = cron.schedule(cronExpression, async () => {
      await this.executeBackup();
    });

    this.jobs.set('backup', job);
    console.log(`[BACKUP SCHEDULER] Scheduled ${schedule} backups: ${cronExpression}`);
  }

  /**
   * Start cleanup job to delete old backups
   * Runs daily at 3 AM
   * @param {number} retentionDays - Number of days to keep backups
   */
  startCleanupJob(retentionDays) {
    const cronExpression = '0 3 * * *'; // Daily at 3 AM

    const job = cron.schedule(cronExpression, async () => {
      try {
        console.log('[BACKUP SCHEDULER] Running scheduled cleanup...');
        const deletedCount = await backupService.deleteOldBackups(retentionDays);
        console.log(`[BACKUP SCHEDULER] Cleanup complete: ${deletedCount} old backup(s) deleted`);
      } catch (error) {
        console.error('[BACKUP SCHEDULER] Error during cleanup:', error);
      }
    });

    this.jobs.set('cleanup', job);
    console.log(`[BACKUP SCHEDULER] Scheduled daily cleanup at 3 AM (${retentionDays} days retention)`);
  }

  /**
   * Execute a scheduled backup
   */
  async executeBackup() {
    try {
      if (!this.systemUserId) {
        console.error('[BACKUP SCHEDULER] No admin user available for automatic backup');
        return;
      }

      console.log('[BACKUP SCHEDULER] Executing scheduled backup...');

      const result = await backupService.createFullSiteBackup(this.systemUserId, 'automatic');

      // Update last_backup timestamp in settings
      await db.query(
        `UPDATE backup_settings SET last_backup = NOW() WHERE id = (SELECT id FROM backup_settings ORDER BY updated_at DESC LIMIT 1)`
      );

      console.log(`[BACKUP SCHEDULER] Backup completed: ${result.filename} (${result.size} bytes)`);
    } catch (error) {
      console.error('[BACKUP SCHEDULER] Error executing backup:', error);
    }
  }

  /**
   * Stop a specific job
   * @param {string} jobName - Name of the job to stop
   */
  stop(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      this.jobs.delete(jobName);
      console.log(`[BACKUP SCHEDULER] Stopped job: ${jobName}`);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    for (const [jobName, job] of this.jobs) {
      job.stop();
      console.log(`[BACKUP SCHEDULER] Stopped job: ${jobName}`);
    }
    this.jobs.clear();
  }

  /**
   * Get current scheduler status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      activeJobs: Array.from(this.jobs.keys()),
      jobCount: this.jobs.size,
      systemUserId: this.systemUserId
    };
  }
}

module.exports = new BackupScheduler();
