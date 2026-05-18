const db = require('../config/database');

function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventType: row.event_type,
    severity: row.severity,
    origin: row.origin,
    path: row.path,
    host: row.host,
    statusCode: row.status_code,
    directive: row.directive,
    blockedUri: row.blocked_uri,
    documentUri: row.document_uri,
    userAgent: row.user_agent,
    requestId: row.request_id,
    payload: row.payload || {},
    createdAt: row.created_at
  };
}

class HttpSecurityEvent {
  static async record({
    eventType,
    severity = 'warning',
    origin = null,
    path = null,
    host = null,
    statusCode = null,
    directive = null,
    blockedUri = null,
    documentUri = null,
    userAgent = null,
    requestId = null,
    payload = {}
  }) {
    const result = await db.query(
      `
        INSERT INTO http_security_events (
          event_type, severity, origin, path, host, status_code,
          directive, blocked_uri, document_uri, user_agent, request_id, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
        RETURNING *
      `,
      [
        eventType,
        severity,
        origin,
        path,
        host,
        statusCode,
        directive,
        blockedUri,
        documentUri,
        userAgent,
        requestId,
        JSON.stringify(payload || {})
      ]
    );
    return toCamel(result.rows[0]);
  }

  static async list({ eventType, severity, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const values = [];

    if (eventType) {
      values.push(eventType);
      conditions.push(`event_type = $${values.length}`);
    }

    if (severity) {
      values.push(severity);
      conditions.push(`severity = $${values.length}`);
    }

    values.push(Math.min(parseInt(limit, 10) || 50, 200));
    const limitParam = values.length;
    values.push(parseInt(offset, 10) || 0);
    const offsetParam = values.length;

    const result = await db.query(
      `
        SELECT *
        FROM http_security_events
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT $${limitParam}
        OFFSET $${offsetParam}
      `,
      values
    );
    return result.rows.map(toCamel);
  }
}

module.exports = HttpSecurityEvent;
