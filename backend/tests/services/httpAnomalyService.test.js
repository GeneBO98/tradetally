jest.mock('../../src/models/OperationalAlert', () => ({
  upsertActive: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  logError: jest.fn()
}));

const OperationalAlert = require('../../src/models/OperationalAlert');
const {
  recordCorsDenied,
  recordStaticAssetFailure,
  resetHttpAnomalyCounters
} = require('../../src/services/httpAnomalyService');

describe('httpAnomalyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHttpAnomalyCounters();
    process.env.HTTP_ANOMALY_THRESHOLD = '2';
    process.env.HTTP_ANOMALY_WINDOW_MS = '60000';
    delete process.env.HTTP_ANOMALY_ALERTS_ENABLED;
  });

  afterEach(() => {
    delete process.env.HTTP_ANOMALY_THRESHOLD;
    delete process.env.HTTP_ANOMALY_WINDOW_MS;
    delete process.env.HTTP_ANOMALY_ALERTS_ENABLED;
  });

  test('emits an operational alert after repeated denied CORS requests', async () => {
    await recordCorsDenied({ origin: 'https://evil.example', path: '/api/health', host: 'localhost:3001' });
    expect(OperationalAlert.upsertActive).not.toHaveBeenCalled();

    await recordCorsDenied({ origin: 'https://evil.example', path: '/api/health', host: 'localhost:3001' });

    expect(OperationalAlert.upsertActive).toHaveBeenCalledWith(expect.objectContaining({
      alertType: 'http_cors_denied_spike',
      severity: 'warning',
      entityType: 'origin',
      entityId: 'https://evil.example',
      payload: expect.objectContaining({
        count: 2,
        origin: 'https://evil.example'
      })
    }));
  });

  test('emits a critical alert for repeated static asset 5xx failures', async () => {
    await recordStaticAssetFailure({ path: '/assets/app.js', statusCode: 500 });
    await recordStaticAssetFailure({ path: '/assets/app.js', statusCode: 500 });

    expect(OperationalAlert.upsertActive).toHaveBeenCalledWith(expect.objectContaining({
      alertType: 'http_static_asset_failure_spike',
      severity: 'critical',
      entityType: 'static_asset',
      entityId: '/assets/app.js'
    }));
  });

  test('can be disabled by environment for self-hosted instances', async () => {
    process.env.HTTP_ANOMALY_ALERTS_ENABLED = 'false';

    await recordCorsDenied({ origin: 'https://evil.example', path: '/api/health', host: 'localhost:3001' });
    await recordCorsDenied({ origin: 'https://evil.example', path: '/api/health', host: 'localhost:3001' });

    expect(OperationalAlert.upsertActive).not.toHaveBeenCalled();
  });
});
