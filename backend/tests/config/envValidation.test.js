const { hasStrongSecret, validateProductionSecrets } = require('../../src/config/envValidation');

describe('envValidation', () => {
  test('accepts non-production environments without requiring production secrets', () => {
    expect(validateProductionSecrets({ NODE_ENV: 'development' })).toEqual([]);
  });

  test('rejects weak production secrets', () => {
    expect(() => validateProductionSecrets({
      NODE_ENV: 'production',
      JWT_SECRET: 'short',
      ENABLE_BROKER_SYNC_SCHEDULER: 'false'
    })).toThrow(/JWT_SECRET/);
  });

  test('requires broker encryption key when broker sync is enabled in production', () => {
    expect(() => validateProductionSecrets({
      NODE_ENV: 'production',
      JWT_SECRET: 'j'.repeat(32),
      ENABLE_BROKER_SYNC_SCHEDULER: 'true'
    })).toThrow(/BROKER_ENCRYPTION_KEY/);
  });

  test('accepts strong configured production secrets', () => {
    expect(validateProductionSecrets({
      NODE_ENV: 'production',
      JWT_SECRET: 'j'.repeat(32),
      API_KEY_LOOKUP_SECRET: 'a'.repeat(32),
      BROKER_ENCRYPTION_KEY: 'b'.repeat(32),
      REPORT_LINK_SECRET: 'r'.repeat(32)
    })).toEqual([]);
    expect(hasStrongSecret('x'.repeat(32))).toBe(true);
  });

  test('requires REDIS_URL when production opts into Redis-backed coordination', () => {
    expect(() => validateProductionSecrets({
      NODE_ENV: 'production',
      JWT_SECRET: 'j'.repeat(32),
      ENABLE_BROKER_SYNC_SCHEDULER: 'false',
      API_KEY_RATE_LIMIT_STORE: 'redis',
      SSE_REDIS_FANOUT_ENABLED: 'true'
    })).toThrow(/REDIS_URL/);
  });
});
