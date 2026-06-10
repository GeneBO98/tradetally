const db = require('../config/database');

class PlaidBalanceSnapshot {
  static async hasSchema() {
    if (PlaidBalanceSnapshot._schemaReady) {
      return true;
    }

    const result = await db.query(`
      SELECT to_regclass('public.plaid_balance_snapshots') IS NOT NULL AS ready
    `);

    const ready = Boolean(result.rows[0]?.ready);
    if (ready) {
      PlaidBalanceSnapshot._schemaReady = true;
    }
    return ready;
  }

  /**
   * Record today's balance for each synced Plaid account. Re-syncs on the
   * same day overwrite the earlier value (last write of the day wins).
   *
   * @param {string} userId
   * @param {Array} accounts - formatted plaid accounts (camelCase) from
   *   PlaidConnection.upsertAccounts
   */
  static async upsertForAccounts(userId, accounts = []) {
    let written = 0;
    for (const account of accounts) {
      if (!account?.id) continue;
      if (account.currentBalance === null && account.availableBalance === null) continue;

      await db.query(`
        INSERT INTO plaid_balance_snapshots (
          user_id, plaid_account_row_id, snapshot_date,
          current_balance, available_balance, iso_currency_code
        )
        VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
        ON CONFLICT (plaid_account_row_id, snapshot_date) DO UPDATE SET
          current_balance = EXCLUDED.current_balance,
          available_balance = EXCLUDED.available_balance,
          iso_currency_code = EXCLUDED.iso_currency_code,
          updated_at = CURRENT_TIMESTAMP
      `, [
        userId,
        account.id,
        account.currentBalance,
        account.availableBalance,
        account.currencyCode || null
      ]);
      written += 1;
    }

    return written;
  }

  /**
   * Per-day balance totals across the user's active Plaid accounts, plus the
   * list of accounts contributing to the series.
   */
  static async getHistory(userId, { days = 90, plaidAccountRowId = null } = {}) {
    const params = [userId, days];
    let accountFilter = '';
    if (plaidAccountRowId) {
      params.push(plaidAccountRowId);
      accountFilter = `AND s.plaid_account_row_id = $${params.length}`;
    }

    const seriesResult = await db.query(`
      SELECT
        s.snapshot_date,
        SUM(s.current_balance) AS current_balance,
        SUM(s.available_balance) AS available_balance,
        COUNT(DISTINCT s.plaid_account_row_id) AS account_count
      FROM plaid_balance_snapshots s
      JOIN plaid_accounts pa ON pa.id = s.plaid_account_row_id
      WHERE s.user_id = $1
        AND pa.is_active = true
        AND s.snapshot_date >= CURRENT_DATE - ($2 || ' days')::interval
        ${accountFilter}
      GROUP BY s.snapshot_date
      ORDER BY s.snapshot_date ASC
    `, params);

    const accountsResult = await db.query(`
      SELECT DISTINCT pa.id, pa.account_name, pa.mask, pc.institution_name
      FROM plaid_balance_snapshots s
      JOIN plaid_accounts pa ON pa.id = s.plaid_account_row_id
      JOIN plaid_connections pc ON pc.id = pa.connection_id
      WHERE s.user_id = $1
        AND pa.is_active = true
      ORDER BY pa.account_name ASC
    `, [userId]);

    return {
      series: seriesResult.rows.map(row => ({
        date: row.snapshot_date,
        currentBalance: row.current_balance !== null ? parseFloat(row.current_balance) : null,
        availableBalance: row.available_balance !== null ? parseFloat(row.available_balance) : null,
        accountCount: parseInt(row.account_count, 10) || 0
      })),
      accounts: accountsResult.rows.map(row => ({
        plaidAccountRowId: row.id,
        accountName: row.account_name,
        mask: row.mask,
        institutionName: row.institution_name
      }))
    };
  }
}

module.exports = PlaidBalanceSnapshot;
