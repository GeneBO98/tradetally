const db = require('../config/database');
const PortfolioService = require('./portfolioService');
const HistoricalInflationService = require('./historicalInflationService');
const { calculateRetirementProjection } = require('./retirementCalculator');

const DEFAULT_PLAN = Object.freeze({
  current_age: 35,
  age_as_of_date: null,
  target_retirement_age: 65,
  current_annual_cost_of_living: 60000,
  desired_annual_retirement_spending: 60000,
  target_portfolio_balance: null,
  monthly_contribution: 500,
  annual_contribution_increase_percent: 0,
  additional_retirement_savings: 0,
  other_annual_retirement_income: 0,
  other_income_start_age: 65,
  custom_return_rate_percent: 7,
  inflation_rate_percent: 3,
  withdrawal_rate_percent: 4
});

function toDateString(value = new Date()) {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPlanRow(row) {
  if (!row) return null;
  return {
    current_age: Number(row.current_age),
    age_as_of_date: toDateString(row.age_as_of_date),
    target_retirement_age: Number(row.target_retirement_age),
    current_annual_cost_of_living: Number(row.current_annual_cost_of_living),
    desired_annual_retirement_spending: Number(row.desired_annual_retirement_spending),
    target_portfolio_balance: parseNullableNumber(row.target_portfolio_balance),
    monthly_contribution: Number(row.monthly_contribution),
    annual_contribution_increase_percent: Number(row.annual_contribution_increase_percent),
    additional_retirement_savings: Number(row.additional_retirement_savings),
    other_annual_retirement_income: Number(row.other_annual_retirement_income),
    other_income_start_age: row.other_income_start_age === null ? null : Number(row.other_income_start_age),
    custom_return_rate_percent: Number(row.custom_return_rate_percent),
    inflation_rate_percent: Number(row.inflation_rate_percent),
    withdrawal_rate_percent: Number(row.withdrawal_rate_percent),
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function normalizePlan(data, existingPlan = null) {
  const today = toDateString();
  const base = {
    ...DEFAULT_PLAN,
    age_as_of_date: today,
    ...(existingPlan || {}),
    ...(data || {})
  };

  return {
    current_age: Number(base.current_age),
    age_as_of_date: toDateString(base.age_as_of_date || today),
    target_retirement_age: Number(base.target_retirement_age),
    current_annual_cost_of_living: Number(base.current_annual_cost_of_living),
    desired_annual_retirement_spending: Number(base.desired_annual_retirement_spending),
    target_portfolio_balance: parseNullableNumber(base.target_portfolio_balance),
    monthly_contribution: Number(base.monthly_contribution),
    annual_contribution_increase_percent: Number(base.annual_contribution_increase_percent),
    additional_retirement_savings: Number(base.additional_retirement_savings),
    other_annual_retirement_income: Number(base.other_annual_retirement_income),
    other_income_start_age: parseNullableNumber(base.other_income_start_age),
    custom_return_rate_percent: Number(base.custom_return_rate_percent),
    inflation_rate_percent: Number(base.inflation_rate_percent),
    withdrawal_rate_percent: Number(base.withdrawal_rate_percent)
  };
}

class RetirementService {
  static getDefaultPlan() {
    return normalizePlan({});
  }

  static async getSavedPlan(userId) {
    const result = await db.query(
      `SELECT *
       FROM retirement_plans
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    return mapPlanRow(result.rows[0]);
  }

  static async savePlan(userId, data) {
    const existingPlan = await this.getSavedPlan(userId);
    const plan = normalizePlan({
      ...data,
      age_as_of_date: toDateString()
    }, existingPlan);
    const result = await db.query(
      `INSERT INTO retirement_plans (
         user_id,
         current_age,
         age_as_of_date,
         target_retirement_age,
         current_annual_cost_of_living,
         desired_annual_retirement_spending,
         target_portfolio_balance,
         monthly_contribution,
         annual_contribution_increase_percent,
         additional_retirement_savings,
         other_annual_retirement_income,
         other_income_start_age,
         custom_return_rate_percent,
         inflation_rate_percent,
         withdrawal_rate_percent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (user_id) DO UPDATE SET
         current_age = EXCLUDED.current_age,
         age_as_of_date = EXCLUDED.age_as_of_date,
         target_retirement_age = EXCLUDED.target_retirement_age,
         current_annual_cost_of_living = EXCLUDED.current_annual_cost_of_living,
         desired_annual_retirement_spending = EXCLUDED.desired_annual_retirement_spending,
         target_portfolio_balance = EXCLUDED.target_portfolio_balance,
         monthly_contribution = EXCLUDED.monthly_contribution,
         annual_contribution_increase_percent = EXCLUDED.annual_contribution_increase_percent,
         additional_retirement_savings = EXCLUDED.additional_retirement_savings,
         other_annual_retirement_income = EXCLUDED.other_annual_retirement_income,
         other_income_start_age = EXCLUDED.other_income_start_age,
         custom_return_rate_percent = EXCLUDED.custom_return_rate_percent,
         inflation_rate_percent = EXCLUDED.inflation_rate_percent,
         withdrawal_rate_percent = EXCLUDED.withdrawal_rate_percent,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        userId,
        plan.current_age,
        plan.age_as_of_date,
        plan.target_retirement_age,
        plan.current_annual_cost_of_living,
        plan.desired_annual_retirement_spending,
        plan.target_portfolio_balance,
        plan.monthly_contribution,
        plan.annual_contribution_increase_percent,
        plan.additional_retirement_savings,
        plan.other_annual_retirement_income,
        plan.other_income_start_age,
        plan.custom_return_rate_percent,
        plan.inflation_rate_percent,
        plan.withdrawal_rate_percent
      ]
    );
    return mapPlanRow(result.rows[0]);
  }

  static async deletePlan(userId) {
    const result = await db.query(
      'DELETE FROM retirement_plans WHERE user_id = $1',
      [userId]
    );
    return result.rowCount > 0;
  }

  static async calculate(userId, data, options = {}) {
    const plan = normalizePlan(data);
    const [overview, portfolioHistoricalScenarios, availableAccounts] = await Promise.all([
      PortfolioService.getOverview(userId, options),
      PortfolioService.getHistoricalReturnScenarios(userId, options),
      PortfolioService.getRetirementAccountBreakdown(userId)
    ]);
    const historicalInflation = await HistoricalInflationService.enrichScenarios(
      portfolioHistoricalScenarios
    );
    const historicalScenarios = historicalInflation.scenarios;
    const scope = options.accounts
      ? String(options.accounts).split(',').map(value => value.trim()).filter(Boolean)
      : [];
    const projection = calculateRetirementProjection({
      plan,
      tracked_portfolio_value: overview.totalValue || 0,
      historical_scenarios: historicalScenarios,
      as_of_date: new Date()
    });

    return {
      draft_plan: plan,
      portfolio: {
        scope: scope.length > 0 ? 'filtered' : 'all_accounts',
        accounts: scope,
        tracked_portfolio_value: Number(overview.totalValue) || 0,
        total_cost_basis: Number(overview.totalCostBasis) || 0,
        position_count: Number(overview.positionCount) || 0,
        price_stale_position_count: Number(overview.priceStalePositionCount) || 0,
        available_accounts: availableAccounts
      },
      historical_scenarios: historicalScenarios,
      historical_inflation: {
        source: historicalInflation.source,
        series_id: historicalInflation.series_id,
        unavailable: historicalInflation.unavailable,
        message: historicalInflation.message
      },
      projection
    };
  }

  static async get(userId, options = {}) {
    const savedPlan = await this.getSavedPlan(userId);
    const plan = savedPlan || this.getDefaultPlan();
    const result = await this.calculate(userId, plan, options);
    return {
      ...result,
      plan: savedPlan,
      draft_plan: plan,
      has_saved_plan: Boolean(savedPlan)
    };
  }
}

module.exports = RetirementService;
