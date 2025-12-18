/**
 * Broker Sync Scheduler
 * Handles automatic scheduled syncing of broker connections
 *
 * Runs every 15 minutes to check for connections due for sync
 */

const BrokerConnection = require('../../models/BrokerConnection');
const brokerSyncService = require('./index');

const SCHEDULER_INTERVAL = 15 * 60 * 1000; // 15 minutes
const MAX_CONCURRENT_SYNCS = 3;

class BrokerSyncScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.currentSyncs = 0;
  }

  /**
   * Process all connections due for scheduled sync
   */
  async processDueSyncs() {
    if (this.isRunning) {
      console.log('[BROKER-SCHEDULER] Previous run still in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const logPrefix = '[BROKER-SCHEDULER]';

    try {
      console.log(`${logPrefix} Checking for scheduled syncs...`);

      // Find connections due for sync
      const dueConnections = await BrokerConnection.findDueForSync();

      if (dueConnections.length === 0) {
        console.log(`${logPrefix} No connections due for sync`);
        return;
      }

      console.log(`${logPrefix} Found ${dueConnections.length} connections due for sync`);

      // Process syncs with concurrency limit
      const results = [];
      const queue = [...dueConnections];

      while (queue.length > 0) {
        // Process up to MAX_CONCURRENT_SYNCS at a time
        const batch = queue.splice(0, MAX_CONCURRENT_SYNCS);

        const batchResults = await Promise.allSettled(
          batch.map(connection => this.syncConnection(connection))
        );

        // Collect results
        batchResults.forEach((result, index) => {
          const connection = batch[index];
          if (result.status === 'fulfilled') {
            results.push({
              connectionId: connection.id,
              brokerType: connection.brokerType,
              userId: connection.userId,
              success: result.value.success,
              imported: result.value.imported || 0,
              duplicates: result.value.duplicates || 0,
              error: result.value.error
            });
          } else {
            results.push({
              connectionId: connection.id,
              brokerType: connection.brokerType,
              userId: connection.userId,
              success: false,
              error: result.reason?.message || 'Unknown error'
            });
          }
        });

        // Small delay between batches to avoid overwhelming APIs
        if (queue.length > 0) {
          await this.sleep(5000);
        }
      }

      // Log summary
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      const totalImported = results.reduce((sum, r) => sum + (r.imported || 0), 0);

      console.log(`${logPrefix} Scheduled sync batch complete:`);
      console.log(`${logPrefix}   Successful: ${successCount}`);
      console.log(`${logPrefix}   Failed: ${failCount}`);
      console.log(`${logPrefix}   Total trades imported: ${totalImported}`);

      // Log failures for debugging
      results.filter(r => !r.success).forEach(r => {
        console.error(`${logPrefix} Failed sync for ${r.brokerType} connection ${r.connectionId}: ${r.error}`);
      });

    } catch (error) {
      console.error(`${logPrefix} [ERROR] Scheduler error:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync a single connection
   */
  async syncConnection(connection) {
    console.log(`[BROKER-SCHEDULER] Syncing ${connection.brokerType} connection ${connection.id}...`);

    try {
      const result = await brokerSyncService.syncConnection(connection.id, {
        syncType: 'scheduled'
      });

      return result;
    } catch (error) {
      console.error(`[BROKER-SCHEDULER] Sync failed for ${connection.id}:`, error.message);

      // Update connection failure status
      await BrokerConnection.updateAfterFailure(connection.id, error.message);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start the scheduler
   */
  start() {
    console.log('[BROKER-SCHEDULER] Starting broker sync scheduler...');
    console.log(`[BROKER-SCHEDULER] Check interval: ${SCHEDULER_INTERVAL / 60000} minutes`);

    // Run immediately on start
    this.processDueSyncs().catch(error => {
      console.error('[BROKER-SCHEDULER] Initial run failed:', error);
    });

    // Schedule regular runs
    this.interval = setInterval(() => {
      this.processDueSyncs().catch(error => {
        console.error('[BROKER-SCHEDULER] Scheduled run failed:', error);
      });
    }, SCHEDULER_INTERVAL);

    console.log('[BROKER-SCHEDULER] Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    console.log('[BROKER-SCHEDULER] Stopping broker sync scheduler...');

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log('[BROKER-SCHEDULER] Scheduler stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.interval !== null,
      processing: this.isRunning,
      checkIntervalMinutes: SCHEDULER_INTERVAL / 60000,
      maxConcurrentSyncs: MAX_CONCURRENT_SYNCS
    };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
module.exports = new BrokerSyncScheduler();
