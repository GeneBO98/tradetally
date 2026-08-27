const db = require('../config/database');

class SchedulerStatusService {
  static async recordStarted(schedulerName, startedAt = new Date()) {
    await db.query(
      `INSERT INTO scheduler_status (scheduler_name, last_started_at, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (scheduler_name) DO UPDATE SET
         last_started_at = EXCLUDED.last_started_at,
         updated_at = NOW()`,
      [schedulerName, startedAt]
    );
  }

  static async recordSuccess(schedulerName, summary, succeededAt = new Date()) {
    await db.query(
      `INSERT INTO scheduler_status (
         scheduler_name, last_success_at, last_error, last_summary, updated_at
       ) VALUES ($1, $2, NULL, $3, NOW())
       ON CONFLICT (scheduler_name) DO UPDATE SET
         last_success_at = EXCLUDED.last_success_at,
         last_error = NULL,
         last_summary = EXCLUDED.last_summary,
         updated_at = NOW()`,
      [schedulerName, succeededAt, JSON.stringify(summary || {})]
    );
  }

  static async recordFailure(schedulerName, error, failedAt = new Date()) {
    const errorMessage = String(error?.message || error || 'Unknown scheduler failure').slice(0, 4000);
    await db.query(
      `INSERT INTO scheduler_status (
         scheduler_name, last_failure_at, last_error, updated_at
       ) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (scheduler_name) DO UPDATE SET
         last_failure_at = EXCLUDED.last_failure_at,
         last_error = EXCLUDED.last_error,
         updated_at = NOW()`,
      [schedulerName, failedAt, errorMessage]
    );
  }

  static async get(schedulerName) {
    const result = await db.query(
      `SELECT scheduler_name, last_started_at, last_success_at,
              last_failure_at, last_error, last_summary, updated_at
       FROM scheduler_status
       WHERE scheduler_name = $1`,
      [schedulerName]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      schedulerName: row.scheduler_name,
      lastStartedAt: row.last_started_at,
      lastSuccessAt: row.last_success_at,
      lastFailureAt: row.last_failure_at,
      lastError: row.last_error,
      lastSummary: row.last_summary,
      updatedAt: row.updated_at
    };
  }
}

module.exports = SchedulerStatusService;
