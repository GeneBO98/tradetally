const IntervalScheduler = require('./schedulers/IntervalScheduler');
const WebMentionFetcherService = require('./webMentionFetcherService');
const WebMentionService = require('./webMentionService');

const CHECK_INTERVAL = parseInt(process.env.WEB_MENTION_CHECK_INTERVAL_MS || String(60 * 60 * 1000), 10);

class WebMentionScheduler extends IntervalScheduler {
  constructor() {
    super({
      intervalMs: CHECK_INTERVAL,
      guardRestart: true,
      messages: {
        startLogs: ['[WEB-MENTIONS] Starting scheduler'],
        skip: '[WEB-MENTIONS] Previous scheduler run still in progress, skipping',
        runError: '[WEB-MENTIONS] Scheduler error:',
        initialError: '[WEB-MENTIONS] Initial run failed:',
        scheduledError: '[WEB-MENTIONS] Scheduled run failed:'
      }
    });
  }

  async processMentions() {
    return this.runGuarded();
  }

  async execute() {
    console.log('[WEB-MENTIONS] Starting scheduled mention fetch and evaluation');
    const fetchSummary = await WebMentionFetcherService.fetchDueSources();
    const ruleSummary = await WebMentionService.evaluateRules();
    await WebMentionService.cleanupRetention();
    this.lastRunDate = new Date().toISOString();
    console.log(`[WEB-MENTIONS] Complete - sources: ${fetchSummary.sources}, inserted: ${fetchSummary.inserted}, rules: ${ruleSummary.rules}, alerts: ${ruleSummary.alerted}`);
    return { fetchSummary, ruleSummary };
  }
}

module.exports = new WebMentionScheduler();
