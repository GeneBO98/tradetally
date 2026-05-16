#!/usr/bin/env node

require('dotenv').config();

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const baseUrl = (process.env.POST_CHECK_BASE_URL || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const allowDegradedHealth = process.env.POST_CHECK_ALLOW_DEGRADED_HEALTH === 'true';
const summaryPath = process.env.POST_CHECK_SUMMARY_PATH || path.resolve(process.cwd(), 'test-results/deployment-post-check-summary.json');

function run(command, args, options = {}) {
  console.log(`[POST_CHECK] ${command} ${args.join(' ')}`);
  const startedAt = Date.now();
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, ...(options.env || {}) }
  });
  return {
    command,
    args,
    durationMs: Date.now() - startedAt,
    status: 'passed'
  };
}

function writeSummary(summary) {
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[POST_CHECK] summary ${summaryPath}`);
}

async function request(path, options = {}, token = null) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.buffer();
  return { response, body, contentType };
}

async function liveProbeWithTestSupport() {
  const fixtureResponse = await request('/api/test-support/e2e/trade-management-fixture', {
    method: 'POST',
    body: JSON.stringify({ admin: true })
  });
  if (!fixtureResponse.response.ok) {
    throw new Error(`Fixture probe failed with HTTP ${fixtureResponse.response.status}; set SMOKE_TOKEN for deployed environments`);
  }

  const fixture = fixtureResponse.body;
  const token = fixture.token;
  try {
    const health = await request('/api/health');
    const databaseHealthy = health.body?.services?.database === 'OK';
    const healthAcceptable = health.body?.status === 'OK'
      || (allowDegradedHealth && health.body?.status === 'DEGRADED' && databaseHealthy);
    if (!health.response.ok || !healthAcceptable) {
      throw new Error(`Health probe failed with HTTP ${health.response.status} status ${health.body?.status || 'unknown'}`);
    }

    const run = fixture.runs.find(item => item.mode === 'backtest') || fixture.runs[0];
    const pdf = await request(`/api/execution-runs/${run.id}/report?format=pdf`, {
      headers: { Accept: 'application/pdf' }
    }, token);
    if (!pdf.response.ok || pdf.body.slice(0, 8).toString() !== '%PDF-1.4') {
      throw new Error(`PDF probe failed with HTTP ${pdf.response.status}`);
    }

    const share = await request(`/api/execution-runs/${run.id}/share`, {
      method: 'POST',
      body: JSON.stringify({
        expiresInHours: 1,
        scope: {
          formats: ['json'],
          includeEvents: false,
          includeMetrics: true,
          includeReportAccesses: false,
          template: 'investor',
          accountIds: ['E2E-ACT']
        }
      })
    }, token);
    if (!share.response.ok || !share.body.run?.shareToken) {
      throw new Error(`Share probe failed with HTTP ${share.response.status}`);
    }

    const sharedJson = await request(`/api/execution-runs/shared/${share.body.run.shareToken}`);
    if (sharedJson.response.status !== 200 || sharedJson.body.report?.run?.id !== run.id) {
      throw new Error(`Shared JSON probe failed with HTTP ${sharedJson.response.status}`);
    }

    const sharedPdf = await request(`/api/execution-runs/shared/${share.body.run.shareToken}?format=pdf`);
    if (sharedPdf.response.status !== 403) {
      throw new Error(`Scoped PDF denial probe expected 403, received ${sharedPdf.response.status}`);
    }

    const probe = {
      success: true,
      runId: run.id,
      health: health.body.status,
      pdfBytes: pdf.body.length,
      sharedJsonStatus: sharedJson.response.status,
      scopedPdfStatus: sharedPdf.response.status
    };
    console.log(JSON.stringify(probe, null, 2));
    return probe;
  } finally {
    if (fixture.user?.id) {
      await request(`/api/test-support/e2e/users/${fixture.user.id}`, { method: 'DELETE' }, token).catch(() => {});
    }
  }
}

async function main() {
  const summary = {
    success: false,
    generatedAt: new Date().toISOString(),
    baseUrl,
    allowDegradedHealth,
    steps: []
  };

  summary.steps.push(run('npm', ['run', 'migrate:check']));
  summary.steps.push(run('npm', ['run', 'migrate:check', '--', '--strict-prefixes'], {
    env: { MIGRATION_PREFIX_STRICT: 'true' }
  }));

  if (process.env.POST_CHECK_SKIP_FRESH_REBUILD !== 'true') {
    summary.steps.push(run('npm', ['run', 'migrate:fresh-rebuild']));
  } else {
    summary.steps.push({ command: 'npm', args: ['run', 'migrate:fresh-rebuild'], status: 'skipped' });
  }

  if (process.env.SMOKE_TOKEN || process.env.POST_CHECK_TOKEN) {
    summary.steps.push(run('npm', ['run', 'deployment:smoke'], {
      env: {
        SMOKE_BASE_URL: baseUrl,
        SMOKE_TOKEN: process.env.POST_CHECK_TOKEN || process.env.SMOKE_TOKEN
      }
    }));
  } else {
    summary.liveProbe = await liveProbeWithTestSupport();
    summary.steps.push({ command: 'liveProbeWithTestSupport', status: 'passed' });
  }

  if (process.env.POST_CHECK_SKIP_PERFORMANCE !== 'true') {
    summary.steps.push(run('npm', ['run', 'performance-budgets:check']));
  } else {
    summary.steps.push({ command: 'npm', args: ['run', 'performance-budgets:check'], status: 'skipped' });
  }

  if (process.env.POST_CHECK_RUN_ALERT_SMOKE === 'true') {
    summary.steps.push(run('npm', ['run', 'smoke:alert-escalations']));
  } else {
    summary.steps.push({ command: 'npm', args: ['run', 'smoke:alert-escalations'], status: 'skipped' });
  }

  summary.success = true;
  writeSummary(summary);
}

main().catch(error => {
  console.error('[POST_CHECK]', error.stack || error.message);
  process.exit(1);
});
