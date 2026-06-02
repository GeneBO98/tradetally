const { buildSwaggerSpec } = require('../src/config/swagger');

describe('swagger api docs configuration', () => {
  test('uses explicit server URL when provided', () => {
    const spec = buildSwaggerSpec('https://api.example.com');

    expect(spec.servers).toEqual([
      {
        url: 'https://api.example.com',
        description: 'API server'
      }
    ]);
  });

  test('falls back to configured API_BASE_URL when server URL is omitted', () => {
    const originalApiBaseUrl = process.env.API_BASE_URL;
    process.env.API_BASE_URL = 'https://configured.example.com';

    const spec = buildSwaggerSpec();

    expect(spec.servers).toEqual([
      {
        url: 'https://configured.example.com',
        description: 'API server'
      }
    ]);

    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
  });
});
