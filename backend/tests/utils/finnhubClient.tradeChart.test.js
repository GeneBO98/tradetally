jest.mock('../../src/utils/cache', () => ({
  get: jest.fn(async () => null),
  set: jest.fn(async () => true)
}));

const finnhubClient = require('../../src/utils/finnhubClient');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function captureWindow() {
  return jest.spyOn(finnhubClient, 'getStockCandles').mockResolvedValue([]);
}

function windowOf(spy) {
  const [, resolution, from, to] = spy.mock.calls[0];
  return { resolution, from, to, spanDays: (to - from) / 86400 };
}

describe('Finnhub trade chart windows', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('intraday', () => {
    test('a same-day trade keeps the single-session frame', async () => {
      const spy = captureWindow();

      await finnhubClient.getTradeChartData(
        'AAPL', '2026-03-02T14:30:00.000Z', '2026-03-02T18:00:00.000Z', null, '1'
      );

      const { from, to } = windowOf(spy);
      // 04:00 to 20:00 ET on the trade day: sixteen hours.
      expect((to - from) / 3600).toBe(16);
      expect(new Date(from * 1000).toISOString()).toBe('2026-03-02T09:00:00.000Z');
      expect(new Date(to * 1000).toISOString()).toBe('2026-03-03T01:00:00.000Z');
    });

    test('a multi-session trade runs through to its exit day', async () => {
      const spy = captureWindow();

      await finnhubClient.getTradeChartData(
        'AAPL', '2026-03-02T14:30:00.000Z', '2026-03-05T18:00:00.000Z', null, '1'
      );

      const { to } = windowOf(spy);
      // Extended to 20:00 ET on the exit day rather than stopping on entry day.
      expect(new Date(to * 1000).toISOString()).toBe('2026-03-06T01:00:00.000Z');
    });

    test('a long hold is capped at thirty days', async () => {
      const spy = captureWindow();

      await finnhubClient.getTradeChartData(
        'AAPL', '2026-01-05T14:30:00.000Z', '2026-06-05T18:00:00.000Z', null, '1'
      );

      const { from, to } = windowOf(spy);
      expect((to - from) * 1000).toBeLessThanOrEqual(30 * ONE_DAY_MS);
    });

    test('an open trade still charts its entry session', async () => {
      const spy = captureWindow();

      await finnhubClient.getTradeChartData('AAPL', '2026-03-02T14:30:00.000Z', null, null, '1');

      const { from, to } = windowOf(spy);
      expect(to).toBeGreaterThan(from);
      expect((to - from) * 1000).toBeLessThanOrEqual(30 * ONE_DAY_MS);
    });
  });

  describe('daily window settings', () => {
    async function dailySpan(lookback, lookahead) {
      if (lookback === undefined) delete process.env.CHART_DAILY_LOOKBACK_DAYS;
      else process.env.CHART_DAILY_LOOKBACK_DAYS = lookback;
      if (lookahead === undefined) delete process.env.CHART_DAILY_LOOKAHEAD_DAYS;
      else process.env.CHART_DAILY_LOOKAHEAD_DAYS = lookahead;

      const spy = captureWindow();
      await finnhubClient.getTradeChartData(
        'AAPL', '2026-03-02T14:30:00.000Z', '2026-03-02T18:00:00.000Z', null, 'D'
      );

      const entry = Date.parse('2026-03-02T14:30:00.000Z') / 1000;
      const { from, to } = windowOf(spy);
      return {
        lookbackDays: Math.round((entry - from) / 86400),
        lookaheadDays: Math.round((to - entry) / 86400)
      };
    }

    test('defaults to thirty days back and ten forward', async () => {
      expect(await dailySpan(undefined, undefined)).toEqual({ lookbackDays: 30, lookaheadDays: 10 });
    });

    test('honours a valid override', async () => {
      expect(await dailySpan('120', '45')).toEqual({ lookbackDays: 120, lookaheadDays: 45 });
    });

    test.each([
      ['a negative value', '-5'],
      ['zero', '0'],
      ['a non-numeric value', 'thirty'],
      ['a trailing-garbage value', '30days'],
      ['Infinity', 'Infinity'],
      ['a fractional value', '10.5'],
      ['an empty value', '']
    ])('falls back to the default for %s', async (_label, value) => {
      expect(await dailySpan(value, value)).toEqual({ lookbackDays: 30, lookaheadDays: 10 });
    });

    test('falls back to the default for an excessive value', async () => {
      expect(await dailySpan('100000', '100000')).toEqual({ lookbackDays: 30, lookaheadDays: 10 });
    });

    test('accepts the upper bound itself', async () => {
      expect(await dailySpan('1825', '1825')).toEqual({ lookbackDays: 1825, lookaheadDays: 1825 });
    });

    test('never produces a reversed window', async () => {
      for (const value of ['-5', 'Infinity', '100000', '0']) {
        process.env.CHART_DAILY_LOOKBACK_DAYS = value;
        process.env.CHART_DAILY_LOOKAHEAD_DAYS = value;

        const spy = captureWindow();
        await finnhubClient.getTradeChartData(
          'AAPL', '2026-03-02T14:30:00.000Z', '2026-03-02T18:00:00.000Z', null, 'D'
        );

        const { from, to } = windowOf(spy);
        expect(Number.isFinite(from)).toBe(true);
        expect(Number.isFinite(to)).toBe(true);
        expect(to).toBeGreaterThan(from);
        spy.mockRestore();
      }
    });
  });
});
