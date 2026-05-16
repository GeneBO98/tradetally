const { swaggerSpec } = require('../src/config/swagger');

describe('legacy OpenAPI contract', () => {
  test('documents execution run lifecycle and event endpoints', () => {
    expect(swaggerSpec.paths['/api/execution-runs'].get).toBeDefined();
    expect(swaggerSpec.paths['/api/execution-runs'].post).toBeDefined();
    expect(swaggerSpec.paths['/api/execution-runs/{id}'].get).toBeDefined();
    expect(swaggerSpec.paths['/api/execution-runs/{id}'].patch).toBeDefined();
    expect(swaggerSpec.paths['/api/execution-runs/{id}/events'].get).toBeDefined();
    expect(swaggerSpec.paths['/api/execution-runs/{id}/events'].post).toBeDefined();
    expect(swaggerSpec.components.schemas.ExecutionRun).toBeDefined();
    expect(swaggerSpec.components.schemas.ExecutionRunEvent).toBeDefined();
  });
});
