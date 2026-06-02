jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../src/services/backup.service', () => ({
  getBackupHealth: jest.fn()
}));
jest.mock('../src/services/storageHealth.service', () => ({
  getHealth: jest.fn()
}));
jest.mock('../src/workers/backgroundWorker', () => ({
  getStatus: jest.fn()
}));
jest.mock('../src/services/jobRecoveryService', () => ({
  getStatus: jest.fn(),
  stop: jest.fn()
}));
jest.mock('../src/services/globalEnrichmentCacheCleanupService', () => ({
  getStatus: jest.fn(),
  stop: jest.fn()
}));
jest.mock('../src/services/backupScheduler.service', () => ({
  getStatus: jest.fn(),
  stopAll: jest.fn()
}));
jest.mock('../src/services/priceMonitoringService', () => ({
  stop: jest.fn()
}));
jest.mock('../src/services/optionsScheduler', () => ({
  stop: jest.fn()
}));
jest.mock('../src/services/brokerSync/brokerSyncScheduler', () => ({
  stop: jest.fn()
}));
jest.mock('../src/services/newsScheduler', () => ({
  stop: jest.fn()
}));
jest.mock('../src/services/earningsScheduler', () => ({
  stop: jest.fn()
}));
jest.mock('../src/services/symbolCategoryScheduler', () => ({
  stop: jest.fn()
}));
jest.mock('../src/services/gamificationScheduler', () => ({
  stopScheduler: jest.fn()
}));
jest.mock('../src/services/trialScheduler', () => ({
  stopScheduler: jest.fn()
}));
jest.mock('../src/services/retentionEmailScheduler', () => ({
  stopScheduler: jest.fn()
}));
jest.mock('../src/services/webhookEventBridge', () => ({
  stop: jest.fn()
}));
jest.mock('../src/services/stockScannerScheduler', () => ({
  stop: jest.fn()
}));
jest.mock('../src/services/watchlistPillarsScheduler', () => ({
  stop: jest.fn()
}));
jest.mock('../src/posthog-telemetry', () => ({
  initializePostHogTelemetry: jest.fn(),
  shutdown: jest.fn()
}));

const db = require('../src/config/database');
const backupService = require('../src/services/backup.service');
const storageHealthService = require('../src/services/storageHealth.service');
const backgroundWorker = require('../src/workers/backgroundWorker');
const jobRecoveryService = require('../src/services/jobRecoveryService');
const enrichmentCacheCleanupService = require('../src/services/globalEnrichmentCacheCleanupService');
const backupScheduler = require('../src/services/backupScheduler.service');
const { buildHealthStatus } = require('../src/services/healthStatus.service');

describe('server health status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    backgroundWorker.getStatus.mockReturnValue({ isRunning: true, queueProcessing: true });
    jobRecoveryService.getStatus.mockReturnValue({ isRunning: true });
    enrichmentCacheCleanupService.getStatus.mockReturnValue({ isRunning: true });
    backupScheduler.getStatus.mockReturnValue({ isRunning: true, enabled: true });
  });

  test('includes backup and storage sections and degrades status when either is not OK', async () => {
    backupService.getBackupHealth.mockResolvedValue({
      status: 'DEGRADED',
      warnings: ['Backups are disabled in backup settings.']
    });
    storageHealthService.getHealth.mockResolvedValue({
      status: 'DEGRADED',
      warnings: ['Images are stored on the application host.']
    });

    const health = await buildHealthStatus();

    expect(health.status).toBe('DEGRADED');
    expect(health.services.backups).toEqual({
      status: 'DEGRADED',
      warnings: ['Backups are disabled in backup settings.']
    });
    expect(health.services.storage).toEqual({
      status: 'DEGRADED',
      warnings: ['Images are stored on the application host.']
    });
  });
});
