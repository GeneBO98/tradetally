const SENSITIVE_KEY_PATTERN = /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|session|signedtransactioninfo|receipt|clientsecret|webhooksecret|x-api-key|private[_-]?key)/i;

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return value;
  }

  let sanitized = value;

  sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/(Basic\s+)[A-Za-z0-9+/=]+/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/([?&](?:token|access_token|refresh_token|api[_-]?key|key|secret|password)=)[^&\s]+/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/((?:token|access_token|refresh_token|api[_-]?key|secret|password|authorization|cookie)["']?\s*[:=]\s*["']?)([^"',\s}]+)/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/(https?:\/\/)([^/\s:@]+):([^@/\s]+)@/gi, '$1[REDACTED]:[REDACTED]@');

  try {
    const parsedUrl = new URL(sanitized);
    if (parsedUrl.username || parsedUrl.password) {
      parsedUrl.username = '[REDACTED]';
      parsedUrl.password = '[REDACTED]';
      sanitized = parsedUrl.toString();
    }
  } catch (_) {
    // Not a URL-like string; nothing else to do.
  }

  return sanitized;
}

function sanitizeErrorForLogging(error) {
  if (!(error instanceof Error)) {
    return sanitizeForLogging(error);
  }

  return {
    name: error.name,
    message: sanitizeString(error.message),
    stack: sanitizeString(error.stack || '')
  };
}

function sanitizeForLogging(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return sanitizeErrorForLogging(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item, seen));
  }

  const sanitized = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    sanitized[key] = sanitizeForLogging(rawValue, seen);
  }

  return sanitized;
}

function summarizeUrlForLogging(value) {
  if (!value) {
    return 'not set';
  }

  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch (_) {
    return 'configured';
  }
}

module.exports = {
  sanitizeForLogging,
  sanitizeErrorForLogging,
  summarizeUrlForLogging
};
