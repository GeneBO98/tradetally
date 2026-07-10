const { isV1Request, sendV1Error } = require('../utils/apiResponse');

const errorHandler = (err, req, res, next) => {
  // Skip logging for benign client disconnect errors
  // These occur when users navigate away, close browser, or network drops
  const isClientDisconnect = err.message === 'aborted' ||
                              err.code === 'ECONNRESET' ||
                              err.code === 'EPIPE' ||
                              err.code === 'ECONNABORTED';

  // Handled application errors carry an exact HTTP response (status + body).
  // They replace hand-rolled inline `res.status(n).json(body)` calls in
  // controllers; the body is emitted verbatim so the wire format is identical
  // to the original inline call. The handler that threw already logged context,
  // so skip the generic stack log to keep logging behaviour identical too.
  if (err && err.isAppError) {
    return res.status(err.statusCode).json(err.body);
  }

  if (!isClientDisconnect) {
    console.error(err.stack);
  }

  // If client disconnected, no point sending response
  if (isClientDisconnect) {
    return;
  }

  if (err.code === 'CORS_ORIGIN_DENIED') {
    if (isV1Request(req)) {
      return sendV1Error(res, 403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed');
    }
    return res.status(403).json({ error: 'Forbidden', message: 'Origin is not allowed' });
  }

  if (isV1Request(req)) {
    if (err.name === 'ValidationError') {
      return sendV1Error(res, 400, 'VALIDATION_ERROR', err.message);
    }

    if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
      return sendV1Error(res, 401, 'UNAUTHORIZED', 'Invalid token');
    }

    if (err.code === '23505') {
      return sendV1Error(res, 409, 'CONFLICT', 'Resource already exists');
    }

    if (err.code === '23503') {
      return sendV1Error(res, 400, 'BAD_REQUEST', 'Invalid reference');
    }

    return sendV1Error(
      res,
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    );
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.message
    });
  }

  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }

  if (err.code === '23505') { // PostgreSQL unique violation
    return res.status(409).json({
      error: 'Conflict',
      message: 'Resource already exists'
    });
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid reference'
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
};

module.exports = errorHandler;
