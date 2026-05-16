#!/usr/bin/env node

const { spawnSync } = require('child_process');

const env = {
  ...process.env,
  LOAD_TEST_DURATION_SECONDS: process.env.SOAK_DURATION_SECONDS || process.env.LOAD_TEST_DURATION_SECONDS || '300',
  LOAD_TEST_CONNECTIONS: process.env.SOAK_CONNECTIONS || process.env.LOAD_TEST_CONNECTIONS || '8',
  LOAD_TEST_MIN_REQUESTS: process.env.SOAK_MIN_REQUESTS || process.env.LOAD_TEST_MIN_REQUESTS || '100',
  LOAD_TEST_MAX_P95_MS: process.env.SOAK_MAX_P95_MS || process.env.LOAD_TEST_MAX_P95_MS || '2000'
};

const result = spawnSync(process.execPath, ['scripts/load-test-execution-endpoints.js'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit'
});

process.exit(result.status || 0);
