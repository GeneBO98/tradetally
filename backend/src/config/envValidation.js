const PLACEHOLDER_PATTERNS = [
  /^change[-_]?me$/i,
  /^your[-_]/i,
  /^your.*secret/i,
  /example/i,
  /placeholder/i
];

function hasStrongSecret(value, minLength = 32) {
  return typeof value === 'string' && value.length >= minLength;
}

function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER_PATTERNS.some(pattern => pattern.test(value));
}

function validateProductionSecrets(env = process.env) {
  if (env.NODE_ENV !== 'production') {
    return [];
  }

  const errors = [];

  if (!hasStrongSecret(env.JWT_SECRET, 32) || isPlaceholder(env.JWT_SECRET)) {
    errors.push('JWT_SECRET must be a non-placeholder secret at least 32 characters long');
  }

  if (env.API_KEY_LOOKUP_SECRET && !hasStrongSecret(env.API_KEY_LOOKUP_SECRET, 32)) {
    errors.push('API_KEY_LOOKUP_SECRET must be at least 32 characters long when configured');
  }

  if (env.ENABLE_BROKER_SYNC_SCHEDULER !== 'false' && !hasStrongSecret(env.BROKER_ENCRYPTION_KEY, 32)) {
    errors.push('BROKER_ENCRYPTION_KEY must be at least 32 characters long when broker sync is enabled');
  }

  if (env.REPORT_LINK_SECRET && !hasStrongSecret(env.REPORT_LINK_SECRET, 32)) {
    errors.push('REPORT_LINK_SECRET must be at least 32 characters long when configured');
  }

  if (errors.length > 0) {
    throw new Error(`Production configuration is unsafe: ${errors.join('; ')}`);
  }

  return [];
}

module.exports = {
  hasStrongSecret,
  validateProductionSecrets
};
