const {
  FinnhubPriority,
  FinnhubRequestScheduler
} = require('../../src/utils/finnhubScheduler');

describe('FinnhubRequestScheduler', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('runs active quote requests before queued background split requests', async () => {
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 10,
      maxCallsPerSecond: 10,
      autoProcess: false
    });
    const order = [];

    const background = scheduler.schedule(async () => {
      order.push('background');
      return 'background';
    }, {
      endpoint: '/stock/split',
      source: 'stock_split_service',
      priority: FinnhubPriority.BACKGROUND_MAINTENANCE,
      background: true,
      maxQueueWaitMs: null
    });

    const active = scheduler.schedule(async () => {
      order.push('active');
      return 'active';
    }, {
      endpoint: '/quote',
      source: 'open_positions',
      priority: FinnhubPriority.ACTIVE_QUOTE,
      maxQueueWaitMs: null
    });

    scheduler.processQueue();

    await expect(Promise.all([background, active])).resolves.toEqual(['background', 'active']);
    expect(order).toEqual(['active', 'background']);
  });

  test('keeps equal-priority requests FIFO', async () => {
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 10,
      maxCallsPerSecond: 10,
      autoProcess: false
    });
    const order = [];

    const first = scheduler.schedule(async () => {
      order.push('first');
      return 'first';
    }, {
      endpoint: '/quote',
      source: 'test',
      priority: FinnhubPriority.ACTIVE_QUOTE,
      maxQueueWaitMs: null
    });

    const second = scheduler.schedule(async () => {
      order.push('second');
      return 'second';
    }, {
      endpoint: '/quote',
      source: 'test',
      priority: FinnhubPriority.ACTIVE_QUOTE,
      maxQueueWaitMs: null
    });

    scheduler.processQueue();

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(order).toEqual(['first', 'second']);
  });

  test('background requests cannot exhaust the active minute reserve', async () => {
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 3,
      maxCallsPerSecond: 10,
      activeReservePerMinute: 1
    });

    const results = await Promise.allSettled([
      scheduler.schedule(async () => 'one', {
        endpoint: '/stock/split',
        source: 'stock_split_service',
        priority: FinnhubPriority.BACKGROUND_MAINTENANCE,
        background: true,
        maxQueueWaitMs: 0
      }),
      scheduler.schedule(async () => 'two', {
        endpoint: '/stock/split',
        source: 'stock_split_service',
        priority: FinnhubPriority.BACKGROUND_MAINTENANCE,
        background: true,
        maxQueueWaitMs: 0
      }),
      scheduler.schedule(async () => 'three', {
        endpoint: '/stock/split',
        source: 'stock_split_service',
        priority: FinnhubPriority.BACKGROUND_MAINTENANCE,
        background: true,
        maxQueueWaitMs: 0
      })
    ]);

    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
    expect(results[2].reason.code).toBe('FINNHUB_SCHEDULER_SKIPPED');
    expect(scheduler.getStats().backgroundSkips).toBe(1);
  });

  test('active quote requests time out quickly when max queue wait is exceeded', async () => {
    jest.useFakeTimers();
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 1,
      maxCallsPerSecond: 1
    });
    scheduler.callTimestamps.push(Date.now());
    scheduler.secondTimestamps.push(Date.now());

    const queued = scheduler.schedule(async () => 'quote', {
      endpoint: '/quote',
      source: 'open_positions',
      priority: FinnhubPriority.ACTIVE_QUOTE,
      maxQueueWaitMs: 50
    });

    jest.advanceTimersByTime(51);
    await expect(queued).rejects.toMatchObject({
      code: 'FINNHUB_SCHEDULER_TIMEOUT'
    });
    expect(scheduler.getStats().activeTimeouts).toBe(1);
  });

  test('background split requests skip instead of waiting on saturation', async () => {
    jest.useFakeTimers();
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 1,
      maxCallsPerSecond: 1,
      activeReservePerMinute: 0
    });
    scheduler.callTimestamps.push(Date.now());
    scheduler.secondTimestamps.push(Date.now());

    const queued = scheduler.schedule(async () => 'split', {
      endpoint: '/stock/split',
      source: 'stock_split_service',
      priority: FinnhubPriority.BACKGROUND_MAINTENANCE,
      background: true,
      maxQueueWaitMs: 0
    });

    jest.advanceTimersByTime(1);
    await expect(queued).rejects.toMatchObject({
      code: 'FINNHUB_SCHEDULER_SKIPPED'
    });
    expect(scheduler.getStats().backgroundSkips).toBe(1);
  });
});

describe('FinnhubRequestScheduler metrics recording', () => {
  test('records successful provider requests', async () => {
    const metricsRecorder = jest.fn(async () => true);
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 10,
      maxCallsPerSecond: 10,
      metricsRecorder
    });

    await expect(scheduler.schedule(async () => 'ok', {
      endpoint: '/quote',
      source: 'open_positions',
      priority: FinnhubPriority.ACTIVE_QUOTE
    })).resolves.toBe('ok');

    await new Promise(resolve => setImmediate(resolve));
    expect(metricsRecorder).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: '/quote',
      source: 'open_positions',
      requestCount: 1,
      configuredLimitPerMinute: 10
    }));
  });

  test('records upstream 429 responses', async () => {
    const metricsRecorder = jest.fn(async () => true);
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 10,
      maxCallsPerSecond: 10,
      metricsRecorder
    });
    const error = new Error('rate limited');
    error.response = { status: 429 };

    await expect(scheduler.schedule(async () => { throw error; }, {
      endpoint: '/quote',
      source: 'open_positions',
      priority: FinnhubPriority.ACTIVE_QUOTE
    })).rejects.toBe(error);

    await new Promise(resolve => setImmediate(resolve));
    expect(metricsRecorder).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: '/quote',
      requestCount: 1,
      rateLimitedCount: 1
    }));
  });

  test('records local scheduler skips as throttles', async () => {
    jest.useFakeTimers();
    const metricsRecorder = jest.fn(async () => true);
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 1,
      maxCallsPerSecond: 1,
      activeReservePerMinute: 0,
      metricsRecorder
    });
    scheduler.callTimestamps.push(Date.now());
    scheduler.secondTimestamps.push(Date.now());

    const queued = scheduler.schedule(async () => 'split', {
      endpoint: '/stock/split',
      source: 'stock_split_service',
      priority: FinnhubPriority.BACKGROUND_MAINTENANCE,
      background: true,
      maxQueueWaitMs: 0
    });

    jest.advanceTimersByTime(1);
    await expect(queued).rejects.toMatchObject({
      code: 'FINNHUB_SCHEDULER_SKIPPED'
    });
    await Promise.resolve();

    expect(metricsRecorder).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: '/stock/split',
      requestCount: 0,
      throttledCount: 1
    }));
  });
});
