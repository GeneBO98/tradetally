/**
 * Per-minute Finnhub usage metrics (finnhub_usage_minute_metrics).
 *
 * The request scheduler reports every request outcome here. Events are
 * aggregated in memory per (minute, endpoint, source) and written in one
 * batched upsert every FLUSH_INTERVAL_MS, instead of one INSERT per request.
 *
 * Env:
 *   FINNHUB_USAGE_METRICS_ENABLED=false          turn recording off
 *   FINNHUB_USAGE_METRICS_RETENTION_DAYS=180     prune older rows (0 keeps all)
 */

const db = require('../config/database');

const FLUSH_INTERVAL_MS = 30 * 1000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 180;
const MAX_ROWS_PER_STATEMENT = 200;
const LOG_PREFIX = '[FINNHUB-METRICS]';

const COUNTER_FIELDS = [
  ['requestCount', 'request_count'],
  ['successCount', 'success_count'],
  ['errorCount', 'error_count'],
  ['emptyCount', 'empty_count'],
  ['rateLimitedCount', 'rate_limited_count'],
  ['throttledCount', 'throttled_count'],
  ['totalThrottleWaitMs', 'total_throttle_wait_ms']
];

function nonNegativeInt(value) {
  return Math.max(0, parseInt(value, 10) || 0);
}

class FinnhubUsageMetricsService {
  static isEnabled() {
    return process.env.FINNHUB_USAGE_METRICS_ENABLED !== 'false';
  }

  static getRetentionDays() {
    const raw = process.env.FINNHUB_USAGE_METRICS_RETENTION_DAYS;
    if (raw === undefined || String(raw).trim() === '') return DEFAULT_RETENTION_DAYS;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_RETENTION_DAYS;
  }

  /**
   * Buffer one scheduler event. Kept under the original name so callers in
   * other deployments keep working; the write now happens on flush().
   */
  static recordMinuteMetric(event = {}, now = Date.now()) {
    if (!this.isEnabled()) return Promise.resolve();

    const minuteEpochSeconds = Math.floor(now / 60000) * 60;
    const endpoint = String(event.endpoint || 'unknown').slice(0, 120);
    const source = event.source ? String(event.source).slice(0, 120) : 'unknown';
    const key = `${minuteEpochSeconds}|${endpoint}|${source}`;

    let entry = this._buffer.get(key);
    if (!entry) {
      entry = {
        minuteEpochSeconds,
        endpoint,
        source,
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        emptyCount: 0,
        rateLimitedCount: 0,
        throttledCount: 0,
        totalThrottleWaitMs: 0,
        maxThrottleWaitMs: 0,
        configuredLimitPerMinute: null
      };
      this._buffer.set(key, entry);
    }

    for (const [field] of COUNTER_FIELDS) {
      entry[field] += nonNegativeInt(event[field]);
    }
    entry.maxThrottleWaitMs = Math.max(entry.maxThrottleWaitMs, nonNegativeInt(event.maxThrottleWaitMs));
    if (event.configuredLimitPerMinute !== null && event.configuredLimitPerMinute !== undefined) {
      entry.configuredLimitPerMinute = nonNegativeInt(event.configuredLimitPerMinute);
    }

    this._scheduleFlush();
    return Promise.resolve();
  }

  static _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush().catch(error => {
        console.warn(`${LOG_PREFIX} Flush failed:`, error.message);
      });
    }, FLUSH_INTERVAL_MS);
    if (typeof this._flushTimer.unref === 'function') {
      this._flushTimer.unref();
    }
  }

  static async flush() {
    if (this._buffer.size === 0) return 0;

    const entries = [...this._buffer.values()];
    this._buffer.clear();

    for (let start = 0; start < entries.length; start += MAX_ROWS_PER_STATEMENT) {
      const chunk = entries.slice(start, start + MAX_ROWS_PER_STATEMENT);
      const params = [];
      const rows = chunk.map(entry => {
        const values = [
          entry.minuteEpochSeconds,
          entry.endpoint,
          entry.source,
          ...COUNTER_FIELDS.map(([field]) => entry[field]),
          entry.maxThrottleWaitMs,
          entry.configuredLimitPerMinute
        ];
        const base = params.length;
        params.push(...values);
        const placeholders = values.map((_, index) => `$${base + index + 1}`);
        placeholders[0] = `DATE_TRUNC('minute', TO_TIMESTAMP(${placeholders[0]}::double precision))`;
        return `(${placeholders.join(', ')})`;
      });

      const counterColumns = COUNTER_FIELDS.map(([, column]) => column);
      const counterUpdates = counterColumns
        .map(column => `${column} = finnhub_usage_minute_metrics.${column} + EXCLUDED.${column}`)
        .join(',\n          ');

      try {
        await db.query(`
          INSERT INTO finnhub_usage_minute_metrics (
            minute_bucket, endpoint, source,
            ${counterColumns.join(', ')},
            max_throttle_wait_ms, configured_limit_per_minute
          )
          VALUES ${rows.join(',\n')}
          ON CONFLICT (minute_bucket, endpoint, source)
          DO UPDATE SET
            ${counterUpdates},
            max_throttle_wait_ms = GREATEST(finnhub_usage_minute_metrics.max_throttle_wait_ms, EXCLUDED.max_throttle_wait_ms),
            configured_limit_per_minute = COALESCE(EXCLUDED.configured_limit_per_minute, finnhub_usage_minute_metrics.configured_limit_per_minute),
            updated_at = NOW()
        `, params);
      } catch (error) {
        // Metrics are best effort; dropping a batch beats growing the buffer
        // without bound while the database is unavailable.
        console.warn(`${LOG_PREFIX} Dropped ${chunk.length} metric row(s):`, error.message);
      }
    }

    await this._pruneIfDue();
    return entries.length;
  }

  static async _pruneIfDue() {
    const retentionDays = this.getRetentionDays();
    if (retentionDays <= 0) return;
    const now = Date.now();
    if (now - this._lastPruneAt < PRUNE_INTERVAL_MS) return;
    this._lastPruneAt = now;

    try {
      await db.query(
        `DELETE FROM finnhub_usage_minute_metrics
          WHERE minute_bucket < NOW() - make_interval(days => $1::int)`,
        [retentionDays]
      );
    } catch (error) {
      console.warn(`${LOG_PREFIX} Retention prune failed:`, error.message);
    }
  }

  static _resetForTests() {
    this._buffer.clear();
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = null;
    this._lastPruneAt = 0;
  }
}

FinnhubUsageMetricsService._buffer = new Map();
FinnhubUsageMetricsService._flushTimer = null;
FinnhubUsageMetricsService._lastPruneAt = 0;

module.exports = FinnhubUsageMetricsService;
