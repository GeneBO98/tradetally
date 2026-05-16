require('dotenv').config();

const autocannon = require('autocannon');
const fetch = require('node-fetch');

const API_BASE_URL = process.env.API_BASE_URL || process.env.BACKEND_URL || 'http://127.0.0.1:3001';

function latencyBudgetFor(name) {
  const envKey = `LOAD_TEST_P95_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_MS`;
  const value = Number(process.env[envKey] || process.env.LOAD_TEST_MAX_P95_MS || 1500);
  return Number.isFinite(value) && value > 0 ? value : 1500;
}

async function createFixture() {
  if (process.env.TEST_AUTH_TOKEN && process.env.TEST_EXECUTION_RUN_ID) {
    return {
      token: process.env.TEST_AUTH_TOKEN,
      runId: process.env.TEST_EXECUTION_RUN_ID,
      cleanupUserId: null
    };
  }

  const response = await fetch(`${API_BASE_URL}/api/test-support/e2e/trade-management-fixture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ admin: true })
  });
  if (!response.ok) {
    throw new Error(`Fixture creation failed with HTTP ${response.status}; set TEST_AUTH_TOKEN and TEST_EXECUTION_RUN_ID for non-test environments`);
  }
  const fixture = await response.json();
  const backtest = fixture.runs.find(run => run.mode === 'backtest') || fixture.runs[0];
  return {
    token: fixture.token,
    runId: backtest.id,
    cleanupUserId: fixture.user.id
  };
}

function runAutocannon(options) {
  return new Promise((resolve, reject) => {
    autocannon(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

async function runScenario(name, path, token, options = {}) {
  const result = await runAutocannon({
    url: `${API_BASE_URL}${path}`,
    method: options.method || 'GET',
    connections: Number(process.env.LOAD_TEST_CONNECTIONS || 4),
    duration: Number(process.env.LOAD_TEST_DURATION_SECONDS || 8),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const summary = {
    name,
    requests: result.requests.total,
    errors: result.errors,
    non2xx: result.non2xx,
    latencyP95: Number(result.latency.p95 ?? result.latency.p97_5 ?? result.latency.p99 ?? result.latency.average ?? 0),
    latencyBudgetP95: latencyBudgetFor(name),
    throughputAvg: result.throughput.average
  };
  console.log(JSON.stringify(summary));
  return summary;
}

async function cleanup(userId) {
  if (!userId) return;
  await fetch(`${API_BASE_URL}/api/test-support/e2e/users/${userId}`, { method: 'DELETE' }).catch(() => {});
}

async function main() {
  const fixture = await createFixture();
  try {
    const scenarios = [
      ['compare', '/api/execution-runs/compare?source=trade-management'],
      ['report', `/api/execution-runs/${fixture.runId}/report?format=json`],
      ['admin.execution_runs', '/api/admin/execution-runs?limit=25'],
      ['admin.alert_scan', '/api/admin/alerts/scan', { method: 'POST', body: {} }]
    ];
    const summaries = [];
    for (const [name, path, options] of scenarios) {
      summaries.push(await runScenario(name, path, fixture.token, options || {}));
    }
    const minRequests = Number(process.env.LOAD_TEST_MIN_REQUESTS || 1);
    const failures = summaries.filter(summary =>
      summary.errors > 0 ||
      summary.non2xx > Number(process.env.LOAD_TEST_MAX_NON2XX || 0) ||
      summary.requests < minRequests ||
      summary.latencyP95 > summary.latencyBudgetP95
    );
    if (failures.length > 0) {
      throw new Error(`Load test budget failed: ${failures.map(item => `${item.name} p95=${item.latencyP95}ms budget=${item.latencyBudgetP95}ms errors=${item.errors} non2xx=${item.non2xx}`).join('; ')}`);
    }
  } finally {
    await cleanup(fixture.cleanupUserId);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
