// Opt-in real-Postgres integration suite (see tests/integration/env.js).
// Run with: npm run test:integration
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/integration/env.js'],
  globalSetup: './tests/integration/globalSetup.js',
  testMatch: ['**/tests/integration/**/*.int.test.js'],
  moduleNameMapper: {
    // ESM-only; only used by Apple IAP verification, never in these tests.
    '^jose$': '<rootDir>/tests/integration/stubs/jose.js'
  },
  testTimeout: 60000,
  // The app module tree opens pools/intervals that don't unref; the suite
  // closes the pool in afterAll, forceExit covers stray library handles.
  forceExit: true,
  maxWorkers: 1
};
