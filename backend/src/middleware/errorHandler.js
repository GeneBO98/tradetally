const { isV1Request, sendV1Error } = require('../utils/apiResponse');

const errorHandler = (err, req, res, next) => {
  // Skip logging for benign client disconnect errors
  // These occur when users navigate away, close browser, or network drops
  const isClientDisconnect = err.message === 'aborted' ||
                              err.code === 'ECONNRESET' ||
                              err.code === 'EPIPE' ||
                              err.code === 'ECONNABORTED';

  if (!isClientDisconnect) {
    console.error(err.stack);
  }

  // If client disconnected, no point sending response
  if (isClientDisconnect) {
    return;
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
      details: err.message,
      requestId: req.requestId
    });
  }

  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({
      error: err.message,
      requestId: req.requestId
    });
  }

  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token',
      requestId: req.requestId
    });
  }

  if (err.code === '23505') { // PostgreSQL unique violation
    return res.status(409).json({
      error: 'Conflict',
      message: 'Resource already exists',
      requestId: req.requestId
    });
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid reference',
      requestId: req.requestId
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    requestId: req.requestId
  });
};

module.exports = errorHandler;
