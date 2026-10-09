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
      activeReservePerMinute: 1,
      safetyFactor: 1
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

  test('applies a safety factor below the configured provider limit', () => {
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 150,
      maxCallsPerSecond: 30
    });

    expect(scheduler.maxCallsPerMinute).toBe(135);
    expect(scheduler.maxCallsPerSecond).toBe(27);
    expect(scheduler.configuredCallsPerMinute).toBe(150);
    expect(scheduler.configuredCallsPerSecond).toBe(30);
  });

  test('background requests without explicit maxQueueWaitMs queue instead of skipping', async () => {
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 10,
      maxCallsPerSecond: 10,
      autoProcess: false
    });

    const queued = scheduler.schedule(async () => 'enrichment', {
      endpoint: '/stock/metric',
      source: 'basic_financials',
      priority: FinnhubPriority.BACKGROUND_ENRICHMENT,
      background: true
    });

    // Not rejected while waiting for capacity
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(scheduler.queue.length).toBe(1);

    scheduler.processQueue();
    await expect(queued).resolves.toBe('enrichment');
    expect(scheduler.getStats().backgroundSkips).toBe(0);
  });

  test('pauses all sends after an upstream 429', async () => {
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 10,
      maxCallsPerSecond: 10
    });
    const error = new Error('rate limited');
    error.response = { status: 429, headers: {} };

    await expect(scheduler.schedule(async () => { throw error; }, {
      endpoint: '/quote',
      source: 'quote',
      priority: FinnhubPriority.ACTIVE_QUOTE
    })).rejects.toBe(error);

    expect(scheduler.cooldownUntil).toBeGreaterThan(Date.now());
    expect(scheduler.hasCapacity({ background: false })).toBe(false);
  });

  test('honors Retry-After when entering cooldown', async () => {
    const scheduler = new FinnhubRequestScheduler({
      maxCallsPerMinute: 10,
      maxCallsPerSecond: 10
    });
    const error = new Error('rate limited');
    error.response = { status: 429, headers: { 'retry-after': '30' } };

    await expect(scheduler.schedule(async () => { throw error; }, {
      endpoint: '/quote',
      source: 'quote',
      priority: FinnhubPriority.ACTIVE_QUOTE
    })).rejects.toBe(error);

    const remaining = scheduler.cooldownUntil - Date.now();
    expect(remaining).toBeGreaterThan(25000);
    expect(remaining).toBeLessThanOrEqual(30000);
  });
});
