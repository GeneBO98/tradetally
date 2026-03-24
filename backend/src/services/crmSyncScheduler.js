const cron = require('node-cron');
const twentySyncService = require('./twentySyncService');
const invoiceNinjaSyncService = require('./invoiceNinjaSyncService');

/**
 * CRM Sync Scheduler
 * Periodically syncs TradeTally user/billing data to Twenty CRM and Invoice Ninja.
 * Controlled by ENABLE_CRM_SYNC env var and CRM_SYNC_CRON for interval.
 */
class CrmSyncScheduler {
  constructor() {
    this.job = null;
    this.running = false;
  }

  /**
   * Initialize both sync services and start the cron job
   */
  start() {
    const twentyReady = twentySyncService.initialize();
    const ninjaReady = invoiceNinjaSyncService.initialize();

    if (!twentyReady && !ninjaReady) {
      console.log('[CRM SYNC] No integrations configured - scheduler not started');
      return false;
    }

    const cronExpression = process.env.CRM_SYNC_CRON || '0 */6 * * *';

    if (!cron.validate(cronExpression)) {
      console.error(`[CRM SYNC] Invalid cron expression: ${cronExpression}`);
      return false;
    }

    this.job = cron.schedule(cronExpression, () => this.runSync(), {
      scheduled: true,
      timezone: process.env.TZ || 'UTC',
    });

    console.log(`[CRM SYNC] Scheduler started (cron: ${cronExpression})`);

    // Run initial sync 30 seconds after startup to let everything settle
    setTimeout(() => this.runSync(), 30000);

    return true;
  }

  /**
   * Run a full sync cycle
   */
  async runSync() {
    if (this.running) {
      console.log('[CRM SYNC] Sync already in progress, skipping');
      return;
    }

    this.running = true;
    const startTime = Date.now();
    console.log('[CRM SYNC] Starting sync cycle...');

    const results = {
      twenty: { synced: 0, errors: 0 },
      invoiceNinja: { synced: 0, errors: 0 },
    };

    try {
      results.twenty = await twentySyncService.syncAll();
    } catch (error) {
      console.error('[CRM SYNC] Twenty sync failed:', error.message);
      results.twenty.errors = -1;
    }

    try {
      results.invoiceNinja = await invoiceNinjaSyncService.syncAll();
    } catch (error) {
      console.error('[CRM SYNC] Invoice Ninja sync failed:', error.message);
      results.invoiceNinja.errors = -1;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[CRM SYNC] Cycle complete in ${duration}s:`,
      `Twenty(${results.twenty.synced}/${results.twenty.errors})`,
      `InvoiceNinja(${results.invoiceNinja.synced}/${results.invoiceNinja.errors})`
    );

    this.running = false;
    return results;
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('[CRM SYNC] Scheduler stopped');
    }
  }

  /**
   * Sync a single user to both systems (call after signup, subscription change, etc.)
   */
  async syncUser(userId) {
    const results = {};

    try {
      results.twenty = await twentySyncService.syncUser(userId);
    } catch (error) {
      console.error(`[CRM SYNC] Twenty single-user sync failed for ${userId}:`, error.message);
    }

    try {
      results.invoiceNinja = await invoiceNinjaSyncService.syncUser(userId);
    } catch (error) {
      console.error(`[CRM SYNC] Invoice Ninja single-user sync failed for ${userId}:`, error.message);
    }

    return results;
  }
}

module.exports = new CrmSyncScheduler();
