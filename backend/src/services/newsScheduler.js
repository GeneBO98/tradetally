/**
 * News Scheduler
 * Runs periodically to pre-fetch and cache company news for open positions
 *
 * Default schedule: Every hour
 * - Queries all distinct symbols with open trades
 * - Fetches news from Finnhub with rate-limit-respecting delays
 * - Stores results in dashboard_news_cache table
 * - Skips symbols already fetched within the last hour
 */

const IntervalScheduler = require('./schedulers/IntervalScheduler');
const NewsService = require('./newsService');
const pushNotificationService = require('./pushNotificationService');
const SchedulerStatusService = require('./schedulerStatusService');

const CHECK_INTERVAL = 60 * 60 * 1000; // Run every hour
const LOG_PREFIX = '[NEWS-SCHEDULER]';
const SCHEDULER_NAME = 'news';

class NewsScheduler extends IntervalScheduler {
  constructor() {
    super({
      intervalMs: CHECK_INTERVAL,
      useUnref: true,
      messages: {
        startLogs: [
          `${LOG_PREFIX} Starting news scheduler...`,
          `${LOG_PREFIX} Scheduled to run every hour`
        ],
        started: `${LOG_PREFIX} Scheduler started`,
        stopping: `${LOG_PREFIX} Stopping news scheduler...`,
        stopped: `${LOG_PREFIX} Scheduler stopped`,
        skip: `${LOG_PREFIX} Previous run still in progress, skipping...`,
        runError: `${LOG_PREFIX} [ERROR] Scheduler error:`,
        initialError: `${LOG_PREFIX} Initial run failed:`,
        scheduledError: `${LOG_PREFIX} Scheduled run failed:`,
        manualRun: `${LOG_PREFIX} Manual run triggered...`
      }
    });
  }

  /**
   * Process news for all open position symbols
   */
  async processNews() {
    return this.runGuarded();
  }

  async execute() {
    const logPrefix = LOG_PREFIX;
    const startedAt = new Date();
    this.lastAttemptDate = startedAt.toISOString();
    await this.persistDiagnostic('started', startedAt);

    try {
      console.log(`${logPrefix} Starting scheduled news fetch...`);

      const symbols = await NewsService.getAllTrackedSymbols();

      let summary;
      if (symbols.length === 0) {
        console.log(`${logPrefix} No tracked symbols found, skipping news fetch`);
        summary = {
          fetched: 0, skipped: 0, errors: 0, total: 0,
          changedSymbols: [], usersTargeted: 0, usersNotified: 0
        };
      } else {
        console.log(`${logPrefix} Found ${symbols.length} tracked symbols (open positions + watchlists)`);

        summary = await NewsService.fetchAndCacheAll(symbols);

        const changedSymbols = summary.changedSymbols || [];
        if (changedSymbols.length > 0) {
          const userIds = await NewsService.getUserIdsTrackingSymbols(changedSymbols);
          let usersNotified = 0;

          // Keep APNs traffic bounded while still allowing accounts with several
          // devices to refresh promptly.
          for (let index = 0; index < userIds.length; index += 10) {
            const batch = userIds.slice(index, index + 10);
            const results = await Promise.all(
              batch.map(userId => pushNotificationService.sendBackgroundRefresh(userId, 'news_updated'))
            );
            usersNotified += results.filter(result => result.success).length;
          }

          summary.usersTargeted = userIds.length;
          summary.usersNotified = usersNotified;
        } else {
          summary.usersTargeted = 0;
          summary.usersNotified = 0;
        }
      }

      const succeededAt = new Date();
      this.lastRunDate = succeededAt.toISOString();
      this.lastSuccessDate = this.lastRunDate;
      this.lastError = null;
      this.lastSummary = summary;
      await this.persistDiagnostic('success', succeededAt, summary);

      console.log(`${logPrefix} News fetch complete - fetched: ${summary.fetched}, skipped (cached): ${summary.skipped}, errors: ${summary.errors}`);
      return summary;
    } catch (error) {
      const failedAt = new Date();
      this.lastRunDate = failedAt.toISOString();
      this.lastFailureDate = this.lastRunDate;
      this.lastError = error.message;
      await this.persistDiagnostic('failure', failedAt, error);
      throw error;
    }
  }

  async persistDiagnostic(kind, at, detail) {
    try {
      if (kind === 'started') return await SchedulerStatusService.recordStarted(SCHEDULER_NAME, at);
      if (kind === 'success') return await SchedulerStatusService.recordSuccess(SCHEDULER_NAME, detail, at);
      return await SchedulerStatusService.recordFailure(SCHEDULER_NAME, detail, at);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to persist ${kind} diagnostic:`, error.message);
      return null;
    }
  }

  getStatus() {
    return {
      ...super.getStatus(),
      lastAttemptDate: this.lastAttemptDate || null,
      lastSuccessDate: this.lastSuccessDate || null,
      lastFailureDate: this.lastFailureDate || null,
      lastError: this.lastError || null,
      lastSummary: this.lastSummary || null
    };
  }

  async getPersistentStatus() {
    try {
      return {
        ...this.getStatus(),
        persisted: await SchedulerStatusService.get(SCHEDULER_NAME)
      };
    } catch (error) {
      return {
        ...this.getStatus(),
        persisted: null,
        diagnosticStorageError: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new NewsScheduler();
