/**
 * Retirement affordability: what the trader earns, spends, owes and already
 * saves, derived from Plaid bank transactions and liabilities, and whether the
 * retirement plan fits inside that cash flow.
 *
 * Summaries are cached per user for a few minutes because the planner
 * recalculates on every input change and the AI classification pass is the
 * expensive part. Anything that changes the inputs (a Plaid sync, a category
 * override, an account flag) calls invalidate().
 */
const db = require('../config/database');
const PlaidLiability = require('../models/PlaidLiability');
const CashflowClassificationService = require('./cashflowClassificationService');

const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MONTHS = 12;
const MIN_MONTHS = 3;
const MAX_MONTHS = 24;
const RETIREMENT_SPENDING_RATIO = 0.8;
const cache = new Map();

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function clampMonths(months) {
  const parsed = Number.parseInt(months, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MONTHS;
  return Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, parsed));
}

function windowStart(months) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().split('T')[0];
}

/**
 * Pure aggregation. `rows` are { cashflow_category, amount (Plaid sign),
 * transaction_date }. Returns monthly averages over the months that actually
 * contain transactions, so a link made three months ago is not divided by 12.
 */
function aggregateCashflow(rows, { months }) {
  const totals = {
    income: 0, essential: 0, discretionary: 0, debt_payment: 0, savings: 0, transfer: 0, refund: 0, other: 0
  };
  const counts = { ...totals };
  const monthsSeen = new Set();
  let classified = 0;
  let unclassified = 0;
  let bySource = { rule: 0, ai: 0, user: 0 };

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    monthsSeen.add(String(row.transaction_date).slice(0, 7));
    const category = row.cashflow_category;
    if (!category || !(category in totals)) {
      unclassified += 1;
      continue;
    }
    classified += 1;
    if (row.cashflow_source && row.cashflow_source in bySource) bySource[row.cashflow_source] += 1;
    // The category already says which way money moved, so use magnitudes.
    // Some institutions (and Plaid's sandbox) report sign inconsistently.
    totals[category] += Math.abs(amount);
    counts[category] += 1;
  }

  const monthsCovered = Math.max(1, Math.min(months, monthsSeen.size));
  const monthly = Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, round(value / monthsCovered)])
  );
  const spending = monthly.essential + monthly.discretionary - monthly.refund;
  const leftOver = monthly.income - spending - monthly.debt_payment - monthly.savings;

  return {
    months_requested: months,
    months_covered: monthsCovered,
    transaction_count: rows.length,
    classified_count: classified,
    unclassified_count: unclassified,
    classification_sources: bySource,
    income_detected: monthly.income > 0,
    monthly: {
      income: monthly.income,
      essential: monthly.essential,
      discretionary: monthly.discretionary,
      refunds: monthly.refund,
      spending: round(Math.max(0, spending)),
      debt_payments: monthly.debt_payment,
      savings: monthly.savings,
      left_over: round(leftOver),
      capacity: round(Math.max(0, monthly.savings + leftOver))
    },
    category_counts: counts
  };
}

/**
 * Compare a scenario's required contribution to what the cash flow allows.
 */
function assessViability(summary, scenario, plan) {
  if (!summary || !scenario) return null;
  const capacity = Number(summary.monthly?.capacity) || 0;
  const discretionary = Number(summary.monthly?.discretionary) || 0;
  const current = Number(plan?.monthly_contribution) || 0;
  const required = scenario.required_monthly_contribution;

  if (required == null) {
    return {
      status: 'not_reachable',
      capacity,
      required: null,
      increase_needed: null,
      shortfall_per_month: null,
      spending_cut_percent: null,
      suggested_retirement_age: scenario.estimated_goal_age == null ? null : Math.ceil(scenario.estimated_goal_age),
      current_contribution_affordable: current <= capacity
    };
  }

  const increase = round(Math.max(0, required - current));
  if (required <= current) {
    return {
      status: 'on_track',
      capacity,
      required: round(required),
      increase_needed: 0,
      shortfall_per_month: 0,
      spending_cut_percent: null,
      suggested_retirement_age: null,
      current_contribution_affordable: current <= capacity
    };
  }
  if (required <= capacity) {
    return {
      status: 'affordable',
      capacity,
      required: round(required),
      increase_needed: increase,
      shortfall_per_month: 0,
      spending_cut_percent: null,
      suggested_retirement_age: null,
      current_contribution_affordable: current <= capacity
    };
  }
  const shortfall = round(required - capacity);
  return {
    status: 'stretch',
    capacity,
    required: round(required),
    increase_needed: increase,
    shortfall_per_month: shortfall,
    spending_cut_percent: discretionary > 0 ? round(Math.min(100, (shortfall / discretionary) * 100), 0) : null,
    suggested_retirement_age: scenario.estimated_goal_age == null ? null : Math.ceil(scenario.estimated_goal_age),
    current_contribution_affordable: current <= capacity
  };
}

