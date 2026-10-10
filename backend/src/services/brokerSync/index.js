/**
 * Broker Sync Service - Main Orchestrator
 * Coordinates syncing trades from connected brokers
 */

const BrokerConnection = require('../../models/BrokerConnection');
const db = require('../../config/database');
const AnalyticsCache = require('../analyticsCache');
const OptionStrategyGroupingService = require('../optionStrategyGroupingService');
const ibkrService = require('./ibkrService');
const schwabService = require('./schwabService');
const tradestationService = require('./tradestationService');
const alpacaService = require('./alpacaService');
const webullService = require('./webullService');
const trading212Service = require('./trading212Service');
const tradovateService = require('./tradovateService');
const { getUserTimezone } = require('../../utils/timezone');
const { publishInBackground } = require('../../events/domainEvents');

const IBKR_BACKFILL_RETRY_LIMIT = 3;
const IBKR_BACKFILL_RETRY_DELAY_MINUTES = 60;

class BrokerSyncService {
  /**
   * Sync trades for a specific connection
   * @param {string} connectionId - Connection ID
   * @param {object} options - Sync options
   */
  async syncConnection(connectionId, options = {}) {
    const lock = await BrokerConnection.acquireSyncLock(connectionId);
    if (!lock) {
      console.log(`[BROKER-SYNC] Connection sync already running for ${connectionId}; skipping duplicate request`);
      return {
        success: false,
        skipped: true,
        reason: 'sync_already_running',
        imported: 0,
        duplicates: 0
      };
    }

    try {
      return await this.syncConnectionUnlocked(connectionId, options);
    } finally {
      try {
        await lock.release();
      } catch (error) {
        console.error(`[BROKER-SYNC] Failed to release sync lock for ${connectionId}:`, error.message);
      }
    }
  }

  async syncConnectionUnlocked(connectionId, options = {}) {
    const { syncType = 'manual', endDate, referenceCode } = options;
    let { startDate } = options;

    // Get connection with credentials
    const connection = await BrokerConnection.findById(connectionId, true);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Broker sync is a Pro feature. This is the single funnel for every sync
    // path (manual, scheduled, retry), so gating here covers them all.
    // - Scheduled syncs for a gated free user are skipped cleanly: no sync log,
    //   no failure counter, so the connection isn't marked 'error' and the
    //   scheduler simply resumes automatically if the user upgrades.
    // - Manual syncs throw (the controller already returns a 403 before this,
    //   so this is defense-in-depth).
    const TierService = require('../tierService');
    const syncAccess = await TierService.canSyncBrokerConnection(connection.userId);
    if (!syncAccess.allowed) {
      if (['scheduled', 'ibkr_timeout_retry'].includes(syncType)) {
        console.log(`[BROKER-SYNC] Skipping scheduled sync for connection ${connectionId}: broker sync is Pro-only for this free user`);
        return { success: false, skippedForTier: true, reason: 'tier_pro_required', imported: 0, duplicates: 0 };
      }
      const tierError = new Error(syncAccess.message);
      tierError.code = syncAccess.code;
      throw tierError;
    }

    if (connection.connectionStatus !== 'active') {
      throw new Error(`Cannot sync: connection status is ${connection.connectionStatus}`);
    }

    // Apply the connection's configured sync floor when the caller didn't pass
    // an explicit startDate. This makes scheduled syncs respect the user's
    // chosen lookback window (e.g. "this year only") without re-specifying it
    // each time. An ad-hoc manual sync can still override by passing startDate.
    if (!startDate && connection.syncStartDate) {
      const floor = connection.syncStartDate instanceof Date
        ? connection.syncStartDate.toISOString().slice(0, 10)
        : String(connection.syncStartDate).slice(0, 10);
      startDate = floor;
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
            syncLogId: syncLog.id,
            syncType,
            referenceCode
          });
          break;

        case 'schwab':
          result = await schwabService.syncTrades(connection, {
            startDate,
            endDate,
            syncLogId: syncLog.id
          });
          break;

        case 'tradestation':
          result = await tradestationService.syncTrades(connection, {
            startDate,
            endDate,
            syncLogId: syncLog.id
          });
          break;

        case 'alpaca':
          result = await alpacaService.syncTrades(connection, {
            startDate,
            endDate,
            syncLogId: syncLog.id
          });
          break;

        case 'webull':
          result = await webullService.syncTrades(connection, {
            startDate,
            endDate,
            syncLogId: syncLog.id
          });
          break;

