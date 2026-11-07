import { describe, expect, it } from 'vitest'
import { getExcursionScale, normalizeExcursionDollars, excursionValue, getExcursionFormSource } from './excursionUnits'
import contracts from '../../../tests/fixtures/trading-calculation-contracts.json'

describe('MAE/MFE units (issue 427)', () => {
  it.each(contracts.excursion_unit_cases)('$id displays the same values as the API', fixture => {
    const trade = { ...fixture.trade, mae: 0, mfe: fixture.dollars, post_exit_mfe: fixture.dollars }
    for (const unit of ['dollars', 'points', 'r']) {
      expect(excursionValue(trade, 'mfe', unit)).toBe(fixture[unit])
      expect(excursionValue(trade, 'post_exit_mfe', unit)).toBe(fixture[unit])
      expect(excursionValue(trade, 'mae', unit)).toBe(0)
      expect(excursionValue(trade, 'post_exit_mae', unit)).toBeNull()
      expect(fixture[unit] * getExcursionScale(trade, unit)).toBe(fixture.dollars)
    }
  })

  it('keeps server-derived units independent of converted display amounts', () => {
    const trade = { quantity: 10, entry_price: 80, stop_loss: 78.4, side: 'long', mfe: 48, mfe_points: 6, mfe_r: 3 }
    expect(excursionValue(trade, 'mfe', 'points')).toBe(6)
    expect(excursionValue(trade, 'mfe', 'r')).toBe(3)
    expect(excursionValue({ ...trade, mfe_r: null }, 'mfe', 'r')).toBeNull()
  })

  it('requires valid stop risk and position size', () => {
    expect(getExcursionScale({ quantity: 10, entry_price: 100, stop_loss: 100, side: 'long' }, 'r')).toBeNull()
    expect(getExcursionScale({ quantity: 10, entry_price: 100, stop_loss: 99, side: 'short' }, 'r')).toBeNull()
    expect(getExcursionScale({ quantity: 0 }, 'points')).toBeNull()
    expect(getExcursionScale({ quantity: 1, instrument_type: 'future' }, 'points')).toBeNull()
  })

  it('preserves multi-contract excursion dollars and handles legacy points', () => {
    const trade = contracts.futures_excursion_edit.trade
    expect(normalizeExcursionDollars(trade.mfe, trade)).toBe(trade.mfe)
    expect(normalizeExcursionDollars(30, { ...trade, mfe: 30 })).toBe(450)
  })
  it('uses grouped execution entry and stop prices when the main fields are hidden', () => {
    const form = { instrumentType: 'future', pointValue: 5, entryPrice: '', quantity: '', side: '', stopLoss: null,
      executions: [
        { side: 'long', quantity: 1, entryPrice: 6000, stopLoss: 5998 },
        { side: 'long', quantity: 2, entryPrice: 6003, stopLoss: 6001 }
      ] }
    const source = getExcursionFormSource(form)
    expect(source.entry_price).toBe(6002)
    expect(source.quantity).toBe(3)
    expect(source.stop_loss).toBe(6000)
    expect(getExcursionScale(source, 'points')).toBe(15)
    expect(getExcursionScale(source, 'r')).toBe(30)
  })

  it('uses opening fills for weighted entry prices and avoids counting closing fills twice', () => {
    const source = getExcursionFormSource({ side: 'short', stopLoss: 105, executions: [
      { action: 'sell', quantity: 10, price: 100 },
      { action: 'buy', quantity: 10, price: 95 }
    ] })
    expect(source.entry_price).toBe(100)
    expect(source.quantity).toBe(10)
    expect(getExcursionScale(source, 'r')).toBe(50)
  })

})
