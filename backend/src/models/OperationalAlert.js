const db = require('../config/database');
const crypto = require('crypto');
const { assertCanReviewOwnRequest } = require('../utils/approvalPolicy');

function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    alertType: row.alert_type,
    severity: row.severity,
    status: row.status,
    entityType: row.entity_type,
    entityId: row.entity_id,
    message: row.message,
    payload: row.payload || {},
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
    suppressedUntil: row.suppressed_until,
    suppressionReason: row.suppression_reason,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by
  };
}

function toActionAuditCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    alertId: row.alert_id,
    alertType: row.alert_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorUsername: row.actor_username,
    statusBefore: row.status_before,
    statusAfter: row.status_after,
    payload: row.payload || {},
    createdAt: row.created_at
  };
}

function toSuppressionRuleCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    alertType: row.alert_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    recurrenceRule: row.recurrence_rule || {},
    reason: row.reason,
    isEnabled: row.is_enabled,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toEscalationDestinationCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    destinationType: row.destination_type,
    target: row.target,
    severity: row.severity,
    isEnabled: row.is_enabled,
    isDeleted: Boolean(row.deleted_at),
    metadata: row.metadata || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function toEscalationDestinationAuditCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    destinationId: row.destination_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorUsername: row.actor_username,
    reason: row.reason,
    beforeState: row.before_state || {},
    afterState: row.after_state || {},
    createdAt: row.created_at
  };
}

function toEscalationDestinationRequestCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    destinationId: row.destination_id,
    action: row.action,
    status: row.status,
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by,
    reason: row.reason,
    beforeState: row.before_state || {},
    afterState: row.after_state || {},
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    appliedAt: row.applied_at
  };
}

function toEscalationDeliveryCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    alertId: row.alert_id,
    destinationId: row.destination_id,
    destinationType: row.destination_type,
    target: row.target,
    severity: row.severity,
    status: row.status,
    dryRun: row.dry_run,
    payload: row.payload || {},
    responseStatus: row.response_status,
    errorMessage: row.error_message,
    retryCount: Number(row.retry_count || 0),
    nextRetryAt: row.next_retry_at,
    lastRetryAt: row.last_retry_at,
    retryReason: row.retry_reason,
    retryLeaseId: row.retry_lease_id,
    retryLeaseUntil: row.retry_lease_until,
    deadLetteredAt: row.dead_lettered_at,
    deadLetterReason: row.dead_letter_reason,
    eligibleForRetry: !row.dead_lettered_at && ['failed', 'skipped'].includes(row.status) && (!row.next_retry_at || new Date(row.next_retry_at) <= new Date()),
    attemptedAt: row.attempted_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at
  };
}

function toEscalationDeliveryReplayRequestCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    status: row.status,
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by,
    reason: row.reason,
    reviewNote: row.review_note,
    scope: row.scope || {},
    destinationType: row.destination_type || row.scope?.destinationType,
    target: row.target || row.scope?.target,
    resultDeliveryId: row.result_delivery_id,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    appliedAt: row.applied_at
  };
}

function cleanText(value, maxLength = 500) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

class OperationalAlert {
  static async findById(alertId) {
    const result = await db.query(
      'SELECT * FROM operational_alerts WHERE id = $1',
      [alertId]
    );
    return toCamel(result.rows[0]);
  }

  static async upsertActive({ alertType, severity = 'warning', entityType = null, entityId = null, message, payload = {} }) {
    const result = await db.query(
      `
        INSERT INTO operational_alerts (
          alert_type, severity, status, entity_type, entity_id, message, payload,
          first_seen_at, last_seen_at, resolved_at
        )
        VALUES ($1, $2, 'active', $3, $4, $5, $6::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
        ON CONFLICT (alert_type, entity_type, entity_id) WHERE status = 'active'
        DO UPDATE SET
          severity = EXCLUDED.severity,
          message = EXCLUDED.message,
          payload = EXCLUDED.payload,
          last_seen_at = CURRENT_TIMESTAMP,
          resolved_at = NULL
        RETURNING *
      `,
      [alertType, severity, entityType, entityId, message, JSON.stringify(payload || {})]
    );

    return toCamel(result.rows[0]);
  }

  static async resolveById(alertId, actionPayload = {}) {
    const result = await db.query(
      `
        UPDATE operational_alerts
        SET status = 'resolved',
            resolved_at = CURRENT_TIMESTAMP,
            last_seen_at = CURRENT_TIMESTAMP,
            payload = payload || $2::jsonb
        WHERE id = $1
        RETURNING *
      `,
      [alertId, JSON.stringify({ resolution: actionPayload })]
    );

    return toCamel(result.rows[0]);
  }