        case 'trading212':
          result = await trading212Service.syncTrades(connection, {
            startDate,
            endDate,
            syncLogId: syncLog.id
          });
          break;

        case 'tradovate':
          result = await tradovateService.syncTrades(connection, {
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

      // Update sync log with results
      await BrokerConnection.updateSyncLog(syncLog.id, 'completed', {
        tradesImported: result.imported + expiredClosed,
        tradesSkipped: result.skipped,
        tradesFailed: result.failed,
        duplicatesDetected: result.duplicates,
        syncDetails: {
          warnings: result.warnings || [],
          warning_details: result.warningDetails || [],
          outcome: result.outcome || ((result.warnings || []).length > 0 ? 'warning' : 'success'),
          report_formats: result.reportFormats || [],
          windows_requested: result.windowsRequested || 0,
          windows_completed: result.windowsCompleted || 0,
          requested_ranges: result.requestedRanges || [],
          returned_ranges: result.returnedRanges || [],
          reports_retrieved: result.reportsRetrieved || 0,
          latest_window_retrieved: result.latestWindowRetrieved !== false,
          latest_retrieved_end_date: result.latestRetrievedEndDate || null,
          trade_rows: result.tradeRows || 0,
          excluded_trade_count: result.excluded || 0,
          open_position_rows: result.openPositionRows || 0,
          open_positions_parsed: result.openPositionsParsed || 0,
          manual_review_count: result.manualReviewCount || 0,
          manual_review_items: result.manualReviewItems || [],
          retryable_window: result.retryableWindow || null,
          retry_error_code: result.retryableErrorCode || null
        }
      });

      // Update connection status
      let nextSync = null;
      if (connection.autoSyncEnabled && connection.syncFrequency !== 'manual') {
        const userTimezone = await getUserTimezone(connection.userId);
        nextSync = BrokerConnection.calculateNextSync(
          connection.syncFrequency,
          connection.syncTime,
          userTimezone
        );
      }

      const latestReportRetrieved = connection.brokerType !== 'ibkr' || result.latestWindowRetrieved !== false;
      await BrokerConnection.updateAfterSync(
        connectionId,
        result.imported + expiredClosed,
        result.skipped,
        nextSync,
        { advanceLastSync: latestReportRetrieved }
      );

      let retryStopped = false;
      if (connection.brokerType === 'ibkr' && result.retryableWindow) {
        const retriesConsumed = syncType === 'ibkr_timeout_retry'
          ? Number(connection.ibkrBackfillRetry?.retry_count || 0) + 1
          : 0;

        if (retriesConsumed >= IBKR_BACKFILL_RETRY_LIMIT) {
          const message = `IBKR backfill stopped after ${IBKR_BACKFILL_RETRY_LIMIT} hourly retries. The last unfinished range was ${result.retryableWindow.start_date} through ${result.retryableWindow.end_date}.`;
          await BrokerConnection.stopIBKRBackfillRetry(connectionId, message);
          await BrokerConnection.updateSyncLog(syncLog.id, 'failed', {
            errorMessage: message,
            errorDetails: {
              errorCode: result.retryableErrorCode || 'TIMEOUT',
              retryAttempts: IBKR_BACKFILL_RETRY_LIMIT,
              window: result.retryableWindow,
              transient: false,
              timestamp: new Date().toISOString()
            }
          });
          result.warnings = [...(result.warnings || []), message];
          result.warningDetails = [...(result.warningDetails || []), {
            code: 'IBKR_BACKFILL_RETRY_EXHAUSTED',
            message,
            window_start: result.retryableWindow.start_date,
            window_end: result.retryableWindow.end_date
          }];
          result.outcome = 'failed';
          retryStopped = true;
          console.warn(`[BROKER-SYNC] ${message}`);
        } else {
          await BrokerConnection.scheduleIBKRBackfillRetry(connectionId, {
            floor: result.backfillFloor,
            windowStart: result.retryableWindow.start_date,
            windowEnd: result.retryableWindow.end_date,
            retryCount: retriesConsumed,
            errorCode: result.retryableErrorCode,
            referenceCode: result.retryableReferenceCode
          }, IBKR_BACKFILL_RETRY_DELAY_MINUTES);
          result.retryScheduled = true;
          result.retryAttempt = retriesConsumed + 1;
          console.log(`[BROKER-SYNC] Scheduled IBKR backfill retry ${result.retryAttempt} of ${IBKR_BACKFILL_RETRY_LIMIT} for ${connectionId} in one hour`);
        }
      } else if (connection.brokerType === 'ibkr' && connection.ibkrBackfillRetry) {
        await BrokerConnection.clearIBKRBackfillRetry(connectionId);
      }

      if (latestReportRetrieved) {
        console.log(`[BROKER-SYNC] Sync completed: ${result.imported} imported, ${result.duplicates} duplicates, ${expiredClosed} expired options closed`);
      } else {
        console.warn('[BROKER-SYNC] Sync completed with no retrievable IBKR statement; preserving the previous successful-sync cursor');
      }

      publishInBackground('broker_sync.completed', {
        connectionId,
        brokerType: connection.brokerType,
        syncLogId: syncLog.id,
        syncType,
        status: 'completed',
        imported: result.imported + expiredClosed,
        skipped: result.skipped || 0,
        failed: result.failed || 0,
        duplicates: result.duplicates || 0,
        warnings: result.warnings || []
      }, { source: 'brokerSync', userId: connection.userId });

      return {
        success: !retryStopped,
        syncLogId: syncLog.id,
        ...result
      };
    } catch (error) {
      if (error.errorCode === 'IBKR_OPERATION_IN_PROGRESS') {
        await BrokerConnection.updateSyncLog(syncLog.id, 'failed', {
          errorMessage: error.message,
          errorDetails: {
            errorCode: error.errorCode,
            transient: true,
            timestamp: new Date().toISOString()
          }
        });
        return {
          success: false,
          skipped: true,
          reason: 'ibkr_token_operation_in_progress',
          syncLogId: syncLog.id,
          error: error.message
        };
      }

      console.error(`[BROKER-SYNC] Sync failed:`, error.message);

      // Capture error code + raw message into error_details for diagnosability.
      // Without this we only have the human-friendly message and can't tell
      // an IBKR 1019 ("statement being generated") from a 1011 ("inactive
      // account") after the fact.
      const errorDetails = {
        errorCode: error.errorCode || null,
        rawMessage: error.rawMessage || null,
        transient: Boolean(error.transient),
        timestamp: new Date().toISOString()
      };

      // Update sync log with error
      await BrokerConnection.updateSyncLog(syncLog.id, 'failed', {
        errorMessage: error.message,
        errorDetails
      });

      // Update connection failure status
      await BrokerConnection.updateAfterFailure(connectionId, error.message);

      // Auto-retry transient failures by bringing next_scheduled_sync
      // forward to 30 min from now. The scheduler will pick it up on its
      // next pass. Only retries when auto-sync is enabled and we haven't
      // already burned through retries (updateAfterFailure caps at 3
      // consecutive failures, after which the connection is marked 'error').
      // Manual retries are not auto-rescheduled — the user is watching the
      // UI and can re-click "Sync Now".
      if (connection.brokerType !== 'ibkr' && error.transient && syncType === 'scheduled') {
        try {
          await BrokerConnection.scheduleTransientRetry(connectionId, 30);
          console.log(`[BROKER-SYNC] Scheduled transient-failure retry for ${connectionId} in 30 min`);
        } catch (retryErr) {
          console.error(`[BROKER-SYNC] Failed to schedule retry: ${retryErr.message}`);
        }
      }

      publishInBackground('broker_sync.completed', {
        connectionId,
        brokerType: connection.brokerType,
        syncLogId: syncLog.id,
        syncType,
        status: 'failed',
        error: error.message
      }, { source: 'brokerSync', userId: connection.userId });

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

      case 'tradestation':
        return {
          valid: tradestationService.isConfigured(),
          message: tradestationService.isConfigured() ? 'TradeStation OAuth is configured' : 'TradeStation OAuth is not configured'
        };

      case 'alpaca':
        return {
          valid: alpacaService.isConfigured(),
          message: alpacaService.isConfigured() ? 'Alpaca OAuth is configured' : 'Alpaca OAuth is not configured'
        };

      case 'tradovate':
        return {
          valid: tradovateService.isConfigured(),
          message: tradovateService.isConfigured() ? 'Tradovate OAuth is configured' : 'Tradovate OAuth is not configured'
        };

      case 'webull':
        return {
          valid: webullService.isConfigured(),
          message: webullService.isConfigured() ? 'Webull OAuth is configured' : 'Webull OAuth is not configured'
        };

      case 'trading212':
        return trading212Service.validateCredentials(
          credentials.apiKey,
          credentials.apiSecret,
          credentials.environment
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
        await OptionStrategyGroupingService.rebuildUserGroupsSafe(userId, 'expired option auto-close');
        await AnalyticsCache.invalidate(userId);
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
