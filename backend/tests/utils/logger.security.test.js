const logger = require('../../src/utils/logger');

describe('logger path hardening', () => {
  test('rejects path traversal attempts when reading logs', () => {
    expect(() => logger.readLogFile('../../../.env')).toThrow(expect.objectContaining({
      code: 'INVALID_LOG_FILENAME'
    }));
  });

  test('filters import logs for user-facing log listings', () => {
    const result = logger.getLogFiles(true, 1, 20, { allowedPrefixes: ['import'] });

    expect(result.files.every(file => file.name.startsWith('import_'))).toBe(true);
  });
});
