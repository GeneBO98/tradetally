const PlaidConnection = require('../../models/PlaidConnection');
const plaidFundingService = require('./plaidFundingService');

const SCHEDULER_INTERVAL = 15 * 60 * 1000;
const MAX_CONCURRENT_SYNCS = 3;

class PlaidFundingScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
  }

  async processDueSyncs() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      const dueConnections = await PlaidConnection.findDueForSync();
      if (dueConnections.length === 0) {
        return;
      }

      const queue = [...dueConnections];
      while (queue.length > 0) {
        const batch = queue.splice(0, MAX_CONCURRENT_SYNCS);
        await Promise.allSettled(
          batch.map(connection => plaidFundingService.syncConnection(connection.id))
        );
      }
    } catch (error) {
      console.error('[PLAID-SCHEDULER] Error processing scheduled syncs:', error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    console.log('[PLAID-SCHEDULER] Starting Plaid funding scheduler...');

    this.processDueSyncs().catch(error => {
      console.error('[PLAID-SCHEDULER] Initial run failed:', error);
    });

    this.interval = setInterval(() => {
      this.processDueSyncs().catch(error => {
        console.error('[PLAID-SCHEDULER] Scheduled run failed:', error);
      });
    }, SCHEDULER_INTERVAL);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

module.exports = new PlaidFundingScheduler();
