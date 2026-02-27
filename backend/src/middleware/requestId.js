const { createRequestId } = require('../utils/apiResponse');

function requestIdMiddleware(req, res, next) {
  req.requestId = req.headers['x-request-id'] || createRequestId();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = requestIdMiddleware;
