const db = require('../../config/database');
const PlaidConnection = require('../../models/PlaidConnection');

const DIVIDEND_SUBTYPES = new Set(['dividend', 'qualified dividend', 'non-qualified dividend']);
const INTEREST_SUBTYPES = new Set(['interest', 'interest receivable']);
const FEE_SUBTYPES = new Set([
  'account fee',
  'management fee',
  'transfer fee',
  'legal fee',
  'miscellaneous fee',
  'tax',
  'tax withheld'
]);

/**
 * Classify a Plaid investment transaction type/subtype into an income
 * category. Returns 'dividend' | 'interest' | 'fee' | null.
 */
function classifyIncome(type, subtype) {
  const normalizedType = String(type || '').toLowerCase().trim();
  const normalizedSubtype = String(subtype || '').toLowerCase().trim();

  if (DIVIDEND_SUBTYPES.has(normalizedSubtype)) return 'dividend';
  if (INTEREST_SUBTYPES.has(normalizedSubtype)) return 'interest';
  if (FEE_SUBTYPES.has(normalizedSubtype)) return 'fee';
  if (normalizedType === 'fee') return 'fee';
  return null;
}

function monthKey(date) {
  return String(date).slice(0, 7);
}

class PlaidIncomeService {
  /**
   * Aggregate dividend/interest/fee activity from synced Plaid investment
   * transactions, by month and by symbol.
   *
   * Plaid sign convention: amount is positive when cash leaves the account,
   * negative when cash is credited. Dividends/interest therefore arrive as
   * negative amounts (income = -amount); fees arrive positive.
   */
  async getIncomeSummary(userId, { startDate = null, endDate = null } = {}) {
    const schemaReady = await PlaidConnection.hasSchema();
    if (!schemaReady) {
      return this.emptySummary();
    }

    const result = await db.query(`
      SELECT
        pt.amount,
        pt.transaction_date,
        pt.description,
        pt.metadata->>'investmentType' AS investment_type,
        pt.metadata->>'investmentSubtype' AS investment_subtype,
        COALESCE(ps.ticker_symbol, ps.name) AS symbol_label
      FROM plaid_transactions pt
      LEFT JOIN plaid_securities ps
        ON ps.plaid_security_id = pt.raw_payload->>'security_id'
      WHERE pt.user_id = $1
        AND pt.transaction_source = 'investment'
        AND pt.is_removed = false
        AND ($2::date IS NULL OR pt.transaction_date >= $2)
        AND ($3::date IS NULL OR pt.transaction_date <= $3)
      ORDER BY pt.transaction_date ASC
    `, [userId, startDate, endDate]);

    const summary = { totalDividends: 0, totalInterest: 0, totalFees: 0, trailing12mDividends: 0 };
    const byMonth = new Map();
    const bySymbol = new Map();

    const trailingCutoff = new Date();
    trailingCutoff.setFullYear(trailingCutoff.getFullYear() - 1);

    for (const row of result.rows) {
      const category = classifyIncome(row.investment_type, row.investment_subtype);
      if (!category) continue;

      const amount = parseFloat(row.amount) || 0;
      // Income categories flip the sign; fees keep it (see convention above)
      const value = category === 'fee' ? amount : -amount;

      const month = monthKey(
        row.transaction_date instanceof Date
          ? row.transaction_date.toISOString().slice(0, 10)
          : row.transaction_date
      );
      if (!byMonth.has(month)) {
        byMonth.set(month, { month, dividends: 0, interest: 0, fees: 0 });
      }
      const monthEntry = byMonth.get(month);

      const symbol = row.symbol_label || 'Unknown';
      if (!bySymbol.has(symbol)) {
        bySymbol.set(symbol, { symbol, dividends: 0, interest: 0, fees: 0, transactionCount: 0, lastDate: null });
      }
      const symbolEntry = bySymbol.get(symbol);
      symbolEntry.transactionCount += 1;
      const rowDate = new Date(row.transaction_date);
      if (!symbolEntry.lastDate || rowDate > new Date(symbolEntry.lastDate)) {
        symbolEntry.lastDate = row.transaction_date;
      }

      if (category === 'dividend') {
        summary.totalDividends += value;
        monthEntry.dividends += value;
        symbolEntry.dividends += value;
        if (rowDate >= trailingCutoff) {
          summary.trailing12mDividends += value;
        }
      } else if (category === 'interest') {
        summary.totalInterest += value;
        monthEntry.interest += value;
        symbolEntry.interest += value;
      } else {
        summary.totalFees += value;
        monthEntry.fees += value;
        symbolEntry.fees += value;
      }
    }

    const round2 = value => Math.round(value * 100) / 100;
    for (const entry of byMonth.values()) {
      entry.dividends = round2(entry.dividends);
      entry.interest = round2(entry.interest);
      entry.fees = round2(entry.fees);
    }
    for (const entry of bySymbol.values()) {
      entry.dividends = round2(entry.dividends);
      entry.interest = round2(entry.interest);
      entry.fees = round2(entry.fees);
    }

    return {
      summary: {
        totalDividends: round2(summary.totalDividends),
        totalInterest: round2(summary.totalInterest),
        totalFees: round2(summary.totalFees),
        trailing12mDividends: round2(summary.trailing12mDividends)
      },
      byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
      bySymbol: [...bySymbol.values()].sort((a, b) => (b.dividends + b.interest) - (a.dividends + a.interest))
    };
  }

  emptySummary() {
    return {
      summary: { totalDividends: 0, totalInterest: 0, totalFees: 0, trailing12mDividends: 0 },
      byMonth: [],
      bySymbol: []
    };
  }
}

const plaidIncomeService = new PlaidIncomeService();
plaidIncomeService.classifyIncome = classifyIncome;

module.exports = plaidIncomeService;
module.exports.classifyIncome = classifyIncome;