function buildSuggestions(summary, savingsAccounts) {
  const monthly = summary.monthly;
  const annualSpending = round((monthly.spending + monthly.debt_payments) * 12);
  const annualSpendingWithoutDebt = round(monthly.spending * 12);
  return {
    monthly_contribution_current_saving: round(monthly.savings, 0),
    monthly_contribution_capacity: round(monthly.capacity, 0),
    current_annual_cost_of_living: annualSpending,
    desired_annual_retirement_spending: round(annualSpendingWithoutDebt * RETIREMENT_SPENDING_RATIO, 0),
    retirement_spending_ratio_percent: RETIREMENT_SPENDING_RATIO * 100,
    additional_retirement_savings: round(
      savingsAccounts
        .filter(account => account.include_in_retirement_savings)
        .reduce((sum, account) => sum + (Number(account.current_balance) || 0), 0)
    )
  };
}

class RetirementAffordabilityService {
  static get DEFAULT_MONTHS() {
    return DEFAULT_MONTHS;
  }

  static get CATEGORIES() {
    return CashflowClassificationService.CATEGORIES;
  }

  static aggregateCashflow(rows, options) {
    return aggregateCashflow(rows, options);
  }

  static assessViability(summary, scenario, plan) {
    return assessViability(summary, scenario, plan);
  }

