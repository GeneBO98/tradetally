const { computePerformanceScore, MIN_TRADES } = require('../../src/utils/performanceScore');

const days = (pnls) => pnls.map((daily_pnl, i) => ({ trade_date: `2026-01-${String(i + 1).padStart(2, '0')}`, daily_pnl }));

function summary(overrides = {}) {
  return {
    winningTrades: 30,
    losingTrades: 20,
    breakevenTrades: 0,
    avgWin: 200,
    avgLoss: -100,
    totalNetPnL: 4000,
    profitFactor: 3,
    sharpeRatio: 0.3,
    maxDrawdown: -800,
    ...overrides
  };
}

describe('computePerformanceScore', () => {
  it('withholds a score until there are enough closed trades', () => {
    const result = computePerformanceScore({
      summary: summary({ winningTrades: 6, losingTrades: 4 }),
      dailyPnL: days([10, 20, -5, 30, 15])
    });

    expect(result.ready).toBe(false);
    expect(result.score).toBeNull();
    expect(result.tradesCounted).toBe(10);
    expect(result.minTrades).toBe(MIN_TRADES);
    expect(result.factors).toEqual([]);
  });

  it('scores a profitable, controlled record highly and reports all six factors', () => {
    const result = computePerformanceScore({
      summary: summary(),
      dailyPnL: days([100, 200, -50, 300, 150, 80, -20, 120, 90, 60])
    });

    expect(result.ready).toBe(true);
    expect(result.factors.map(f => f.key)).toEqual([
      'profitFactor', 'expectancy', 'drawdown', 'consistency', 'winRate', 'riskAdjusted'
    ]);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.band).toBe('strong');
    // 60% winners at 2:1 -> 0.6 * 2 - 0.4 = 0.8 average losses per trade.
    expect(result.factors.find(f => f.key === 'expectancy').value).toBeCloseTo(0.8);
    expect(result.factors.find(f => f.key === 'drawdown').value).toBe(5);
    expect(result.factors.find(f => f.key === 'consistency').value).toBe(80);
  });

  it('scores a losing record low', () => {
    const result = computePerformanceScore({
      summary: summary({
        winningTrades: 15,
        losingTrades: 35,
        avgWin: 80,
        avgLoss: -100,
        totalNetPnL: -2300,
        profitFactor: 0.34,
        sharpeRatio: -0.3,
        maxDrawdown: -2600
      }),
      dailyPnL: days([-100, -200, 50, -300, -150, -80, 20, -120])
    });

    expect(result.ready).toBe(true);
    expect(result.score).toBeLessThan(35);
    expect(result.band).toBe('weak');
  });

  it('leaves consistency out and rescales the weights when there are too few trading days', () => {
    const result = computePerformanceScore({ summary: summary(), dailyPnL: days([500, 400]) });

    expect(result.factors.map(f => f.key)).not.toContain('consistency');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('handles a record with no losing trades and no drawdown without emitting non-JSON values', () => {
    const result = computePerformanceScore({
      summary: summary({
        winningTrades: 25,
        losingTrades: 0,
        avgLoss: 0,
        profitFactor: 999.99,
        maxDrawdown: 0
      }),
      dailyPnL: days([10, 20, 30, 40, 50])
    });

    expect(result.ready).toBe(true);
    expect(result.factors.find(f => f.key === 'expectancy')).toMatchObject({ value: null, score: 100 });
    expect(result.factors.find(f => f.key === 'drawdown')).toMatchObject({ value: null, score: 100 });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('gives no drawdown credit to a record that lost money', () => {
    const result = computePerformanceScore({
      summary: summary({ totalNetPnL: -500, maxDrawdown: -1000 }),
      dailyPnL: []
    });

    expect(result.factors.find(f => f.key === 'drawdown').score).toBe(0);
  });

  it('counts breakeven trades toward the minimum but not toward win rate', () => {
    const result = computePerformanceScore({
      summary: summary({ winningTrades: 10, losingTrades: 5, breakevenTrades: 5 }),
      dailyPnL: []
    });

    expect(result.ready).toBe(true);
    expect(result.tradesCounted).toBe(20);
    expect(result.factors.find(f => f.key === 'winRate').value).toBeCloseTo(66.67);
  });

  it('tolerates a missing or empty payload', () => {
    expect(computePerformanceScore(undefined).ready).toBe(false);
    expect(computePerformanceScore({}).ready).toBe(false);
  });
});
