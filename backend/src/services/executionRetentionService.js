const db = require('../config/database');
const { withSpan } = require('../utils/tracing');
const { assertCanReviewOwnRequest } = require('../utils/approvalPolicy');

function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    policyName: row.policy_name,
    isEnabled: row.is_enabled,
    eventRetentionDays: row.event_retention_days,
    telemetryRetentionDays: row.telemetry_retention_days,
    reportAccessRetentionDays: row.report_access_retention_days,
    lastRunAt: row.last_run_at,
    lastDeletedCounts: row.last_deleted_counts || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRevisionCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    policyId: row.policy_id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorUsername: row.actor_username,
    changeType: row.change_type,
    beforePolicy: row.before_policy || {},
    afterPolicy: row.after_policy || {},
    approvalStatus: row.approval_status,
    requestedAt: row.requested_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    appliedAt: row.applied_at
  };
}

function normalizePolicyUpdate(current, updates = {}) {
  const next = { ...current };

  if (Object.prototype.hasOwnProperty.call(updates, 'isEnabled')) {
    next.isEnabled = updates.isEnabled === true || updates.isEnabled === 'true';
  }

  const dayFields = ['eventRetentionDays', 'telemetryRetentionDays', 'reportAccessRetentionDays'];
  for (const field of dayFields) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      const value = Number(updates[field]);
      if (!Number.isInteger(value) || value < 1 || value > 3650) {
        const error = new Error(`${field} must be an integer between 1 and 3650`);
        error.status = 400;
        throw error;
      }
      next[field] = value;
    }
  }

  return next;
}

class ExecutionRetentionService {
  static async getDefaultPolicy() {
    const result = await db.query(
      `
        SELECT *
        FROM execution_retention_policies
        WHERE policy_name = 'default'
      `
    );

    return toCamel(result.rows[0]);
  }

