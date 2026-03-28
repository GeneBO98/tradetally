const {
  sanitizeForLogging,
  sanitizeErrorForLogging,
  summarizeUrlForLogging
} = require('../../src/utils/logSanitizer');

describe('logSanitizer', () => {
  test('redacts nested sensitive object fields', () => {
    const sanitized = sanitizeForLogging({
      apiKey: 'secret-key',
      nested: {
        password: 'hunter2',
        token: 'abc123'
      },
      safe: 'value'
    });

    expect(sanitized).toEqual({
      apiKey: '[REDACTED]',
      nested: {
        password: '[REDACTED]',
        token: '[REDACTED]'
      },
      safe: 'value'
    });
  });

  test('redacts bearer tokens and URL credentials in strings', () => {
    const sanitized = sanitizeForLogging('Authorization: Bearer abc.def.ghi https://user:pass@example.com/path?token=abc');
    expect(sanitized).toContain('Authorization: [REDACTED] [REDACTED]');
    expect(sanitized).toContain('https://[REDACTED]:[REDACTED]@example.com/path?token=[REDACTED]');
  });

  test('sanitizes error objects', () => {
    const sanitized = sanitizeErrorForLogging(new Error('Bearer abc.def.ghi failed'));
    expect(sanitized.message).toBe('Bearer [REDACTED] failed');
    expect(sanitized.name).toBe('Error');
  });

  test('summarizes URLs without credentials or paths', () => {
    expect(summarizeUrlForLogging('https://user:pass@example.com:8080/private/path')).toBe('https://example.com:8080');
    expect(summarizeUrlForLogging('')).toBe('not set');
  });
});
