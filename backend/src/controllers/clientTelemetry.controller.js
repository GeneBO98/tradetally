const db = require('../config/database');
const logger = require('../utils/logger');

function truncate(value, maxLength) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str.length > maxLength ? str.slice(0, maxLength) : str;
}

function sanitizeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return {};
  }

  const allowed = {};
  for (const [key, value] of Object.entries(details)) {
    if (['password', 'token', 'authorization', 'cookie'].includes(key.toLowerCase())) {
      continue;
    }
    allowed[key] = typeof value === 'string' ? truncate(value, 500) : value;
  }
  return allowed;
}

const clientTelemetryController = {
  async recordError(req, res, next) {
    try {
      const body = req.body || {};
      const context = truncate(body.context || 'client.error', 100);
      const message = truncate(body.message || 'Unknown client error', 2000);

      await db.query(
        `
          INSERT INTO client_error_events (
            user_id, context, message, stack, route, component, status_code,
            request_id, details, user_agent
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
        `,
        [
          req.user?.id || null,
          context,
          message,
          truncate(body.stack, 5000),
          truncate(body.route, 1000),
          truncate(body.component, 150),
          Number.isInteger(body.statusCode) ? body.statusCode : null,
          truncate(body.requestId, 100),
          JSON.stringify(sanitizeDetails(body.details)),
          truncate(req.get('user-agent'), 1000)
        ]
      );

      logger.warn({
        event: 'client_error',
        context,
        message,
        route: truncate(body.route, 1000),
        component: truncate(body.component, 150),
        statusCode: Number.isInteger(body.statusCode) ? body.statusCode : null,
        requestId: truncate(body.requestId, 100),
        userId: req.user?.id || null
      }, 'client-telemetry');

      res.status(202).json({ success: true });
    } catch (error) {
      logger.logError('Error recording client telemetry:', error);
      next(error);
    }
  }
};

module.exports = clientTelemetryController;
