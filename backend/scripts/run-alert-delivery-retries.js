const AlertEscalationDeliveryService = require('../src/services/alertEscalationDeliveryService');

async function runOnce() {
  const limit = Number(process.env.ALERT_RETRY_WORKER_LIMIT || 25);
  const includeSkipped = process.env.ALERT_RETRY_WORKER_INCLUDE_SKIPPED === 'true';
  const result = await AlertEscalationDeliveryService.processDueRetries({
    limit,
    includeSkipped,
    actorUserId: null
  });
  console.log(JSON.stringify({
    checked: result.checked,
    retried: result.retried.length,
    failed: result.failed.length,
    failures: result.failed
  }));
  if (result.failed.length > 0) process.exitCode = 1;
}

async function main() {
  const intervalMs = Number(process.env.ALERT_RETRY_WORKER_INTERVAL_MS || 0);
  await runOnce();
  if (!intervalMs) return;

  setInterval(() => {
    runOnce().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  }, Math.max(intervalMs, 10000));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (!Number(process.env.ALERT_RETRY_WORKER_INTERVAL_MS || 0)) {
      setTimeout(() => process.exit(process.exitCode || 0), 50);
    }
  });
