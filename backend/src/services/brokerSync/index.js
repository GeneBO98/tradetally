/**
 * Broker Sync Service - Main Orchestrator
 * Coordinates syncing trades from connected brokers
 */

const BrokerConnection = require('../../models/BrokerConnection');
const db = require('../../config/database');
const AnalyticsCache = require('../analyticsCache');
const cache = require('../../utils/cache');
const ibkrService = require('./ibkrService');
const schwabService = require('./schwabService');
const bitunixService = require('./bitunixService');

// Helper function to invalidate in-memory analytics cache for a user
function invalidateInMemoryCache(userId) {
  const cacheKeys = Object.keys(cache.data || {}).filter(key =>
    key.startsWith(`analytics:user_${userId}:`)
  );
  cacheKeys.forEach(key => cache.del(key));
}

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

        case 'bitunix':
          result = await bitunixService.syncTrades(connection, {
            startDate,
            endDate,
            syncLogId: syncLog.id
          });
          break;

        default:
          throw new Error(`Unknown broker type: ${connection.brokerType}`);
      }

      // Auto-close expired options after importing broker data
      const expiredClosed = await this.closeExpiredOptions(connection.userId);
      result.expiredClosed = expiredClosed;
      const syncedTradeCount = (result.imported || 0) + (result.updated || 0) + expiredClosed;

      // Update sync log with results
      await BrokerConnection.updateSyncLog(syncLog.id, 'completed', {
        tradesImported: syncedTradeCount,
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
        syncedTradeCount,
        result.skipped,
        nextSync
      );

      console.log(`[BROKER-SYNC] Sync completed: ${result.imported || 0} imported, ${result.updated || 0} updated, ${result.duplicates || 0} duplicates, ${expiredClosed} expired options closed`);

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

      case 'bitunix':
        return bitunixService.validateCredentials(
          credentials.apiKey,
          credentials.apiSecret,
          credentials.marginCoin
        );

      default:
        return { valid: false, message: `Unknown broker type: ${brokerType}` };
    }
  }

  /**
   * Auto-close open option positions where the expiration date has passed.
   * If no exercise/assignment transaction was received from the broker, the option expired worthless.
   * Closes them with exit_price = 0 and calculates final P&L.
   * This is broker-agnostic and runs after every sync.
   */
  async closeExpiredOptions(userId) {
    let closed = 0;

    try {
      const findQuery = `
        SELECT id, symbol, side, quantity, entry_price, commission, fees, expiration_date,
               contract_size, executions
        FROM trades
        WHERE user_id = $1
          AND instrument_type = 'option'
          AND expiration_date IS NOT NULL
          AND expiration_date < CURRENT_DATE
          AND exit_price IS NULL
          AND exit_time IS NULL
      `;
      const result = await db.query(findQuery, [userId]);

      if (result.rows.length === 0) {
        return 0;
      }

      console.log(`[BROKER-SYNC] Found ${result.rows.length} expired option(s) to auto-close`);

      const now = new Date();

      for (const trade of result.rows) {
        try {
          const expDate = trade.expiration_date instanceof Date
            ? trade.expiration_date.toISOString().split('T')[0]
            : String(trade.expiration_date).split('T')[0];
          const exitTime = `${expDate}T16:00:00`;

          // Parse existing executions
          let executions = [];
          if (trade.executions) {
            try {
              executions = typeof trade.executions === 'string'
                ? JSON.parse(trade.executions)
                : trade.executions;
            } catch (e) {
              executions = [];
            }
          }

          // Add expiration execution
          const closingAction = trade.side === 'long' ? 'sell' : 'buy';
          executions.push({
            action: closingAction,
            quantity: parseInt(trade.quantity),
            price: 0,
            datetime: exitTime,
            fees: 0,
            note: 'Option expired worthless (auto-closed by broker sync)'
          });

          const quantity = parseInt(trade.quantity);
          const entryPrice = parseFloat(trade.entry_price);
          const contractSize = trade.contract_size || 100;

          console.log(`[BROKER-SYNC] Auto-closing expired ${trade.side} option: ${trade.symbol} (exp: ${expDate}), ${quantity} contracts @ $${entryPrice}`);

          // Direct SQL UPDATE - avoids Trade.update() complex side effects
          const updateQuery = `
            UPDATE trades
            SET exit_time = $1,
                exit_price = 0,
                pnl = CASE
                  WHEN side = 'long' THEN (0 - entry_price) * quantity * COALESCE(contract_size, 100)
                  WHEN side = 'short' THEN (entry_price - 0) * quantity * COALESCE(contract_size, 100)
                END,
                pnl_percent = CASE
                  WHEN side = 'long' THEN -100.0
                  WHEN side = 'short' THEN 100.0
                END,
                auto_closed = true,
                auto_close_reason = 'Option expired worthless (broker sync)',
                executions = $2::jsonb,
                updated_at = $3
            WHERE id = $4 AND user_id = $5
          `;

          await db.query(updateQuery, [exitTime, JSON.stringify(executions), now, trade.id, userId]);
          closed++;
        } catch (error) {
          console.error(`[BROKER-SYNC] Failed to auto-close expired option ${trade.id}:`, error.message);
        }
      }

      if (closed > 0) {
        console.log(`[BROKER-SYNC] Auto-closed ${closed} expired option(s)`);
        // Invalidate both caches so analytics reflect the closed trades
        await AnalyticsCache.invalidateUserCache(userId);
        invalidateInMemoryCache(userId);
      }
    } catch (error) {
      console.error('[BROKER-SYNC] Error checking for expired options:', error.message);
    }

    return closed;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new BrokerSyncService();
