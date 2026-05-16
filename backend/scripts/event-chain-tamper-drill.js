const db = require('../src/config/database');
const OperationalMetricsService = require('../src/services/operationalMetricsService');

async function selectEvent(runId = null) {
  const values = [];
  const runClause = runId ? `AND er.id = $${values.push(runId)}` : '';
  const result = await db.query(
    `
      SELECT ere.id, ere.run_id, ere.event_hash
      FROM execution_run_events ere
      JOIN execution_runs er ON er.id = ere.run_id
      WHERE ere.event_hash IS NOT NULL
        ${runClause}
      ORDER BY ere.created_at DESC
      LIMIT 1
    `,
    values
  );
  return result.rows[0] || null;
}

async function main() {
  const event = await selectEvent(process.env.EVENT_CHAIN_TAMPER_DRILL_RUN_ID || null);
  if (!event) {
    console.log(JSON.stringify({ skipped: true, reason: 'No hashed execution event available' }));
    return;
  }

  try {
    await db.query(
      'UPDATE execution_run_events SET event_hash = $2 WHERE id = $1',
      [event.id, `tamper-drill-${event.event_hash}`]
    );
    const result = await OperationalMetricsService.scanEventChainTamperAlerts();
    const detected = (result.alerts || []).some(alert => alert.entityId === event.run_id);
    console.log(JSON.stringify({
      skipped: false,
      runId: event.run_id,
      eventId: event.id,
      detected,
      alertCount: result.alerts.length
    }));
    if (!detected) process.exitCode = 1;
  } finally {
    await db.query(
      'UPDATE execution_run_events SET event_hash = $2 WHERE id = $1',
      [event.id, event.event_hash]
    );
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  });
