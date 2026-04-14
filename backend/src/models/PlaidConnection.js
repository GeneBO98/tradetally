const db = require('../config/database');
const BrokerConnection = require('./BrokerConnection');
const encryptionService = require('../services/brokerSync/encryptionService');

class PlaidConnection {
  static calculateNextSync(syncFrequency, syncTime) {
    return BrokerConnection.calculateNextSync(syncFrequency, syncTime);
  }

  static async create(userId, data) {
    const {
      itemId,
      accessToken,
      institutionId = null,
      institutionName = null,
      targetType = 'bank',
      autoSyncEnabled = false,
      syncFrequency = 'daily',
      syncTime = '06:00:00'
    } = data;

    const encryptedAccessToken = encryptionService.encrypt(accessToken);
    const nextScheduledSync = autoSyncEnabled && syncFrequency !== 'manual'
      ? this.calculateNextSync(syncFrequency, syncTime)
      : null;

    const query = `
      INSERT INTO plaid_connections (
        user_id, item_id, access_token, institution_id, institution_name, target_type,
        auto_sync_enabled, sync_frequency, sync_time, next_scheduled_sync
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (user_id, item_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        institution_id = EXCLUDED.institution_id,
        institution_name = EXCLUDED.institution_name,
        target_type = EXCLUDED.target_type,
        auto_sync_enabled = EXCLUDED.auto_sync_enabled,
        sync_frequency = EXCLUDED.sync_frequency,
        sync_time = EXCLUDED.sync_time,
        next_scheduled_sync = EXCLUDED.next_scheduled_sync,
        connection_status = 'active',
        consecutive_failures = 0,
        last_error_at = NULL,
        last_error_message = NULL,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await db.query(query, [
      userId,
      itemId,
      encryptedAccessToken,
      institutionId,
      institutionName,
      targetType,
      autoSyncEnabled,
      syncFrequency,
      syncTime,
      nextScheduledSync
    ]);

    return this.formatConnection(result.rows[0], true);
  }

  static async findById(connectionId, userId = null, includeCredentials = false) {
    const values = [connectionId];
    let query = 'SELECT * FROM plaid_connections WHERE id = $1';

    if (userId) {
      query += ' AND user_id = $2';
      values.push(userId);
    }

    const result = await db.query(query, values);
    if (result.rows.length === 0) return null;
    return this.formatConnection(result.rows[0], includeCredentials);
  }

  static async findByUserId(userId) {
    const connectionsResult = await db.query(`
      SELECT * FROM plaid_connections
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    const accountsResult = await db.query(`
      SELECT
        pa.*,
        ua.account_name as linked_account_name
      FROM plaid_accounts pa
      LEFT JOIN user_accounts ua
        ON ua.id = pa.linked_account_id
      WHERE pa.user_id = $1
      ORDER BY pa.account_name ASC
    `, [userId]);

    const accountsByConnection = new Map();
    for (const row of accountsResult.rows) {
      const existing = accountsByConnection.get(row.connection_id) || [];
      existing.push(this.formatAccount(row));
      accountsByConnection.set(row.connection_id, existing);
    }

    return connectionsResult.rows.map(row => ({
      ...this.formatConnection(row, false),
      accounts: accountsByConnection.get(row.id) || []
    }));
  }

  static async findDueForSync() {
    const result = await db.query(`
      SELECT * FROM plaid_connections
      WHERE auto_sync_enabled = true
        AND connection_status = 'active'
        AND next_scheduled_sync IS NOT NULL
        AND next_scheduled_sync <= NOW()
      ORDER BY next_scheduled_sync ASC
    `);

    return result.rows.map(row => this.formatConnection(row, true));
  }

