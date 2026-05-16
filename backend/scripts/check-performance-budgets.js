const fs = require('fs');
const path = require('path');
const ExecutionRun = require('../src/models/ExecutionRun');

function readJson(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function trendRows(snapshot) {
  if (!snapshot) return new Map();
  const rows = Array.isArray(snapshot) ? snapshot : snapshot.budgets || snapshot.endpoints || [];
  return new Map(rows.map(row => [row.endpointKey, row]));
}

async function main() {
  const hours = Number(process.env.PERFORMANCE_BUDGET_WINDOW_HOURS || 24);
  const minSamples = Number(process.env.PERFORMANCE_BUDGET_MIN_SAMPLES || 1);
  const baselineEnv = process.env.PERFORMANCE_BUDGET_ENV || (process.env.CI ? 'ci' : 'local');
  const baselinePath = process.env.PERFORMANCE_BUDGET_BASELINES_FILE
    || path.join(__dirname, '../config/performance-budgets.baselines.json');
  const baselines = readJson(baselinePath, {});
  const envBaselines = baselines[baselineEnv] || baselines.local || {};
  const trendBaseline = trendRows(readJson(process.env.PERFORMANCE_BUDGET_TREND_BASELINE, null));
  const trendRatio = Number(process.env.PERFORMANCE_BUDGET_MAX_REGRESSION_RATIO || 0.2);
  const trendMs = Number(process.env.PERFORMANCE_BUDGET_MAX_REGRESSION_MS || 150);
  const outputPath = process.env.PERFORMANCE_BUDGET_OUTPUT
    || path.join(__dirname, '../test-results/performance-budget-current.json');
  const budgets = await ExecutionRun.listPerformanceBudgets({ hours });
  const evaluated = budgets.map(budget => {
    const baseline = envBaselines[budget.endpointKey] || {};
    const p95BudgetMs = Number(baseline.p95BudgetMs || budget.p95BudgetMs || 0);
    const p95DurationMs = Number(budget.p95DurationMs || 0);
    const trend = trendBaseline.get(budget.endpointKey);
    const allowedTrendP95 = trend
      ? Math.max(Number(trend.p95DurationMs || 0) * (1 + trendRatio), Number(trend.p95DurationMs || 0) + trendMs)
      : null;
    const status = budget.isEnabled && budget.sampleCount >= minSamples && p95BudgetMs > 0 && p95DurationMs > p95BudgetMs
      ? 'breached'
      : 'ok';
    const trendStatus = allowedTrendP95 !== null && budget.sampleCount >= minSamples && p95DurationMs > allowedTrendP95
      ? 'regressed'
      : 'ok';
    return {
      ...budget,
      p95BudgetMs,
      baselineEnv,
      status,
      trendStatus,
      trendBaselineP95Ms: trend ? Number(trend.p95DurationMs || 0) : null,
      allowedTrendP95Ms: allowedTrendP95
    };
  });
  const breached = evaluated.filter(budget => budget.status === 'breached' || budget.trendStatus === 'regressed');

  if (evaluated.length === 0) {
    console.log('No performance budgets configured.');
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    baselineEnv,
    hours,
    minSamples,
    budgets: evaluated
  }, null, 2)}\n`);

  evaluated.forEach(budget => {
    const trend = budget.trendBaselineP95Ms !== null
      ? ` trend=${budget.trendStatus} baseline=${budget.trendBaselineP95Ms}ms`
      : '';
    console.log(`${budget.endpointKey}: p95=${budget.p95DurationMs}ms budget=${budget.p95BudgetMs}ms samples=${budget.sampleCount} status=${budget.status}${trend}`);
  });

  if (breached.length > 0) {
    console.error(`Performance budget failure: ${breached.map(budget => `${budget.endpointKey}:${budget.status}/${budget.trendStatus}`).join(', ')}`);
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  });
