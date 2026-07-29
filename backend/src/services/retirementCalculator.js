const MONTHS_PER_YEAR = 12;
const MAX_PROJECTION_AGE = 100;
const MAX_REQUIRED_MONTHLY_CONTRIBUTION = 1_000_000_000;

function round(value, decimals = 2) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (typeof value === 'number') return new Date(value * 1000).toISOString().split('T')[0];
  return String(value).split('T')[0];
}

function dateDiffDays(startDate, endDate) {
  const start = new Date(`${toDateString(startDate)}T00:00:00.000Z`);
  const end = new Date(`${toDateString(endDate)}T00:00:00.000Z`);
  return Math.max(0, (end - start) / 86_400_000);
}

function calculateEffectiveCurrentAge(plan, asOfDate = new Date()) {
  const currentAge = toNumber(plan.current_age);
  const ageAsOf = new Date(`${toDateString(plan.age_as_of_date || asOfDate)}T00:00:00.000Z`);
  const calculationDate = new Date(`${toDateString(asOfDate)}T00:00:00.000Z`);
  const elapsedYears = Math.max(0, (calculationDate - ageAsOf) / (365.25 * 86_400_000));
  return currentAge + elapsedYears;
}

function calculateGoal(plan, yearsToRetirement, retirementAge = plan.target_retirement_age) {
  const desiredSpending = Math.max(0, toNumber(plan.desired_annual_retirement_spending));
  const otherIncome = Math.max(0, toNumber(plan.other_annual_retirement_income));
  const incomeStartAge = plan.other_income_start_age === null || plan.other_income_start_age === undefined
    ? toNumber(retirementAge)
    : toNumber(plan.other_income_start_age);
  const withdrawalRate = toNumber(plan.withdrawal_rate_percent) / 100;
  const inflationRate = toNumber(plan.inflation_rate_percent) / 100;
  const ongoingSpendingGap = Math.max(0, desiredSpending - otherIncome);
  const bridgeYears = Math.max(0, incomeStartAge - toNumber(retirementAge));
  const bridgeReserveToday = Math.min(desiredSpending, otherIncome) * bridgeYears;
  const spendingTargetToday = withdrawalRate > 0
    ? (ongoingSpendingGap / withdrawalRate) + bridgeReserveToday
    : Number.POSITIVE_INFINITY;
  const explicitTargetToday = plan.target_portfolio_balance === null || plan.target_portfolio_balance === undefined
    ? null
    : Math.max(0, toNumber(plan.target_portfolio_balance));
  const effectiveTargetToday = Math.max(spendingTargetToday, explicitTargetToday || 0);
  const inflationFactor = (1 + inflationRate) ** Math.max(0, yearsToRetirement);

  return {
    desired_annual_retirement_spending_today: round(desiredSpending),
    other_annual_retirement_income_today: round(otherIncome),
    annual_spending_gap_today: round(ongoingSpendingGap),
    bridge_years: round(bridgeYears, 2),
    bridge_reserve_today: round(bridgeReserveToday),
    spending_target_today: round(spendingTargetToday),
    explicit_target_today: explicitTargetToday === null ? null : round(explicitTargetToday),
    effective_target_today: round(effectiveTargetToday),
    effective_target_at_retirement: round(effectiveTargetToday * inflationFactor)
  };
}

function getMonthlyRate(annualReturnPercent) {
  const annualRate = toNumber(annualReturnPercent) / 100;
  if (annualRate <= -1) {
    throw new Error('Annual return must be greater than -100%');
  }
  return ((1 + annualRate) ** (1 / MONTHS_PER_YEAR)) - 1;
}

function projectBalance({
  starting_balance,
  monthly_contribution,
  annual_contribution_increase_percent,
  annual_return_percent,
  inflation_rate_percent,
  months
}) {
  const totalMonths = Math.max(0, Math.floor(toNumber(months)));
  const startingBalance = Math.max(0, toNumber(starting_balance));
  const baseMonthlyContribution = Math.max(0, toNumber(monthly_contribution));
  const contributionGrowthRate = toNumber(annual_contribution_increase_percent) / 100;
  const inflationRate = toNumber(inflation_rate_percent) / 100;
  const monthlyRate = getMonthlyRate(annual_return_percent);
  const monthlyInflationRate = ((1 + inflationRate) ** (1 / MONTHS_PER_YEAR)) - 1;

  let balance = startingBalance;
  let totalContributions = 0;
  let investmentGrowth = 0;
  const timeline = [{
    month: 0,
    year: 0,
    balance: round(balance),
    balance_today: round(balance),
    total_contributions: 0,
    investment_growth: 0
  }];

  for (let month = 1; month <= totalMonths; month += 1) {
    const growth = balance * monthlyRate;
    balance += growth;
    investmentGrowth += growth;

    const contributionYear = Math.floor((month - 1) / MONTHS_PER_YEAR);
    const contribution = baseMonthlyContribution * ((1 + contributionGrowthRate) ** contributionYear);
    balance += contribution;
    totalContributions += contribution;

    if (month % MONTHS_PER_YEAR === 0 || month === totalMonths) {
      const inflationFactor = (1 + monthlyInflationRate) ** month;
      timeline.push({
        month,
        year: round(month / MONTHS_PER_YEAR, 2),
        balance: round(balance),
        balance_today: round(inflationFactor > 0 ? balance / inflationFactor : balance),
        total_contributions: round(totalContributions),
        investment_growth: round(investmentGrowth)
      });
    }
  }

  return {
    balance: round(balance),
    total_contributions: round(totalContributions),
    investment_growth: round(investmentGrowth),
    timeline
  };
}