  static async update(connectionId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;
    const fieldMap = {
      autoSyncEnabled: 'auto_sync_enabled',
      syncFrequency: 'sync_frequency',
      syncTime: 'sync_time',
      nextScheduledSync: 'next_scheduled_sync',
      lastSyncCursor: 'last_sync_cursor',
      connectionStatus: 'connection_status',
      lastSyncStatus: 'last_sync_status',
      lastSyncMessage: 'last_sync_message',
      lastSyncAt: 'last_sync_at',
      lastErrorAt: 'last_error_at',
      lastErrorMessage: 'last_error_message',
      consecutiveFailures: 'consecutive_failures',
      institutionName: 'institution_name'
    };

    for (const [key, value] of Object.entries(updates)) {
      if (fieldMap[key] && value !== undefined) {
        fields.push(`${fieldMap[key]} = $${paramCount}`);
        values.push(value);
        paramCount += 1;
      }
    }

    if (fields.length === 0) return null;

    values.push(connectionId);
    const result = await db.query(`
      UPDATE plaid_connections
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) return null;
    return this.formatConnection(result.rows[0], false);
  }

  static async updateAfterSync(connectionId, details = {}) {
    const {
      lastSyncCursor = null,
      message = null,
      syncFrequency = null,
      syncTime = null
    } = details;

    const connection = await this.findById(connectionId);
    const nextScheduledSync = connection && connection.autoSyncEnabled
      ? this.calculateNextSync(syncFrequency || connection.syncFrequency, syncTime || connection.syncTime)
      : null;

    const result = await db.query(`
      UPDATE plaid_connections
      SET connection_status = 'active',
          last_sync_cursor = COALESCE($2, last_sync_cursor),
          last_sync_at = CURRENT_TIMESTAMP,
          last_sync_status = 'success',
          last_sync_message = $3,
          next_scheduled_sync = $4,
          consecutive_failures = 0,
          last_error_at = NULL,
          last_error_message = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [connectionId, lastSyncCursor, message, nextScheduledSync]);

    if (result.rows.length === 0) return null;
    return this.formatConnection(result.rows[0], false);
  }

  static async updateAfterFailure(connectionId, errorMessage) {
    const result = await db.query(`
      UPDATE plaid_connections
      SET connection_status = 'error',
          last_sync_status = 'failed',
          last_error_at = CURRENT_TIMESTAMP,
          last_error_message = $2,
          consecutive_failures = consecutive_failures + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [connectionId, errorMessage]);

    if (result.rows.length === 0) return null;
    return this.formatConnection(result.rows[0], false);
  }

  static async delete(connectionId, userId) {
    const result = await db.query(`
      DELETE FROM plaid_connections
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [connectionId, userId]);
    return result.rows[0] || null;
  }

  static async upsertAccounts(connectionId, userId, accounts) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const activeAccountIds = [];
      const rows = [];

      for (const account of accounts) {
        activeAccountIds.push(account.account_id);
        const result = await client.query(`
          INSERT INTO plaid_accounts (
            connection_id, user_id, plaid_account_id, account_name, official_name, mask,
            account_type, account_subtype, current_balance, available_balance,
            iso_currency_code, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
          ON CONFLICT (plaid_account_id) DO UPDATE SET
            connection_id = EXCLUDED.connection_id,
            user_id = EXCLUDED.user_id,
            account_name = EXCLUDED.account_name,
            official_name = EXCLUDED.official_name,
            mask = EXCLUDED.mask,
            account_type = EXCLUDED.account_type,
            account_subtype = EXCLUDED.account_subtype,
            current_balance = EXCLUDED.current_balance,
            available_balance = EXCLUDED.available_balance,
            iso_currency_code = EXCLUDED.iso_currency_code,
            is_active = true,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `, [
          connectionId,
          userId,
          account.account_id,
          account.name,
          account.official_name || null,
          account.mask || null,
          account.type || null,
          account.subtype || null,
          account.balances?.current ?? null,
          account.balances?.available ?? null,
          account.balances?.iso_currency_code || account.balances?.unofficial_currency_code || null
        ]);

        rows.push(result.rows[0]);
      }

      await client.query(`
        UPDATE plaid_accounts
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE connection_id = $1
          AND ($2::text[] IS NULL OR plaid_account_id != ALL($2::text[]))
      `, [connectionId, activeAccountIds.length > 0 ? activeAccountIds : null]);

      await client.query('COMMIT');
      return rows.map(row => this.formatAccount(row));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findAccountById(plaidAccountRowId, userId) {
    const result = await db.query(`
      SELECT pa.*, pc.target_type, ua.account_name as linked_account_name
      FROM plaid_accounts pa
      JOIN plaid_connections pc ON pc.id = pa.connection_id
      LEFT JOIN user_accounts ua ON ua.id = pa.linked_account_id
      WHERE pa.id = $1 AND pa.user_id = $2
    `, [plaidAccountRowId, userId]);

    if (result.rows.length === 0) return null;
    return this.formatAccount(result.rows[0], result.rows[0].target_type);
  }

