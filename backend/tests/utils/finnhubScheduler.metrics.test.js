const {
  FinnhubPriority,
  FinnhubRequestScheduler,
  isEmptyProviderPayload
} = require('../../src/utils/finnhubScheduler');

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

function makeScheduler(metricsRecorder) {
  return new FinnhubRequestScheduler({
    maxCallsPerMinute: 100,
    maxCallsPerSecond: 100,
    metricsRecorder
  });
}

describe('FinnhubRequestScheduler outcome metrics', () => {
  test('classifies empty provider payloads', () => {
    expect(isEmptyProviderPayload([])).toBe(true);
    expect(isEmptyProviderPayload({})).toBe(true);
    expect(isEmptyProviderPayload(null)).toBe(true);
    expect(isEmptyProviderPayload({ s: 'no_data' })).toBe(true);
    expect(isEmptyProviderPayload({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 })).toBe(true);
    expect(isEmptyProviderPayload({ c: 101, pc: 100, t: 1710000000 })).toBe(false);
    expect(isEmptyProviderPayload([{ headline: 'x' }])).toBe(false);
    expect(isEmptyProviderPayload({ name: 'Apple' })).toBe(false);
  });

  test('records success, empty and error outcomes per endpoint and source', async () => {
    const events = [];
    const scheduler = makeScheduler(event => events.push(event));
    const context = { endpoint: '/quote', source: 'price_monitoring', priority: FinnhubPriority.ACTIVE_QUOTE };

    await scheduler.schedule(async () => ({ c: 10, pc: 9, t: 1 }), context);
    await scheduler.schedule(async () => ({}), context);
    await expect(scheduler.schedule(async () => {
      throw Object.assign(new Error('boom'), { response: { status: 500 } });
    }, context)).rejects.toThrow('boom');
    await flushPromises();

    expect(events.map(({ requestCount, successCount, emptyCount, errorCount, rateLimitedCount }) => ({
      requestCount, successCount, emptyCount, errorCount, rateLimitedCount
    }))).toEqual([
      { requestCount: 1, successCount: 1, emptyCount: 0, errorCount: undefined, rateLimitedCount: undefined },
      { requestCount: 1, successCount: 0, emptyCount: 1, errorCount: undefined, rateLimitedCount: undefined },
      { requestCount: 1, successCount: undefined, emptyCount: undefined, errorCount: 1, rateLimitedCount: 0 }
    ]);
    expect(events[0]).toEqual(expect.objectContaining({ endpoint: '/quote', source: 'price_monitoring' }));
  });

  test('counts upstream 429s as rate limited, not as errors', async () => {
    const events = [];
    const scheduler = makeScheduler(event => events.push(event));

    await expect(scheduler.schedule(async () => {
      throw Object.assign(new Error('429'), { response: { status: 429, headers: {} } });
    }, { endpoint: '/company-news', source: 'company_news' })).rejects.toThrow('429');
    await flushPromises();

    expect(events[0]).toEqual(expect.objectContaining({ requestCount: 1, rateLimitedCount: 1, errorCount: 0 }));
  });

  test('records local throttling when a background job times out in the queue', async () => {
    const events = [];
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 10,
      maxCallsPerSecond: 10,
      autoProcess: false,
      metricsRecorder: event => events.push(event)
    });

    await expect(scheduler.schedule(async () => 'never', {
      endpoint: '/stock/split',
      source: 'stock_split_service',
      priority: FinnhubPriority.BACKGROUND_MAINTENANCE,
      background: true,
      maxQueueWaitMs: 0
    })).rejects.toMatchObject({ code: 'FINNHUB_SCHEDULER_SKIPPED' });
    await flushPromises();

    expect(events[0]).toEqual(expect.objectContaining({ requestCount: 0, throttledCount: 1 }));
  });

  test('a failing recorder never breaks the request', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scheduler = makeScheduler(() => { throw new Error('db down'); });

    await expect(scheduler.schedule(async () => 'ok', { endpoint: '/quote' })).resolves.toBe('ok');
    await flushPromises();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
