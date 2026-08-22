/**
 * BrokerConnection Model
 * Manages broker API connections for automated trade syncing
 */

const db = require('../config/database');
const encryptionService = require('../services/brokerSync/encryptionService');
const { toSnakeCase } = require('../utils/caseConvert');
const { localToUTC } = require('../utils/timezone');

function getZonedDateTimeParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const value = (type) => Number(parts.find(part => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour') === 24 ? 0 : value('hour'),
    minute: value('minute'),
    second: value('second')
  };
}

function addCalendarDays({ year, month, day }, days) {
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate()
  };
}

function formatNaiveDateTime(date, hour, minute, second) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

// pg-types parses PostgreSQL DATE columns via `new Date(y, m, d)` (server-local
// midnight). Letting JSON serialize that Date via toISOString() shifts the
// calendar day backward whenever the server TZ is east of UTC. Normalize to a
// plain YYYY-MM-DD string using local getters so the wire format matches what
// was stored regardless of server timezone.
function toDateOnlyString(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(value).slice(0, 10);
}

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
      trading212ApiKey,
      trading212ApiSecret,
      oauthAccessToken,
      oauthRefreshToken,
      oauthTokenExpiresAt,
      oauthRefreshTokenExpiresAt,
      oauthScopes,
      externalAccountId,
      externalUserId,
      brokerEnvironment,
      brokerMetadata,
      accountLabel = null,
      autoSyncEnabled = false,
      syncFrequency = 'daily',
      syncTime = '06:00:00',
      syncStartDate = null
    } = connectionData;

    // Encrypt sensitive credentials
    const encryptedIbkrToken = ibkrFlexToken ? encryptionService.encrypt(ibkrFlexToken) : null;
    const encryptedSchwabAccess = schwabAccessToken ? encryptionService.encrypt(schwabAccessToken) : null;
    const encryptedSchwabRefresh = schwabRefreshToken ? encryptionService.encrypt(schwabRefreshToken) : null;
    const encryptedTrading212ApiKey = trading212ApiKey ? encryptionService.encrypt(trading212ApiKey) : null;
    const encryptedTrading212ApiSecret = trading212ApiSecret ? encryptionService.encrypt(trading212ApiSecret) : null;
    const encryptedOAuthAccess = oauthAccessToken ? encryptionService.encrypt(oauthAccessToken) : null;
    const encryptedOAuthRefresh = oauthRefreshToken ? encryptionService.encrypt(oauthRefreshToken) : null;

    let query;
    let params;

    if (brokerType === 'ibkr') {
      // IBKR: allow multiple connections (different query IDs)
      // Unique constraint on (user_id, ibkr_flex_query_id) prevents duplicates
      query = `
        INSERT INTO broker_connections (
          user_id, broker_type, connection_status,
          ibkr_flex_token, ibkr_flex_query_id, account_label,
          auto_sync_enabled, sync_frequency, sync_time, sync_start_date
        )
        VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, ibkr_flex_query_id) WHERE broker_type = 'ibkr' AND ibkr_flex_query_id IS NOT NULL DO UPDATE SET
          ibkr_flex_token = EXCLUDED.ibkr_flex_token,
          account_label = EXCLUDED.account_label,
          auto_sync_enabled = EXCLUDED.auto_sync_enabled,
          sync_frequency = EXCLUDED.sync_frequency,
          sync_time = EXCLUDED.sync_time,
          sync_start_date = EXCLUDED.sync_start_date,
          connection_status = 'pending',
          consecutive_failures = 0,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      params = [
        userId, brokerType, encryptedIbkrToken, ibkrFlexQueryId,
        accountLabel, autoSyncEnabled, syncFrequency, syncTime, syncStartDate
      ];
    } else if (brokerType === 'schwab') {
      // Schwab: keep single connection per user (upsert via partial unique index)
      query = `
        INSERT INTO broker_connections (
          user_id, broker_type, connection_status,
          schwab_access_token, schwab_refresh_token, schwab_token_expires_at, schwab_account_id,
          broker_metadata, account_label, auto_sync_enabled, sync_frequency, sync_time, sync_start_date
        )
        VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (user_id) WHERE broker_type = 'schwab' DO UPDATE SET
          schwab_access_token = EXCLUDED.schwab_access_token,
          schwab_refresh_token = EXCLUDED.schwab_refresh_token,
          schwab_token_expires_at = EXCLUDED.schwab_token_expires_at,
          schwab_account_id = EXCLUDED.schwab_account_id,
          broker_metadata = COALESCE(broker_connections.broker_metadata, '{}'::jsonb) || EXCLUDED.broker_metadata,
          account_label = EXCLUDED.account_label,
          auto_sync_enabled = EXCLUDED.auto_sync_enabled,
          sync_frequency = EXCLUDED.sync_frequency,
          sync_time = EXCLUDED.sync_time,
          sync_start_date = EXCLUDED.sync_start_date,
          connection_status = 'pending',
          consecutive_failures = 0,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      params = [
        userId, brokerType, encryptedSchwabAccess, encryptedSchwabRefresh,
        schwabTokenExpiresAt, schwabAccountId, JSON.stringify(brokerMetadata || {}), accountLabel,
        autoSyncEnabled, syncFrequency, syncTime, syncStartDate
      ];
    } else if (brokerType === 'trading212') {
      query = `
        INSERT INTO broker_connections (
          user_id, broker_type, connection_status,
          trading212_api_key, trading212_api_secret, external_account_id,
          broker_environment, broker_metadata, account_label,
          auto_sync_enabled, sync_frequency, sync_time, sync_start_date
        )
        VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (user_id, (COALESCE(broker_environment, 'live'))) WHERE broker_type = 'trading212' DO UPDATE SET
          trading212_api_key = EXCLUDED.trading212_api_key,
          trading212_api_secret = EXCLUDED.trading212_api_secret,
          external_account_id = EXCLUDED.external_account_id,
          broker_metadata = EXCLUDED.broker_metadata,
          account_label = EXCLUDED.account_label,
          auto_sync_enabled = EXCLUDED.auto_sync_enabled,
          sync_frequency = EXCLUDED.sync_frequency,
          sync_time = EXCLUDED.sync_time,
          sync_start_date = EXCLUDED.sync_start_date,
          connection_status = 'pending',
          consecutive_failures = 0,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      params = [
        userId, brokerType, encryptedTrading212ApiKey, encryptedTrading212ApiSecret,
        externalAccountId || null, brokerEnvironment || 'live',
        JSON.stringify(brokerMetadata || {}), accountLabel, autoSyncEnabled,
        syncFrequency, syncTime, syncStartDate
      ];
    } else {
      query = `
        INSERT INTO broker_connections (
          user_id, broker_type, connection_status,
          oauth_access_token, oauth_refresh_token, oauth_token_expires_at,
          oauth_refresh_token_expires_at, oauth_scopes, external_account_id,
          external_user_id, broker_environment, broker_metadata, account_label,
          auto_sync_enabled, sync_frequency, sync_time
        )
        VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (user_id) WHERE broker_type = 'tradestation' DO UPDATE SET
          oauth_access_token = EXCLUDED.oauth_access_token,
          oauth_refresh_token = EXCLUDED.oauth_refresh_token,
          oauth_token_expires_at = EXCLUDED.oauth_token_expires_at,
          oauth_refresh_token_expires_at = EXCLUDED.oauth_refresh_token_expires_at,
          oauth_scopes = EXCLUDED.oauth_scopes,
          external_account_id = EXCLUDED.external_account_id,
          external_user_id = EXCLUDED.external_user_id,
          broker_environment = EXCLUDED.broker_environment,
          broker_metadata = EXCLUDED.broker_metadata,
          account_label = EXCLUDED.account_label,
          auto_sync_enabled = EXCLUDED.auto_sync_enabled,
          sync_frequency = EXCLUDED.sync_frequency,
          sync_time = EXCLUDED.sync_time,
          connection_status = 'pending',
          consecutive_failures = 0,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      if (brokerType === 'alpaca') {
        query = `
          INSERT INTO broker_connections (
            user_id, broker_type, connection_status,
            oauth_access_token, oauth_refresh_token, oauth_token_expires_at,
            oauth_refresh_token_expires_at, oauth_scopes, external_account_id,
            external_user_id, broker_environment, broker_metadata, account_label,
            auto_sync_enabled, sync_frequency, sync_time
          )
          VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (user_id, (COALESCE(broker_environment, 'live'))) WHERE broker_type = 'alpaca' DO UPDATE SET
            oauth_access_token = EXCLUDED.oauth_access_token,
            oauth_refresh_token = EXCLUDED.oauth_refresh_token,
            oauth_token_expires_at = EXCLUDED.oauth_token_expires_at,
            oauth_refresh_token_expires_at = EXCLUDED.oauth_refresh_token_expires_at,
            oauth_scopes = EXCLUDED.oauth_scopes,
            external_account_id = EXCLUDED.external_account_id,
            external_user_id = EXCLUDED.external_user_id,
            broker_metadata = EXCLUDED.broker_metadata,
            account_label = EXCLUDED.account_label,
            auto_sync_enabled = EXCLUDED.auto_sync_enabled,
            sync_frequency = EXCLUDED.sync_frequency,
            sync_time = EXCLUDED.sync_time,
            connection_status = 'pending',
            consecutive_failures = 0,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `;
      }

      params = [
        userId, brokerType, encryptedOAuthAccess, encryptedOAuthRefresh,
        oauthTokenExpiresAt, oauthRefreshTokenExpiresAt, oauthScopes || null,
        externalAccountId || null, externalUserId || null, brokerEnvironment || null,
        JSON.stringify(brokerMetadata || {}), accountLabel, autoSyncEnabled,
        syncFrequency, syncTime
      ];
    }

    const result = await db.query(query, params);
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
   * Find all IBKR connections for a user
   */
  static async findIBKRByUser(userId) {
    const query = `
      SELECT * FROM broker_connections
      WHERE user_id = $1 AND broker_type = 'ibkr'
      ORDER BY created_at ASC
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
  static async updateStatus(connectionId, status, message = null, resetFailures = false) {
    const query = `
      UPDATE broker_connections
      SET connection_status = $2,
          last_sync_message = COALESCE($3, last_sync_message),
          consecutive_failures = CASE WHEN $4 THEN 0 ELSE consecutive_failures END,
          last_error_at = CASE WHEN $4 THEN NULL ELSE last_error_at END,
          last_error_message = CASE WHEN $4 THEN NULL ELSE last_error_message END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [connectionId, status, message, resetFailures]);
    if (result.rows.length === 0) return null;

    return this.formatConnection(result.rows[0], false);
  }

  /**
   * Update connection after successful sync
   */
  static async updateAfterSync(connectionId, tradesImported, tradesSkipped, nextSync = null, options = {}) {
    const advanceLastSync = options.advanceLastSync !== false;
    const query = `
      UPDATE broker_connections
      SET connection_status = 'active',
          last_sync_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE last_sync_at END,
          last_sync_status = CASE WHEN $5 THEN 'success' ELSE 'warning' END,
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

    const result = await db.query(query, [connectionId, tradesImported, tradesSkipped, nextSync, advanceLastSync]);
    if (result.rows.length === 0) return null;

    return this.formatConnection(result.rows[0], false);
  }

  /**
   * Bring next_scheduled_sync forward when a sync failed with a transient
   * error (timeout, DNS hiccup, IBKR "try again later"). The regular
   * scheduler will pick the connection up on its next pass and retry.
   * Only fires for scheduled syncs and only while consecutive_failures is
   * below the cap enforced by findDueForSync. Doesn't move the sync forward
   * if the user already had it scheduled sooner than the retry window.
   */
  static async scheduleTransientRetry(connectionId, delayMinutes = 30) {
    const query = `
      UPDATE broker_connections
      SET next_scheduled_sync = CASE
            WHEN next_scheduled_sync IS NULL OR next_scheduled_sync <= NOW()
              THEN NOW() + ($2 || ' minutes')::interval
            ELSE LEAST(next_scheduled_sync, NOW() + ($2 || ' minutes')::interval)
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND auto_sync_enabled = true
        AND consecutive_failures < 3
      RETURNING id, next_scheduled_sync
    `;
    const result = await db.query(query, [connectionId, String(delayMinutes)]);
    return result.rows[0] || null;
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
    const allowedFields = ['auto_sync_enabled', 'sync_frequency', 'sync_time', 'sync_start_date', 'account_label', 'next_scheduled_sync'];
    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = toSnakeCase(key);
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
   * Merge broker-specific public settings into the connection metadata.
   */
  static async updateBrokerMetadata(connectionId, metadata) {
    const query = `
      UPDATE broker_connections
      SET broker_metadata = COALESCE(broker_metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [connectionId, JSON.stringify(metadata || {})]);
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
   * Update generic OAuth broker tokens.
   */
  static async updateOAuthTokens(connectionId, accessToken, refreshToken, expiresAt, refreshTokenExpiresAt = null) {
    const encryptedAccess = encryptionService.encrypt(accessToken);
    const encryptedRefresh = refreshToken ? encryptionService.encrypt(refreshToken) : null;

    const query = `
      UPDATE broker_connections
      SET oauth_access_token = $2,
          oauth_refresh_token = COALESCE($3, oauth_refresh_token),
          oauth_token_expires_at = $4,
          oauth_refresh_token_expires_at = COALESCE($5, oauth_refresh_token_expires_at),
          connection_status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [connectionId, encryptedAccess, encryptedRefresh, expiresAt, refreshTokenExpiresAt]);
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
   * Daily times are interpreted in the supplied IANA timezone.
   */
  static calculateNextSync(syncFrequency, syncTime, timezone = process.env.TZ || 'UTC') {
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
        // Interpret the configured clock time in the user's timezone, then
        // persist the resulting instant as UTC in next_scheduled_sync.
        const timeMatch = String(syncTime || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!timeMatch) {
          throw new Error(`Invalid broker sync time: ${syncTime}`);
        }

        const hours = Number(timeMatch[1]);
        const minutes = Number(timeMatch[2]);
        const seconds = Number(timeMatch[3] || 0);
        if (hours > 23 || minutes > 59 || seconds > 59) {
          throw new Error(`Invalid broker sync time: ${syncTime}`);
        }

        let resolvedTimezone = timezone || 'UTC';
        let localNow;
        try {
          localNow = getZonedDateTimeParts(now, resolvedTimezone);
        } catch (error) {
          console.warn(`[BROKER-SYNC] Invalid user timezone "${resolvedTimezone}"; scheduling in UTC`);
          resolvedTimezone = 'UTC';
          localNow = getZonedDateTimeParts(now, resolvedTimezone);
        }

        const targetSeconds = (hours * 60 * 60) + (minutes * 60) + seconds;
        const currentSeconds = (localNow.hour * 60 * 60) + (localNow.minute * 60) + localNow.second;
        const daysToAdd = targetSeconds <= currentSeconds ? 1 : 0;
        let targetDate = addCalendarDays(localNow, daysToAdd);
        let next = new Date(localToUTC(
          formatNaiveDateTime(targetDate, hours, minutes, seconds),
          resolvedTimezone
        ));

        // Guard unusual DST transitions and ambiguous wall-clock times. The
        // next scheduled instant must always be in the future.
        if (next <= now) {
          targetDate = addCalendarDays(targetDate, 1);
          next = new Date(localToUTC(
            formatNaiveDateTime(targetDate, hours, minutes, seconds),
            resolvedTimezone
          ));
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
      accountLabel: row.account_label,
      connectionStatus: row.connection_status,
      autoSyncEnabled: row.auto_sync_enabled,
      syncFrequency: row.sync_frequency,
      syncTime: row.sync_time,
      syncStartDate: toDateOnlyString(row.sync_start_date),
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
      const brokerMetadata = row.broker_metadata || {};
      connection.schwabAccountId = row.schwab_account_id;
      connection.schwabTokenExpiresAt = row.schwab_token_expires_at;
      connection.schwab_accounts = Array.isArray(brokerMetadata.schwab_accounts)
        ? brokerMetadata.schwab_accounts
        : [];
      connection.excluded_account_identifiers = Array.isArray(brokerMetadata.excluded_account_identifiers)
        ? brokerMetadata.excluded_account_identifiers
        : [];
      // Only include decrypted tokens if explicitly requested
      if (includeCredentials) {
        if (row.schwab_access_token) {
          connection.schwabAccessToken = encryptionService.decrypt(row.schwab_access_token);
        }
        if (row.schwab_refresh_token) {
          connection.schwabRefreshToken = encryptionService.decrypt(row.schwab_refresh_token);
        }
      }
    } else if (row.broker_type === 'trading212') {
      connection.externalAccountId = row.external_account_id;
      connection.brokerEnvironment = row.broker_environment || 'live';
      connection.brokerMetadata = row.broker_metadata || {};
      if (includeCredentials) {
        if (row.trading212_api_key) {
          connection.trading212ApiKey = encryptionService.decrypt(row.trading212_api_key);
        }
        if (row.trading212_api_secret) {
          connection.trading212ApiSecret = encryptionService.decrypt(row.trading212_api_secret);
        }
      }
    } else if (['tradestation', 'alpaca'].includes(row.broker_type)) {
      connection.oauthTokenExpiresAt = row.oauth_token_expires_at;
      connection.oauthRefreshTokenExpiresAt = row.oauth_refresh_token_expires_at;
      connection.oauthScopes = row.oauth_scopes || [];
      connection.externalAccountId = row.external_account_id;
      connection.externalUserId = row.external_user_id;
      connection.brokerEnvironment = row.broker_environment;
      connection.brokerMetadata = row.broker_metadata || {};
      if (includeCredentials) {
        if (row.oauth_access_token) {
          connection.oauthAccessToken = encryptionService.decrypt(row.oauth_access_token);
        }
        if (row.oauth_refresh_token) {
          connection.oauthRefreshToken = encryptionService.decrypt(row.oauth_refresh_token);
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
      syncStartDate: toDateOnlyString(row.sync_start_date),
      syncEndDate: toDateOnlyString(row.sync_end_date),
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
