const OperationalAlert = require('../models/OperationalAlert');
const logger = require('../utils/logger');

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_THRESHOLD = 5;

const counters = new Map();

function getWindowMs() {
  const configured = Number(process.env.HTTP_ANOMALY_WINDOW_MS || DEFAULT_WINDOW_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WINDOW_MS;
}

function getThreshold() {
  const configured = Number(process.env.HTTP_ANOMALY_THRESHOLD || DEFAULT_THRESHOLD);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_THRESHOLD;
}

function shouldRecordAlert(counter, now, threshold) {
  if (counter.count < threshold) {
    return false;
  }

  if (counter.lastAlertAt && now - counter.lastAlertAt < getWindowMs()) {
    return false;
  }

  counter.lastAlertAt = now;
  return true;
}

function incrementCounter(key, now = Date.now()) {
  const windowMs = getWindowMs();
  const current = counters.get(key);

  if (!current || now - current.startedAt > windowMs) {
    const next = { count: 1, startedAt: now, lastAlertAt: null };
    counters.set(key, next);
    return next;
  }

  current.count += 1;
  return current;
}

async function recordHttpAnomaly({ alertType, severity = 'warning', entityType = 'http', entityId, message, payload = {} }) {
  if (process.env.HTTP_ANOMALY_ALERTS_ENABLED === 'false') {
    return null;
  }

  const key = `${alertType}:${entityType}:${entityId || 'global'}`;
  const counter = incrementCounter(key);

  if (!shouldRecordAlert(counter, Date.now(), getThreshold())) {
    return null;
  }

  try {
    return await OperationalAlert.upsertActive({
      alertType,
      severity,
      entityType,
      entityId,
      message,
      payload: {
        ...payload,
        count: counter.count,
        windowMs: getWindowMs()
      }
    });
  } catch (error) {
    logger.logError(`Failed to record HTTP anomaly alert: ${error.message}`);
    return null;
  }
}

function recordCorsDenied({ origin, path, host }) {
  return recordHttpAnomaly({
    alertType: 'http_cors_denied_spike',
    severity: 'warning',
    entityType: 'origin',
    entityId: origin || 'missing-origin',
    message: `Repeated denied CORS requests from ${origin || 'missing origin'}`,
    payload: { origin, path, host }
  });
}

function recordStaticAssetFailure({ path, statusCode }) {
  return recordHttpAnomaly({
    alertType: 'http_static_asset_failure_spike',
    severity: statusCode >= 500 ? 'critical' : 'warning',
    entityType: 'static_asset',
    entityId: path,
    message: `Repeated static asset failures for ${path}`,
    payload: { path, statusCode }
  });
}

function resetHttpAnomalyCounters() {
  counters.clear();
}

module.exports = {
  recordCorsDenied,
  recordHttpAnomaly,
  recordStaticAssetFailure,
  resetHttpAnomalyCounters
};