  static async acknowledgeById(alertId, actorUserId = null) {
    const result = await db.query(
      `
        UPDATE operational_alerts
        SET acknowledged_at = CURRENT_TIMESTAMP,
            acknowledged_by = $2,
            last_seen_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [alertId, actorUserId]
    );

    return toCamel(result.rows[0]);
  }

  static async suppressById(alertId, { minutes = 60, reason = null, actorUserId = null } = {}) {
    const durationMinutes = Math.min(Math.max(parseInt(minutes || '60', 10), 1), 10080);
    const result = await db.query(
      `
        UPDATE operational_alerts
        SET suppressed_until = CURRENT_TIMESTAMP + ($2::text || ' minutes')::interval,
            suppression_reason = $3,
            acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP),
            acknowledged_by = COALESCE(acknowledged_by, $4),
            last_seen_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [alertId, durationMinutes, reason, actorUserId]
    );

    return toCamel(result.rows[0]);
  }

  static async listSuppressionRules(filters = {}) {
    const values = [];
    const clauses = [];

    if (filters.alertType) {
      values.push(filters.alertType);
      clauses.push(`alert_type = $${values.length}`);
    }
    if (filters.enabled !== undefined) {
      values.push(String(filters.enabled) === 'true');
      clauses.push(`is_enabled = $${values.length}`);
    }

    const result = await db.query(
      `
        SELECT *
        FROM operational_alert_suppression_rules
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY updated_at DESC, created_at DESC
      `,
      values
    );

    return result.rows.map(toSuppressionRuleCamel);
  }

  static async upsertSuppressionRule(data = {}, actorUserId = null) {
    const alertType = cleanText(data.alertType || data.alert_type, 120);
    if (!alertType) {
      const error = new Error('Alert type is required for suppression rules');
      error.status = 400;
      throw error;
    }
    const recurrenceRule = data.recurrenceRule || data.recurrence_rule || {};
    const isEnabled = data.isEnabled !== undefined ? Boolean(data.isEnabled) : data.is_enabled !== undefined ? Boolean(data.is_enabled) : true;

    if (data.id) {
      const result = await db.query(
        `
          UPDATE operational_alert_suppression_rules
          SET alert_type = $2,
              entity_type = $3,
              entity_id = $4,
              recurrence_rule = $5::jsonb,
              reason = $6,
              is_enabled = $7,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [
          data.id,
          alertType,
          cleanText(data.entityType || data.entity_type, 120),
          data.entityId || data.entity_id || null,
          JSON.stringify(recurrenceRule || {}),
          cleanText(data.reason, 500),
          isEnabled
        ]
      );
      return toSuppressionRuleCamel(result.rows[0]);
    }

    const result = await db.query(
      `
        INSERT INTO operational_alert_suppression_rules (
          alert_type, entity_type, entity_id, recurrence_rule, reason, is_enabled, created_by
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
        RETURNING *
      `,
      [
        alertType,
        cleanText(data.entityType || data.entity_type, 120),
        data.entityId || data.entity_id || null,
        JSON.stringify(recurrenceRule || {}),
        cleanText(data.reason, 500),
        isEnabled,
        actorUserId
      ]
    );

    return toSuppressionRuleCamel(result.rows[0]);
  }

  static async listEscalationDestinations(filters = {}) {
    const values = [];
    const clauses = [];

    if (filters.includeDeleted !== 'true') {
      clauses.push('deleted_at IS NULL');
    }
    if (filters.destinationType) {
      values.push(filters.destinationType);
      clauses.push(`destination_type = $${values.length}`);
    }
    if (filters.enabled !== undefined) {
      values.push(String(filters.enabled) === 'true');
      clauses.push(`is_enabled = $${values.length}`);
    }

    const result = await db.query(
      `
        SELECT *
        FROM operational_alert_escalation_destinations
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY is_enabled DESC, severity ASC, destination_type ASC, target ASC
      `,
      values
    );

    return result.rows.map(toEscalationDestinationCamel);
  }

  static async upsertEscalationDestination(data = {}, actorUserId = null) {
    const destinationType = cleanText(data.destinationType || data.destination_type, 20);
    const target = cleanText(data.target, 500);
    if (!['email', 'slack', 'webhook'].includes(destinationType)) {
      const error = new Error('Escalation destination type must be email, slack, or webhook');
      error.status = 400;
      throw error;
    }
    if (!target) {
      const error = new Error('Escalation destination target is required');
      error.status = 400;
      throw error;
    }
    const severity = ['critical', 'warning', 'info'].includes(data.severity) ? data.severity : 'warning';
    const isEnabled = data.isEnabled !== undefined ? Boolean(data.isEnabled) : data.is_enabled !== undefined ? Boolean(data.is_enabled) : true;

    if (data.id) {
      const before = await this.findEscalationDestinationById(data.id, { includeDeleted: true });
      const result = await db.query(
        `
          UPDATE operational_alert_escalation_destinations
          SET destination_type = $2,
              target = $3,
              severity = $4,
              is_enabled = $5,
              metadata = $6::jsonb,
              deleted_at = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [
          data.id,
          destinationType,
          target,
          severity,
          isEnabled,
          JSON.stringify(data.metadata || {})
        ]
      );
      const destination = toEscalationDestinationCamel(result.rows[0]);
      if (destination) {
        await this.recordEscalationDestinationAudit(destination.id, {
          action: 'update',
          actorUserId,
          reason: cleanText(data.reason, 500),
          beforeState: before || {},
          afterState: destination
        });
      }
      return destination;
    }

    const result = await db.query(
      `
        INSERT INTO operational_alert_escalation_destinations (
          destination_type, target, severity, is_enabled, metadata, created_by
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        RETURNING *
      `,
      [
        destinationType,
        target,
        severity,
        isEnabled,
        JSON.stringify(data.metadata || {}),
        actorUserId
      ]
    );

    const destination = toEscalationDestinationCamel(result.rows[0]);
    if (destination) {
      await this.recordEscalationDestinationAudit(destination.id, {
        action: 'create',
        actorUserId,
        reason: cleanText(data.reason, 500),
        beforeState: {},
        afterState: destination
      });
    }
    return destination;
  }

  static async recordEscalationDestinationAudit(destinationId, {
    action,
    actorUserId = null,
    reason = null,
    beforeState = {},
    afterState = {}
  } = {}) {
    const result = await db.query(
      `
        INSERT INTO operational_alert_escalation_destination_audits (
          destination_id, action, actor_user_id, reason, before_state, after_state
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
        RETURNING *
      `,
      [
        destinationId || null,
        action,
        actorUserId,
        cleanText(reason, 500),
        JSON.stringify(beforeState || {}),
        JSON.stringify(afterState || {})
      ]
    );
    return toEscalationDestinationAuditCamel(result.rows[0]);
  }

  static async setEscalationDestinationEnabled(destinationId, isEnabled, { reason, actorUserId = null } = {}) {
    const before = await this.findEscalationDestinationById(destinationId, { includeDeleted: true });
    if (!before) {
      const error = new Error('Escalation destination not found');
      error.status = 404;
      throw error;
    }
    const cleanedReason = cleanText(reason, 500);
    if (!cleanedReason) {
      const error = new Error('A reason is required to enable or disable an escalation destination');
      error.status = 400;
      throw error;
    }

    const result = await db.query(
      `
        UPDATE operational_alert_escalation_destinations
        SET is_enabled = $2,
            deleted_at = CASE WHEN $2 = TRUE THEN NULL ELSE deleted_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [destinationId, Boolean(isEnabled)]
    );
    const destination = toEscalationDestinationCamel(result.rows[0]);
    await this.recordEscalationDestinationAudit(destinationId, {
      action: isEnabled ? 'enable' : 'disable',
      actorUserId,
      reason: cleanedReason,
      beforeState: before,
      afterState: destination
    });
    return destination;
  }

  static async deleteEscalationDestination(destinationId, { reason, actorUserId = null } = {}) {
    const before = await this.findEscalationDestinationById(destinationId, { includeDeleted: true });
    if (!before) {
      const error = new Error('Escalation destination not found');
      error.status = 404;
      throw error;
    }
    const cleanedReason = cleanText(reason, 500);
    if (!cleanedReason) {
      const error = new Error('A reason is required to delete an escalation destination');
      error.status = 400;
      throw error;
    }

    const result = await db.query(
      `
        UPDATE operational_alert_escalation_destinations
        SET is_enabled = FALSE,
            deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [destinationId]
    );
    const destination = toEscalationDestinationCamel(result.rows[0]);
    await this.recordEscalationDestinationAudit(destinationId, {
      action: 'delete',
      actorUserId,
      reason: cleanedReason,
      beforeState: before,
      afterState: destination
    });
    return destination;
  }

  static async listEscalationDestinationAudits(filters = {}) {
    const values = [];
    const clauses = [];

    if (filters.destinationId) {
      values.push(filters.destinationId);
      clauses.push(`a.destination_id = $${values.length}`);
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 500);
    values.push(limit);

    const result = await db.query(
      `
        SELECT a.*, u.email AS actor_email, u.username AS actor_username
        FROM operational_alert_escalation_destination_audits a
        LEFT JOIN users u ON u.id = a.actor_user_id
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY a.created_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(toEscalationDestinationAuditCamel);
  }

  static async requestEscalationDestinationChange(data = {}, actorUserId = null) {
    const action = cleanText(data.action, 20);
    if (!['create', 'update', 'enable', 'disable', 'delete'].includes(action)) {
      const error = new Error('Escalation destination request action must be create, update, enable, disable, or delete');
      error.status = 400;
      throw error;
    }
    const reason = cleanText(data.reason, 500);
    if (!reason) {
      const error = new Error('A reason is required for escalation destination change approval');
      error.status = 400;
      throw error;
    }

    const destinationId = data.destinationId || data.destination_id || data.id || null;
    const before = destinationId
      ? await this.findEscalationDestinationById(destinationId, { includeDeleted: true })
      : null;
    if (destinationId && !before) {
      const error = new Error('Escalation destination not found');
      error.status = 404;
      throw error;
    }

    let afterState = data.afterState || data.after_state || {};
    if (action === 'create' || action === 'update') {
      afterState = {
        id: destinationId,
        destinationType: data.destinationType || data.destination_type || before?.destinationType,
        target: data.target || before?.target,
        severity: data.severity || before?.severity || 'warning',
        isEnabled: data.isEnabled !== undefined ? Boolean(data.isEnabled) : data.is_enabled !== undefined ? Boolean(data.is_enabled) : before?.isEnabled !== false,
        metadata: data.metadata || before?.metadata || {}
      };
    } else if (action === 'enable' || action === 'disable') {
      afterState = {
        ...(before || {}),
        isEnabled: action === 'enable'
      };
    } else if (action === 'delete') {
      afterState = {
        ...(before || {}),
        isEnabled: false,
        isDeleted: true
      };
    }

    const result = await db.query(
      `
        INSERT INTO operational_alert_escalation_destination_change_requests (
          destination_id, action, requested_by, reason, before_state, after_state
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
        RETURNING *
      `,
      [
        destinationId,
        action,
        actorUserId,
        reason,
        JSON.stringify(before || {}),
        JSON.stringify(afterState || {})
      ]
    );
    return toEscalationDestinationRequestCamel(result.rows[0]);
  }

  static async listEscalationDestinationChangeRequests(filters = {}) {
    const values = [];
    const clauses = [];
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filters.destinationId || filters.destination_id) {
      values.push(filters.destinationId || filters.destination_id);
      clauses.push(`destination_id = $${values.length}`);
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 500);
    values.push(limit);
    const result = await db.query(
      `
        SELECT *
        FROM operational_alert_escalation_destination_change_requests
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY requested_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(toEscalationDestinationRequestCamel);
  }

  static async runEscalationDestinationChangeRequestAction(requestId, action = 'approve', reviewerUserId = null) {
    if (!['approve', 'reject'].includes(action)) {
      const error = new Error('Escalation destination request action must be approve or reject');
      error.status = 400;
      throw error;
    }
    const existingResult = await db.query(
      `
        SELECT *
        FROM operational_alert_escalation_destination_change_requests
        WHERE id = $1
      `,
      [requestId]
    );
    const request = existingResult.rows[0];
    if (!request) {
      const error = new Error('Escalation destination change request not found');
      error.status = 404;
      throw error;
    }
    if (request.status !== 'pending') {
      const error = new Error('Escalation destination change request has already been reviewed');
      error.status = 400;
      throw error;
    }
    assertCanReviewOwnRequest({
      requestedBy: request.requested_by,
      reviewerUserId,
      resource: 'alert destination change request'
    });

    if (action === 'reject') {
      const rejected = await db.query(
        `
          UPDATE operational_alert_escalation_destination_change_requests
          SET status = 'rejected',
              reviewed_by = $2,
              reviewed_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [requestId, reviewerUserId]
      );
      return { request: toEscalationDestinationRequestCamel(rejected.rows[0]), destination: null };
    }

    const afterState = request.after_state || {};
    let destination = null;
    if (request.action === 'create' || request.action === 'update') {
      destination = await this.upsertEscalationDestination({
        ...afterState,
        id: request.destination_id || afterState.id || undefined,
        reason: request.reason
      }, reviewerUserId);
    } else if (request.action === 'enable') {
      destination = await this.setEscalationDestinationEnabled(request.destination_id, true, {
        reason: request.reason,
        actorUserId: reviewerUserId
      });
    } else if (request.action === 'disable') {
      destination = await this.setEscalationDestinationEnabled(request.destination_id, false, {
        reason: request.reason,
        actorUserId: reviewerUserId
      });
    } else if (request.action === 'delete') {
      destination = await this.deleteEscalationDestination(request.destination_id, {
        reason: request.reason,
        actorUserId: reviewerUserId
      });
    }

    const applied = await db.query(
      `
        UPDATE operational_alert_escalation_destination_change_requests
        SET status = 'applied',
            reviewed_by = $2,
            reviewed_at = CURRENT_TIMESTAMP,
            applied_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [requestId, reviewerUserId]
    );
    return { request: toEscalationDestinationRequestCamel(applied.rows[0]), destination };
  }

  static async recordEscalationDelivery(data = {}) {
    const result = await db.query(
      `
        INSERT INTO operational_alert_escalation_deliveries (
          alert_id, destination_id, destination_type, target, severity, status,
          dry_run, payload, response_status, error_message, retry_count,
          next_retry_at, last_retry_at, retry_reason, retry_lease_id,
          retry_lease_until, dead_lettered_at, dead_letter_reason, delivered_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18,
          CASE WHEN $6 = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END
        )
        RETURNING *
      `,
      [
        data.alertId || null,
        data.destinationId || null,
        data.destinationType,
        cleanText(data.target, 500),
        data.severity || 'warning',
        data.status || 'pending',
        data.dryRun === true,
        JSON.stringify(data.payload || {}),
        data.responseStatus || null,
        cleanText(data.errorMessage, 1000),
        Math.max(0, parseInt(data.retryCount || '0', 10) || 0),
        data.nextRetryAt || null,
        data.lastRetryAt || null,
        cleanText(data.retryReason, 1000),
        data.retryLeaseId || null,
        data.retryLeaseUntil || null,
        data.deadLetteredAt || null,
        cleanText(data.deadLetterReason, 1000)
      ]
    );

    return toEscalationDeliveryCamel(result.rows[0]);
  }

  static async findEscalationDestinationById(destinationId, options = {}) {
    const result = await db.query(
      `
        SELECT *
        FROM operational_alert_escalation_destinations
        WHERE id = $1
          ${options.includeDeleted ? '' : 'AND deleted_at IS NULL'}
      `,
      [destinationId]
    );
    return toEscalationDestinationCamel(result.rows[0]);
  }

  static async findEscalationDeliveryById(deliveryId) {
    const result = await db.query(
      `
        SELECT *
        FROM operational_alert_escalation_deliveries
        WHERE id = $1
      `,
      [deliveryId]
    );
    return toEscalationDeliveryCamel(result.rows[0]);
  }

  static async listEscalationDeliveries(filters = {}) {
    const values = [];
    const clauses = [];
    if (filters.alertId) {
      values.push(filters.alertId);
      clauses.push(`alert_id = $${values.length}`);
    }
    if (filters.destinationId) {
      values.push(filters.destinationId);
      clauses.push(`destination_id = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filters.deadLettered !== undefined) {
      clauses.push(String(filters.deadLettered) === 'true' ? 'dead_lettered_at IS NOT NULL' : 'dead_lettered_at IS NULL');
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '100', 10), 1), 500);
    values.push(limit);

    const result = await db.query(
      `
        SELECT *
        FROM operational_alert_escalation_deliveries
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY attempted_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(toEscalationDeliveryCamel);
  }

  static async listEscalationDeliveryReplayRequests(filters = {}) {
    const values = [];
    const clauses = [];
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`r.status = $${values.length}`);
    }
    if (filters.deliveryId || filters.delivery_id) {
      values.push(filters.deliveryId || filters.delivery_id);
      clauses.push(`r.delivery_id = $${values.length}`);
    }
    if (filters.destinationType || filters.destination_type) {
      values.push(filters.destinationType || filters.destination_type);
      clauses.push(`d.destination_type = $${values.length}`);
    }
    if (filters.from || filters.requestedFrom || filters.requested_from) {
      values.push(filters.from || filters.requestedFrom || filters.requested_from);
      clauses.push(`r.requested_at >= $${values.length}`);
    }
    if (filters.to || filters.requestedTo || filters.requested_to) {
      values.push(filters.to || filters.requestedTo || filters.requested_to);
      clauses.push(`r.requested_at <= $${values.length}`);
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 500);
    values.push(limit);
    const result = await db.query(
      `
        SELECT r.*, d.destination_type, d.target
        FROM operational_alert_delivery_replay_requests r
        LEFT JOIN operational_alert_escalation_deliveries d ON d.id = r.delivery_id
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY r.requested_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(toEscalationDeliveryReplayRequestCamel);
  }

  static async requestEscalationDeliveryReplay(deliveryId, data = {}, actorUserId = null) {
    const delivery = await this.findEscalationDeliveryById(deliveryId);
    if (!delivery) {
      const error = new Error('Escalation delivery not found');
      error.status = 404;
      throw error;
    }
    if (!delivery.deadLetteredAt) {
      const error = new Error('Only dead-lettered escalation deliveries can request replay');
      error.status = 400;
      throw error;
    }

    const reason = cleanText(data.reason, 500);
    if (!reason) {
      const error = new Error('A reason is required to request dead-letter replay');
      error.status = 400;
      throw error;
    }

    const maxReplayCount = Math.min(
      Math.max(parseInt(data.maxReplayCount || process.env.ALERT_DEAD_LETTER_REPLAY_LIMIT || '3', 10) || 3, 1),
      25
    );
    const replayCount = await this.countAppliedDeliveryReplays(deliveryId);
    if (replayCount >= maxReplayCount) {
      const error = new Error(`Dead-letter replay limit reached for this delivery (${replayCount}/${maxReplayCount})`);
      error.status = 429;
      throw error;
    }

    const scope = {
      maxReplayCount,
      replayCount,
      destinationType: delivery.destinationType,
      target: delivery.target,
      retryCount: delivery.retryCount || 0
    };
    const result = await db.query(
      `
        INSERT INTO operational_alert_delivery_replay_requests (
          delivery_id, requested_by, reason, scope
        )
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING *
      `,
      [deliveryId, actorUserId, reason, JSON.stringify(scope)]
    );
    return toEscalationDeliveryReplayRequestCamel(result.rows[0]);
  }

  static async countAppliedDeliveryReplays(deliveryId) {
    const result = await db.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM operational_alert_delivery_replay_requests
        WHERE delivery_id = $1
          AND status = 'applied'
      `,
      [deliveryId]
    );
    return Number(result.rows[0]?.count || 0);
  }

  static async getPendingEscalationDeliveryReplayRequestForReview(requestId, reviewerUserId = null, options = {}) {
    const result = await db.query(
      `
        SELECT *
        FROM operational_alert_delivery_replay_requests
        WHERE id = $1
      `,
      [requestId]
    );
    const request = result.rows[0];
    if (!request) {
      const error = new Error('Dead-letter replay request not found');
      error.status = 404;
      throw error;
    }
    if (request.status !== 'pending') {
      const error = new Error('Dead-letter replay request has already been reviewed');
      error.status = 400;
      throw error;
    }
    assertCanReviewOwnRequest({
      requestedBy: request.requested_by,
      reviewerUserId,
      resource: 'dead-letter replay request'
    });
    if (options.enforceLimit !== false) {
      const scope = request.scope || {};
      const maxReplayCount = Math.min(Math.max(parseInt(scope.maxReplayCount || process.env.ALERT_DEAD_LETTER_REPLAY_LIMIT || '3', 10) || 3, 1), 25);
      const replayCount = await this.countAppliedDeliveryReplays(request.delivery_id);
      if (replayCount >= maxReplayCount) {
        const error = new Error(`Dead-letter replay limit reached for this delivery (${replayCount}/${maxReplayCount})`);
        error.status = 429;
        throw error;
      }
    }
    return toEscalationDeliveryReplayRequestCamel(request);
  }

  static async rejectEscalationDeliveryReplayRequest(requestId, reviewerUserId = null, reviewNote = null) {
    const request = await this.getPendingEscalationDeliveryReplayRequestForReview(requestId, reviewerUserId, { enforceLimit: false });
    const result = await db.query(
      `
        UPDATE operational_alert_delivery_replay_requests
        SET status = 'rejected',
            reviewed_by = $2,
            reviewed_at = CURRENT_TIMESTAMP,
            review_note = $3
        WHERE id = $1
        RETURNING *
      `,
      [request.id, reviewerUserId, cleanText(reviewNote, 500)]
    );
    return toEscalationDeliveryReplayRequestCamel(result.rows[0]);
  }

  static async markEscalationDeliveryReplayRequestApplied(requestId, reviewerUserId = null, resultDeliveryId = null, reviewNote = null) {
    const result = await db.query(
      `
        UPDATE operational_alert_delivery_replay_requests
        SET status = 'applied',
            reviewed_by = $2,
            reviewed_at = CURRENT_TIMESTAMP,
            applied_at = CURRENT_TIMESTAMP,
            result_delivery_id = $3,
            review_note = $4
        WHERE id = $1
          AND status = 'pending'
        RETURNING *
      `,
      [requestId, reviewerUserId, resultDeliveryId || null, cleanText(reviewNote, 500)]
    );
    if (!result.rows[0]) {
      const error = new Error('Dead-letter replay request has already been reviewed');
      error.status = 400;
      throw error;
    }
    return toEscalationDeliveryReplayRequestCamel(result.rows[0]);
  }

  static async cleanupEscalationDeliveryReplayRequests(options = {}) {
    const pendingOlderThanHours = Math.min(Math.max(parseInt(options.pendingOlderThanHours || process.env.ALERT_REPLAY_PENDING_TTL_HOURS || '168', 10) || 168, 1), 8760);
    const reviewedOlderThanDays = Math.min(Math.max(parseInt(options.reviewedOlderThanDays || process.env.ALERT_REPLAY_REVIEWED_TTL_DAYS || '90', 10) || 90, 1), 3650);
    const dryRun = options.dryRun === true || options.dryRun === 'true';
    const stalePending = await db.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM operational_alert_delivery_replay_requests
        WHERE status = 'pending'
          AND requested_at < NOW() - ($1::text)::interval
      `,
      [`${pendingOlderThanHours} hours`]
    );
    const oldReviewed = await db.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM operational_alert_delivery_replay_requests
        WHERE status IN ('applied', 'rejected')
          AND COALESCE(reviewed_at, applied_at, requested_at) < NOW() - ($1::text)::interval
      `,
      [`${reviewedOlderThanDays} days`]
    );
    if (dryRun) {
      return {
        dryRun: true,
        pendingOlderThanHours,
        reviewedOlderThanDays,
        stalePending: Number(stalePending.rows[0]?.count || 0),
        oldReviewed: Number(oldReviewed.rows[0]?.count || 0),
        expiredPending: 0,
        deletedReviewed: 0
      };
    }

    const expired = await db.query(
      `
        UPDATE operational_alert_delivery_replay_requests
        SET status = 'rejected',
            reviewed_at = CURRENT_TIMESTAMP,
            review_note = COALESCE(review_note, 'Expired by replay request cleanup')
        WHERE status = 'pending'
          AND requested_at < NOW() - ($1::text)::interval
      `,
      [`${pendingOlderThanHours} hours`]
    );
    const deleted = await db.query(
      `
        DELETE FROM operational_alert_delivery_replay_requests
        WHERE status IN ('applied', 'rejected')
          AND COALESCE(reviewed_at, applied_at, requested_at) < NOW() - ($1::text)::interval
      `,
      [`${reviewedOlderThanDays} days`]
    );
    return {
      dryRun: false,
      pendingOlderThanHours,
      reviewedOlderThanDays,
      stalePending: Number(stalePending.rows[0]?.count || 0),
      oldReviewed: Number(oldReviewed.rows[0]?.count || 0),
      expiredPending: expired.rowCount || 0,
      deletedReviewed: deleted.rowCount || 0
    };
  }

  static async listDueEscalationRetryDeliveries({ limit = 25, includeSkipped = false } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit || '25', 10), 1), 250);
    const statuses = includeSkipped ? ['failed', 'skipped'] : ['failed'];
    const result = await db.query(
      `
        SELECT *
        FROM operational_alert_escalation_deliveries
        WHERE status = ANY($1::text[])
          AND next_retry_at IS NOT NULL
          AND next_retry_at <= CURRENT_TIMESTAMP
          AND dead_lettered_at IS NULL
          AND (retry_lease_until IS NULL OR retry_lease_until <= CURRENT_TIMESTAMP)
        ORDER BY next_retry_at ASC, attempted_at ASC
        LIMIT $2
      `,
      [statuses, safeLimit]
    );
    return result.rows.map(toEscalationDeliveryCamel);
  }

  static async claimDueEscalationRetryDeliveries({ limit = 25, includeSkipped = false, leaseSeconds = 300 } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit || '25', 10), 1), 250);
    const safeLeaseSeconds = Math.min(Math.max(parseInt(leaseSeconds || '300', 10), 30), 3600);
    const statuses = includeSkipped ? ['failed', 'skipped'] : ['failed'];
    const leaseId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const result = await db.query(
      `
        UPDATE operational_alert_escalation_deliveries
        SET retry_lease_id = $3,
            retry_lease_until = CURRENT_TIMESTAMP + ($4::text || ' seconds')::interval
        WHERE id IN (
          SELECT id
          FROM operational_alert_escalation_deliveries
          WHERE status = ANY($1::text[])
            AND next_retry_at IS NOT NULL
            AND next_retry_at <= CURRENT_TIMESTAMP
            AND dead_lettered_at IS NULL
            AND (retry_lease_until IS NULL OR retry_lease_until <= CURRENT_TIMESTAMP)
          ORDER BY next_retry_at ASC, attempted_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `,
      [statuses, safeLimit, leaseId, safeLeaseSeconds]
    );
    return result.rows.map(toEscalationDeliveryCamel);
  }

  static async markEscalationDeliveryRetryClaimed(deliveryId, { reason = null } = {}) {
    const result = await db.query(
      `
        UPDATE operational_alert_escalation_deliveries
        SET last_retry_at = CURRENT_TIMESTAMP,
            next_retry_at = NULL,
            retry_reason = COALESCE($2, retry_reason),
            retry_lease_id = NULL,
            retry_lease_until = NULL
        WHERE id = $1
        RETURNING *
      `,
      [deliveryId, cleanText(reason, 1000)]
    );
    return toEscalationDeliveryCamel(result.rows[0]);
  }

  static async markEscalationDeliveryDeadLettered(deliveryId, { reason = null } = {}) {
    const result = await db.query(
      `
        UPDATE operational_alert_escalation_deliveries
        SET dead_lettered_at = CURRENT_TIMESTAMP,
            dead_letter_reason = COALESCE($2, retry_reason, error_message),
            next_retry_at = NULL,
            retry_lease_id = NULL,
            retry_lease_until = NULL
        WHERE id = $1
        RETURNING *
      `,
      [deliveryId, cleanText(reason, 1000)]
    );
    return toEscalationDeliveryCamel(result.rows[0]);
  }

  static async recordActionAudit(alert, { action, actorUserId = null, statusAfter = null, payload = {} }) {
    const result = await db.query(
      `
        INSERT INTO operational_alert_action_audits (
          alert_id, alert_type, entity_type, entity_id, action, actor_user_id,
          status_before, status_after, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        RETURNING *
      `,
      [
        alert.id,
        alert.alertType,
        alert.entityType,
        alert.entityId,
        action,
        actorUserId,
        alert.status,
        statusAfter,
        JSON.stringify(payload || {})
      ]
    );

    return toActionAuditCamel(result.rows[0]);
  }

  static async listActionAudits(filters = {}) {
    const values = [];
    const clauses = [];

    if (filters.alertType) {
      values.push(filters.alertType);
      clauses.push(`oaaa.alert_type = $${values.length}`);
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '50', 10), 1), 500);
    values.push(limit);

    const result = await db.query(
      `
        SELECT oaaa.*, u.email AS actor_email, u.username AS actor_username
        FROM operational_alert_action_audits oaaa
        LEFT JOIN users u ON u.id = oaaa.actor_user_id
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY oaaa.created_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return result.rows.map(toActionAuditCamel);
  }

  static async resolveMissing(alertType, entityType, activeEntityIds = []) {
    const values = [alertType, entityType];
    let entityClause = '';

    if (activeEntityIds.length > 0) {
      values.push(activeEntityIds);
      entityClause = `AND entity_id <> ALL($${values.length}::uuid[])`;
    }

    const result = await db.query(
      `
        UPDATE operational_alerts
        SET status = 'resolved',
            resolved_at = CURRENT_TIMESTAMP,
            last_seen_at = CURRENT_TIMESTAMP
        WHERE status = 'active'
          AND alert_type = $1
          AND entity_type = $2
          ${entityClause}
        RETURNING *
      `,
      values
    );

    return result.rows.map(toCamel);
  }

  static async list(filters = {}) {
    const values = [];
    const clauses = [];

    if (filters.status) {
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }

    if (filters.alertType) {
      values.push(filters.alertType);
      clauses.push(`alert_type = $${values.length}`);
    }

    if (filters.includeSuppressed !== 'true' && filters.status === 'active') {
      clauses.push(`(suppressed_until IS NULL OR suppressed_until <= CURRENT_TIMESTAMP)`);
    }

    const limit = Math.min(Math.max(parseInt(filters.limit || '100', 10), 1), 500);
    values.push(limit);

    const result = await db.query(
      `
        SELECT *
        FROM operational_alerts
        ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY
          CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
          last_seen_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return result.rows.map(toCamel);
  }
}

module.exports = OperationalAlert;
