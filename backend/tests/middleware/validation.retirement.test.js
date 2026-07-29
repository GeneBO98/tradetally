const { schemas } = require('../../src/middleware/validation');

const validPlan = {
  current_age: 40,
  target_retirement_age: 65,
  current_annual_cost_of_living: 60000,
  desired_annual_retirement_spending: 60000,
  target_portfolio_balance: null,
  monthly_contribution: 1000,
  annual_contribution_increase_percent: 0,
  additional_retirement_savings: 0,
  other_annual_retirement_income: 20000,
  other_income_start_age: 67,
  custom_return_rate_percent: 7,
  inflation_rate_percent: 3,
  withdrawal_rate_percent: 4
};

describe('retirement plan validation', () => {
  test('accepts the snake_case retirement contract', () => {
    const result = schemas.retirementPlan.validate(validPlan);
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual(validPlan);
  });

  test('requires retirement age to be later than current age', () => {
    const result = schemas.retirementPlan.validate({
      ...validPlan,
      target_retirement_age: 40
    });
    expect(result.error).toBeDefined();
  });

  test.each([
    ['custom_return_rate_percent', -100],
    ['inflation_rate_percent', 21],
    ['withdrawal_rate_percent', 0],
    ['monthly_contribution', -1],
    ['desired_annual_retirement_spending', 0]
  ])('rejects invalid %s', (field, value) => {
    const result = schemas.retirementPlan.validate({
      ...validPlan,
      [field]: value
    });
    expect(result.error).toBeDefined();
  });
});
