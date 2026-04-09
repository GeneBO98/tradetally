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
    this.initialized = false;
    this.integrationStatus = {
      twenty: false,
      invoiceNinja: false,
    };
  }

  ensureServicesInitialized() {
    if (this.initialized) {
      return this.integrationStatus;
    }

    this.integrationStatus = {
      twenty: twentySyncService.initialize(),
      invoiceNinja: invoiceNinjaSyncService.initialize(),
    };
    this.initialized = true;
    return this.integrationStatus;
  }

  normalizeTargets(targets) {
    const allowedTargets = new Set(['twenty', 'invoiceNinja']);
    const normalized = Array.isArray(targets) && targets.length > 0
      ? [...new Set(targets.filter((target) => allowedTargets.has(target)))]
      : ['twenty', 'invoiceNinja'];

    return normalized.length > 0 ? normalized : ['twenty', 'invoiceNinja'];
  }

  getStatus() {
    const integrations = this.ensureServicesInitialized();

    return {
      schedulerRunning: Boolean(this.job),
      syncInProgress: this.running,
      cronExpression: process.env.CRM_SYNC_CRON || '0 */6 * * *',
      integrations,
    };
  }

  /**
   * Initialize both sync services and start the cron job
   */
  start() {
    const { twenty: twentyReady, invoiceNinja: ninjaReady } = this.ensureServicesInitialized();

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
  async syncAll({ targets } = {}) {
    const integrations = this.ensureServicesInitialized();
    const normalizedTargets = this.normalizeTargets(targets);

    if (this.running) {
      return {
        skipped: true,
        reason: 'sync_in_progress',
        targets: normalizedTargets,
      };
    }

    this.running = true;
    const startTime = Date.now();
    console.log(`[CRM SYNC] Starting sync cycle for targets: ${normalizedTargets.join(', ')}`);

    const results = {
      twenty: {
        enabled: integrations.twenty,
        synced: 0,
        errors: 0,
        skipped: !normalizedTargets.includes('twenty') || !integrations.twenty,
      },
      invoiceNinja: {
        enabled: integrations.invoiceNinja,
        synced: 0,
        errors: 0,
        skipped: !normalizedTargets.includes('invoiceNinja') || !integrations.invoiceNinja,
      },
    };

    try {
      if (normalizedTargets.includes('twenty') && integrations.twenty) {
        results.twenty = {
          enabled: true,
          skipped: false,
          ...(await twentySyncService.syncAll()),
        };
      }
    } catch (error) {
      console.error('[CRM SYNC] Twenty sync failed:', error.message);
      results.twenty = { enabled: true, synced: 0, errors: -1, skipped: false };
    }

    try {
      if (normalizedTargets.includes('invoiceNinja') && integrations.invoiceNinja) {
        results.invoiceNinja = {
          enabled: true,
          skipped: false,
          ...(await invoiceNinjaSyncService.syncAll()),
        };
      }
    } catch (error) {
      console.error('[CRM SYNC] Invoice Ninja sync failed:', error.message);
      results.invoiceNinja = { enabled: true, synced: 0, errors: -1, skipped: false };
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[CRM SYNC] Cycle complete in ${duration}s:`,
      `Twenty(${results.twenty.synced}/${results.twenty.errors})`,
      `InvoiceNinja(${results.invoiceNinja.synced}/${results.invoiceNinja.errors})`
    );

    this.running = false;
    return results;
  }

  async runSync() {
    return this.syncAll();
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
  async syncUser(userId, { targets } = {}) {
    const integrations = this.ensureServicesInitialized();
    const normalizedTargets = this.normalizeTargets(targets);
    const results = {};

    if (normalizedTargets.includes('twenty')) {
      if (!integrations.twenty) {
        results.twenty = { enabled: false, skipped: true, found: false, result: null };
      } else {
        try {
          const result = await twentySyncService.syncUser(userId);
          results.twenty = { enabled: true, skipped: false, found: result !== null, result };
        } catch (error) {
          console.error(`[CRM SYNC] Twenty single-user sync failed for ${userId}:`, error.message);
          results.twenty = { enabled: true, skipped: false, found: true, error: error.message, result: null };
        }
      }
    }

    if (normalizedTargets.includes('invoiceNinja')) {
      if (!integrations.invoiceNinja) {
        results.invoiceNinja = { enabled: false, skipped: true, found: false, result: null };
      } else {
        try {
          const result = await invoiceNinjaSyncService.syncUser(userId);
          results.invoiceNinja = { enabled: true, skipped: false, found: result !== null, result };
        } catch (error) {
          console.error(`[CRM SYNC] Invoice Ninja single-user sync failed for ${userId}:`, error.message);
          results.invoiceNinja = { enabled: true, skipped: false, found: true, error: error.message, result: null };
        }
      }
    }

    return results;
  }
}

module.exports = new CrmSyncScheduler();