function solveRequiredMonthlyContribution(params, targetBalance) {
  const target = Math.max(0, toNumber(targetBalance));
  const withNoContribution = projectBalance({ ...params, monthly_contribution: 0 }).balance;
  if (withNoContribution >= target) return 0;

  let low = 0;
  let high = Math.max(100, toNumber(params.monthly_contribution));

  while (
    high < MAX_REQUIRED_MONTHLY_CONTRIBUTION
    && projectBalance({ ...params, monthly_contribution: high }).balance < target
  ) {
    high *= 2;
  }

  if (high >= MAX_REQUIRED_MONTHLY_CONTRIBUTION) {
    const upperProjection = projectBalance({
      ...params,
      monthly_contribution: MAX_REQUIRED_MONTHLY_CONTRIBUTION
    });
    if (upperProjection.balance < target) return null;
    high = MAX_REQUIRED_MONTHLY_CONTRIBUTION;
  }

  for (let iteration = 0; iteration < 70; iteration += 1) {
    const midpoint = (low + high) / 2;
    const result = projectBalance({ ...params, monthly_contribution: midpoint });
    if (result.balance >= target) {
      high = midpoint;
    } else {
      low = midpoint;
    }
  }

  return round(high);
}

function estimateGoalAge({
  plan,
  starting_balance,
  annual_return_percent,
  effective_current_age
}) {
  const maximumMonths = Math.max(
    0,
    Math.ceil((MAX_PROJECTION_AGE - effective_current_age) * MONTHS_PER_YEAR)
  );
  const monthlyRate = getMonthlyRate(annual_return_percent);
  const contributionGrowthRate = toNumber(plan.annual_contribution_increase_percent) / 100;
  const inflationRate = toNumber(plan.inflation_rate_percent) / 100;
  const monthlyInflationRate = ((1 + inflationRate) ** (1 / MONTHS_PER_YEAR)) - 1;
  const baseContribution = Math.max(0, toNumber(plan.monthly_contribution));
  let balance = Math.max(0, toNumber(starting_balance));

  for (let month = 0; month <= maximumMonths; month += 1) {
    const elapsedYears = month / MONTHS_PER_YEAR;
    const candidateAge = effective_current_age + elapsedYears;
    const goal = calculateGoal(plan, elapsedYears, candidateAge);
    if (balance >= goal.effective_target_at_retirement) {
      return round(candidateAge, 1);
    }

    if (month === maximumMonths) break;

    balance *= (1 + monthlyRate);
    const contributionYear = Math.floor(month / MONTHS_PER_YEAR);
    balance += baseContribution * ((1 + contributionGrowthRate) ** contributionYear);

    if (!Number.isFinite(balance)) return null;
    const inflationFactor = (1 + monthlyInflationRate) ** (month + 1);
    if (!Number.isFinite(inflationFactor)) return null;
  }

  return null;
}

