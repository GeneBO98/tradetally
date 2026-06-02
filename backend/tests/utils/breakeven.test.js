const {
  breakevenPredicate,
  normalizeConfig,
  normalizeTolerance,
  toleranceCacheKey
} = require('../../src/utils/breakeven');

const COLS = {
  gross: '(pnl + COALESCE(commission, 0) + COALESCE(fees, 0))',
  tickSize: 'tick_size',
  pointValue: 'point_value',
  quantity: 'quantity',
  underlying: 'underlying_asset'
};

describe('breakeven.normalizeTolerance', () => {
  test('coerces numbers and rejects junk', () => {
    expect(normalizeTolerance(2)).toBe(2);
    expect(normalizeTolerance('2.5')).toBe(2.5);
    expect(normalizeTolerance(0)).toBe(0);
    expect(normalizeTolerance(-1)).toBe(0);
    expect(normalizeTolerance(null)).toBe(0);
    expect(normalizeTolerance('abc')).toBe(0);
    expect(normalizeTolerance(Infinity)).toBe(0);
  });
});

describe('breakeven.normalizeConfig', () => {
  test('accepts a scalar as the default', () => {
    expect(normalizeConfig(3)).toEqual({ default: 3, byUnderlying: {} });
  });

  test('accepts object form and sanitizes the map', () => {
    expect(normalizeConfig({ default: 2, byUnderlying: { es: 2, NQ: 5 } }))
      .toEqual({ default: 2, byUnderlying: { ES: 2, NQ: 5 } });
  });

  test('keeps explicit 0 overrides but drops invalid keys/values', () => {
    const cfg = normalizeConfig({
      default: 'x; DROP TABLE users;--',
      byUnderlying: { "ES'; DROP": 2, NQ: 'bad', M2K: 3, ZB: 0, '': 1 }
    });
    expect(cfg.default).toBe(0);              // junk default -> 0
    expect(cfg.byUnderlying).toEqual({ M2K: 3, ZB: 0 }); // injection + NaN + empty dropped, 0 kept
  });

  test('parses a JSON string map', () => {
    expect(normalizeConfig({ default: 1, byUnderlying: '{"ES":2}' }))
      .toEqual({ default: 1, byUnderlying: { ES: 2 } });
  });
});

describe('breakeven.breakevenPredicate', () => {
  test('default 0 with no overrides yields the exact (simple) form', () => {
    const be = breakevenPredicate(COLS, { default: 0, byUnderlying: {} });
    expect(be.is).toBe(`${COLS.gross} = 0`);
    expect(be.isNot).toBe(`${COLS.gross} <> 0`);
  });

  test('all-zero map + zero default still yields the simple form', () => {
    const be = breakevenPredicate(COLS, { default: 0, byUnderlying: { ES: 0 } });
    expect(be.is).toBe(`${COLS.gross} = 0`);
  });

  test('scalar tolerance yields ABS bound form', () => {
    const be = breakevenPredicate(COLS, 2);
    expect(be.is).toContain('ABS(');
    expect(be.is).toContain('(2) * COALESCE(tick_size, 0) * COALESCE(point_value, 0) * COALESCE(quantity, 0)');
    expect(be.is).toContain('<=');
    expect(be.isNot).toContain('>');
  });

  test('per-underlying map yields a sanitized CASE expression', () => {
    const be = breakevenPredicate(COLS, { default: 0, byUnderlying: { ES: 2, NQ: 5 } });
    expect(be.is).toContain("CASE UPPER(underlying_asset) WHEN 'ES' THEN 2 WHEN 'NQ' THEN 5 ELSE 0 END");
    // No raw injection should ever appear
    expect(be.is).not.toMatch(/DROP|;|--/);
  });

  test('map without an underlying column falls back to default scalar', () => {
    const cols = { ...COLS, underlying: undefined };
    const be = breakevenPredicate(cols, { default: 3, byUnderlying: { ES: 2 } });
    expect(be.is).toContain('(3) *');
    expect(be.is).not.toContain('CASE');
  });
});

describe('breakeven.toleranceCacheKey', () => {
  test('is stable regardless of key order', () => {
    const a = toleranceCacheKey({ default: 1, byUnderlying: { NQ: 5, ES: 2 } });
    const b = toleranceCacheKey({ default: 1, byUnderlying: { ES: 2, NQ: 5 } });
    expect(a).toBe(b);
    expect(a).toBe('1|ES:2,NQ:5');
  });
});
