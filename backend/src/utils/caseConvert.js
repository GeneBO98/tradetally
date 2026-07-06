// Shared snake_case/camelCase conversion helpers.
//
// All helpers are intentionally SHALLOW: only top-level keys are converted.
// Values (including nested objects, arrays, Dates, and JSONB payloads) are
// passed through untouched. This matches the behavior of the previous local
// copies in settings.controller.js, v1/settings.controller.js,
// v1/user.controller.js, and backup.service.js.

// Convert a snake_case string to camelCase (e.g. 'entry_price' -> 'entryPrice')
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert a camelCase string to snake_case (e.g. 'entryPrice' -> 'entry_price')
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Convert all top-level keys of an object from snake_case to camelCase.
// Falsy inputs (null/undefined) are returned as-is, so callers that need a
// guaranteed object should pass `obj || {}`.
function keysToCamelCase(obj) {
  if (!obj) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toCamelCase(key)] = value;
  }
  return result;
}

// Convert all top-level keys of an object from camelCase to snake_case.
// Falsy inputs (null/undefined) are returned as-is.
function keysToSnakeCase(obj) {
  if (!obj) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] = value;
  }
  return result;
}

module.exports = {
  toCamelCase,
  toSnakeCase,
  keysToCamelCase,
  keysToSnakeCase
};