function calculateScenario(plan, baseline, scenario, effectiveCurrentAge, monthsToRetirement) {
  const scenarioInflationRate = scenario.source === 'historical'
    ? toNumber(scenario.inflation_rate_percent, NaN)
    : toNumber(plan.inflation_rate_percent);
  if (!Number.isFinite(scenarioInflationRate)) {
    throw new Error(`Inflation rate is required for ${scenario.label || scenario.key}`);
  }
  const scenarioPlan = {
    ...plan,
    inflation_rate_percent: scenarioInflationRate
  };
  const yearsToRetirement = monthsToRetirement / MONTHS_PER_YEAR;
  const goal = calculateGoal(
    scenarioPlan,
    yearsToRetirement,
    scenarioPlan.target_retirement_age
  );
  const projectionParams = {
    starting_balance: baseline.starting_balance,
    monthly_contribution: scenarioPlan.monthly_contribution,
    annual_contribution_increase_percent: scenarioPlan.annual_contribution_increase_percent,
    annual_return_percent: scenario.annual_return_percent,
    inflation_rate_percent: scenarioInflationRate,
    months: monthsToRetirement
  };
  const projection = projectBalance(projectionParams);
  const requiredContribution = solveRequiredMonthlyContribution(
    projectionParams,
    goal.effective_target_at_retirement
  );
  const inflationFactor = (1 + (scenarioInflationRate / 100))
    ** (monthsToRetirement / MONTHS_PER_YEAR);
  const projectedToday = inflationFactor > 0 ? projection.balance / inflationFactor : projection.balance;
  const gapAtRetirement = projection.balance - goal.effective_target_at_retirement;
  const withdrawalRate = toNumber(scenarioPlan.withdrawal_rate_percent) / 100;
  const supportedSpending = (projectedToday * withdrawalRate)
    + (
      toNumber(
        scenarioPlan.other_income_start_age,
        scenarioPlan.target_retirement_age
      ) <= toNumber(scenarioPlan.target_retirement_age)
        ? Math.max(0, toNumber(scenarioPlan.other_annual_retirement_income))
        : 0
    );

  return {
    key: scenario.key,
    label: scenario.label,
    source: scenario.source,
    annual_return_percent: round(scenario.annual_return_percent, 3),
    inflation_rate_percent: round(scenarioInflationRate, 3),
    inflation_source: scenario.source === 'historical'
      ? scenario.inflation_source
      : 'user_assumption',
    inflation_series_id: scenario.inflation_series_id ?? null,
    inflation_data_start: scenario.inflation_data_start ?? null,
    inflation_data_end: scenario.inflation_data_end ?? null,
    inflation_time_coverage_percent: scenario.inflation_time_coverage_percent ?? null,
    period_years: scenario.period_years ?? null,
    data_start: scenario.data_start ?? null,
    data_end: scenario.data_end ?? null,
    time_coverage_percent: scenario.time_coverage_percent ?? null,
    portfolio_value_coverage_percent: scenario.portfolio_value_coverage_percent ?? null,
    includes_recorded_dividends: scenario.includes_recorded_dividends ?? false,
    portfolio_goal_in_today_dollars: goal.effective_target_today,
    portfolio_goal_at_retirement: goal.effective_target_at_retirement,
    projected_balance_at_retirement: projection.balance,
    projected_balance_in_today_dollars: round(projectedToday),
    surplus_shortfall_at_retirement: round(gapAtRetirement),
    is_on_track: gapAtRetirement >= 0,
    required_monthly_contribution: requiredContribution,
    monthly_contribution_change: requiredContribution === null
      ? null
      : round(requiredContribution - toNumber(scenarioPlan.monthly_contribution)),
    estimated_goal_age: estimateGoalAge({
      plan: scenarioPlan,
      starting_balance: baseline.starting_balance,
      annual_return_percent: scenario.annual_return_percent,
      effective_current_age: effectiveCurrentAge
    }),
    supported_annual_spending_today: round(supportedSpending),
    total_future_contributions: projection.total_contributions,
    projected_investment_growth: projection.investment_growth,
    timeline: projection.timeline.map(point => ({
      ...point,
      age: round(effectiveCurrentAge + point.year, 1)
    }))
  };
}

function calculateRetirementProjection({
  plan,
  tracked_portfolio_value,
  historical_scenarios = [],
  as_of_date = new Date()
}) {
  const effectiveCurrentAge = calculateEffectiveCurrentAge(plan, as_of_date);
  const targetAge = toNumber(plan.target_retirement_age);
  if (targetAge <= effectiveCurrentAge) {
    throw new Error('Target retirement age must be later than the effective current age');
  }

  const monthsToRetirement = Math.max(
    1,
    Math.round((targetAge - effectiveCurrentAge) * MONTHS_PER_YEAR)
  );
  const yearsToRetirement = monthsToRetirement / MONTHS_PER_YEAR;
  const trackedValue = Math.max(0, toNumber(tracked_portfolio_value));
  const additionalSavings = Math.max(0, toNumber(plan.additional_retirement_savings));
  const baseline = {
    tracked_portfolio_value: round(trackedValue),
    additional_retirement_savings: round(additionalSavings),
    starting_balance: round(trackedValue + additionalSavings)
  };
  const goal = calculateGoal(plan, yearsToRetirement, targetAge);
  const scenarioInputs = [{
    key: 'custom',
    label: 'Custom assumption',
    source: 'custom',
    annual_return_percent: toNumber(plan.custom_return_rate_percent),
    inflation_rate_percent: toNumber(plan.inflation_rate_percent),
    inflation_source: 'user_assumption'
  }, ...historical_scenarios.filter(scenario => (
    Number.isFinite(Number(scenario.inflation_rate_percent))
  ))];

  return {
    as_of_date: toDateString(as_of_date),
    effective_current_age: round(effectiveCurrentAge, 2),
    target_retirement_age: targetAge,
    years_to_retirement: round(yearsToRetirement, 2),
    months_to_retirement: monthsToRetirement,
    baseline,
    goal,
    scenarios: scenarioInputs.map(scenario => calculateScenario(
      plan,
      baseline,
      scenario,
      effectiveCurrentAge,
      monthsToRetirement
    ))
  };
}

