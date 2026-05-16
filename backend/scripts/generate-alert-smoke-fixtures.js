#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const outputPath = process.env.ALERT_SMOKE_FIXTURE_PATH
  || path.resolve(process.cwd(), 'test-results/alert-smoke-fixtures.json');

const fixtures = {
  generatedAt: new Date().toISOString(),
  env: {
    ALERT_ESCALATION_DELIVERY_ENABLED: 'false',
    ALERT_SMOKE_ALLOW_DRY_RUN: 'true',
    ALERT_SMOKE_REQUIRE_TYPES: 'email,slack,webhook',
    ALERT_SMOKE_EMAIL_TARGET: 'ops-smoke@example.com',
    ALERT_SMOKE_SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T000/B000/fixture',
    ALERT_SMOKE_WEBHOOK_URL: 'https://example.invalid/tradetally-alert-smoke'
  },
  destinations: [
    {
      destinationType: 'email',
      target: 'ops-smoke@example.com',
      severity: 'info',
      metadata: { smoke: true, dryRun: true }
    },
    {
      destinationType: 'slack',
      target: 'https://hooks.slack.com/services/T000/B000/fixture',
      severity: 'info',
      metadata: { smoke: true, dryRun: true }
    },
    {
      destinationType: 'webhook',
      target: 'https://example.invalid/tradetally-alert-smoke',
      severity: 'info',
      metadata: { smoke: true, dryRun: true, headers: { 'X-TradeTally-Smoke': 'true' } }
    }
  ],
  command: 'ALERT_SMOKE_ALLOW_DRY_RUN=true ALERT_SMOKE_REQUIRE_TYPES=email,slack,webhook npm run smoke:alert-escalations'
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, destinationCount: fixtures.destinations.length }, null, 2));
