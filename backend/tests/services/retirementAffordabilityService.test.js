jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/PlaidLiability', () => ({
  hasSchema: jest.fn(async () => true),
  listByUser: jest.fn(async () => [])
}));
jest.mock('../../src/services/cashflowClassificationService', () => ({
  CATEGORIES: ['income', 'essential', 'discretionary', 'debt_payment', 'savings', 'transfer', 'refund', 'other'],
  classifyAll: jest.fn(async () => ({ rules: 10, ai: 4, unclassified: 1, ai_reason: null })),
  setUserCategory: jest.fn(async () => ({ id: 'tx', cashflow_category: 'essential', cashflow_source: 'user' }))
}));

const db = require('../../src/config/database');
const PlaidLiability = require('../../src/models/PlaidLiability');
const Service = require('../../src/services/retirementAffordabilityService');

const rows = [
  { cashflow_category: 'income', cashflow_source: 'rule', amount: -6000, transaction_date: '2026-09-01' },
  { cashflow_category: 'income', cashflow_source: 'rule', amount: -6000, transaction_date: '2026-10-01' },
  { cashflow_category: 'essential', cashflow_source: 'rule', amount: 3000, transaction_date: '2026-09-05' },
  { cashflow_category: 'essential', cashflow_source: 'ai', amount: 3000, transaction_date: '2026-10-05' },
  { cashflow_category: 'discretionary', cashflow_source: 'ai', amount: 1000, transaction_date: '2026-09-10' },
  { cashflow_category: 'discretionary', cashflow_source: 'user', amount: 1000, transaction_date: '2026-10-10' },
  { cashflow_category: 'refund', cashflow_source: 'rule', amount: -200, transaction_date: '2026-10-12' },
  { cashflow_category: 'debt_payment', cashflow_source: 'rule', amount: 400, transaction_date: '2026-09-15' },
  { cashflow_category: 'debt_payment', cashflow_source: 'rule', amount: 400, transaction_date: '2026-10-15' },
  { cashflow_category: 'savings', cashflow_source: 'rule', amount: 500, transaction_date: '2026-09-20' },
  { cashflow_category: 'savings', cashflow_source: 'rule', amount: 500, transaction_date: '2026-10-20' },
  { cashflow_category: 'transfer', cashflow_source: 'rule', amount: 2000, transaction_date: '2026-10-21' },
  { cashflow_category: null, cashflow_source: null, amount: 33, transaction_date: '2026-10-22' }
];

describe('aggregateCashflow', () => {
  test('averages over months that contain transactions and nets refunds and transfers', () => {
    const summary = Service.aggregateCashflow(rows, { months: 12 });
    expect(summary.months_covered).toBe(2);
    expect(summary.transaction_count).toBe(13);
    expect(summary.unclassified_count).toBe(1);
    expect(summary.classification_sources).toEqual({ rule: 9, ai: 2, user: 1 });
    expect(summary.monthly.income).toBe(6000);
    expect(summary.monthly.essential).toBe(3000);
    expect(summary.monthly.discretionary).toBe(1000);
    expect(summary.monthly.refunds).toBe(100);
    expect(summary.monthly.spending).toBe(3900);
    expect(summary.monthly.debt_payments).toBe(400);
    expect(summary.monthly.savings).toBe(500);
    expect(summary.monthly.left_over).toBe(1200);
    expect(summary.monthly.capacity).toBe(1700);
  });

  test('uses magnitudes so an inconsistently signed paycheck still counts as income', () => {
    const summary = Service.aggregateCashflow([
      { cashflow_category: 'income', cashflow_source: 'user', amount: 5850, transaction_date: '2026-10-01' },
      { cashflow_category: 'essential', cashflow_source: 'rule', amount: 2000, transaction_date: '2026-10-02' }
    ], { months: 12 });
    expect(summary.income_detected).toBe(true);
    expect(summary.monthly.income).toBe(5850);
    expect(summary.monthly.capacity).toBe(3850);
  });

  test('never divides by zero and clamps capacity at zero', () => {
    const summary = Service.aggregateCashflow([
      { cashflow_category: 'essential', cashflow_source: 'rule', amount: 5000, transaction_date: '2026-10-01' }
    ], { months: 12 });
    expect(summary.months_covered).toBe(1);
    expect(summary.income_detected).toBe(false);
    expect(summary.monthly.left_over).toBe(-5000);
    expect(summary.monthly.capacity).toBe(0);
  });
});

