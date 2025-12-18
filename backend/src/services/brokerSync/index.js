/**
 * Broker Sync Service - Main Orchestrator
 * Coordinates syncing trades from connected brokers
 */

const BrokerConnection = require('../../models/BrokerConnection');
const ibkrService = require('./ibkrService');
const schwabService = require('./schwabService');

class BrokerSyncService {
  /**
   * Sync trades for a specific connection
   * @param {string} connectionId - Connection ID
   * @param {object} options - Sync options
   */
  async syncConnection(connectionId, options = {}) {
    const { syncType = 'manual', startDate, endDate } = options;

    // Get connection with credentials
    const connection = await BrokerConnection.findById(connectionId, true);
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (connection.connectionStatus !== 'active') {
      throw new Error(`Cannot sync: connection status is ${connection.connectionStatus}`);
    }

    // Create sync log
    const syncLog = await BrokerConnection.createSyncLog(
      connectionId,
      connection.userId,
      syncType,
      startDate,
      endDate
    );

    try {
      let result;

      // Route to appropriate broker service
      switch (connection.brokerType) {
        case 'ibkr':
          result = await ibkrService.syncTrades(connection, {
            startDate,
            endDate,
            syncLogId: syncLog.id
          });
          break;

        case 'schwab':
          result = await schwabService.syncTrades(connection, {
            startDate,
            endDate,
            syncLogId: syncLog.id
          });
          break;

        default:
          throw new Error(`Unknown broker type: ${connection.brokerType}`);
      }

      // Update sync log with results
      await BrokerConnection.updateSyncLog(syncLog.id, 'completed', {
        tradesImported: result.imported,
        tradesSkipped: result.skipped,
        tradesFailed: result.failed,
        duplicatesDetected: result.duplicates
      });

      // Update connection status
      const nextSync = connection.autoSyncEnabled && connection.syncFrequency !== 'manual'
        ? BrokerConnection.calculateNextSync(connection.syncFrequency, connection.syncTime)
        : null;

      await BrokerConnection.updateAfterSync(
        connectionId,
        result.imported,
        result.skipped,
        nextSync
      );

      console.log(`[BROKER-SYNC] Sync completed: ${result.imported} imported, ${result.duplicates} duplicates`);

      return {
        success: true,
        syncLogId: syncLog.id,
        ...result
      };
    } catch (error) {
      console.error(`[BROKER-SYNC] Sync failed:`, error.message);

      // Update sync log with error
      await BrokerConnection.updateSyncLog(syncLog.id, 'failed', {
        errorMessage: error.message
      });

      // Update connection failure status
      await BrokerConnection.updateAfterFailure(connectionId, error.message);

      return {
        success: false,
        syncLogId: syncLog.id,
        error: error.message
      };
    }
  }

  /**
   * Process all connections due for scheduled sync
   */
  async processScheduledSyncs() {
    console.log('[BROKER-SYNC] Processing scheduled syncs...');

    const dueConnections = await BrokerConnection.findDueForSync();
    console.log(`[BROKER-SYNC] Found ${dueConnections.length} connections due for sync`);

    const results = [];

    for (const connection of dueConnections) {
      try {
        console.log(`[BROKER-SYNC] Processing scheduled sync for connection ${connection.id}`);

        const result = await this.syncConnection(connection.id, {
          syncType: 'scheduled'
        });

        results.push({
          connectionId: connection.id,
          brokerType: connection.brokerType,
          ...result
        });

        // Small delay between syncs to avoid rate limiting
        await this.sleep(2000);
      } catch (error) {
        console.error(`[BROKER-SYNC] Scheduled sync failed for ${connection.id}:`, error.message);
        results.push({
          connectionId: connection.id,
          brokerType: connection.brokerType,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Validate credentials for a broker connection
   */
  async validateCredentials(brokerType, credentials) {
    switch (brokerType) {
      case 'ibkr':
        return ibkrService.validateCredentials(
          credentials.flexToken,
          credentials.flexQueryId
        );

      case 'schwab':
        return schwabService.validateConfig();

      default:
        return { valid: false, message: `Unknown broker type: ${brokerType}` };
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new BrokerSyncService();
