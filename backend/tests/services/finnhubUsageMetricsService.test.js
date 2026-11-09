jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] })
}));

const db = require('../../src/config/database');
const FinnhubUsageMetricsService = require('../../src/services/finnhubUsageMetricsService');

describe('FinnhubUsageMetricsService', () => {
  const originalEnabled = process.env.FINNHUB_USAGE_METRICS_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    FinnhubUsageMetricsService._resetForTests();
    delete process.env.FINNHUB_USAGE_METRICS_ENABLED;
  });

  afterAll(() => {
    FinnhubUsageMetricsService._resetForTests();
    if (originalEnabled === undefined) delete process.env.FINNHUB_USAGE_METRICS_ENABLED;
    else process.env.FINNHUB_USAGE_METRICS_ENABLED = originalEnabled;
  });

  test('aggregates events per minute, endpoint and source into one batched upsert', async () => {
    const minute = Date.UTC(2026, 10, 9, 15, 0, 5);
    FinnhubUsageMetricsService.recordMinuteMetric({ endpoint: '/quote', source: 'price_monitoring', requestCount: 1, successCount: 1, maxThrottleWaitMs: 20, configuredLimitPerMinute: 121 }, minute);
    FinnhubUsageMetricsService.recordMinuteMetric({ endpoint: '/quote', source: 'price_monitoring', requestCount: 1, emptyCount: 1, maxThrottleWaitMs: 50 }, minute + 1000);
    FinnhubUsageMetricsService.recordMinuteMetric({ endpoint: '/company-news', source: 'company_news', requestCount: 1, errorCount: 1 }, minute + 2000);

    const flushed = await FinnhubUsageMetricsService.flush();

    expect(flushed).toBe(2);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (minute_bucket, endpoint, source)');
    expect(sql).toContain('success_count = finnhub_usage_minute_metrics.success_count + EXCLUDED.success_count');
    // minute, endpoint, source, request, success, error, empty, 429, throttled, total wait, max wait, limit
    expect(params.slice(0, 12)).toEqual([
      minute / 1000 - 5, '/quote', 'price_monitoring', 2, 1, 0, 1, 0, 0, 0, 50, 121
    ]);
    expect(params.slice(12, 24)).toEqual([
      minute / 1000 - 5, '/company-news', 'company_news', 1, 0, 1, 0, 0, 0, 0, 0, null
    ]);
  });

  test('prunes rows past retention at most once per interval', async () => {
    FinnhubUsageMetricsService.recordMinuteMetric({ endpoint: '/quote', requestCount: 1 });
    await FinnhubUsageMetricsService.flush();
    FinnhubUsageMetricsService.recordMinuteMetric({ endpoint: '/quote', requestCount: 1 });
    await FinnhubUsageMetricsService.flush();

    const prunes = db.query.mock.calls.filter(([sql]) => sql.includes('DELETE FROM finnhub_usage_minute_metrics'));
    expect(prunes).toHaveLength(1);
    expect(prunes[0][1]).toEqual([180]);
  });

  test('drops a batch rather than throwing when the database write fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    db.query.mockRejectedValueOnce(new Error('relation does not exist'));
    FinnhubUsageMetricsService.recordMinuteMetric({ endpoint: '/quote', requestCount: 1 });

    await expect(FinnhubUsageMetricsService.flush()).resolves.toBe(1);
    expect(FinnhubUsageMetricsService._buffer.size).toBe(0);
    warn.mockRestore();
  });

  test('records nothing when disabled', async () => {
    process.env.FINNHUB_USAGE_METRICS_ENABLED = 'false';
    FinnhubUsageMetricsService.recordMinuteMetric({ endpoint: '/quote', requestCount: 1 });

    expect(await FinnhubUsageMetricsService.flush()).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });
});
