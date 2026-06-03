const db = require('../config/database');

class FinnhubUsageMetricsService {
  static async recordMinuteMetric(event = {}) {
    const endpoint = String(event.endpoint || 'unknown').slice(0, 120);
    const source = event.source ? String(event.source).slice(0, 120) : 'unknown';
    const requestCount = Math.max(0, parseInt(event.requestCount, 10) || 0);
    const rateLimitedCount = Math.max(0, parseInt(event.rateLimitedCount, 10) || 0);
    const throttledCount = Math.max(0, parseInt(event.throttledCount, 10) || 0);
    const totalThrottleWaitMs = Math.max(0, parseInt(event.totalThrottleWaitMs, 10) || 0);
    const maxThrottleWaitMs = Math.max(0, parseInt(event.maxThrottleWaitMs, 10) || 0);
    const configuredLimitPerMinute = event.configuredLimitPerMinute === null || event.configuredLimitPerMinute === undefined
      ? null
      : Math.max(0, parseInt(event.configuredLimitPerMinute, 10) || 0);

    await db.query(`
      INSERT INTO finnhub_usage_minute_metrics (
        minute_bucket,
        endpoint,
        source,
        request_count,
        rate_limited_count,
        throttled_count,
        total_throttle_wait_ms,
        max_throttle_wait_ms,
        configured_limit_per_minute
      )
      VALUES (
        DATE_TRUNC('minute', NOW()),
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8
      )
      ON CONFLICT (minute_bucket, endpoint, source)
      DO UPDATE SET
        request_count = finnhub_usage_minute_metrics.request_count + EXCLUDED.request_count,
        rate_limited_count = finnhub_usage_minute_metrics.rate_limited_count + EXCLUDED.rate_limited_count,
        throttled_count = finnhub_usage_minute_metrics.throttled_count + EXCLUDED.throttled_count,
        total_throttle_wait_ms = finnhub_usage_minute_metrics.total_throttle_wait_ms + EXCLUDED.total_throttle_wait_ms,
        max_throttle_wait_ms = GREATEST(finnhub_usage_minute_metrics.max_throttle_wait_ms, EXCLUDED.max_throttle_wait_ms),
        configured_limit_per_minute = COALESCE(EXCLUDED.configured_limit_per_minute, finnhub_usage_minute_metrics.configured_limit_per_minute),
        updated_at = NOW()
    `, [
      endpoint,
      source,
      requestCount,
      rateLimitedCount,
      throttledCount,
      totalThrottleWaitMs,
      maxThrottleWaitMs,
      configuredLimitPerMinute
    ]);
  }
}

module.exports = FinnhubUsageMetricsService;
