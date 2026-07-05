const {
  resolveFuturesRoot,
  isKnownFuturesRoot,
  getFuturesPointValue
} = require('../../src/utils/futuresUtils');

describe('resolveFuturesRoot', () => {
  it('accepts known bare roots', () => {
    expect(resolveFuturesRoot('MNQ')).toBe('MNQ');
    expect(resolveFuturesRoot('es')).toBe('ES');
    expect(resolveFuturesRoot('CL')).toBe('CL');
  });

  it('normalizes contract symbols to their root', () => {
    expect(resolveFuturesRoot('MNQM6')).toBe('MNQ');
    expect(resolveFuturesRoot('ESU25')).toBe('ES');
    expect(resolveFuturesRoot('M2KM6')).toBe('M2K');
  });

  it('rejects unknown symbols', () => {
    expect(resolveFuturesRoot('AAPL')).toBeNull();
    expect(resolveFuturesRoot('ZZTX5')).toBeNull(); // contract format, unknown root
    expect(resolveFuturesRoot('')).toBeNull();
    expect(resolveFuturesRoot(null)).toBeNull();
  });
});

describe('isKnownFuturesRoot', () => {
  it('matches the point-value table exactly', () => {
    expect(isKnownFuturesRoot('ES')).toBe(true);
    expect(isKnownFuturesRoot('mnq')).toBe(true);
    expect(isKnownFuturesRoot('SPY')).toBe(false);
    expect(isKnownFuturesRoot(null)).toBe(false);
  });
});

describe('getFuturesPointValue', () => {
  it('returns known point values and the default for unknowns', () => {
    expect(getFuturesPointValue('MNQ')).toBe(2);
    expect(getFuturesPointValue('ES')).toBe(50);
    expect(getFuturesPointValue('UNKNOWN')).toBe(50);
  });
});