function calculateTimeWeightedReturn({
  components,
  price_series_by_symbol,
  dividends = [],
  start_date,
  end_date
}) {
  const startDate = toDateString(start_date);
  const endDate = toDateString(end_date);
  const dateSet = new Set();
  const indexedSeries = new Map();

  for (const [symbol, candles] of Object.entries(price_series_by_symbol || {})) {
    const sorted = (candles || [])
      .map(candle => ({
        date: toDateString(candle.date || candle.time),
        close: toNumber(candle.close, NaN)
      }))
      .filter(candle => candle.date && Number.isFinite(candle.close) && candle.close > 0)
      .filter(candle => candle.date >= startDate && candle.date <= endDate)
      .sort((left, right) => left.date.localeCompare(right.date));
    if (sorted.length === 0) continue;
    indexedSeries.set(symbol, sorted);
    sorted.forEach(candle => dateSet.add(candle.date));
  }

  const dates = [...dateSet].sort();
  if (dates.length < 2) return null;

  const normalizedComponents = (components || [])
    .map(component => ({
      symbol: component.symbol,
      shares: toNumber(component.shares),
      value_multiplier: toNumber(component.value_multiplier ?? component.valueMultiplier, 1),
      effective_date: toDateString(component.effective_date ?? component.effectiveDate)
    }))
    .filter(component => indexedSeries.has(component.symbol) && component.shares > 0);
  const dividendMap = new Map();
  for (const dividend of dividends || []) {
    const date = toDateString(dividend.payment_date ?? dividend.paymentDate);
    if (!date || date < startDate || date > endDate) continue;
    dividendMap.set(date, (dividendMap.get(date) || 0) + Math.max(0, toNumber(dividend.total_amount ?? dividend.totalAmount)));
  }

  const seriesCursors = new Map();
  const lastCloseBySymbol = new Map();
  let previousDate = null;
  let previousValue = 0;
  let chainedGrowth = 1;
  let returnCount = 0;
  let dataStart = null;
  let dataEnd = null;

  for (const date of dates) {
    for (const [symbol, series] of indexedSeries.entries()) {
      let cursor = seriesCursors.get(symbol) || 0;
      while (cursor < series.length && series[cursor].date <= date) {
        lastCloseBySymbol.set(symbol, series[cursor].close);
        cursor += 1;
      }
      seriesCursors.set(symbol, cursor);
    }

    let currentValue = 0;
    let externalFlow = 0;
    for (const component of normalizedComponents) {
      if (component.effective_date && component.effective_date > date) continue;
      const close = lastCloseBySymbol.get(component.symbol);
      if (!Number.isFinite(close)) continue;
      const value = component.shares * component.value_multiplier * close;
      currentValue += value;
      if (
        component.effective_date
        && component.effective_date <= date
        && (!previousDate || component.effective_date > previousDate)
      ) {
        externalFlow += value;
      }
    }

    if (currentValue <= 0) {
      previousDate = date;
      previousValue = 0;
      continue;
    }

    if (previousValue > 0) {
      const dividend = [...dividendMap.entries()].reduce((sum, [paymentDate, amount]) => (
        paymentDate <= date && (!previousDate || paymentDate > previousDate)
          ? sum + amount
          : sum
      ), 0);
      const dailyReturn = ((currentValue + dividend - externalFlow) / previousValue) - 1;
      if (Number.isFinite(dailyReturn) && dailyReturn > -1) {
        chainedGrowth *= (1 + dailyReturn);
        returnCount += 1;
        dataStart ||= previousDate;
        dataEnd = date;
      }
    }

    previousDate = date;
    previousValue = currentValue;
  }

  if (returnCount === 0 || !dataStart || !dataEnd || chainedGrowth <= 0) return null;
  const elapsedDays = Math.max(1, dateDiffDays(dataStart, dataEnd));
  const annualizedReturn = (chainedGrowth ** (365.25 / elapsedDays)) - 1;

  return {
    annual_return_percent: round(annualizedReturn * 100, 3),
    total_return_percent: round((chainedGrowth - 1) * 100, 3),
    data_start: dataStart,
    data_end: dataEnd,
    observation_count: returnCount
  };
}

module.exports = {
  calculateEffectiveCurrentAge,
  calculateGoal,
  projectBalance,
  solveRequiredMonthlyContribution,
  estimateGoalAge,
  calculateRetirementProjection,
  calculateTimeWeightedReturn
};
