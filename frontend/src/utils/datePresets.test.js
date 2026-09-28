import { describe, it, expect } from 'vitest'
import { resolveDatePreset, resolveMonthlyFilterParams } from './datePresets'

describe('calendar-month reporting presets', () => {
  it.each([
    [new Date(2026, 8, 28, 23, 59), '2026-09-01', '2026-09-28', '2026-08-01', '2026-08-31'],
    [new Date(2026, 0, 1), '2026-01-01', '2026-01-01', '2025-12-01', '2025-12-31'],
    [new Date(2024, 2, 31), '2024-03-01', '2024-03-31', '2024-02-01', '2024-02-29'],
    [new Date(2025, 2, 1), '2025-03-01', '2025-03-01', '2025-02-01', '2025-02-28']
  ])('resolves calendar boundaries from %s without UTC conversion', (now, start, end, previousStart, previousEnd) => {
    expect(resolveDatePreset('this_month', now)).toEqual({ start_date: start, end_date: end })
    expect(resolveDatePreset('last_month', now)).toEqual({ start_date: previousStart, end_date: previousEnd })
  })

  it('re-resolves restored monthly filters while retaining account and other filters', () => {
    const filters = { date_preset: 'last_month', startDate: '2026-01-01', endDate: '2026-01-31', accounts: 'acc-1', tags: 'setup' }
    expect(resolveMonthlyFilterParams(filters, new Date(2026, 3, 2))).toEqual({ startDate: '2026-03-01', endDate: '2026-03-31', accounts: 'acc-1', tags: 'setup' })
    expect(filters.startDate).toBe('2026-01-01')
  })

  it('preserves custom ranges and existing rolling presets', () => {
    expect(resolveMonthlyFilterParams({ startDate: '2025-01-02', endDate: '2025-02-03' })).toEqual({ startDate: '2025-01-02', endDate: '2025-02-03' })
    expect(resolveDatePreset('30d', new Date(2026, 2, 15))).toEqual({ start_date: '2026-02-13', end_date: '2026-03-15' })
    expect(resolveDatePreset('all')).toEqual({ start_date: '', end_date: '' })
  })
})
