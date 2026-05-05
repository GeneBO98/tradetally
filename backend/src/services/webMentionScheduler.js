const WebMentionFetcherService = require('./webMentionFetcherService');
const WebMentionService = require('./webMentionService');

const CHECK_INTERVAL = parseInt(process.env.WEB_MENTION_CHECK_INTERVAL_MS || String(60 * 60 * 1000), 10);

class WebMentionScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.lastRunDate = null;
  }

  async processMentions() {
    if (this.isRunning) {
      console.log('[WEB-MENTIONS] Previous scheduler run still in progress, skipping');
      return;
    }

    this.isRunning = true;
    try {
      console.log('[WEB-MENTIONS] Starting scheduled mention fetch and evaluation');
      const fetchSummary = await WebMentionFetcherService.fetchDueSources();
      const ruleSummary = await WebMentionService.evaluateRules();
      await WebMentionService.cleanupRetention();
      this.lastRunDate = new Date().toISOString();
      console.log(`[WEB-MENTIONS] Complete - sources: ${fetchSummary.sources}, inserted: ${fetchSummary.inserted}, rules: ${ruleSummary.rules}, alerts: ${ruleSummary.alerted}`);
      return { fetchSummary, ruleSummary };
    } catch (error) {
      console.error('[WEB-MENTIONS] Scheduler error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    if (this.interval) return;
    console.log('[WEB-MENTIONS] Starting scheduler');
    this.processMentions().catch(error => {
      console.error('[WEB-MENTIONS] Initial run failed:', error);
    });
    this.interval = setInterval(() => {
      this.processMentions().catch(error => {
        console.error('[WEB-MENTIONS] Scheduled run failed:', error);
      });
    }, CHECK_INTERVAL);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async runNow() {
    return this.processMentions();
  }

  getStatus() {
    return {
      running: this.interval !== null,
      processing: this.isRunning,
      checkIntervalMinutes: CHECK_INTERVAL / 60000,
      lastRunDate: this.lastRunDate
    };
  }
}

module.exports = new WebMentionScheduler();