  static async setAccountLink(plaidAccountRowId, userId, linkedAccountId, trackingMode) {
    const result = await db.query(`
      UPDATE plaid_accounts
      SET linked_account_id = $3,
          tracking_mode = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [plaidAccountRowId, userId, linkedAccountId, trackingMode]);

    if (result.rows.length === 0) return null;
    return this.findAccountById(plaidAccountRowId, userId);
  }

  static async upsertTransaction(userId, transaction) {
    const result = await db.query(`
      INSERT INTO plaid_transactions (
        connection_id, plaid_account_row_id, user_id, external_transaction_id, pending_transaction_id,
        transaction_source, amount, iso_currency_code, transaction_date, authorized_date,
        description, merchant_name, pending, is_removed, review_status, review_reason,
        direction_guess, confidence, metadata, raw_payload, last_synced_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, false, $14, $15,
        $16, $17, $18, $19, CURRENT_TIMESTAMP
      )
      ON CONFLICT (external_transaction_id) DO UPDATE SET
        connection_id = EXCLUDED.connection_id,
        plaid_account_row_id = EXCLUDED.plaid_account_row_id,
        user_id = EXCLUDED.user_id,
        pending_transaction_id = EXCLUDED.pending_transaction_id,
        transaction_source = EXCLUDED.transaction_source,
        amount = EXCLUDED.amount,
        iso_currency_code = EXCLUDED.iso_currency_code,
        transaction_date = EXCLUDED.transaction_date,
        authorized_date = EXCLUDED.authorized_date,
        description = EXCLUDED.description,
        merchant_name = EXCLUDED.merchant_name,
        pending = EXCLUDED.pending,
        is_removed = false,
        review_status = CASE
          WHEN plaid_transactions.review_status = 'approved' THEN plaid_transactions.review_status
          ELSE EXCLUDED.review_status
        END,
        review_reason = EXCLUDED.review_reason,
        direction_guess = CASE
          WHEN plaid_transactions.review_status = 'approved' THEN plaid_transactions.direction_guess
          ELSE EXCLUDED.direction_guess
        END,
        confidence = EXCLUDED.confidence,
        metadata = EXCLUDED.metadata,
        raw_payload = EXCLUDED.raw_payload,
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      transaction.connectionId,
      transaction.plaidAccountRowId,
      userId,
      transaction.externalTransactionId,
      transaction.pendingTransactionId,
      transaction.transactionSource,
      transaction.amount,
      transaction.isoCurrencyCode,
      transaction.transactionDate,
      transaction.authorizedDate,
      transaction.description,
      transaction.merchantName,
      transaction.pending,
      transaction.reviewStatus,
      transaction.reviewReason,
      transaction.directionGuess,
      transaction.confidence,
      JSON.stringify(transaction.metadata || {}),
      JSON.stringify(transaction.rawPayload || {})
    ]);

