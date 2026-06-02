const db = require('../config/database');

const DEFAULT_PROVIDER_TYPE = 'custom';

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  return value;
}

function hydrateWebhookRow(row) {
  if (!row) return null;
  return {
    ...row,
    provider_type: row.provider_type || DEFAULT_PROVIDER_TYPE,
    event_types: parseJsonValue(row.event_types, []),
    custom_headers: parseJsonValue(row.custom_headers, {})
  };
}

function hydrateDeliveryRow(row) {
  if (!row) return null;
  return {
    ...row,
    request_headers: parseJsonValue(row.request_headers, null),
    request_body: parseJsonValue(row.request_body, null)
  };
}

class WebhookSubscription {
  static async listByUserId(userId, { limit = 50, offset = 0, exactEventTypes = null } = {}) {
    const filterExactEventTypes = Array.isArray(exactEventTypes) ? JSON.stringify(exactEventTypes) : null;
    const listResult = await db.query(
      `
        SELECT id, user_id, url, secret, provider_type, description, event_types, custom_headers,
               is_active, failure_count, disabled_at, last_success_at, last_failure_at,
               created_at, updated_at
        FROM webhook_subscriptions
        WHERE user_id = $1
          AND ($2::jsonb IS NULL OR event_types = $2::jsonb)
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
      `,
      [userId, filterExactEventTypes, limit, offset]
    );

    const countResult = await db.query(
      `
        SELECT COUNT(*)::integer AS total
        FROM webhook_subscriptions
        WHERE user_id = $1
          AND ($2::jsonb IS NULL OR event_types = $2::jsonb)
      `,
      [userId, filterExactEventTypes]
    );

    return {
      rows: listResult.rows.map((row) => hydrateWebhookRow(row)),
      total: countResult.rows[0]?.total || 0
    };
  }

