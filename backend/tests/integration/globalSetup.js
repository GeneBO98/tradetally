// Runs once before the integration suite: applies the base schema and all
// migrations to the scratch database, exactly like server startup does.
module.exports = async function globalSetup() {
  require('./env');

  const { migrate } = require('../../src/utils/migrate');
  const { ensurePostExitSchema } = require('../../src/utils/ensurePostExitSchema');
  const db = require('../../src/config/database');

  const startedAt = Date.now();
  await migrate();
  await ensurePostExitSchema();
  console.log(`[INTEGRATION] Schema ready in ${Date.now() - startedAt}ms`);

  // This process holds its own pool; close it so Jest's main process isn't
  // kept alive by idle connections.
  await db.pool.end();
};
