import { describe, expect, it } from 'vitest'
import { localInputToUTC, utcToLocalInput } from './timezone'

describe('timezone input conversion', () => {
  it('preserves execution seconds through a Berlin datetime-local round trip', () => {
    const originalUtc = '2026-08-05T12:11:02.000Z'
    const localInput = utcToLocalInput(originalUtc, 'Europe/Berlin')

    expect(localInput).toBe('2026-08-05T14:11:02')
    expect(localInputToUTC(localInput, 'Europe/Berlin')).toBe(originalUtc)
  })
})
