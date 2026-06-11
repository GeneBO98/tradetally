const backgroundWorker = require('../workers/backgroundWorker');
const jobRecoveryService = require('./jobRecoveryService');
const globalEnrichmentCacheCleanupService = require('./globalEnrichmentCacheCleanupService');
const backupScheduler = require('./backupScheduler.service');
const storageHealthService = require('./storageHealth.service');
const backupService = require('./backup.service');
const db = require('../config/database');
const { execSync } = require('child_process');

// Resolve the deployed git commit once at startup so /api/health can answer
// "is prod running the code we shipped?" — the question that took a day to
// answer during the stale-deploy incident.
let COMMIT_SHA = process.env.COMMIT_SHA || process.env.GIT_COMMIT || null;
if (!COMMIT_SHA) {
  try {
    COMMIT_SHA = execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
  } catch (_) {
    COMMIT_SHA = 'unknown';
  }
}

function isUsMarketHours(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  if (['Sat', 'Sun'].includes(get('weekday'))) return false;
  const mins = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
  return mins >= 9 * 60 + 30 && mins <= 16 * 60; // 09:30–16:00 ET
}

// Finnhub usage metrics should be written continuously while the market is
// open. Only flag staleness during market hours to avoid overnight/weekend
// false positives. This is the signal that was silently broken for 25h.
async function getFinnhubMetricsHealth() {
  try {
    const r = await db.query('SELECT MAX(minute_bucket) AS last FROM finnhub_usage_minute_metrics');
    const last = r.rows[0]?.last;
    if (!last) {
      return { available: true, lastBucketUtc: null, ageSeconds: null, stale: isUsMarketHours() };
    }
    const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / 1000));
    return {
      available: true,
      lastBucketUtc: new Date(last).toISOString(),
      ageSeconds,
      stale: isUsMarketHours() && ageSeconds > 3600
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

async function buildHealthStatus() {
  const health = {
    status: 'OK',
    commit: COMMIT_SHA,
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

  // Informational, market-aware: exposed for synthetic monitoring (gatus) and
  // the post-deploy smoke test. Does not flip overall status, so a metrics
  // hiccup doesn't mask/flap the primary health signal.
  health.services.finnhubMetrics = await getFinnhubMetricsHealth();

  return health;
}

module.exports = {
  buildHealthStatus
};
