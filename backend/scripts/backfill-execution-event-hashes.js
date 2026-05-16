require('dotenv').config();

const ExecutionRun = require('../src/models/ExecutionRun');
const db = require('../src/config/database');

async function main() {
  const args = new Map(process.argv.slice(2).map(arg => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value || true];
  }));
  const result = await ExecutionRun.backfillEventHashes({
    runId: args.get('run-id') || args.get('runId') || null,
    limit: args.get('limit') || 1000
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db.pool && typeof db.pool.end === 'function') {
      await db.pool.end();
    }
  });
