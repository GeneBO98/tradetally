const { getExcursionScale, convertExcursionInputs, buildExcursionUnitValues } = require('../../src/utils/excursionUnits');
const { schemas } = require('../../src/middleware/validation');
const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

describe('MAE/MFE units (issue 427)', () => {
  test.each(contracts.excursion_unit_cases)('$id round-trips currency, points, and R', fixture => {
    for (const unit of ['dollars', 'points', 'r']) {
      const input = { excursion_unit: unit, mae: 0, mfe: fixture[unit], post_exit_mae: null, post_exit_mfe: fixture[unit] };
      expect(convertExcursionInputs(input, fixture.trade)).toEqual({ mae: 0, mfe: fixture.dollars, post_exit_mae: null, post_exit_mfe: fixture.dollars });
    }
    const derived = buildExcursionUnitValues({ ...fixture.trade, mae: 0, mfe: fixture.dollars, post_exit_mfe: fixture.dollars });
    expect(derived.mfe_points).toBe(fixture.points);
    expect(derived.mfe_r).toBe(fixture.r);
    expect(derived.mae_r).toBe(0);
    expect(derived.post_exit_mae_r).toBeNull();
  });

  test.each([null, '', 100, 101])('R is unavailable with a long stop of %s', stop_loss => {
    const trade = { quantity: 10, entry_price: 100, side: 'long', stop_loss };
    expect(getExcursionScale(trade, 'r')).toBeNull();
    expect(() => convertExcursionInputs({ excursion_unit: 'r', mfe: 0 }, trade)).toThrow('positive risk');
    // Clearing a value must still work when risk is unavailable.
    expect(convertExcursionInputs({ excursion_unit: 'r', mfe: null }, trade)).toEqual({ mfe: null });
    expect(buildExcursionUnitValues({ ...trade, mfe: 0 }).mfe_r).toBeNull();
  });

  test('points require a usable position size and multiplier', () => {
    expect(() => convertExcursionInputs({ excursion_unit: 'points', mfe: 2 }, { quantity: 0 })).toThrow('positive quantity');
    expect(() => convertExcursionInputs({ excursion_unit: 'points', mfe: 2 }, { quantity: 1, instrument_type: 'future', symbol: 'UNKNOWN' })).toThrow('multiplier');
  });

  test('default dollar input remains unchanged and legacy after-trade names work', () => {
    expect(convertExcursionInputs({ mae: 0, mfe: 25, postExitMfe: 50 }, {})).toEqual({ mae: 0, mfe: 25, postExitMfe: 50 });
  });

  test('both API schemas accept the unit selector and reject unknown units', () => {
    for (const schema of [schemas.trade, schemas.updateTrade]) {
      const body = schema === schemas.trade ? { symbol: 'AAPL', side: 'long', entryTime: '2026-10-15T14:00:00Z', entryPrice: 100, quantity: 10 } : {};
      for (const excursion_unit of ['dollars', 'points', 'r']) {
        expect(schema.validate({ ...body, excursion_unit, mfe: 2 }).error).toBeUndefined();
      }
      expect(schema.validate({ ...body, excursion_unit: 'unknown', mfe: 2 }).error).toBeDefined();
    }
  });
});
