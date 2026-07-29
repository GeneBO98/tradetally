-- One saved retirement plan per user. Projection results are calculated from
-- the latest portfolio data and are intentionally not persisted.
CREATE TABLE IF NOT EXISTS retirement_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_age INTEGER NOT NULL,
  age_as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_retirement_age INTEGER NOT NULL,
  current_annual_cost_of_living NUMERIC(15,2) NOT NULL DEFAULT 0,
  desired_annual_retirement_spending NUMERIC(15,2) NOT NULL,
  target_portfolio_balance NUMERIC(18,2),
  monthly_contribution NUMERIC(15,2) NOT NULL DEFAULT 0,
  annual_contribution_increase_percent NUMERIC(7,3) NOT NULL DEFAULT 0,
  additional_retirement_savings NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_annual_retirement_income NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_income_start_age INTEGER,
  custom_return_rate_percent NUMERIC(7,3) NOT NULL DEFAULT 7,
  inflation_rate_percent NUMERIC(7,3) NOT NULL DEFAULT 3,
  withdrawal_rate_percent NUMERIC(7,3) NOT NULL DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT retirement_plans_user_unique UNIQUE(user_id),
  CONSTRAINT retirement_plans_age_check CHECK (
    current_age BETWEEN 18 AND 99
    AND target_retirement_age > current_age
    AND target_retirement_age <= 100
  ),
  CONSTRAINT retirement_plans_money_check CHECK (
    current_annual_cost_of_living >= 0
    AND desired_annual_retirement_spending > 0
    AND (target_portfolio_balance IS NULL OR target_portfolio_balance >= 0)
    AND monthly_contribution >= 0
    AND additional_retirement_savings >= 0
    AND other_annual_retirement_income >= 0
  ),
  CONSTRAINT retirement_plans_rate_check CHECK (
    custom_return_rate_percent > -100
    AND custom_return_rate_percent <= 100
    AND inflation_rate_percent >= 0
    AND inflation_rate_percent <= 20
    AND withdrawal_rate_percent > 0
    AND withdrawal_rate_percent <= 20
    AND annual_contribution_increase_percent > -100
    AND annual_contribution_increase_percent <= 100
  )
);

CREATE INDEX IF NOT EXISTS idx_retirement_plans_user_id
ON retirement_plans(user_id);

DROP TRIGGER IF EXISTS update_retirement_plans_updated_at ON retirement_plans;
CREATE TRIGGER update_retirement_plans_updated_at
  BEFORE UPDATE ON retirement_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE retirement_plans IS 'Stores one retirement-planning assumption set per user; projections are calculated from live portfolio data';

INSERT INTO features (
  feature_key,
  feature_name,
  description,
  required_tier,
  is_active
)
VALUES (
  'retirement_planner',
  'Retirement Planner',
  'Project retirement outcomes from tracked portfolios, contributions, spending goals, and return assumptions',
  'pro',
  TRUE
)
ON CONFLICT (feature_key) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  required_tier = EXCLUDED.required_tier,
  is_active = EXCLUDED.is_active;
