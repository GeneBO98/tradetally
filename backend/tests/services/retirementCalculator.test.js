const {
  calculateGoal,
  projectBalance,
  solveRequiredMonthlyContribution,
  estimateGoalAge,
  calculateRetirementProjection,
  calculateTimeWeightedReturn
} = require('../../src/services/retirementCalculator');

const basePlan = {
  current_age: 40,
  age_as_of_date: '2026-01-01',
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
};

describe('retirementCalculator', () => {
  test('projects zero-return monthly contributions without phantom growth', () => {
    const result = projectBalance({
      starting_balance: 1000,
      monthly_contribution: 100,
      annual_contribution_increase_percent: 0,
      annual_return_percent: 0,
      inflation_rate_percent: 0,
      months: 12
    });

    expect(result.balance).toBe(2200);
    expect(result.total_contributions).toBe(1200);
    expect(result.investment_growth).toBe(0);
  });

  test('supports negative annual returns greater than negative one hundred percent', () => {
    const result = projectBalance({
      starting_balance: 12000,
      monthly_contribution: 0,
      annual_contribution_increase_percent: 0,
      annual_return_percent: -12,
      inflation_rate_percent: 0,
      months: 12
    });

    expect(result.balance).toBeCloseTo(10560, 1);
  });

  test('increases monthly contributions on annual boundaries', () => {
    const result = projectBalance({
      starting_balance: 0,
      monthly_contribution: 100,
      annual_contribution_increase_percent: 10,
      annual_return_percent: 0,
      inflation_rate_percent: 0,
      months: 24
    });

    expect(result.balance).toBe(2520);
    expect(result.total_contributions).toBe(2520);
  });

  test('uses the larger of the spending target and explicit target', () => {
    const goal = calculateGoal({
      ...basePlan,
      desired_annual_retirement_spending: 80000,
      other_annual_retirement_income: 20000,
      other_income_start_age: 70,
      target_portfolio_balance: 2000000
    }, 20, 65);

    expect(goal.spending_target_today).toBe(1600000);
    expect(goal.bridge_reserve_today).toBe(100000);
    expect(goal.effective_target_today).toBe(2000000);
    expect(goal.effective_target_at_retirement).toBeGreaterThan(2000000);
  });

  test('solves the monthly contribution required to reach a target', () => {
    const params = {
      starting_balance: 0,
      monthly_contribution: 0,
      annual_contribution_increase_percent: 0,
      annual_return_percent: 0,
      inflation_rate_percent: 0,
      months: 120
    };
    const required = solveRequiredMonthlyContribution(params, 120000);

    expect(required).toBeCloseTo(1000, 1);
  });

  test('estimates the age at which the plan reaches its goal', () => {
    const age = estimateGoalAge({
      plan: {
        ...basePlan,
        desired_annual_retirement_spending: 4000,
        monthly_contribution: 1000,
        inflation_rate_percent: 0,
        withdrawal_rate_percent: 4
      },
      starting_balance: 0,
      annual_return_percent: 0,
      effective_current_age: 40
    });

    expect(age).toBeCloseTo(48.3, 1);
  });

  test('returns custom and historical scenario results in today and future dollars', () => {
    const result = calculateRetirementProjection({
      plan: basePlan,
      tracked_portfolio_value: 150000,
      historical_scenarios: [{
        key: 'historical_5y',
        label: 'Historical 5-year',
        source: 'historical',
        period_years: 5,
        annual_return_percent: 8,
        inflation_rate_percent: 2,
        inflation_source: 'historical_us_cpi_u',
        inflation_data_start: '2021-01-01',
        inflation_data_end: '2026-01-01',
        data_start: '2021-01-01',
        data_end: '2026-01-01',
        time_coverage_percent: 100,
        portfolio_value_coverage_percent: 90
      }],
      as_of_date: '2026-01-01'
    });

    expect(result.baseline.starting_balance).toBe(150000);
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios[0].key).toBe('custom');
    expect(result.scenarios[1].period_years).toBe(5);
    expect(result.scenarios[0].inflation_rate_percent).toBe(3);
    expect(result.scenarios[0].inflation_source).toBe('user_assumption');
    expect(result.scenarios[1].inflation_rate_percent).toBe(2);
    expect(result.scenarios[1].inflation_source).toBe('historical_us_cpi_u');
    expect(result.scenarios[0].portfolio_goal_at_retirement)
      .toBeGreaterThan(result.scenarios[1].portfolio_goal_at_retirement);
    expect(result.scenarios[0].projected_balance_at_retirement)
      .toBeGreaterThan(result.scenarios[0].projected_balance_in_today_dollars);
  });

  test('neutralizes new position cash flows in time-weighted returns', () => {
    const result = calculateTimeWeightedReturn({
      components: [
        { symbol: 'ABC', shares: 1, value_multiplier: 1, effective_date: '2026-01-01' },
        { symbol: 'ABC', shares: 1, value_multiplier: 1, effective_date: '2026-01-03' }
      ],
      price_series_by_symbol: {
        ABC: [
          { date: '2026-01-01', close: 100 },
          { date: '2026-01-02', close: 110 },
          { date: '2026-01-03', close: 121 }
        ]
      },
      start_date: '2026-01-01',
      end_date: '2026-01-03'
    });

    expect(result.total_return_percent).toBeCloseTo(21, 3);
  });

  test('includes recorded dividends in time-weighted returns', () => {
    const result = calculateTimeWeightedReturn({
      components: [
        { symbol: 'ABC', shares: 1, value_multiplier: 1, effective_date: '2026-01-01' }
      ],
      price_series_by_symbol: {
        ABC: [
          { date: '2026-01-01', close: 100 },
          { date: '2026-01-02', close: 100 }
        ]
      },
      dividends: [
        { symbol: 'ABC', payment_date: '2026-01-02', total_amount: 5 }
      ],
      start_date: '2026-01-01',
      end_date: '2026-01-02'
    });

    expect(result.total_return_percent).toBeCloseTo(5, 3);
  });
});
