#!/usr/bin/env node

const { migrate } = require('../src/utils/migrate');

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[ERROR] Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = { runAllMigrations: migrate };
