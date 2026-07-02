jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const {
  normalizeSessionFills,
  computeSessionStats
} = require('../../src/services/backtestService');

const SESSION = { from_ts: 1_000_000, to_ts: 1_060_000 };

function fill(time, price, quantity, action) {
  return { time, price, quantity, action };
}

describe('normalizeSessionFills', () => {
  it('sorts fills chronologically and normalizes numeric fields', () => {
    const fills = normalizeSessionFills(
      [
        fill(1_000_200, '10.50', '100', 'sell'),
        fill(1_000_100, 10, 100, 'buy')
      ],
      SESSION
    );
    expect(fills.map((f) => f.action)).toEqual(['buy', 'sell']);
    expect(fills[0]).toEqual({ time: 1_000_100, price: 10, quantity: 100, action: 'buy' });
    expect(fills[1].price).toBe(10.5);
  });

  it('rejects empty fill lists', () => {
    expect(() => normalizeSessionFills([], SESSION)).toThrow('at least one fill');
  });

  it('rejects fills outside the session window', () => {
    expect(() => normalizeSessionFills([fill(999_999, 10, 100, 'buy')], SESSION))
      .toThrow('inside the session window');
    expect(() => normalizeSessionFills([fill(1_060_001, 10, 100, 'buy')], SESSION))
      .toThrow('inside the session window');
  });

  it('rejects invalid prices, quantities, and actions', () => {
    expect(() => normalizeSessionFills([fill(1_000_100, 0, 100, 'buy')], SESSION))
      .toThrow('positive numbers');
    expect(() => normalizeSessionFills([fill(1_000_100, 10, -5, 'buy')], SESSION))
      .toThrow('positive numbers');
    expect(() => normalizeSessionFills([fill(1_000_100, 10, 100, 'hold')], SESSION))
      .toThrow('"buy" or "sell"');
  });
});

describe('computeSessionStats', () => {
  it('scores a winning long round trip', () => {
    const stats = computeSessionStats([
      fill(1, 10, 100, 'buy'),
      fill(2, 11, 100, 'sell')
    ]);
    expect(stats.position).toBe(0);
    expect(stats.total_pnl).toBeCloseTo(100);
    expect(stats.round_trips).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
  });

  it('scores a winning short round trip', () => {
    const stats = computeSessionStats([
      fill(1, 20, 50, 'sell'),
      fill(2, 18, 50, 'buy')
    ]);
    expect(stats.position).toBe(0);
    expect(stats.total_pnl).toBeCloseTo(100);
    expect(stats.wins).toBe(1);
  });

  it('handles scaling in with average-cost accounting', () => {
    const stats = computeSessionStats([
      fill(1, 10, 100, 'buy'),
      fill(2, 12, 100, 'buy'), // avg cost 11
      fill(3, 11, 200, 'sell')
    ]);
    expect(stats.position).toBe(0);
    expect(stats.total_pnl).toBeCloseTo(0);
    expect(stats.round_trips).toBe(1);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(0);
  });

  it('handles partial exits within one round trip', () => {
    const stats = computeSessionStats([
      fill(1, 10, 200, 'buy'),
      fill(2, 11, 100, 'sell'),
      fill(3, 9, 100, 'sell')
    ]);
    expect(stats.position).toBe(0);
    expect(stats.total_pnl).toBeCloseTo(0);
    expect(stats.round_trips).toBe(1);
  });

  it('splits a flip through zero into two round trips', () => {
    const stats = computeSessionStats([
      fill(1, 10, 100, 'buy'),
      fill(2, 11, 200, 'sell'), // closes long +100, opens short 100 @ 11
      fill(3, 12, 100, 'buy') // closes short -100
    ]);
    expect(stats.position).toBe(0);
    expect(stats.total_pnl).toBeCloseTo(0);
    expect(stats.round_trips).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
  });

  it('reports a non-zero position when the session is not flat', () => {
    const stats = computeSessionStats([fill(1, 10, 100, 'buy')]);
    expect(stats.position).toBe(100);
    expect(stats.round_trips).toBe(0);
  });
});
