const db = require('../config/database');

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value) {
  if (!value) return null;
  const text = String(value).split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

class PlaidLiability {
  static async hasSchema() {
    const result = await db.query(
      "SELECT to_regclass('public.plaid_liabilities') IS NOT NULL AS ready"
    );
    return Boolean(result.rows[0]?.ready);
  }

  /**
   * Replace the liabilities for one connection with the latest Plaid payload.
   * Accounts that no longer appear are removed so a paid-off card drops out.
   */
  static async replaceForConnection(connectionId, userId, liabilities = []) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const keptAccountRowIds = [];

      for (const liability of liabilities) {
        const result = await client.query(`
          INSERT INTO plaid_liabilities (
            user_id, connection_id, plaid_account_row_id, liability_type,
            current_balance, apr_percent, minimum_payment, last_payment_amount,
            last_payment_date, next_payment_due_date, origination_date, maturity_date,
            is_overdue, iso_currency_code, raw_payload, synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
          ON CONFLICT (plaid_account_row_id) DO UPDATE SET
            connection_id = EXCLUDED.connection_id,
            liability_type = EXCLUDED.liability_type,
            current_balance = EXCLUDED.current_balance,
            apr_percent = EXCLUDED.apr_percent,
            minimum_payment = EXCLUDED.minimum_payment,
            last_payment_amount = EXCLUDED.last_payment_amount,
            last_payment_date = EXCLUDED.last_payment_date,
            next_payment_due_date = EXCLUDED.next_payment_due_date,
            origination_date = EXCLUDED.origination_date,
            maturity_date = EXCLUDED.maturity_date,
            is_overdue = EXCLUDED.is_overdue,
            iso_currency_code = EXCLUDED.iso_currency_code,
            raw_payload = EXCLUDED.raw_payload,
            synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          RETURNING plaid_account_row_id
        `, [
          userId,
          connectionId,
          liability.plaidAccountRowId,
          liability.liabilityType,
          toNumber(liability.currentBalance),
          toNumber(liability.aprPercent),
          toNumber(liability.minimumPayment),
          toNumber(liability.lastPaymentAmount),
          toDate(liability.lastPaymentDate),
          toDate(liability.nextPaymentDueDate),
          toDate(liability.originationDate),
          toDate(liability.maturityDate),
          Boolean(liability.isOverdue),
          liability.isoCurrencyCode || null,
          JSON.stringify(liability.rawPayload || {})
        ]);
        keptAccountRowIds.push(result.rows[0].plaid_account_row_id);
      }

      await client.query(`
        DELETE FROM plaid_liabilities
        WHERE connection_id = $1
          AND ($2::uuid[] IS NULL OR plaid_account_row_id != ALL($2::uuid[]))
      `, [connectionId, keptAccountRowIds.length > 0 ? keptAccountRowIds : null]);

      await client.query('COMMIT');
      return keptAccountRowIds.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async listByUser(userId) {
    const result = await db.query(`
      SELECT l.*, a.account_name, a.official_name, a.mask, a.account_type, a.account_subtype,
             c.institution_name
      FROM plaid_liabilities l
      JOIN plaid_accounts a ON a.id = l.plaid_account_row_id
      JOIN plaid_connections c ON c.id = l.connection_id
      WHERE l.user_id = $1
        AND a.is_active = true
      ORDER BY l.current_balance DESC NULLS LAST
    `, [userId]);
    return result.rows.map(row => this.format(row));
  }

  static format(row) {
    if (!row) return null;
    return {
      id: row.id,
      plaid_account_row_id: row.plaid_account_row_id,
      liability_type: row.liability_type,
      account_name: row.account_name,
      official_name: row.official_name || null,
      mask: row.mask || null,
      institution_name: row.institution_name || null,
      current_balance: toNumber(row.current_balance),
      apr_percent: toNumber(row.apr_percent),
      minimum_payment: toNumber(row.minimum_payment),
      last_payment_amount: toNumber(row.last_payment_amount),
      last_payment_date: toDate(row.last_payment_date),
      next_payment_due_date: toDate(row.next_payment_due_date),
      origination_date: toDate(row.origination_date),
      maturity_date: toDate(row.maturity_date),
      is_overdue: Boolean(row.is_overdue),
      iso_currency_code: row.iso_currency_code || null,
      synced_at: row.synced_at ? new Date(row.synced_at).toISOString() : null
    };
  }
}

module.exports = PlaidLiability;
