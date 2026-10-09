const {
  breakevenPredicate,
  configFromSettings,
  groupedBreakevenPredicate,
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
    expect(normalizeConfig(3)).toEqual({ mode: 'ticks', default: 3, byUnderlying: {} });
  });

  test('accepts object form and sanitizes the map', () => {
    expect(normalizeConfig({ default: 2, byUnderlying: { es: 2, NQ: 5 } }))
      .toEqual({ mode: 'ticks', default: 2, byUnderlying: { ES: 2, NQ: 5 } });
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
      .toEqual({ mode: 'ticks', default: 1, byUnderlying: { ES: 2 } });
  });

  test('accepts dollar mode and ignores an invalid mode', () => {
    expect(normalizeConfig({ mode: 'dollars', default: 12.5 }))
      .toEqual({ mode: 'dollars', default: 12.5, byUnderlying: {} });
    expect(normalizeConfig({ mode: 'percent', default: 2 }).mode).toBe('ticks');
  });
});

describe('breakeven.configFromSettings', () => {
  test('selects the stored amount for the active mode', () => {
    const settings = {
      breakeven_tolerance_mode: 'dollars',
      breakeven_tolerance_ticks: 3,
      breakeven_tolerance_dollars: '15.50',
      breakeven_tolerance_ticks_by_underlying: { ES: 2 }
    };

    expect(configFromSettings(settings)).toEqual({
      mode: 'dollars',
      default: 15.5,
      byUnderlying: { ES: 2 }
    });
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

  test('dollar mode compares gross P&L directly to the fixed amount', () => {
    const be = breakevenPredicate(COLS, { mode: 'dollars', default: 10, byUnderlying: { ES: 2 } });
    expect(be.is).toBe(`ABS(${COLS.gross}) <= (10)`);
    expect(be.isNot).toBe(`ABS(${COLS.gross}) > (10)`);
    expect(be.is).not.toContain('tick_size');
  });

  test('map without an underlying column falls back to default scalar', () => {
    const cols = { ...COLS, underlying: undefined };
    const be = breakevenPredicate(cols, { default: 3, byUnderlying: { ES: 2 } });
    expect(be.is).toContain('(3) *');
    expect(be.is).not.toContain('CASE');
  });
});

describe('breakeven.groupedBreakevenPredicate', () => {
  test('preserves exact net classification in tick mode', () => {
    expect(groupedBreakevenPredicate(
      { gross: 'gross_pnl', net: 'pnl' },
      { mode: 'ticks', default: 2 }
    )).toEqual({
      is: '(ROUND(pnl::numeric, 2) = 0)',
      isNot: '(ROUND(pnl::numeric, 2) <> 0)'
    });
  });

  test('uses combined gross P&L in dollar mode', () => {
    const be = groupedBreakevenPredicate(
      { gross: 'gross_pnl', net: 'pnl' },
      { mode: 'dollars', default: 25 }
    );
    expect(be.is).toBe('ABS(gross_pnl) <= (25)');
  });
});

describe('breakeven.toleranceCacheKey', () => {
  test('is stable regardless of key order', () => {
    const a = toleranceCacheKey({ default: 1, byUnderlying: { NQ: 5, ES: 2 } });
    const b = toleranceCacheKey({ default: 1, byUnderlying: { ES: 2, NQ: 5 } });
    expect(a).toBe(b);
    expect(a).toBe('ticks|1|ES:2,NQ:5');
  });

  test('distinguishes dollar and tick modes', () => {
    expect(toleranceCacheKey({ mode: 'dollars', default: 5 }))
      .not.toBe(toleranceCacheKey({ mode: 'ticks', default: 5 }));
  });
});
