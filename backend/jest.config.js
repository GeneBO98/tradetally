module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  // Real-Postgres tests are opt-in via npm run test:integration
  // (jest.integration.config.js); they need TEST_DATABASE_URL.
  testPathIgnorePatterns: ['/node_modules/', '/tests/integration/'],
  testTimeout: 10000
};
