/**
 * BrokerConnection Model
 * Manages broker API connections for automated trade syncing
 */

const db = require('../config/database');
const encryptionService = require('../services/brokerSync/encryptionService');

class BrokerConnection {
  /**
   * Create a new broker connection
   */
  static async create(userId, connectionData) {
    const {
      brokerType,
      ibkrFlexToken,
      ibkrFlexQueryId,
      schwabAccessToken,
      schwabRefreshToken,
      schwabTokenExpiresAt,
      schwabAccountId,
      autoSyncEnabled = false,
      syncFrequency = 'daily',
      syncTime = '06:00:00'
    } = connectionData;

    // Encrypt sensitive credentials
    const encryptedIbkrToken = ibkrFlexToken ? encryptionService.encrypt(ibkrFlexToken) : null;
    const encryptedSchwabAccess = schwabAccessToken ? encryptionService.encrypt(schwabAccessToken) : null;
    const encryptedSchwabRefresh = schwabRefreshToken ? encryptionService.encrypt(schwabRefreshToken) : null;

    const query = `
      INSERT INTO broker_connections (
        user_id, broker_type, connection_status,
        ibkr_flex_token, ibkr_flex_query_id,
        schwab_access_token, schwab_refresh_token, schwab_token_expires_at, schwab_account_id,
        auto_sync_enabled, sync_frequency, sync_time
      )
      VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (user_id, broker_type) DO UPDATE SET
        ibkr_flex_token = EXCLUDED.ibkr_flex_token,
        ibkr_flex_query_id = EXCLUDED.ibkr_flex_query_id,
        schwab_access_token = EXCLUDED.schwab_access_token,
        schwab_refresh_token = EXCLUDED.schwab_refresh_token,
        schwab_token_expires_at = EXCLUDED.schwab_token_expires_at,
        schwab_account_id = EXCLUDED.schwab_account_id,
        auto_sync_enabled = EXCLUDED.auto_sync_enabled,
        sync_frequency = EXCLUDED.sync_frequency,
        sync_time = EXCLUDED.sync_time,
        connection_status = 'pending',
        consecutive_failures = 0,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await db.query(query, [
      userId,
      brokerType,
      encryptedIbkrToken,
      ibkrFlexQueryId,
      encryptedSchwabAccess,
      encryptedSchwabRefresh,
      schwabTokenExpiresAt,
      schwabAccountId,
      autoSyncEnabled,
      syncFrequency,
      syncTime
    ]);

    return this.formatConnection(result.rows[0], false);
  }

  /**
   * Find connection by ID
   */
  static async findById(connectionId, includeCredentials = false) {
    const query = `
      SELECT * FROM broker_connections WHERE id = $1
    `;

    const result = await db.query(query, [connectionId]);
    if (result.rows.length === 0) return null;

    return this.formatConnection(result.rows[0], includeCredentials);
  }

  /**
   * Find connection by user and broker type
   */
  static async findByUserAndBroker(userId, brokerType, includeCredentials = false) {
    const query = `
      SELECT * FROM broker_connections
      WHERE user_id = $1 AND broker_type = $2
    `;

    const result = await db.query(query, [userId, brokerType]);
    if (result.rows.length === 0) return null;

    return this.formatConnection(result.rows[0], includeCredentials);
  }

  /**
   * Find all connections for a user
   */
  static async findByUserId(userId) {
    const query = `
      SELECT * FROM broker_connections
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, [userId]);
    return result.rows.map(row => this.formatConnection(row, false));
  }

  /**
   * Find all connections due for sync
   */
  static async findDueForSync() {
    const query = `
      SELECT * FROM broker_connections
      WHERE auto_sync_enabled = true
        AND connection_status = 'active'
        AND (next_scheduled_sync IS NULL OR next_scheduled_sync <= NOW())
        AND consecutive_failures < 3
      ORDER BY next_scheduled_sync ASC NULLS FIRST
    `;

    const result = await db.query(query);
    return result.rows.map(row => this.formatConnection(row, true));
  }

  /**
   * Update connection status
   */
  static async updateStatus(connectionId, status, message = null) {
    const query = `
      UPDATE broker_connections
      SET connection_status = $2,
          last_sync_message = COALESCE($3, last_sync_message),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [connectionId, status, message]);
    if (result.rows.length === 0) return null;

    return this.formatConnection(result.rows[0], false);
  }

  /**
   * Update connection after successful sync
   */
  static async updateAfterSync(connectionId, tradesImported, tradesSkipped, nextSync = null) {
    const query = `
      UPDATE broker_connections
      SET connection_status = 'active',
          last_sync_at = CURRENT_TIMESTAMP,
          last_sync_status = 'success',
          last_sync_trades_imported = $2,
          last_sync_trades_skipped = $3,
          next_scheduled_sync = $4,
          consecutive_failures = 0,
          last_error_at = NULL,
          last_error_message = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [connectionId, tradesImported, tradesSkipped, nextSync]);
    if (result.rows.length === 0) return null;

    return this.formatConnection(result.rows[0], false);
  }

  /**
   * Update connection after failed sync
   */
  static async updateAfterFailure(connectionId, errorMessage) {
    const query = `
      UPDATE broker_connections
      SET last_sync_status = 'failed',
          last_error_at = CURRENT_TIMESTAMP,
          last_error_message = $2,
          consecutive_failures = consecutive_failures + 1,
          connection_status = CASE
            WHEN consecutive_failures >= 2 THEN 'error'
            ELSE connection_status
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [connectionId, errorMessage]);
    if (result.rows.length === 0) return null;

    return this.formatConnection(result.rows[0], false);
  }

  /**
   * Update connection settings
   */
  static async update(connectionId, updates) {
    const allowedFields = ['auto_sync_enabled', 'sync_frequency', 'sync_time'];
    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) return null;

    values.push(connectionId);

    const query = `
      UPDATE broker_connections
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    if (result.rows.length === 0) return null;

    return this.formatConnection(result.rows[0], false);
  }

  /**
   * Update Schwab OAuth tokens
   */
  static async updateSchwabTokens(connectionId, accessToken, refreshToken, expiresAt) {
    const encryptedAccess = encryptionService.encrypt(accessToken);
    const encryptedRefresh = encryptionService.encrypt(refreshToken);

    const query = `
      UPDATE broker_connections
      SET schwab_access_token = $2,
          schwab_refresh_token = $3,
          schwab_token_expires_at = $4,
          connection_status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [connectionId, encryptedAccess, encryptedRefresh, expiresAt]);
    if (result.rows.length === 0) return null;

    return this.formatConnection(result.rows[0], false);
  }

  /**
   * Delete connection
   */
  static async delete(connectionId) {
    const query = `
      DELETE FROM broker_connections
      WHERE id = $1
      RETURNING id
    `;

    const result = await db.query(query, [connectionId]);
    return result.rows.length > 0;
  }

  /**
   * Delete connection by user and broker type
   */
  static async deleteByUserAndBroker(userId, brokerType) {
    const query = `
      DELETE FROM broker_connections
      WHERE user_id = $1 AND broker_type = $2
      RETURNING id
    `;

    const result = await db.query(query, [userId, brokerType]);
    return result.rows.length > 0;
  }

  /**
   * Calculate next scheduled sync time based on frequency
   * Supported frequencies: manual, hourly, every_4_hours, every_6_hours, every_12_hours, daily
   */
  static calculateNextSync(syncFrequency, syncTime) {
    if (syncFrequency === 'manual') return null;

    const now = new Date();

    // For interval-based frequencies, calculate next sync from now
    switch (syncFrequency) {
      case 'hourly': {
        const next = new Date(now);
        next.setHours(next.getHours() + 1);
        next.setMinutes(0, 0, 0);
        return next;
      }
      case 'every_4_hours': {
        const next = new Date(now);
        const currentHour = next.getHours();
        const nextSlot = Math.ceil((currentHour + 1) / 4) * 4;
        next.setHours(nextSlot, 0, 0, 0);
        if (next <= now) {
          next.setHours(next.getHours() + 4);
        }
        return next;
      }
      case 'every_6_hours': {
        const next = new Date(now);
        const currentHour = next.getHours();
        const nextSlot = Math.ceil((currentHour + 1) / 6) * 6;
        next.setHours(nextSlot, 0, 0, 0);
        if (next <= now) {
          next.setHours(next.getHours() + 6);
        }
        return next;
      }
      case 'every_12_hours': {
        const next = new Date(now);
        const currentHour = next.getHours();
        const nextSlot = currentHour < 12 ? 12 : 24;
        next.setHours(nextSlot, 0, 0, 0);
        if (next <= now) {
          next.setHours(next.getHours() + 12);
        }
        return next;
      }
      case 'daily':
      default: {
        // Daily sync at specific time
        const [hours, minutes] = syncTime.split(':').map(Number);
        const next = new Date(now);
        next.setHours(hours, minutes, 0, 0);
        // If the time has passed today, schedule for tomorrow
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        return next;
      }
    }
  }

  /**
   * Format connection for API response
   * Decrypts credentials if includeCredentials is true
   */
  static formatConnection(row, includeCredentials = false) {
    if (!row) return null;

    const connection = {
      id: row.id,
      userId: row.user_id,
      brokerType: row.broker_type,
      connectionStatus: row.connection_status,
      autoSyncEnabled: row.auto_sync_enabled,
      syncFrequency: row.sync_frequency,
      syncTime: row.sync_time,
      lastSyncAt: row.last_sync_at,
      lastSyncStatus: row.last_sync_status,
      lastSyncMessage: row.last_sync_message,
      lastSyncTradesImported: row.last_sync_trades_imported,
      lastSyncTradesSkipped: row.last_sync_trades_skipped,
      nextScheduledSync: row.next_scheduled_sync,
      consecutiveFailures: row.consecutive_failures,
      lastErrorAt: row.last_error_at,
      lastErrorMessage: row.last_error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    // Add broker-specific public fields
    if (row.broker_type === 'ibkr') {
      connection.ibkrFlexQueryId = row.ibkr_flex_query_id;
      // Only include decrypted token if explicitly requested (for sync operations)
      if (includeCredentials && row.ibkr_flex_token) {
        connection.ibkrFlexToken = encryptionService.decrypt(row.ibkr_flex_token);
      }
    } else if (row.broker_type === 'schwab') {
      connection.schwabAccountId = row.schwab_account_id;
      connection.schwabTokenExpiresAt = row.schwab_token_expires_at;
      // Only include decrypted tokens if explicitly requested
      if (includeCredentials) {
        if (row.schwab_access_token) {
          connection.schwabAccessToken = encryptionService.decrypt(row.schwab_access_token);
        }
        if (row.schwab_refresh_token) {
          connection.schwabRefreshToken = encryptionService.decrypt(row.schwab_refresh_token);
        }
      }
    }

    return connection;
  }

  // ==================== Sync Logs ====================

  /**
   * Create sync log entry
   */
  static async createSyncLog(connectionId, userId, syncType, startDate = null, endDate = null) {
    const query = `
      INSERT INTO broker_sync_logs (
        connection_id, user_id, sync_type, status,
        sync_start_date, sync_end_date
      )
      VALUES ($1, $2, $3, 'started', $4, $5)
      RETURNING *
    `;

    const result = await db.query(query, [connectionId, userId, syncType, startDate, endDate]);
    return this.formatSyncLog(result.rows[0]);
  }

  /**
   * Update sync log status
   */
  static async updateSyncLog(logId, status, details = {}) {
    const {
      tradesFetched,
      tradesImported,
      tradesSkipped,
      tradesFailed,
      duplicatesDetected,
      errorMessage,
      errorDetails,
      syncDetails
    } = details;

    // Determine completion status before query to avoid parameter type issues
    const isCompleted = ['completed', 'failed'].includes(status);

    const query = `
      UPDATE broker_sync_logs
      SET status = $2,
          trades_fetched = COALESCE($3, trades_fetched),
          trades_imported = COALESCE($4, trades_imported),
          trades_skipped = COALESCE($5, trades_skipped),
          trades_failed = COALESCE($6, trades_failed),
          duplicates_detected = COALESCE($7, duplicates_detected),
          error_message = $8,
          error_details = COALESCE($9, error_details),
          sync_details = COALESCE($10, sync_details),
          completed_at = CASE WHEN $11 THEN CURRENT_TIMESTAMP ELSE completed_at END,
          duration_ms = CASE WHEN $11
            THEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000
            ELSE duration_ms END
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [
      logId,
      status,
      tradesFetched,
      tradesImported,
      tradesSkipped,
      tradesFailed,
      duplicatesDetected,
      errorMessage,
      errorDetails ? JSON.stringify(errorDetails) : null,
      syncDetails ? JSON.stringify(syncDetails) : null,
      isCompleted
    ]);

    if (result.rows.length === 0) return null;
    return this.formatSyncLog(result.rows[0]);
  }

  /**
   * Get sync logs for a connection
   */
  static async getSyncLogs(connectionId, limit = 20) {
    const query = `
      SELECT * FROM broker_sync_logs
      WHERE connection_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await db.query(query, [connectionId, limit]);
    return result.rows.map(row => this.formatSyncLog(row));
  }

  /**
   * Get sync logs for a user
   */
  static async getSyncLogsByUser(userId, limit = 50) {
    const query = `
      SELECT bsl.*, bc.broker_type
      FROM broker_sync_logs bsl
      JOIN broker_connections bc ON bsl.connection_id = bc.id
      WHERE bsl.user_id = $1
      ORDER BY bsl.created_at DESC
      LIMIT $2
    `;

    const result = await db.query(query, [userId, limit]);
    return result.rows.map(row => ({
      ...this.formatSyncLog(row),
      brokerType: row.broker_type
    }));
  }

  /**
   * Format sync log for API response
   */
  static formatSyncLog(row) {
    if (!row) return null;

    return {
      id: row.id,
      connectionId: row.connection_id,
      userId: row.user_id,
      syncType: row.sync_type,
      status: row.status,
      tradesFetched: row.trades_fetched,
      tradesImported: row.trades_imported,
      tradesSkipped: row.trades_skipped,
      tradesFailed: row.trades_failed,
      duplicatesDetected: row.duplicates_detected,
      syncStartDate: row.sync_start_date,
      syncEndDate: row.sync_end_date,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
      errorDetails: row.error_details,
      syncDetails: row.sync_details,
      createdAt: row.created_at
    };
  }
}

module.exports = BrokerConnection;
