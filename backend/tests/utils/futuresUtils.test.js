const {
  resolveFuturesRoot,
  isKnownFuturesRoot,
  getFuturesPointValue,
  getFuturesTickSize,
  extractUnderlyingFromFuturesSymbol
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
  it('returns known point values without guessing unknowns', () => {
    expect(getFuturesPointValue('MNQ')).toBe(2);
    expect(getFuturesPointValue('ES')).toBe(50);
    expect(getFuturesPointValue('UNKNOWN')).toBeNull();
    expect(getFuturesPointValue(null)).toBeNull();
    expect(getFuturesPointValue('')).toBeNull();
  });

  test.each([
    ['MBT', 0.1, 5], ['MET', 0.1, 0.5], ['BTC', 5, 5], ['ETH', 50, 0.5],
    ['NNQ', 0.2, 0.5], ['NES', 0.5, 0.5], ['N2K', 0.5, 0.2], ['NDOW', 0.05, 2],
    ['VX', 1000, 0.05], ['VXM', 100, 0.05], ['PA', 100, 0.5], ['PL', 50, 0.1],
    ['MHG', 2500, 0.0005], ['ZC', 50, 0.25], ['ZL', 600, 0.01], ['HE', 400, 0.025],
    ['6E', 125000, 0.00005], ['M6E', 12500, 0.0001], ['1OZ', 1, 0.25],
    ['ENQ', 20, 0.25], ['EP', 50, 0.25], ['SIL', 1000, 0.01]
  ])('%s uses exchange quote units', (root, pointValue, tickSize) => {
    expect(getFuturesPointValue(root)).toBe(pointValue);
    expect(getFuturesTickSize(root)).toBe(tickSize);
  });

  test.each([
    ['6EZ6', '6E'], ['NDOWZ26', 'NDOW'], ['CME:MBTZ2026', 'MBT'],
    ['CME_MINI:NNQ1!', 'NNQ'], ['MES 09-26', 'MES'], ['MGC SEP26', 'MGC'], ['1OZZ6', '1OZ']
  ])('resolves %s without confusing contract and root', (symbol, root) => {
    expect(extractUnderlyingFromFuturesSymbol(symbol)).toBe(root);
    expect(resolveFuturesRoot(symbol)).toBe(root);
  });

  test.each([['ENQU26', 'NQ'], ['EPU26', 'ES']])('resolves broker alias %s', (symbol, root) => {
    expect(resolveFuturesRoot(symbol)).toBe(root);
    expect(getFuturesPointValue(extractUnderlyingFromFuturesSymbol(symbol))).toBe(getFuturesPointValue(root));
  });
});
