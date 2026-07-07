/**
 * AppError - an application error that carries an EXACT HTTP response.
 *
 * It exists so that route handlers can stop calling `res.status(n).json(body)`
 * inline and instead `throw new AppError(n, body)`. The central error handler
 * (middleware/errorHandler.js) recognises `isAppError` and responds with the
 * carried status code and body verbatim, producing a byte-identical response
 * to the original inline call while routing all error emission through one place.
 *
 *   throw new AppError(500, { success: false, message: 'Failed to fetch tags' });
 *   // errorHandler emits: res.status(500).json({ success: false, message: 'Failed to fetch tags' })
 *
 * @param {number} statusCode - HTTP status code to send.
 * @param {object|string} body - Exact JSON body to send (usually an object).
 */
class AppError extends Error {
  constructor(statusCode, body) {
    const message = body && typeof body === 'object'
      ? (body.message || body.error || body.error_description || 'Application error')
      : String(body);
    super(message);
    this.name = 'AppError';
    this.isAppError = true;
    this.statusCode = statusCode;
    this.body = body;
  }
}

module.exports = AppError;
