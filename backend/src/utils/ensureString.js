// Safely coerce a value to a string.
// Protects against Express query/body parameters being arrays or objects
// when an attacker sends ?param[]=value or crafted JSON bodies.
// Returns defaultValue (empty string by default) if the input is not a string.
function ensureString(value, defaultValue = '') {
  if (typeof value === 'string') return value;
  if (value == null) return defaultValue;
  return defaultValue;
}

module.exports = ensureString;
