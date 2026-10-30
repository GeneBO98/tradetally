const plaidClient = require('./plaidClient');
const PlaidLiability = require('../../models/PlaidLiability');

// Plaid error codes that mean "this Item has no liabilities product", which is
// normal for most bank links and must not fail the sync.
const SKIPPABLE_ERROR_CODES = new Set([
  'PRODUCTS_NOT_SUPPORTED',
  'PRODUCT_NOT_READY',
  'INVALID_PRODUCT',
  'NO_LIABILITY_ACCOUNTS',
  'ADDITIONAL_CONSENT_REQUIRED',
  'NO_ACCOUNTS'
]);

function pickApr(credit) {
  const aprs = Array.isArray(credit.aprs) ? credit.aprs : [];
  const purchase = aprs.find(apr => apr.apr_type === 'purchase_apr');
  const chosen = purchase || aprs.find(apr => Number.isFinite(Number(apr.apr_percentage))) || null;
  return chosen ? Number(chosen.apr_percentage) : null;
}

/**
 * Map the three Plaid liability shapes onto one row shape. `accountsById`
 * maps Plaid account_id -> { id (plaid_accounts.id), balance, currency }.
 */
function mapLiabilities(payload, accountsById) {
  const liabilities = payload?.liabilities || {};
  const rows = [];

  for (const credit of liabilities.credit || []) {
    const account = accountsById.get(credit.account_id);
    if (!account) continue;
    rows.push({
      plaidAccountRowId: account.id,
      liabilityType: 'credit',
      currentBalance: account.currentBalance ?? credit.last_statement_balance ?? null,
      aprPercent: pickApr(credit),
      minimumPayment: credit.minimum_payment_amount ?? null,
      lastPaymentAmount: credit.last_payment_amount ?? null,
      lastPaymentDate: credit.last_payment_date || null,
      nextPaymentDueDate: credit.next_payment_due_date || null,
      originationDate: null,
      maturityDate: null,
      isOverdue: Boolean(credit.is_overdue),
      isoCurrencyCode: account.currencyCode || null,
      rawPayload: credit
    });
  }

  for (const mortgage of liabilities.mortgage || []) {
    const account = accountsById.get(mortgage.account_id);
    if (!account) continue;
    rows.push({
      plaidAccountRowId: account.id,
      liabilityType: 'mortgage',
      currentBalance: account.currentBalance ?? null,
      aprPercent: mortgage.interest_rate?.percentage ?? null,
      minimumPayment: mortgage.next_monthly_payment ?? null,
      lastPaymentAmount: mortgage.last_payment_amount ?? null,
      lastPaymentDate: mortgage.last_payment_date || null,
      nextPaymentDueDate: mortgage.next_payment_due_date || null,
      originationDate: mortgage.origination_date || null,
      maturityDate: mortgage.maturity_date || null,
      isOverdue: Number(mortgage.past_due_amount) > 0,
      isoCurrencyCode: account.currencyCode || null,
      rawPayload: mortgage
    });
  }

  for (const student of liabilities.student || []) {
    const account = accountsById.get(student.account_id);
    if (!account) continue;
    rows.push({
      plaidAccountRowId: account.id,
      liabilityType: 'student',
      currentBalance: account.currentBalance ?? null,
      aprPercent: student.interest_rate_percentage ?? null,
      minimumPayment: student.minimum_payment_amount ?? null,
      lastPaymentAmount: student.last_payment_amount ?? null,
      lastPaymentDate: student.last_payment_date || null,
      nextPaymentDueDate: student.next_payment_due_date || null,
      originationDate: student.origination_date || null,
      maturityDate: student.expected_payoff_date || null,
      isOverdue: Boolean(student.is_overdue),
      isoCurrencyCode: account.currencyCode || null,
      rawPayload: student
    });
  }

  return rows;
}

class PlaidLiabilitiesSyncService {
  /**
   * Fetch and store liabilities for a bank connection. Returns the number of
   * liabilities stored, or null when the Item has no liabilities product.
   */
  async syncLiabilities(connection, plaidAccountMap) {
    if (!(await PlaidLiability.hasSchema())) return null;

    let payload;
    try {
      payload = await plaidClient.getLiabilities(connection.accessToken);
    } catch (error) {
      if (SKIPPABLE_ERROR_CODES.has(error.plaid?.errorCode)) {
        return null;
      }
      throw error;
    }

    const accountsById = new Map();
    for (const [plaidAccountId, account] of plaidAccountMap.entries()) {
      accountsById.set(plaidAccountId, {
        id: account.id,
        currentBalance: account.currentBalance ?? null,
        currencyCode: account.currencyCode || null
      });
    }
    // /liabilities/get returns fresh balances for the liability accounts.
    for (const account of payload.accounts || []) {
      const existing = accountsById.get(account.account_id);
      if (existing && account.balances?.current != null) {
        existing.currentBalance = Number(account.balances.current);
      }
    }

    const rows = mapLiabilities(payload, accountsById);
    return PlaidLiability.replaceForConnection(connection.id, connection.userId, rows);
  }
}

module.exports = new PlaidLiabilitiesSyncService();
module.exports.mapLiabilities = mapLiabilities;
module.exports.SKIPPABLE_ERROR_CODES = SKIPPABLE_ERROR_CODES;
