import { expect, it } from 'vitest'
import contracts from '../../../tests/fixtures/trading-calculation-contracts.json'
import { daily_position_pnl } from './dailyPositionPnl'

it.each(contracts.daily_position_pnl_cases)('$id daily position P&L', ({ position, expected }) => {
  const actual = daily_position_pnl(position)
  if (expected === null) expect(actual).toBeNull()
  else expect(actual).toBeCloseTo(expected, 8)
})