  static async findByIdForUser(id, userId) {
    const result = await db.query(
      `
        SELECT id, user_id, url, secret, provider_type, description, event_types, custom_headers,
               is_active, failure_count, disabled_at, last_success_at, last_failure_at,
               created_at, updated_at
        FROM webhook_subscriptions
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [id, userId]
    );

    return hydrateWebhookRow(result.rows[0]);
  }

  static async findById(id) {
    const result = await db.query(
      `
        SELECT id, user_id, url, secret, provider_type, description, event_types, custom_headers,
               is_active, failure_count, disabled_at, last_success_at, last_failure_at,
               created_at, updated_at
        FROM webhook_subscriptions
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    return hydrateWebhookRow(result.rows[0]);
  }

  static async create({
    userId,
    url,
    secret,
    providerType = DEFAULT_PROVIDER_TYPE,
    description = null,
    eventTypes = [],
    customHeaders = {},
    isActive = true
  }) {
    const result = await db.query(
      `
        INSERT INTO webhook_subscriptions (
          user_id, url, secret, provider_type, description, event_types, custom_headers, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
        RETURNING id, user_id, url, secret, provider_type, description, event_types, custom_headers,
                  is_active, failure_count, disabled_at, last_success_at, last_failure_at,
                  created_at, updated_at
      `,
      [userId, url, secret, providerType, description, JSON.stringify(eventTypes), JSON.stringify(customHeaders), isActive]
    );

    return hydrateWebhookRow(result.rows[0]);
  }

  static async updateForUser(id, userId, updates = {}) {
    const clauses = [];
    const values = [];
    let param = 0;

    if (updates.url !== undefined) {
      clauses.push(`url = $${++param}`);
      values.push(updates.url);
    }

    if (updates.secret !== undefined) {
      clauses.push(`secret = $${++param}`);
      values.push(updates.secret);
    }

    if (updates.providerType !== undefined) {
      clauses.push(`provider_type = $${++param}`);
      values.push(updates.providerType);
    }

    if (updates.description !== undefined) {
      clauses.push(`description = $${++param}`);
      values.push(updates.description);
    }

    if (updates.eventTypes !== undefined) {
      clauses.push(`event_types = $${++param}::jsonb`);
      values.push(JSON.stringify(updates.eventTypes));
    }

    if (updates.customHeaders !== undefined) {
      clauses.push(`custom_headers = $${++param}::jsonb`);
      values.push(JSON.stringify(updates.customHeaders));
    }

    if (updates.isActive !== undefined) {
      clauses.push(`is_active = $${++param}`);
      values.push(updates.isActive);
    }

    if (updates.failureCount !== undefined) {
      clauses.push(`failure_count = $${++param}`);
      values.push(updates.failureCount);
    }

    if (updates.disabledAt !== undefined) {
      clauses.push(`disabled_at = $${++param}`);
      values.push(updates.disabledAt);
    }

    if (updates.lastSuccessAt !== undefined) {
      clauses.push(`last_success_at = $${++param}`);
      values.push(updates.lastSuccessAt);
    }

    if (updates.lastFailureAt !== undefined) {
      clauses.push(`last_failure_at = $${++param}`);
      values.push(updates.lastFailureAt);
    }

    if (clauses.length === 0) {
      return this.findByIdForUser(id, userId);
    }

    values.push(id, userId);
    const result = await db.query(
      `
        UPDATE webhook_subscriptions
        SET ${clauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${++param} AND user_id = $${++param}
        RETURNING id, user_id, url, secret, provider_type, description, event_types, custom_headers,
                  is_active, failure_count, disabled_at, last_success_at, last_failure_at,
                  created_at, updated_at
      `,
      values
    );

    return hydrateWebhookRow(result.rows[0]);
  }

  static async deleteForUser(id, userId) {
    const result = await db.query(
      `
        DELETE FROM webhook_subscriptions
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `,
      [id, userId]
    );

    return result.rows.length > 0;
  }

  static async listActiveByEventType(eventType) {
    const result = await db.query(
      `
        SELECT id, user_id, url, secret, provider_type, description, event_types, custom_headers,
               is_active, failure_count, disabled_at, last_success_at, last_failure_at,
               created_at, updated_at
        FROM webhook_subscriptions
        WHERE is_active = true
          AND (
            event_types @> $1::jsonb
            OR event_types @> '["*"]'::jsonb
            OR event_types @> '["all"]'::jsonb
          )
      `,
      [JSON.stringify([eventType])]
    );

    return result.rows.map((row) => hydrateWebhookRow(row));
  }

  static async recordDelivery({
    webhookId,
    userId,
    eventType,
    eventId = null,
    attempt = 1,
    status = 'pending',
    requestUrl,
    requestHeaders = null,
    requestBody = null,
    responseStatus = null,
    responseBody = null,
    durationMs = null,
    errorMessage = null,
    deliveredAt = null
  }) {
    const result = await db.query(
      `
        INSERT INTO webhook_deliveries (
          webhook_id, user_id, event_type, event_id, attempt, status, request_url,
          request_headers, request_body, response_status, response_body, duration_ms,
          error_message, delivered_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8::jsonb, $9::jsonb, $10, $11, $12,
          $13, $14
        )
        RETURNING id, webhook_id, user_id, event_type, event_id, attempt, status, request_url,
                  request_headers, request_body, response_status, response_body, duration_ms,
                  error_message, created_at, delivered_at
      `,
      [
        webhookId,
        userId,
        eventType,
        eventId,
        attempt,
        status,
        requestUrl,
        requestHeaders ? JSON.stringify(requestHeaders) : null,
        requestBody ? JSON.stringify(requestBody) : null,
        responseStatus,
        responseBody,
        durationMs,
        errorMessage,
        deliveredAt
      ]
    );

    return hydrateDeliveryRow(result.rows[0]);
  }

  static async listDeliveriesForWebhook(userId, webhookId, { limit = 50, offset = 0 } = {}) {
    const listResult = await db.query(
      `
        SELECT wd.id, wd.webhook_id, wd.user_id, wd.event_type, wd.event_id, wd.attempt,
               wd.status, wd.request_url, wd.request_headers, wd.request_body, wd.response_status,
               wd.response_body, wd.duration_ms, wd.error_message, wd.created_at, wd.delivered_at
        FROM webhook_deliveries wd
        INNER JOIN webhook_subscriptions ws
          ON ws.id = wd.webhook_id
        WHERE wd.user_id = $1
          AND wd.webhook_id = $2
          AND ws.user_id = $1
        ORDER BY wd.created_at DESC
        LIMIT $3 OFFSET $4
      `,
      [userId, webhookId, limit, offset]
    );

    const countResult = await db.query(
      `
        SELECT COUNT(*)::integer AS total
        FROM webhook_deliveries wd
        INNER JOIN webhook_subscriptions ws
          ON ws.id = wd.webhook_id
        WHERE wd.user_id = $1
          AND wd.webhook_id = $2
          AND ws.user_id = $1
      `,
      [userId, webhookId]
    );

    return {
      rows: listResult.rows.map((row) => hydrateDeliveryRow(row)),
      total: countResult.rows[0]?.total || 0
    };
  }
}

module.exports = WebhookSubscription;