describe('assessViability', () => {
  const summary = { monthly: { capacity: 1700, discretionary: 1000 } };
  const plan = { monthly_contribution: 500 };

  test('on track when the current contribution already meets the requirement', () => {
    expect(Service.assessViability(summary, { required_monthly_contribution: 450 }, plan))
      .toMatchObject({ status: 'on_track', increase_needed: 0, shortfall_per_month: 0 });
  });

  test('affordable when the required increase fits inside capacity', () => {
    expect(Service.assessViability(summary, { required_monthly_contribution: 1500 }, plan))
      .toMatchObject({ status: 'affordable', increase_needed: 1000, shortfall_per_month: 0, spending_cut_percent: null });
  });

  test('stretch reports the gap, a spending cut and a later retirement age', () => {
    const result = Service.assessViability(summary, { required_monthly_contribution: 2200, estimated_goal_age: 68.4 }, plan);
    expect(result).toMatchObject({
      status: 'stretch',
      required: 2200,
      increase_needed: 1700,
      shortfall_per_month: 500,
      spending_cut_percent: 50,
      suggested_retirement_age: 69
    });
  });

  test('not reachable when the calculator found no contribution that works', () => {
    expect(Service.assessViability(summary, { required_monthly_contribution: null, estimated_goal_age: null }, plan))
      .toMatchObject({ status: 'not_reachable', required: null, suggested_retirement_age: null });
  });
});

describe('getSummary and attach', () => {
  beforeEach(() => {
    db.query.mockReset();
    PlaidLiability.listByUser.mockReset().mockResolvedValue([]);
    Service.invalidate('user-1');
  });

  test('returns no_bank_connection when the user has no bank link', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const result = await Service.attach({ draft_plan: {}, projection: { scenarios: [] } }, 'user-1');
    expect(result.affordability).toEqual({ available: false, reason: 'no_bank_connection' });
  });

  test('builds the summary, debt totals, suggestions and per-scenario viability, then caches it', async () => {
    PlaidLiability.listByUser.mockResolvedValue([
      { current_balance: 8000, minimum_payment: 250, is_overdue: false },
      { current_balance: 200000, minimum_payment: 1500, is_overdue: true }
    ]);
    db.query
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [
        { id: 'sav', account_name: 'Savings', account_type: 'depository', account_subtype: 'savings', current_balance: '12000', include_in_retirement_savings: true },
        { id: 'chk', account_name: 'Checking', account_type: 'depository', account_subtype: 'checking', current_balance: '3000', include_in_retirement_savings: false }
      ] });

    const result = await Service.attach({
      draft_plan: { monthly_contribution: 500 },
      projection: { scenarios: [
        { key: 'custom', required_monthly_contribution: 1500, estimated_goal_age: 70 },
        { key: 'hist', required_monthly_contribution: 400, estimated_goal_age: 63 }
      ] }
    }, 'user-1');

    const affordability = result.affordability;
    expect(affordability.available).toBe(true);
    expect(affordability.cashflow.monthly.capacity).toBe(1700);
    expect(affordability.debt).toMatchObject({ total_balance: 208000, monthly_minimum_payments: 1750, count: 2, overdue_count: 1 });
    expect(affordability.suggestions).toMatchObject({
      monthly_contribution_current_saving: 500,
      monthly_contribution_capacity: 1700,
      current_annual_cost_of_living: 51600,
      desired_annual_retirement_spending: 37440,
      additional_retirement_savings: 12000
    });
    expect(affordability.classification).toMatchObject({ rules: 10, ai: 4, unclassified: 1, ai_enabled: true });
    expect(affordability.viability.custom.status).toBe('affordable');
    expect(affordability.viability.hist.status).toBe('on_track');

    const again = await Service.attach({ draft_plan: {}, projection: { scenarios: [] } }, 'user-1');
    expect(again.affordability.available).toBe(true);
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  test('never throws when the summary cannot be built', async () => {
    db.query.mockRejectedValueOnce(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await Service.attach({ draft_plan: {}, projection: { scenarios: [] } }, 'user-1');
    expect(result.affordability).toEqual({ available: false, reason: 'error' });
    warn.mockRestore();
  });
});
