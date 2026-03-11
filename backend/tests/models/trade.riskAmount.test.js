const Trade = require('../../src/models/Trade');

describe('Trade.calculateRiskAmount', () => {
  it('calculates stock risk for long trades', () => {
    expect(Trade.calculateRiskAmount(100, 95, 10, 'long')).toBe(50);
  });

  it('calculates option risk using contract size', () => {
    expect(Trade.calculateRiskAmount(2.5, 2.0, 3, 'long', 'option', 100)).toBe(150);
  });

  it('calculates futures risk using stored point value', () => {
    expect(Trade.calculateRiskAmount(6000, 5998, 2, 'long', 'future', null, 5, 'MESH6')).toBe(20);
  });

  it('falls back to futures symbol lookup when point value is missing', () => {
    expect(Trade.calculateRiskAmount(22000, 21995, 1, 'long', 'future', null, null, 'MNQH6')).toBe(10);
  });

  it('returns null when stop loss is on the wrong side of entry', () => {
    expect(Trade.calculateRiskAmount(100, 101, 10, 'long')).toBeNull();
    expect(Trade.calculateRiskAmount(100, 99, 10, 'short')).toBeNull();
  });
});
