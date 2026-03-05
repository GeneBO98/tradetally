const {
  buildV1OpenApiSpec,
  getDocumentationMetadata,
  getPublicCapabilities,
  getPublicEndpoints
} = require('../src/config/openapi/v1');

function flattenEndpoints(map) {
  return Object.values(map).flatMap((group) => Object.values(group));
}

describe('v1 public OpenAPI contract', () => {
  test('discovery/spec endpoints are internally consistent', () => {
    const spec = buildV1OpenApiSpec('https://api.example.com');
    const docs = getDocumentationMetadata('https://api.example.com');
    const endpoints = getPublicEndpoints('/api/v1');

    expect(spec.paths[endpoints.server.capabilities]).toBeDefined();
    expect(spec.paths[endpoints.server.endpoints]).toBeDefined();
    expect(spec.paths[endpoints.server.features]).toBeDefined();
    expect(spec.paths[endpoints.server.version]).toBeDefined();
    expect(spec.paths[endpoints.server.health]).toBeDefined();

    expect(docs.documentation.base_url).toBe('/api/v1');
    expect(docs.documentation.compatibility.supported_public_contract).toBe('/api/v1');
    expect(docs.documentation.compatibility.legacy_routes).toEqual(['/api', '/api/v2']);
    expect(docs.documentation.total_paths).toBe(Object.keys(spec.paths).length);
    expect(docs.documentation.authentication.api_keys).toBe(true);
    expect(docs.documentation.authentication.supported).toContain('X-API-Key');
    expect(docs.documentation.headers.idempotency_key).toBe('Idempotency-Key');
    expect(spec.components.securitySchemes.apiKeyAuth).toBeDefined();
  });

  test('all publicly listed endpoints are present in spec paths', () => {
    const spec = buildV1OpenApiSpec('https://api.example.com');
    const endpoints = getPublicEndpoints('/api/v1');
    const flattened = flattenEndpoints(endpoints);

    flattened.forEach((endpoint) => {
      expect(spec.paths[endpoint]).toBeDefined();
    });

    expect(spec.paths['/api/v1/users/sync-info'].post).toBeUndefined();
  });

  test('unsupported analytics/sync placeholder endpoints are not published', () => {
    const spec = buildV1OpenApiSpec('https://api.example.com');
    const pathKeys = Object.keys(spec.paths);

    expect(pathKeys).not.toContain('/api/v1/analytics/profit-loss');
    expect(pathKeys).not.toContain('/api/v1/analytics/win-rate');
    expect(pathKeys).not.toContain('/api/v1/analytics/monthly-summary');
    expect(pathKeys).not.toContain('/api/v1/analytics/daily');
    expect(pathKeys).not.toContain('/api/v1/analytics/weekly');
    expect(pathKeys).not.toContain('/api/v1/analytics/monthly');
    expect(pathKeys).not.toContain('/api/v1/analytics/yearly');
    expect(pathKeys).not.toContain('/api/v1/analytics/risk-metrics');
    expect(pathKeys).not.toContain('/api/v1/analytics/trade-distribution');
    expect(pathKeys).not.toContain('/api/v1/sync/full');
    expect(pathKeys).not.toContain('/api/v1/sync/changes/push');
    expect(pathKeys).not.toContain('/api/v1/sync/changes/pull');
    expect(pathKeys).not.toContain('/api/v1/sync/queue');
    expect(pathKeys).not.toContain('/api/v1/sync/optimize');
    expect(pathKeys).not.toContain('/api/v1/settings/data');
    expect(pathKeys).not.toContain('/api/v1/settings/reset');
    expect(pathKeys).not.toContain('/api/v1/trades/sync');
  });

  test('trade create endpoints document idempotency and conflict responses', () => {
    const spec = buildV1OpenApiSpec('https://api.example.com');

    const createTrade = spec.paths['/api/v1/trades'].post;
    const bulkCreateTrades = spec.paths['/api/v1/trades/bulk'].post;

    expect(createTrade.parameters.some((parameter) => parameter.$ref === '#/components/parameters/IdempotencyKeyHeader')).toBe(true);
    expect(createTrade.responses[409]).toBeDefined();

    expect(bulkCreateTrades.parameters.some((parameter) => parameter.$ref === '#/components/parameters/IdempotencyKeyHeader')).toBe(true);
    expect(bulkCreateTrades.responses[409]).toBeDefined();
  });

  test('capabilities reflect supported surface', () => {
    const capabilities = getPublicCapabilities();

    // Verify supported features are present
    expect(capabilities.data.trade_crud).toBe(true);
    expect(capabilities.data.bulk_operations).toBe(true);
    expect(capabilities.authentication.api_keys).toBe(true);
    expect(capabilities.platform.request_ids).toBe(true);
    expect(capabilities.platform.rate_limiting).toBe(true);

    // Verify unsupported features are not advertised
    expect(capabilities.data.sync).toBeUndefined();
    expect(capabilities.data.offline_support).toBeUndefined();
    expect(capabilities.data.conflict_resolution).toBeUndefined();
    expect(capabilities.data.real_time).toBeUndefined();
    expect(capabilities.platform.websockets).toBeUndefined();
  });
});