    return result.rows[0];
  }

  static async markTransactionsRemoved(userId, externalTransactionIds = []) {
    if (!externalTransactionIds.length) return 0;

    const result = await db.query(`
      UPDATE plaid_transactions
      SET is_removed = true,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
        AND external_transaction_id = ANY($2::text[])
        AND review_status != 'approved'
      RETURNING id
    `, [userId, externalTransactionIds]);

    return result.rowCount;
  }

  static async reclassifyTransactionsForPlaidAccount(plaidAccountRowId, updates) {
    const {
      directionGuess = 'ambiguous',
      confidence = 0,
      reviewReason = null
    } = updates;

    await db.query(`
      UPDATE plaid_transactions
      SET direction_guess = $2,
          confidence = $3,
          review_reason = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE plaid_account_row_id = $1
        AND review_status != 'approved'
    `, [plaidAccountRowId, directionGuess, confidence, reviewReason]);
  }

  static async listTransactionsByPlaidAccount(plaidAccountRowId, userId) {
    const result = await db.query(`
      SELECT * FROM plaid_transactions
      WHERE plaid_account_row_id = $1 AND user_id = $2
      ORDER BY transaction_date DESC, created_at DESC
    `, [plaidAccountRowId, userId]);

    return result.rows;
  }

  static async listReviewQueue(userId, linkedAccountId, limit = 50) {
    const result = await db.query(`
      SELECT
        pt.*,
        pa.account_name as plaid_account_name,
        pa.mask as plaid_account_mask,
        pa.account_type,
        pa.account_subtype,
        pa.tracking_mode,
        pc.institution_name,
        pc.target_type
      FROM plaid_transactions pt
      JOIN plaid_accounts pa ON pa.id = pt.plaid_account_row_id
      JOIN plaid_connections pc ON pc.id = pt.connection_id
      WHERE pt.user_id = $1
        AND pa.linked_account_id = $2
        AND pt.review_status = 'pending'
        AND pt.is_removed = false
        AND pt.pending = false
      ORDER BY pt.confidence DESC, pt.transaction_date DESC, pt.created_at DESC
      LIMIT $3
    `, [userId, linkedAccountId, limit]);

    return result.rows.map(row => this.formatReviewTransaction(row));
  }

  static async listReviewedActivity(userId, linkedAccountId, limit = 20) {
    const result = await db.query(`
      SELECT
        pt.*,
        pa.account_name as plaid_account_name,
        pa.mask as plaid_account_mask,
        pc.institution_name,
        at.transaction_type as imported_transaction_type,
        at.amount as imported_amount,
        at.transaction_date as imported_transaction_date
      FROM plaid_transactions pt
      JOIN plaid_accounts pa ON pa.id = pt.plaid_account_row_id
      JOIN plaid_connections pc ON pc.id = pt.connection_id
      LEFT JOIN account_transactions at ON at.id = pt.account_transaction_id
      WHERE pt.user_id = $1
        AND pa.linked_account_id = $2
        AND pt.review_status IN ('approved', 'rejected')
        AND pt.is_removed = false
      ORDER BY pt.updated_at DESC
      LIMIT $3
    `, [userId, linkedAccountId, limit]);

    return result.rows.map(row => this.formatHistoryTransaction(row));
  }

  static async listSyncedActivity(userId, linkedAccountId, limit = 100) {
    const result = await db.query(`
      SELECT
        pt.*,
        pa.account_name as plaid_account_name,
        pa.mask as plaid_account_mask,
        pa.account_type,
        pa.account_subtype,
        pa.tracking_mode,
        pc.institution_name,
        pc.target_type,
        at.transaction_type as imported_transaction_type
      FROM plaid_transactions pt
      JOIN plaid_accounts pa ON pa.id = pt.plaid_account_row_id
      JOIN plaid_connections pc ON pc.id = pt.connection_id
      LEFT JOIN account_transactions at ON at.id = pt.account_transaction_id
      WHERE pt.user_id = $1
        AND pa.linked_account_id = $2
        AND pt.is_removed = false
      ORDER BY pt.transaction_date DESC, pt.updated_at DESC, pt.created_at DESC
      LIMIT $3
    `, [userId, linkedAccountId, limit]);

    return result.rows.map(row => this.formatSyncedTransaction(row));
  }

  static async findTransactionById(transactionId, userId) {
    const result = await db.query(`
      SELECT
        pt.*,
        pa.linked_account_id,
        pa.account_name as plaid_account_name,
        pa.tracking_mode,
        pc.target_type,
        pc.institution_name
      FROM plaid_transactions pt
      JOIN plaid_accounts pa ON pa.id = pt.plaid_account_row_id
      JOIN plaid_connections pc ON pc.id = pt.connection_id
      WHERE pt.id = $1 AND pt.user_id = $2
    `, [transactionId, userId]);

    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  static async markTransactionApproved(transactionId, accountTransactionId, transactionType) {
    const result = await db.query(`
      UPDATE plaid_transactions
      SET review_status = 'approved',
          review_reason = $3,
          account_transaction_id = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [transactionId, accountTransactionId, `approved_${transactionType}`]);

    return result.rows[0] || null;
  }

  static async markTransactionRejected(transactionId, userId) {
    const result = await db.query(`
      UPDATE plaid_transactions
      SET review_status = 'rejected',
          account_transaction_id = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [transactionId, userId]);

    return result.rows[0] || null;
  }

  static async markTransactionPending(transactionId, userId) {
    const result = await db.query(`
      UPDATE plaid_transactions
      SET review_status = 'pending',
          account_transaction_id = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [transactionId, userId]);

    return result.rows[0] || null;
  }

  static async resetApprovedTransactionByAccountTransactionId(userId, accountTransactionId) {
    const result = await db.query(`
      UPDATE plaid_transactions
      SET review_status = 'pending',
          account_transaction_id = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND account_transaction_id = $2
      RETURNING *
    `, [userId, accountTransactionId]);

    return result.rows[0] || null;
  }

  static formatConnection(row, includeCredentials = false) {
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      itemId: row.item_id,
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      targetType: row.target_type,
      connectionStatus: row.connection_status,
      autoSyncEnabled: row.auto_sync_enabled,
      syncFrequency: row.sync_frequency,
      syncTime: row.sync_time,
      nextScheduledSync: row.next_scheduled_sync,
      lastSyncCursor: row.last_sync_cursor,
      lastSyncAt: row.last_sync_at,
      lastSyncStatus: row.last_sync_status,
      lastSyncMessage: row.last_sync_message,
      lastErrorAt: row.last_error_at,
      lastErrorMessage: row.last_error_message,
      consecutiveFailures: row.consecutive_failures,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(includeCredentials && row.access_token ? {
        accessToken: encryptionService.decrypt(row.access_token)
      } : {})
    };
  }

  static formatAccount(row, targetType = null) {
    if (!row) return null;

    return {
      id: row.id,
      connectionId: row.connection_id,
      plaidAccountId: row.plaid_account_id,
      accountName: row.account_name,
      officialName: row.official_name,
      mask: row.mask,
      accountType: row.account_type,
      accountSubtype: row.account_subtype,
      trackingMode: row.tracking_mode,
      linkedAccountId: row.linked_account_id,
      linkedAccountName: row.linked_account_name || null,
      currentBalance: row.current_balance !== null ? parseFloat(row.current_balance) : null,
      availableBalance: row.available_balance !== null ? parseFloat(row.available_balance) : null,
      currencyCode: row.iso_currency_code,
      isActive: row.is_active,
      targetType,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  static formatReviewTransaction(row) {
    return {
      id: row.id,
      plaidAccountName: row.plaid_account_name,
      plaidAccountMask: row.plaid_account_mask,
      institutionName: row.institution_name,
      accountType: row.account_type,
      accountSubtype: row.account_subtype,
      trackingMode: row.tracking_mode,
      targetType: row.target_type,
      amount: parseFloat(row.amount),
      transactionDate: row.transaction_date,
      authorizedDate: row.authorized_date,
      description: row.description,
      merchantName: row.merchant_name,
      directionGuess: row.direction_guess,
      confidence: row.confidence,
      reviewReason: row.review_reason,
      pending: row.pending,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  static formatHistoryTransaction(row) {
    return {
      id: row.id,
      accountTransactionId: row.account_transaction_id || null,
      plaidAccountName: row.plaid_account_name,
      plaidAccountMask: row.plaid_account_mask,
      institutionName: row.institution_name,
      amount: parseFloat(row.amount),
      transactionDate: row.transaction_date,
      description: row.description,
      reviewStatus: row.review_status,
      importedTransactionType: row.imported_transaction_type || null,
      importedAmount: row.imported_amount !== null && row.imported_amount !== undefined
        ? parseFloat(row.imported_amount)
        : null,
      importedTransactionDate: row.imported_transaction_date || null,
      updatedAt: row.updated_at
    };
  }

  static formatSyncedTransaction(row) {
    return {
      id: row.id,
      accountTransactionId: row.account_transaction_id || null,
      plaidAccountName: row.plaid_account_name,
      plaidAccountMask: row.plaid_account_mask,
      institutionName: row.institution_name,
      accountType: row.account_type,
      accountSubtype: row.account_subtype,
      trackingMode: row.tracking_mode,
      targetType: row.target_type,
      amount: parseFloat(row.amount),
      transactionDate: row.transaction_date,
      authorizedDate: row.authorized_date,
      description: row.description,
      merchantName: row.merchant_name,
      reviewStatus: row.review_status,
      importedTransactionType: row.imported_transaction_type || null,
      directionGuess: row.direction_guess,
      confidence: row.confidence,
      reviewReason: row.review_reason,
      pending: row.pending,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = PlaidConnection;
