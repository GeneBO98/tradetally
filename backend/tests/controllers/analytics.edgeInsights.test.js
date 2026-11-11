jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const analyticsController = require('../../src/controllers/analytics.controller');

const overall = (overrides = {}) => ({ n: 20, wins: 10, pnl: 500, avg_win: 100, avg_loss: 100, ...overrides });

describe('analyticsController.buildEdgeInsights', () => {
  test('returns nothing without trades', () => {
    expect(analyticsController.buildEdgeInsights(null)).toEqual([]);
    expect(analyticsController.buildEdgeInsights({ windowDays: 30, overall: overall({ n: 0 }), groups: [] })).toEqual([]);
  });

  test('offers the top two winners and the worst leak with stable keys', () => {
    const insights = analyticsController.buildEdgeInsights({
      windowDays: 30,
      overall: overall(),
      groups: [
        { kind: 'strategy', label: 'Scalper', n: 12, wins: 8, pnl: 900 },
        { kind: 'symbol', label: 'AAPL', n: 5, wins: 3, pnl: 200 },
        { kind: 'symbol', label: 'TSLA', n: 4, wins: 1, pnl: -350 }
      ]
    });
    expect(insights.map(i => i.key)).toEqual([
      'edge:best:strategy:scalper',
      'edge:best:symbol:aapl',
      'edge:leak:symbol:tsla'
    ]);
    expect(insights[0].headline).toBe('Your Scalper setup is working');
    expect(insights[0].body).toContain('in the last 30 days');
    expect(insights[1].priority).toBeLessThan(insights[0].priority);
  });

  test('flags a recent win-rate drop against the full range', () => {
    const insights = analyticsController.buildEdgeInsights({
      windowDays: 30,
      overall: overall({ n: 10, wins: 3 }),
      groups: [],
      baseline: { n: 100, wins: 55 }
    });
    const shift = insights.find(i => i.key === 'edge:winrate-shift:down');
    expect(shift.headline).toBe('Win rate down to 30% in the last 30 days');
  });

  test('ignores win-rate shift when the window is the whole range', () => {
    const insights = analyticsController.buildEdgeInsights({
      windowDays: null,
      overall: overall({ n: 10, wins: 3 }),
      groups: [],
      baseline: { n: 100, wins: 55 }
    });
    expect(insights.some(i => i.key.startsWith('edge:winrate-shift'))).toBe(false);
  });

  test('calls out losses larger than wins', () => {
    const insights = analyticsController.buildEdgeInsights({
      windowDays: 90,
      overall: overall({ avg_win: 50, avg_loss: 120 }),
      groups: []
    });
    expect(insights.map(i => i.key)).toEqual(['edge:payoff:weak']);
  });
});

describe('analyticsController.buildPositionInsights', () => {
  const NOW = Date.parse('2026-11-11T15:00:00Z');
  const pos = (symbol, overrides = {}) => ({
    symbol,
    opened_at: new Date(NOW - 60 * 60 * 1000).toISOString(),
    legs: 1,
    legs_without_stop: 0,
    exposure: 1000,
    ...overrides
  });

  test('flags a day-trade carried overnight', () => {
    const insights = analyticsController.buildPositionInsights({
      positions: [pos('NVDA', { opened_at: new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString() })],
      medianHoldHours: 0.5,
      now: NOW
    });
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ type: 'position', key: 'position:aging:nvda', headline: 'NVDA has been open 3 days' });
    expect(insights[0].body).toContain('30 minutes');
  });

  test('flags open positions with no stop', () => {
    const insights = analyticsController.buildPositionInsights({
      positions: [pos('MSFT', { legs_without_stop: 1 }), pos('AMD', { legs_without_stop: 1 }), pos('SPY')],
      now: NOW
    });
    const noStop = insights.find(i => i.key === 'position:nostop');
    expect(noStop.key).toBe('position:nostop');
    expect(noStop.body).toContain('AMD, MSFT');
    expect(noStop.headline).toBe('2 open positions have no stop recorded');
  });

  test('flags exposure concentrated in one symbol', () => {
    const insights = analyticsController.buildPositionInsights({
      positions: [pos('TSLA', { exposure: 8000 }), pos('AAPL'), pos('SPY')],
      now: NOW
    });
    expect(insights.map(i => i.key)).toEqual(['position:concentration:tsla']);
    expect(insights[0].headline).toBe('TSLA is 80% of your open exposure');
  });
});
