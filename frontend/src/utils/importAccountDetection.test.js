import { describe, expect, it } from 'vitest'
import {
  collectAccountIdentifiersFromSamples,
  extractFilenameAccount,
  findAccountHeader
} from './importAccountDetection'

describe('importAccountDetection', () => {
  it('finds account columns by common header names', () => {
    expect(findAccountHeader(['Date', 'Symbol', 'Account Number', 'Price'])).toBe('Account Number')
    expect(findAccountHeader(['Date', 'Symbol', 'Price'])).toBeNull()
  })

  it('collects distinct account identifiers from sample rows', () => {
    const identifiers = collectAccountIdentifiersFromSamples(
      ['Date', 'Symbol', 'TradeAccount', 'Price'],
      { TradeAccount: ['RTSL00000000000', 'RTSL00000000000', 'Sim1', '  '] }
    )
    expect(identifiers.sort()).toEqual(['RTSL00000000000', 'Sim1'])
  })

  it('extracts the account from Sierra daily-log filenames only', () => {
    expect(extractFilenameAccount('TradeActivityLog_20260908_UTC.RTSL00000000000.data')).toBe('RTSL00000000000')
    expect(extractFilenameAccount('TradeActivityLog_20260903_UTC.Sim1.simulated.data')).toBe('Sim1')
    expect(extractFilenameAccount('TradeActivityLog_20260908_activity_export.txt')).toBeNull()
    expect(extractFilenameAccount('trades.csv')).toBeNull()
  })
})
