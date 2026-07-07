/**
 * Wraps an async Express route handler so that any rejected promise or thrown
 * error is forwarded to the central error handler via next(err), instead of
 * becoming an unhandled rejection.
 *
 * Usage:
 *   const getThing = asyncHandler(async (req, res) => { ... });
 *
 * Errors thrown inside the handler (including AppError instances that carry an
 * exact response body) reach middleware/errorHandler.js unchanged.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
