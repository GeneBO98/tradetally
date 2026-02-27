const crypto = require('crypto');
const db = require('../config/database');
const { sendV1Error } = require('../utils/apiResponse');

function stableStringify(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashRequestBody(body) {
  const normalized = stableStringify(body || {});
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function resolveRouteKey(req, explicitRouteKey) {
  if (explicitRouteKey) {
    return explicitRouteKey;
  }

  const routePath = req.route?.path || req.path || req.originalUrl;
  return `${req.baseUrl || ''}${routePath}`;
}

function normalizeResponseBody(body) {
  if (body === undefined) {
    return null;
  }

  if (body === null) {
    return null;
  }

  if (Buffer.isBuffer(body)) {
    return { value: body.toString('utf8') };
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      return { value: body };
    }
  }

  if (typeof body === 'object') {
    return body;
  }

  return { value: body };
}

function idempotencyMiddleware(options = {}) {
  const envTtlHours = parseInt(process.env.IDEMPOTENCY_TTL_HOURS || '24', 10);
  const ttlHours = Number.isFinite(options.ttlHours) && options.ttlHours > 0
    ? options.ttlHours
    : Number.isFinite(envTtlHours) && envTtlHours > 0
      ? envTtlHours
      : 24;
  const ttlMilliseconds = Math.max(ttlHours, 1) * 60 * 60 * 1000;

  return async (req, res, next) => {
    const keyHeader = req.headers['idempotency-key'];
    if (!keyHeader) {
      return next();
    }

    const idempotencyKey = String(keyHeader).trim();
    if (!idempotencyKey) {
      return sendV1Error(res, 400, 'BAD_REQUEST', 'Idempotency-Key header cannot be empty');
    }

    if (!req.user?.id) {
      return sendV1Error(res, 401, 'UNAUTHORIZED', 'Authentication required before idempotency checks');
    }

    const method = req.method.toUpperCase();
    const routeKey = resolveRouteKey(req, options.routeKey);
    const requestHash = hashRequestBody(req.body || {});
    const expiresAt = new Date(Date.now() + ttlMilliseconds);
    const userId = req.user.id;

    try {
      await db.query(
        `
          DELETE FROM idempotency_keys
          WHERE user_id = $1
            AND idempotency_key = $2
            AND method = $3
            AND route_key = $4
            AND expires_at <= NOW()
        `,
        [userId, idempotencyKey, method, routeKey]
      );

      const reservation = await db.query(
        `
          INSERT INTO idempotency_keys (
            user_id,
            idempotency_key,
            method,
            route_key,
            request_hash,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (user_id, idempotency_key, method, route_key) DO NOTHING
          RETURNING id
        `,
        [userId, idempotencyKey, method, routeKey, requestHash, expiresAt]
      );

      if (reservation.rows.length === 0) {
        const existingResult = await db.query(
          `
            SELECT id, request_hash, response_status, response_body
            FROM idempotency_keys
            WHERE user_id = $1
              AND idempotency_key = $2
              AND method = $3
              AND route_key = $4
            LIMIT 1
          `,
          [userId, idempotencyKey, method, routeKey]
        );

        const existing = existingResult.rows[0];
        if (!existing) {
          return sendV1Error(res, 409, 'IDEMPOTENCY_COLLISION', 'Unable to reserve idempotency key');
        }

        if (existing.request_hash !== requestHash) {
          return sendV1Error(
            res,
            409,
            'IDEMPOTENCY_KEY_REUSED',
            'Idempotency-Key was already used with a different request payload'
          );
        }

        if (existing.response_status !== null) {
          try {
            await db.query(
              `
                UPDATE idempotency_keys
                SET last_replayed_at = NOW()
                WHERE id = $1
              `,
              [existing.id]
            );
          } catch (error) {
            console.error('Failed to update idempotency replay timestamp:', error.message);
          }

          res.setHeader('X-Idempotency-Replayed', 'true');
          if (existing.response_body === null) {
            return res.status(existing.response_status).send();
          }
          return res.status(existing.response_status).json(existing.response_body);
        }

        return sendV1Error(
          res,
          409,
          'IDEMPOTENCY_IN_PROGRESS',
          'A request with this Idempotency-Key is already being processed'
        );
      }

      const reservationId = reservation.rows[0].id;
      let statusCode = 200;
      let persisted = false;

      const originalStatus = res.status.bind(res);
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const persistResponse = async (body) => {
        if (persisted) {
          return;
        }
        persisted = true;

        const normalizedBody = normalizeResponseBody(body);
        await db.query(
          `
            UPDATE idempotency_keys
            SET response_status = $1,
                response_body = $2::jsonb
            WHERE id = $3
          `,
          [statusCode, JSON.stringify(normalizedBody), reservationId]
        );
      };

      res.status = (code) => {
        statusCode = code;
        return originalStatus(code);
      };

      res.json = (body) => {
        persistResponse(body).catch((error) => {
          console.error('Failed to persist idempotent response:', error.message);
        });
        return originalJson(body);
      };

      res.send = (body) => {
        persistResponse(body).catch((error) => {
          console.error('Failed to persist idempotent response:', error.message);
        });
        return originalSend(body);
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  idempotencyMiddleware
};
