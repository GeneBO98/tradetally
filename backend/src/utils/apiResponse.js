const crypto = require('crypto');

function isV1Request(req) {
  const candidates = [req.originalUrl, req.baseUrl, req.path, req.url];
  return candidates.some((value) => typeof value === 'string' && value.startsWith('/api/v1'));
}

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString('hex');
}

function getRequestId(req) {
  return req.requestId || req.headers['x-request-id'] || null;
}

function sendV1Error(res, status, code, message, details) {
  const payload = {
    error: {
      code,
      message
    },
    requestId: getRequestId(res.req)
  };

  if (details !== undefined) {
    payload.error.details = details;
  }

  return res.status(status).json(payload);
}

function sendV1Paginated(res, data, pagination, status = 200, extra = {}) {
  return res.status(status).json({
    ...extra,
    data,
    pagination
  });
}

function sendV1NotImplemented(res, message = 'This endpoint is not implemented') {
  return sendV1Error(res, 501, 'NOT_IMPLEMENTED', message);
}

function mapLegacyErrorCode(status, legacyBody = {}) {
  if (legacyBody.code) {
    return legacyBody.code;
  }

  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'UNPROCESSABLE_ENTITY';
  if (status === 429) return 'RATE_LIMITED';

  return 'INTERNAL_ERROR';
}

function sendV1ErrorFromLegacy(res, legacyResult, fallbackMessage = 'Request failed') {
  const status = legacyResult.statusCode || 500;
  const body = legacyResult.body || {};
  const message = body.message || body.error || fallbackMessage;
  const details = body.details || body.fields;

  return sendV1Error(
    res,
    status,
    mapLegacyErrorCode(status, body),
    message,
    details
  );
}

module.exports = {
  createRequestId,
  getRequestId,
  isV1Request,
  sendV1Error,
  sendV1ErrorFromLegacy,
  sendV1NotImplemented,
  sendV1Paginated
};
