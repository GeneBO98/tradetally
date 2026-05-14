const backgroundWorker = require('../workers/backgroundWorker');
const jobRecoveryService = require('./jobRecoveryService');
const globalEnrichmentCacheCleanupService = require('./globalEnrichmentCacheCleanupService');
const backupScheduler = require('./backupScheduler.service');
const storageHealthService = require('./storageHealth.service');
const backupService = require('./backup.service');
const db = require('../config/database');

async function buildHealthStatus() {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: 'OK',
      backgroundWorker: backgroundWorker.getStatus(),
      jobRecovery: jobRecoveryService.getStatus(),
      enrichmentCacheCleanup: globalEnrichmentCacheCleanupService.getStatus(),
      backupScheduler: backupScheduler.getStatus(),
      backups: { status: 'UNKNOWN' },
      storage: { status: 'UNKNOWN' }
    }
  };

  try {
    await db.query('SELECT 1');
  } catch (error) {
    health.services.database = 'ERROR';
    health.status = 'DEGRADED';
  }

  if (!health.services.backgroundWorker.isRunning || !health.services.backgroundWorker.queueProcessing) {
    health.status = 'DEGRADED';
    health.services.backgroundWorker.status = 'ERROR';
  } else {
    health.services.backgroundWorker.status = 'OK';
  }

  if (!health.services.jobRecovery.isRunning) {
    health.status = 'DEGRADED';
    health.services.jobRecovery.status = 'ERROR';
  } else {
    health.services.jobRecovery.status = 'OK';
  }

  try {
    health.services.backups = await backupService.getBackupHealth();
    if (health.services.backups.status !== 'OK') {
      health.status = 'DEGRADED';
    }
  } catch (error) {
    health.services.backups = {
      status: 'ERROR',
      error: error.message
    };
    health.status = 'DEGRADED';
  }

  try {
    health.services.storage = await storageHealthService.getHealth();
    if (health.services.storage.status !== 'OK') {
      health.status = 'DEGRADED';
    }
  } catch (error) {
    health.services.storage = {
      status: 'ERROR',
      error: error.message
    };
    health.status = 'DEGRADED';
  }

  return health;
}

module.exports = {
  buildHealthStatus
};
