/**
 * Account Model
 * Handles brokerage account management and cashflow calculations
 * GitHub Issue: #135
 */

const db = require('../config/database');
const { randomUUID } = require('crypto');

function cleanText(value, limit = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, limit);
}

function toImportReconciliationCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    username: row.username,
    importId: row.import_id,
    accountIdentifier: row.account_identifier,
    broker: row.broker,
    source: row.source,
    status: row.status,
    sampleCount: Number(row.sample_count || 0),
    resolvedAccountId: row.resolved_account_id,
    resolvedAccountName: row.resolved_account_name,
    lastError: row.last_error,
    lastAuditId: row.last_audit_id,
    lastAuditAction: row.last_audit_action,
    lastAuditReason: row.last_audit_reason,
    lastAuditAt: row.last_audit_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at
  };
}

function toImportReconciliationAuditCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    reconciliationId: row.reconciliation_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorUsername: row.actor_username,
    reason: row.reason,
    beforeState: row.before_state || {},
    afterState: row.after_state || {},
    bulkActionId: row.bulk_action_id,
    createdAt: row.created_at
  };
}

class Account {
  /**
   * Create a new account
   */
  static async create(userId, accountData) {
    const {
      accountName,
      accountIdentifier,
      broker,
      initialBalance,
      initialBalanceDate,
      isPrimary,
      notes
    } = accountData;

    // If setting as primary, unset existing primary first
    if (isPrimary) {
      await db.query(
        'UPDATE user_accounts SET is_primary = false WHERE user_id = $1',
        [userId]
      );
    }

    const query = `
      INSERT INTO user_accounts (
        user_id, account_name, account_identifier, broker,
        initial_balance, initial_balance_date, is_primary, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await db.query(query, [
      userId,
      accountName,
      accountIdentifier || null,
      broker || null,
      initialBalance || 0,
      initialBalanceDate,
      isPrimary || false,
      notes || null
    ]);

    console.log(`[ACCOUNTS] Created account "${accountName}" for user ${userId}`);
    return result.rows[0];
  }

  /**
   * Get all accounts for a user
   */
  static async findByUser(userId) {
    const query = `
      SELECT
        ua.*,
        (
          SELECT COUNT(*)
          FROM trades t
          WHERE t.user_id = $1
            AND t.account_identifier = ua.account_identifier
            AND ua.account_identifier IS NOT NULL
        ) as trade_count
      FROM user_accounts ua
      WHERE ua.user_id = $1
      ORDER BY ua.is_primary DESC, ua.account_name ASC
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Get a single account by ID
   */
  static async findById(accountId, userId) {
    const query = `
      SELECT * FROM user_accounts
      WHERE id = $1 AND user_id = $2
    `;

    const result = await db.query(query, [accountId, userId]);
    return result.rows[0];
  }

  /**
   * Get primary account for a user
   */
  static async getPrimary(userId) {
    const query = `
      SELECT * FROM user_accounts
      WHERE user_id = $1 AND is_primary = true
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * Get distinct account identifiers from trades that aren't linked to any account
   */
  static async getUnlinkedAccountIdentifiers(userId) {
    const query = `
      SELECT DISTINCT t.account_identifier, t.broker,
        MIN(COALESCE(t.entry_time::date, t.trade_date)) as earliest_trade_date
      FROM trades t
      WHERE t.user_id = $1
        AND t.account_identifier IS NOT NULL
        AND t.account_identifier != ''
        AND t.account_identifier NOT IN (
          SELECT COALESCE(account_identifier, '')
          FROM user_accounts
          WHERE user_id = $1
            AND account_identifier IS NOT NULL
        )
      GROUP BY t.account_identifier, t.broker
      ORDER BY t.account_identifier
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  static async recordImportReconciliation(userId, {
    importId = null,
    accountIdentifier,
    broker = null,
    source = 'csv_import',
    status = 'pending',
    sampleCount = 0,
    resolvedAccountId = null,
    lastError = null
  } = {}) {
    const identifier = accountIdentifier ? String(accountIdentifier).trim() : '';
    if (!identifier) return null;
    const result = await db.query(
      `
        INSERT INTO import_account_reconciliations (
          user_id, import_id, account_identifier, broker, source, status,
          sample_count, resolved_account_id, last_error, resolved_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          CASE WHEN $6 = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END
        )
        ON CONFLICT (user_id, account_identifier, source) DO UPDATE SET
          import_id = COALESCE(EXCLUDED.import_id, import_account_reconciliations.import_id),
          broker = COALESCE(EXCLUDED.broker, import_account_reconciliations.broker),
          status = EXCLUDED.status,
          sample_count = import_account_reconciliations.sample_count + EXCLUDED.sample_count,
          resolved_account_id = COALESCE(EXCLUDED.resolved_account_id, import_account_reconciliations.resolved_account_id),
          last_error = EXCLUDED.last_error,
          last_seen_at = CURRENT_TIMESTAMP,
          resolved_at = CASE WHEN EXCLUDED.status = 'resolved' THEN CURRENT_TIMESTAMP ELSE import_account_reconciliations.resolved_at END
        RETURNING *
      `,
      [
        userId,
        importId,
        identifier,
        broker || null,
        source,
        ['pending', 'resolved', 'ignored'].includes(status) ? status : 'pending',
        Math.max(0, parseInt(sampleCount || '0', 10) || 0),
        resolvedAccountId || null,
        lastError || null
      ]
    );
    return result.rows[0];
  }

  static async listImportReconciliations(userId, filters = {}) {
    const values = [userId];
    const clauses = ['user_id = $1'];
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }
    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 500);
    values.push(limit);
    const result = await db.query(
      `
        SELECT *
        FROM import_account_reconciliations
        WHERE ${clauses.join(' AND ')}
        ORDER BY last_seen_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows;
  }

  static async listImportReconciliationsForAdmin(filters = {}) {
    const values = [];
    const clauses = [];
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`iar.status = $${values.length}`);
    }
    if (filters.userId || filters.user_id) {
      values.push(filters.userId || filters.user_id);
      clauses.push(`iar.user_id = $${values.length}`);
    }
    if (filters.accountIdentifier || filters.account_identifier) {
      values.push(`%${String(filters.accountIdentifier || filters.account_identifier).trim()}%`);
      clauses.push(`iar.account_identifier ILIKE $${values.length}`);
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 500);
    values.push(limit);
    const result = await db.query(
      `
        SELECT
          iar.*,
          u.email AS user_email,
          u.username,
          ua.account_name AS resolved_account_name,
          audit.id AS last_audit_id,
          audit.action AS last_audit_action,
          audit.reason AS last_audit_reason,
          audit.created_at AS last_audit_at
        FROM import_account_reconciliations iar
        LEFT JOIN users u ON u.id = iar.user_id
        LEFT JOIN user_accounts ua ON ua.id = iar.resolved_account_id
        LEFT JOIN LATERAL (
          SELECT id, action, reason, created_at
          FROM import_account_reconciliation_audits
          WHERE reconciliation_id = iar.id
          ORDER BY created_at DESC
          LIMIT 1
        ) audit ON true
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY
          CASE iar.status WHEN 'pending' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END,
          iar.last_seen_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(toImportReconciliationCamel);
  }

  static async recordImportReconciliationAudit(client, beforeRow, afterRow, {
    action,
    actorUserId = null,
    reason,
    bulkActionId = null
  } = {}) {
    const cleanedReason = cleanText(reason, 500);
    if (!cleanedReason) {
      const error = new Error('A reason is required for import account reconciliation review');
      error.status = 400;
      throw error;
    }
    const result = await client.query(
      `
        INSERT INTO import_account_reconciliation_audits (
          reconciliation_id, action, actor_user_id, reason, before_state, after_state, bulk_action_id
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
        RETURNING *
      `,
      [
        beforeRow.id,
        action,
        actorUserId,
        cleanedReason,
        JSON.stringify(beforeRow || {}),
        JSON.stringify(afterRow || {}),
        bulkActionId
      ]
    );
    return toImportReconciliationAuditCamel(result.rows[0]);
  }

  static async runImportReconciliationAction(reconciliationId, action = 'ignore', data = {}, actorUserId = null, options = {}) {
    if (!['resolve', 'ignore', 'reopen'].includes(action)) {
      const error = new Error('Import reconciliation action must be resolve, ignore, or reopen');
      error.status = 400;
      throw error;
    }

    const status = action === 'resolve' ? 'resolved' : action === 'ignore' ? 'ignored' : 'pending';
    const resolvedAccountId = action === 'resolve' ? (data.resolvedAccountId || data.resolved_account_id || null) : null;
    const client = options.client || await db.connect();
    const shouldRelease = !options.client;
    try {
      if (shouldRelease) await client.query('BEGIN');
      const beforeResult = await client.query(
        'SELECT * FROM import_account_reconciliations WHERE id = $1 FOR UPDATE',
        [reconciliationId]
      );
      const beforeRow = beforeResult.rows[0];
      if (!beforeRow) {
        const error = new Error('Import account reconciliation not found');
        error.status = 404;
        throw error;
      }

      const result = await client.query(
        `
          UPDATE import_account_reconciliations
          SET status = $2,
              resolved_account_id = $3,
              last_error = $4,
              resolved_at = CASE WHEN $2 = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END,
              last_seen_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [
          reconciliationId,
          status,
          resolvedAccountId,
          action === 'ignore' ? cleanText(data.reason, 500) : null
        ]
      );
      const afterRow = result.rows[0];
      const audit = await this.recordImportReconciliationAudit(client, beforeRow, afterRow, {
        action,
        actorUserId,
        reason: data.reason,
        bulkActionId: options.bulkActionId || null
      });
      if (shouldRelease) await client.query('COMMIT');
      return {
        ...toImportReconciliationCamel({
          ...afterRow,
          last_audit_id: audit.id,
          last_audit_action: audit.action,
          last_audit_reason: audit.reason,
          last_audit_at: audit.createdAt
        }),
        audit
      };
    } catch (error) {
      if (shouldRelease) await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      if (shouldRelease) client.release();
    }
  }

  static async runBulkImportReconciliationAction({
    reconciliationIds = [],
    action = 'ignore',
    reason,
    preview = false,
    resolvedAccountId = null
  } = {}, actorUserId = null) {
    const ids = Array.from(new Set((reconciliationIds || []).map(String).filter(Boolean))).slice(0, 100);
    if (ids.length === 0) {
      const error = new Error('At least one reconciliation id is required');
      error.status = 400;
      throw error;
    }
    if (!['resolve', 'ignore', 'reopen'].includes(action)) {
      const error = new Error('Import reconciliation bulk action must be resolve, ignore, or reopen');
      error.status = 400;
      throw error;
    }

    const rowsResult = await db.query(
      `
        SELECT *
        FROM import_account_reconciliations
        WHERE id = ANY($1::uuid[])
        ORDER BY last_seen_at DESC
      `,
      [ids]
    );
    const rows = rowsResult.rows.map(toImportReconciliationCamel);
    if (preview) {
      return { preview: true, action, affectedCount: rows.length, reconciliations: rows };
    }

    const bulkActionId = randomUUID();
    const client = await db.connect();
    const updated = [];
    try {
      await client.query('BEGIN');
      for (const id of ids) {
        updated.push(await this.runImportReconciliationAction(id, action, {
          reason,
          resolvedAccountId
        }, actorUserId, { client, bulkActionId }));
      }
      await client.query('COMMIT');
      return { preview: false, action, bulkActionId, affectedCount: updated.length, reconciliations: updated };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  static async listImportReconciliationAudits(filters = {}) {
    const values = [];
    const clauses = [];
    if (filters.reconciliationId || filters.reconciliation_id) {
      values.push(filters.reconciliationId || filters.reconciliation_id);
      clauses.push(`a.reconciliation_id = $${values.length}`);
    }
    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 500);
    values.push(limit);
    const result = await db.query(
      `
        SELECT a.*, u.email AS actor_email, u.username AS actor_username
        FROM import_account_reconciliation_audits a
        LEFT JOIN users u ON u.id = a.actor_user_id
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY a.created_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(toImportReconciliationAuditCamel);
  }

  static async rollbackImportReconciliationAudit(auditId, actorUserId = null, reason = null) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const auditResult = await client.query(
        'SELECT * FROM import_account_reconciliation_audits WHERE id = $1 FOR UPDATE',
        [auditId]
      );
      const audit = auditResult.rows[0];
      if (!audit) {
        const error = new Error('Import reconciliation audit not found');
        error.status = 404;
        throw error;
      }
      const before = audit.before_state || {};
      const currentResult = await client.query(
        'SELECT * FROM import_account_reconciliations WHERE id = $1 FOR UPDATE',
        [audit.reconciliation_id]
      );
      const current = currentResult.rows[0];
      if (!current) {
        const error = new Error('Import account reconciliation not found');
        error.status = 404;
        throw error;
      }
      const rolledBack = await client.query(
        `
          UPDATE import_account_reconciliations
          SET status = $2,
              resolved_account_id = $3,
              last_error = $4,
              resolved_at = $5,
              last_seen_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [
          audit.reconciliation_id,
          before.status || 'pending',
          before.resolved_account_id || null,
          before.last_error || null,
          before.resolved_at || null
        ]
      );
      const rollbackAudit = await this.recordImportReconciliationAudit(client, current, rolledBack.rows[0], {
        action: 'rollback',
        actorUserId,
        reason: reason || `Rollback audit ${auditId}`,
        bulkActionId: audit.bulk_action_id || null
      });
      await client.query('COMMIT');
      return {
        reconciliation: {
          ...toImportReconciliationCamel(rolledBack.rows[0]),
          audit: rollbackAudit
        },
        audit: rollbackAudit
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get the earliest trade date for a given account identifier
   */
  static async getEarliestTradeDate(userId, accountIdentifier) {
    if (!accountIdentifier) return null;

    const query = `
      SELECT MIN(COALESCE(entry_time::date, trade_date)) as earliest_trade_date
      FROM trades
      WHERE user_id = $1
        AND account_identifier = $2
    `;

    const result = await db.query(query, [userId, accountIdentifier]);
    return result.rows[0]?.earliest_trade_date || null;
  }

  /**
   * Update an account
   */
  static async update(accountId, userId, updates) {
    // Handle primary account toggle
    if (updates.isPrimary) {
      await db.query(
        'UPDATE user_accounts SET is_primary = false WHERE user_id = $1 AND id != $2',
        [userId, accountId]
      );
    }

    const fields = [];
    const values = [];
    let paramCount = 1;

    const fieldMap = {
      accountName: 'account_name',
      accountIdentifier: 'account_identifier',
      broker: 'broker',
      initialBalance: 'initial_balance',
      initialBalanceDate: 'initial_balance_date',
      isPrimary: 'is_primary',
      notes: 'notes'
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (fieldMap[key] !== undefined && value !== undefined) {
        fields.push(`${fieldMap[key]} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) return null;

    values.push(accountId, userId);

    const query = `
      UPDATE user_accounts
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete an account
   */
  static async delete(accountId, userId) {
    const query = `
      DELETE FROM user_accounts
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await db.query(query, [accountId, userId]);
    return result.rows[0];
  }

  /**
   * Add a transaction (deposit/withdrawal)
   */
  static async addTransaction(userId, accountId, transactionData) {
    const { transactionType, amount, transactionDate, description } = transactionData;

    // Verify account belongs to user
    const account = await this.findById(accountId, userId);
    if (!account) {
      throw new Error('Account not found');
    }

    const query = `
      INSERT INTO account_transactions (
        user_id, account_id, transaction_type, amount, transaction_date, description
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await db.query(query, [
      userId,
      accountId,
      transactionType,
      amount,
      transactionDate,
      description || null
    ]);

    console.log(`[ACCOUNTS] Added ${transactionType} of $${amount} for account ${accountId}`);
    return result.rows[0];
  }

  /**
   * Get transactions for an account
   */
  static async getTransactions(userId, accountId, options = {}) {
    const { startDate, endDate, limit = 100 } = options;

    let query = `
      SELECT at.*, ua.account_name
      FROM account_transactions at
      JOIN user_accounts ua ON at.account_id = ua.id
      WHERE at.user_id = $1 AND at.account_id = $2
    `;

    const values = [userId, accountId];
    let paramCount = 3;

    if (startDate) {
      query += ` AND at.transaction_date >= $${paramCount}`;
      values.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND at.transaction_date <= $${paramCount}`;
      values.push(endDate);
      paramCount++;
    }

    query += ` ORDER BY at.transaction_date DESC, at.created_at DESC LIMIT $${paramCount}`;
    values.push(limit);

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Update a transaction
   */
  static async updateTransaction(transactionId, userId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    const fieldMap = {
      transactionType: 'transaction_type',
      amount: 'amount',
      transactionDate: 'transaction_date',
      description: 'description'
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (fieldMap[key] !== undefined && value !== undefined) {
        fields.push(`${fieldMap[key]} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) return null;

    values.push(transactionId, userId);

    const query = `
      UPDATE account_transactions
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete a transaction
   */
  static async deleteTransaction(transactionId, userId) {
    const query = `
      DELETE FROM account_transactions
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await db.query(query, [transactionId, userId]);
    return result.rows[0];
  }

  /**
   * Calculate daily cashflow for an account
   *
   * Cashflow logic:
   * - Inflow: LONG exits (sales) + SHORT entries (short sales) + Deposits
   * - Outflow: LONG entries (purchases) + SHORT exits (covers) + Withdrawals + Fees
   * - Net: Inflow - Outflow
   * - Balance: Running balance starting from initial_balance
   */
  static async getCashflow(userId, accountId, options = {}) {
    const { startDate, endDate } = options;

    // Get account details
    const account = await this.findById(accountId, userId);
    if (!account) return null;

    // Determine effective date range
    const effectiveStartDate = startDate || account.initial_balance_date;
    const effectiveEndDate = endDate || new Date().toISOString().split('T')[0];

    // Build the cashflow query
    // This query calculates daily cash movements from trades and transactions
    // NOTE: For options, we multiply by contract_size (typically 100) to get actual cash value
    //
    // IMPORTANT: Cashflow must be attributed to the DATE the cash actually moved:
    // - Entry cash flows (LONG buy outflow, SHORT sell inflow) use entry_time date
    // - Exit cash flows (LONG sell inflow, SHORT cover outflow) use exit_time date
    //
    // Commission handling - SEPARATED from trade values to match broker statements:
    // - Trade values are calculated as NET values (after commission) to match broker statements
    // - For inflows (SHORT entry, LONG exit): commission REDUCES the inflow
    // - For outflows (LONG entry, SHORT exit): commission INCREASES the outflow
    // - Rebates (negative commissions) have the opposite effect
    // - This matches how broker statements show net cash movements per transaction
    const query = `
      WITH entry_cashflows AS (
        -- Cash flows that happen on ENTRY date (when trade is opened)
        -- Track trade values and commissions separately by trade direction
        -- Commission is separated into fees (positive) and rebates (negative) BY TRADE TYPE
        SELECT
          DATE(COALESCE(entry_time, trade_date)) as date,
          -- SHORT entry inflow: raw trade value only
          COALESCE(SUM(
            CASE
              WHEN side IN ('short', 'sell') AND entry_price IS NOT NULL
                THEN (entry_price * quantity * (
                  CASE
                    WHEN instrument_type = 'option' THEN COALESCE(contract_size, 100)
                    WHEN instrument_type = 'future' THEN COALESCE(point_value, 1)
                    ELSE 1
                  END
                ))
              ELSE 0
            END
          ), 0) as trade_inflow,
          -- LONG entry outflow: raw trade value only
          COALESCE(SUM(
            CASE
              WHEN side IN ('long', 'buy') AND entry_price IS NOT NULL
                THEN (entry_price * quantity * (
                  CASE
                    WHEN instrument_type = 'option' THEN COALESCE(contract_size, 100)
                    WHEN instrument_type = 'future' THEN COALESCE(point_value, 1)
                    ELSE 1
                  END
                ))
              ELSE 0
            END
          ), 0) as trade_outflow,
          -- Fees from SHORT entries (reduce inflow) - positive commission values
          COALESCE(SUM(
            CASE
              WHEN side IN ('short', 'sell') THEN
                CASE
                  WHEN COALESCE(entry_commission, 0) != 0
                    THEN GREATEST(0, entry_commission)
                  WHEN COALESCE(commission, 0) > 0
                    THEN commission / 2.0
                  ELSE 0
                END
              ELSE 0
            END
          ), 0) as inflow_fees,
          -- Rebates from SHORT entries (add to inflow) - negative commission values as positive
          COALESCE(SUM(
            CASE
              WHEN side IN ('short', 'sell') THEN
                CASE
                  WHEN COALESCE(entry_commission, 0) != 0
                    THEN ABS(LEAST(0, entry_commission))
                  WHEN COALESCE(commission, 0) < 0
                    THEN ABS(commission / 2.0)
                  ELSE 0
                END
              ELSE 0
            END
          ), 0) as inflow_rebates,
          -- Fees from LONG entries (add to outflow) - positive commission values
          COALESCE(SUM(
            CASE
              WHEN side IN ('long', 'buy') THEN
                CASE
                  WHEN COALESCE(entry_commission, 0) != 0
                    THEN GREATEST(0, entry_commission)
                  WHEN COALESCE(commission, 0) > 0
                    THEN commission / 2.0
                  ELSE 0
                END
              ELSE 0
            END
          ), 0) as outflow_fees,
          -- Rebates from LONG entries (reduce outflow) - negative commission values as positive
          COALESCE(SUM(
            CASE
              WHEN side IN ('long', 'buy') THEN
                CASE
                  WHEN COALESCE(entry_commission, 0) != 0
                    THEN ABS(LEAST(0, entry_commission))
                  WHEN COALESCE(commission, 0) < 0
                    THEN ABS(commission / 2.0)
                  ELSE 0
                END
              ELSE 0
            END
          ), 0) as outflow_rebates
        FROM trades
        WHERE user_id = $1
          AND (
            ($2::varchar IS NOT NULL AND account_identifier = $2)
            OR ($2::varchar IS NULL AND (account_identifier IS NULL OR account_identifier = ''))
          )
          AND DATE(COALESCE(entry_time, trade_date)) >= $3
          AND DATE(COALESCE(entry_time, trade_date)) <= $4
        GROUP BY DATE(COALESCE(entry_time, trade_date))
      ),
      exit_cashflows AS (
        -- Cash flows that happen on EXIT date (when trade is closed)
        -- LONG exit: Inflow (selling shares) - commission reduces inflow
        -- SHORT exit: Outflow (covering short) - commission increases outflow
        SELECT
          DATE(exit_time) as date,
          -- LONG exit inflow: raw trade value only
          COALESCE(SUM(
            CASE
              WHEN side IN ('long', 'buy') AND exit_price IS NOT NULL AND exit_time IS NOT NULL
                THEN (exit_price * quantity * (
                  CASE
                    WHEN instrument_type = 'option' THEN COALESCE(contract_size, 100)
                    WHEN instrument_type = 'future' THEN COALESCE(point_value, 1)
                    ELSE 1
                  END
                ))
              ELSE 0
            END
          ), 0) as trade_inflow,
          -- SHORT exit outflow: raw trade value only
          COALESCE(SUM(
            CASE
              WHEN side IN ('short', 'sell') AND exit_price IS NOT NULL AND exit_time IS NOT NULL
                THEN (exit_price * quantity * (
                  CASE
                    WHEN instrument_type = 'option' THEN COALESCE(contract_size, 100)
                    WHEN instrument_type = 'future' THEN COALESCE(point_value, 1)
                    ELSE 1
                  END
                ))
              ELSE 0
            END
          ), 0) as trade_outflow,
          -- Fees from LONG exits (reduce inflow) - positive commission values
          COALESCE(SUM(
            CASE
              WHEN side IN ('long', 'buy') AND exit_time IS NOT NULL THEN
                CASE
                  WHEN COALESCE(exit_commission, 0) != 0 THEN GREATEST(0, exit_commission)
                  WHEN COALESCE(entry_commission, 0) != 0 THEN GREATEST(0, COALESCE(commission, 0) - entry_commission)
                  WHEN COALESCE(commission, 0) > 0 THEN commission / 2.0
                  ELSE 0
                END
              ELSE 0
            END
          ), 0) as inflow_fees,
          -- Rebates from LONG exits (add to inflow)
          COALESCE(SUM(
            CASE
              WHEN side IN ('long', 'buy') AND exit_time IS NOT NULL THEN
                CASE
                  WHEN COALESCE(exit_commission, 0) != 0 THEN ABS(LEAST(0, exit_commission))
                  WHEN COALESCE(entry_commission, 0) != 0 THEN ABS(LEAST(0, COALESCE(commission, 0) - entry_commission))
                  WHEN COALESCE(commission, 0) < 0 THEN ABS(commission / 2.0)
                  ELSE 0
                END
              ELSE 0
            END
          ), 0) as inflow_rebates,
          -- Fees from SHORT exits (add to outflow) - positive commission values
          COALESCE(SUM(
            CASE
              WHEN side IN ('short', 'sell') AND exit_time IS NOT NULL THEN
                CASE
                  WHEN COALESCE(exit_commission, 0) != 0 THEN GREATEST(0, exit_commission)
                  WHEN COALESCE(entry_commission, 0) != 0 THEN GREATEST(0, COALESCE(commission, 0) - entry_commission)
                  WHEN COALESCE(commission, 0) > 0 THEN commission / 2.0
                  ELSE 0
                END
              ELSE 0
            END
          ), 0) as outflow_fees,
          -- Rebates from SHORT exits (reduce outflow)
          COALESCE(SUM(
            CASE
              WHEN side IN ('short', 'sell') AND exit_time IS NOT NULL THEN
                CASE
                  WHEN COALESCE(exit_commission, 0) != 0 THEN ABS(LEAST(0, exit_commission))
                  WHEN COALESCE(entry_commission, 0) != 0 THEN ABS(LEAST(0, COALESCE(commission, 0) - entry_commission))
                  WHEN COALESCE(commission, 0) < 0 THEN ABS(commission / 2.0)
                  ELSE 0
                END
              ELSE 0
            END
          ), 0) as outflow_rebates,
          -- Separate fees field (always positive = outflow)
          COALESCE(SUM(COALESCE(fees, 0)), 0) as other_fees
        FROM trades
        WHERE user_id = $1
          AND (
            ($2::varchar IS NOT NULL AND account_identifier = $2)
            OR ($2::varchar IS NULL AND (account_identifier IS NULL OR account_identifier = ''))
          )
          AND exit_time IS NOT NULL
          AND DATE(exit_time) >= $3
          AND DATE(exit_time) <= $4
        GROUP BY DATE(exit_time)
      ),
      daily_trades AS (
        -- Combine entry and exit cashflows by date
        -- Commission handling: NET approach to match broker statements
        -- - Fees reduce inflows or increase outflows for the same transaction type
        -- - Rebates increase inflows or reduce outflows
        SELECT
          date,
          -- Net inflows: trade value - fees + rebates
          GREATEST(0, SUM(trade_inflow) - SUM(inflow_fees) + SUM(inflow_rebates)) as trade_inflow,
          -- Net outflows: trade value + fees - rebates + other fees
          GREATEST(0, SUM(trade_outflow) + SUM(outflow_fees) - SUM(outflow_rebates) + SUM(COALESCE(other_fees, 0))) as trade_outflow,
          -- Track total fees for display
          SUM(inflow_fees) - SUM(inflow_rebates) + SUM(outflow_fees) - SUM(outflow_rebates) + SUM(COALESCE(other_fees, 0)) as fees
        FROM (
          SELECT date, trade_inflow, trade_outflow, inflow_fees, inflow_rebates, outflow_fees, outflow_rebates, 0::numeric as other_fees FROM entry_cashflows
          UNION ALL
          SELECT date, trade_inflow, trade_outflow, inflow_fees, inflow_rebates, outflow_fees, outflow_rebates, other_fees FROM exit_cashflows
        ) combined
        GROUP BY date
      ),
      daily_transactions AS (
        SELECT
          transaction_date as date,
          COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as deposits,
          COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) as withdrawals
        FROM account_transactions
        WHERE user_id = $1
          AND account_id = $5
          AND transaction_date >= $3
          AND transaction_date <= $4
        GROUP BY transaction_date
      ),
      all_dates AS (
        SELECT date FROM daily_trades
        UNION
        SELECT date FROM daily_transactions
      )
      SELECT
        ad.date,
        COALESCE(dt.trade_inflow, 0) as trade_inflow,
        COALESCE(dt.trade_outflow, 0) as trade_outflow,
        COALESCE(dt.fees, 0) as fees,
        COALESCE(dtx.deposits, 0) as deposits,
        COALESCE(dtx.withdrawals, 0) as withdrawals,
        (COALESCE(dt.trade_inflow, 0) + COALESCE(dtx.deposits, 0)) as inflow,
        (COALESCE(dt.trade_outflow, 0) + COALESCE(dtx.withdrawals, 0)) as outflow,
        (
          (COALESCE(dt.trade_inflow, 0) + COALESCE(dtx.deposits, 0)) -
          (COALESCE(dt.trade_outflow, 0) + COALESCE(dtx.withdrawals, 0))
        ) as net
      FROM all_dates ad
      LEFT JOIN daily_trades dt ON ad.date = dt.date
      LEFT JOIN daily_transactions dtx ON ad.date = dtx.date
      ORDER BY ad.date ASC
    `;

    const result = await db.query(query, [
      userId,
      account.account_identifier,
      effectiveStartDate,
      effectiveEndDate,
      accountId
    ]);

    // Calculate YTD deposits and withdrawals (always for current year, independent of filter)
    const currentYear = new Date().getFullYear();
    const ytdStartDate = `${currentYear}-01-01`;
    const ytdEndDate = new Date().toISOString().split('T')[0];

    const ytdQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as ytd_deposits,
        COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) as ytd_withdrawals
      FROM account_transactions
      WHERE user_id = $1
        AND account_id = $2
        AND transaction_date >= $3
        AND transaction_date <= $4
    `;

    const ytdResult = await db.query(ytdQuery, [userId, accountId, ytdStartDate, ytdEndDate]);
    const ytdData = ytdResult.rows[0] || { ytd_deposits: 0, ytd_withdrawals: 0 };

    // Calculate running balance
    let runningBalance = parseFloat(account.initial_balance) || 0;
    const cashflowData = result.rows.map(row => {
      const net = parseFloat(row.net) || 0;
      runningBalance += net;

      return {
        date: row.date,
        tradeInflow: parseFloat(row.trade_inflow) || 0,
        tradeOutflow: parseFloat(row.trade_outflow) || 0,
        fees: parseFloat(row.fees) || 0,
        deposits: parseFloat(row.deposits) || 0,
        withdrawals: parseFloat(row.withdrawals) || 0,
        inflow: parseFloat(row.inflow) || 0,
        outflow: parseFloat(row.outflow) || 0,
        net: net,
        balance: runningBalance
      };
    });

    // Calculate summary statistics
    const summary = {
      initialBalance: parseFloat(account.initial_balance) || 0,
      currentBalance: runningBalance,
      totalInflow: cashflowData.reduce((sum, d) => sum + d.inflow, 0),
      totalOutflow: cashflowData.reduce((sum, d) => sum + d.outflow, 0),
      totalDeposits: cashflowData.reduce((sum, d) => sum + d.deposits, 0),
      totalWithdrawals: cashflowData.reduce((sum, d) => sum + d.withdrawals, 0),
      totalFees: cashflowData.reduce((sum, d) => sum + d.fees, 0),
      totalTradeInflow: cashflowData.reduce((sum, d) => sum + d.tradeInflow, 0),
      totalTradeOutflow: cashflowData.reduce((sum, d) => sum + d.tradeOutflow, 0),
      tradingDays: cashflowData.length,
      ytdDeposits: parseFloat(ytdData.ytd_deposits) || 0,
      ytdWithdrawals: parseFloat(ytdData.ytd_withdrawals) || 0
    };

    return {
      account: {
        id: account.id,
        accountName: account.account_name,
        accountIdentifier: account.account_identifier,
        broker: account.broker,
        initialBalance: parseFloat(account.initial_balance),
        initialBalanceDate: account.initial_balance_date,
        isPrimary: account.is_primary
      },
      cashflow: cashflowData,
      summary
    };
  }
}

module.exports = Account;