  static invalidate(userId) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${userId}:`)) cache.delete(key);
    }
  }

  static async hasBankConnection(userId) {
    const result = await db.query(`
      SELECT COUNT(*)::int AS count
      FROM plaid_connections
      WHERE user_id = $1 AND target_type = 'bank' AND connection_status IN ('active', 'reauth_required')
    `, [userId]);
    return (result.rows[0]?.count || 0) > 0;
  }

  static async listDepositoryAccounts(userId) {
    const result = await db.query(`
      SELECT a.id, a.account_name, a.official_name, a.mask, a.account_type, a.account_subtype,
             a.current_balance, a.available_balance, a.iso_currency_code,
             a.include_in_retirement_savings, c.institution_name
      FROM plaid_accounts a
      JOIN plaid_connections c ON c.id = a.connection_id
      WHERE a.user_id = $1
        AND a.is_active = true
        AND a.account_type = 'depository'
      ORDER BY a.account_subtype, a.account_name
    `, [userId]);
    return result.rows.map(row => ({
      id: row.id,
      account_name: row.account_name,
      official_name: row.official_name || null,
      mask: row.mask || null,
      account_type: row.account_type,
      account_subtype: row.account_subtype,
      institution_name: row.institution_name || null,
      current_balance: row.current_balance === null ? null : Number(row.current_balance),
      iso_currency_code: row.iso_currency_code || null,
      include_in_retirement_savings: Boolean(row.include_in_retirement_savings)
    }));
  }

  static async setAccountRetirementSavings(userId, plaidAccountRowId, include) {
    const result = await db.query(`
      UPDATE plaid_accounts
      SET include_in_retirement_savings = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND account_type = 'depository'
      RETURNING id, include_in_retirement_savings
    `, [plaidAccountRowId, userId, Boolean(include)]);
    this.invalidate(userId);
    return result.rows[0] || null;
  }

  static async loadCategorizedRows(userId, months) {
    const result = await db.query(`
      SELECT cashflow_category, cashflow_source, amount, transaction_date
      FROM plaid_transactions
      WHERE user_id = $1
        AND transaction_source = 'bank'
        AND pending = false
        AND is_removed = false
        AND transaction_date >= $2
    `, [userId, windowStart(months)]);
    return result.rows;
  }

  /**
   * Largest transactions in the window with their category, for the review
   * list. Users correct the few that matter rather than every row.
   */
  static async listTransactions(userId, { months = DEFAULT_MONTHS, limit = 40, category = null } = {}) {
    const params = [userId, windowStart(clampMonths(months)), Math.min(200, Math.max(1, Number(limit) || 40))];
    let categoryFilter = '';
    if (category) {
      params.push(category);
      categoryFilter = `AND t.cashflow_category = $${params.length}`;
    }
    const result = await db.query(`
      SELECT t.id, t.amount, t.transaction_date, t.description, t.merchant_name,
             t.cashflow_category, t.cashflow_source, t.cashflow_confidence,
             t.metadata->>'categoryPrimary' AS plaid_category,
             a.account_name, a.mask
      FROM plaid_transactions t
      JOIN plaid_accounts a ON a.id = t.plaid_account_row_id
      WHERE t.user_id = $1
        AND t.transaction_source = 'bank'
        AND t.pending = false
        AND t.is_removed = false
        AND t.transaction_date >= $2
        ${categoryFilter}
      ORDER BY ABS(t.amount) DESC, t.transaction_date DESC
      LIMIT $3
    `, params);
    return result.rows.map(row => ({
      id: row.id,
      amount: Number(row.amount),
      direction: Number(row.amount) < 0 ? 'in' : 'out',
      transaction_date: String(row.transaction_date).split('T')[0],
      description: row.description,
      merchant_name: row.merchant_name || null,
      plaid_category: row.plaid_category || null,
      cashflow_category: row.cashflow_category || null,
      cashflow_source: row.cashflow_source || null,
      cashflow_confidence: row.cashflow_confidence === null ? null : Number(row.cashflow_confidence),
      account_name: row.account_name,
      mask: row.mask || null
    }));
  }

  static async setTransactionCategory(userId, transactionId, category) {
    const row = await CashflowClassificationService.setUserCategory(userId, transactionId, category);
    this.invalidate(userId);
    return row;
  }

  /**
   * Build the cash-flow summary, running classification first. Returns null
   * when the user has no bank link, so callers can leave the feature out.
   */
  static async getSummary(userId, { months = DEFAULT_MONTHS, allowAi = true, force = false } = {}) {
    const window = clampMonths(months);
    const cacheKey = `${userId}:${window}`;
    const cached = cache.get(cacheKey);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

    if (!(await this.hasBankConnection(userId))) {
      cache.set(cacheKey, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    let classification = { rules: 0, ai: 0, unclassified: 0, ai_reason: null };
    try {
      classification = await CashflowClassificationService.classifyAll(userId, { months: window, allowAi });
    } catch (error) {
      console.warn('[AFFORDABILITY] Classification failed:', error.message);
    }

    const [rows, liabilities, accounts] = await Promise.all([
      this.loadCategorizedRows(userId, window),
      PlaidLiability.hasSchema().then(ready => (ready ? PlaidLiability.listByUser(userId) : [])),
      this.listDepositoryAccounts(userId)
    ]);

    const cashflow = aggregateCashflow(rows, { months: window });
    const debt = {
      total_balance: round(liabilities.reduce((sum, item) => sum + (Number(item.current_balance) || 0), 0)),
      monthly_minimum_payments: round(liabilities.reduce((sum, item) => sum + (Number(item.minimum_payment) || 0), 0)),
      count: liabilities.length,
      overdue_count: liabilities.filter(item => item.is_overdue).length,
      items: liabilities
    };

    const value = {
      available: true,
      as_of: new Date().toISOString(),
      window_start: windowStart(window),
      cashflow,
      debt,
      savings_accounts: accounts,
      suggestions: buildSuggestions(cashflow, accounts),
      classification: {
        ...classification,
        ai_enabled: classification.ai_reason !== 'no_ai_provider' && classification.ai_reason !== 'disabled'
      }
    };
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /**
   * Attach `affordability` to a retirement calculation result. Never throws:
   * the planner must keep working when Plaid or the AI provider is down.
   */
  static async attach(result, userId, options = {}) {
    try {
      const summary = await this.getSummary(userId, options);
      if (!summary) {
        return { ...result, affordability: { available: false, reason: 'no_bank_connection' } };
      }
      const viability = {};
      for (const scenario of result.projection?.scenarios || []) {
        viability[scenario.key] = assessViability(summary.cashflow, scenario, result.draft_plan);
      }
      return { ...result, affordability: { ...summary, viability } };
    } catch (error) {
      console.warn('[AFFORDABILITY] Could not build affordability summary:', error.message);
      return { ...result, affordability: { available: false, reason: 'error' } };
    }
  }
}

module.exports = RetirementAffordabilityService;