  static async runDefaultPolicy() {
    return withSpan('execution_retention.run', {
      'retention.policy': 'default'
    }, async () => {
      const policy = await this.getDefaultPolicy();
    if (!policy) {
      const error = new Error('Default execution retention policy not found');
      error.status = 500;
      throw error;
    }

    if (!policy.isEnabled) {
      return { policy, deletedCounts: {}, skipped: true };
    }

    const eventDeletes = await db.query(
      `
        DELETE FROM execution_run_events
        WHERE created_at < NOW() - ($1::text || ' days')::interval
      `,
      [policy.eventRetentionDays]
    );

    const telemetryDeletes = await db.query(
      `
        DELETE FROM client_error_events
        WHERE created_at < NOW() - ($1::text || ' days')::interval
      `,
      [policy.telemetryRetentionDays]
    );

    const reportAccessDeletes = await db.query(
      `
        DELETE FROM execution_run_report_accesses
        WHERE created_at < NOW() - ($1::text || ' days')::interval
      `,
      [policy.reportAccessRetentionDays]
    );

    const deletedCounts = {
      executionRunEvents: eventDeletes.rowCount || 0,
      clientErrorEvents: telemetryDeletes.rowCount || 0,
      reportAccesses: reportAccessDeletes.rowCount || 0
    };

    const updateResult = await db.query(
      `
        UPDATE execution_retention_policies
        SET last_run_at = CURRENT_TIMESTAMP,
            last_deleted_counts = $2::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [policy.id, JSON.stringify(deletedCounts)]
    );

    return {
      policy: toCamel(updateResult.rows[0]),
      deletedCounts,
      skipped: false
    };
    });
  }

  static async previewDefaultPolicy() {
    return withSpan('execution_retention.preview', {
      'retention.policy': 'default'
    }, async () => {
      const policy = await this.getDefaultPolicy();
    if (!policy) {
      const error = new Error('Default execution retention policy not found');
      error.status = 500;
      throw error;
    }

    if (!policy.isEnabled) {
      return { policy, candidateCounts: {}, skipped: true };
    }

    const [eventCandidates, telemetryCandidates, reportAccessCandidates] = await Promise.all([
      db.query(
        `
          SELECT COUNT(*)::integer AS count
          FROM execution_run_events
          WHERE created_at < NOW() - ($1::text || ' days')::interval
        `,
        [policy.eventRetentionDays]
      ),
      db.query(
        `
          SELECT COUNT(*)::integer AS count
          FROM client_error_events
          WHERE created_at < NOW() - ($1::text || ' days')::interval
        `,
        [policy.telemetryRetentionDays]
      ),
      db.query(
        `
          SELECT COUNT(*)::integer AS count
          FROM execution_run_report_accesses
          WHERE created_at < NOW() - ($1::text || ' days')::interval
        `,
        [policy.reportAccessRetentionDays]
      )
    ]);

    return {
      policy,
      candidateCounts: {
        executionRunEvents: eventCandidates.rows[0]?.count || 0,
        clientErrorEvents: telemetryCandidates.rows[0]?.count || 0,
        reportAccesses: reportAccessCandidates.rows[0]?.count || 0
      },
      skipped: false
    };
    });
  }

  static async requestDefaultPolicyUpdate(updates = {}, actorUserId = null) {
    const current = await this.getDefaultPolicy();
    if (!current) {
      const error = new Error('Default execution retention policy not found');
      error.status = 500;
      throw error;
    }

    const next = normalizePolicyUpdate(current, updates);
    const result = await db.query(
      `
        INSERT INTO execution_retention_policy_revisions (
          policy_id, actor_user_id, before_policy, after_policy
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb)
        RETURNING *
      `,
      [current.id, actorUserId, JSON.stringify(current), JSON.stringify(next)]
    );

    return toRevisionCamel(result.rows[0]);
  }

  static async listPolicyRevisions(options = {}) {
    const limit = Math.min(Math.max(parseInt(options.limit || '25', 10), 1), 200);
    const result = await db.query(
      `
        SELECT r.*, u.email AS actor_email, u.username AS actor_username
        FROM execution_retention_policy_revisions r
        LEFT JOIN users u ON u.id = r.actor_user_id
        ORDER BY r.requested_at DESC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows.map(toRevisionCamel);
  }

  static async runRevisionAction(revisionId, action, reviewerUserId = null) {
    if (!['approve', 'reject'].includes(action)) {
      const error = new Error('Unsupported retention revision action');
      error.status = 400;
      throw error;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const revisionResult = await client.query(
        `
          SELECT *
          FROM execution_retention_policy_revisions
          WHERE id = $1
          FOR UPDATE
        `,
        [revisionId]
      );
      const revision = revisionResult.rows[0];
      if (!revision) {
        const error = new Error('Retention policy revision not found');
        error.status = 404;
        throw error;
      }
      if (revision.approval_status !== 'pending') {
        const error = new Error('Retention policy revision has already been reviewed');
        error.status = 400;
        throw error;
      }
      assertCanReviewOwnRequest({
        requestedBy: revision.actor_user_id,
        reviewerUserId,
        resource: 'retention policy revision'
      });

      if (action === 'reject') {
        const rejected = await client.query(
          `
            UPDATE execution_retention_policy_revisions
            SET approval_status = 'rejected',
                reviewed_by = $2,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
          `,
          [revisionId, reviewerUserId]
        );
        await client.query('COMMIT');
        return { revision: toRevisionCamel(rejected.rows[0]), policy: await this.getDefaultPolicy() };
      }

      const after = revision.after_policy || {};
      const policyResult = await client.query(
        `
          UPDATE execution_retention_policies
          SET is_enabled = $2,
              event_retention_days = $3,
              telemetry_retention_days = $4,
              report_access_retention_days = $5,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [
          revision.policy_id,
          after.isEnabled,
          after.eventRetentionDays,
          after.telemetryRetentionDays,
          after.reportAccessRetentionDays
        ]
      );
      const applied = await client.query(
        `
          UPDATE execution_retention_policy_revisions
          SET approval_status = 'applied',
              reviewed_by = $2,
              reviewed_at = CURRENT_TIMESTAMP,
              applied_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [revisionId, reviewerUserId]
      );
      await client.query('COMMIT');
      return { revision: toRevisionCamel(applied.rows[0]), policy: toCamel(policyResult.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = ExecutionRetentionService;
