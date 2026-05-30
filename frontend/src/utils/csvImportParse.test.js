import { describe, it, expect } from 'vitest'
import {
  detectBestDelimiter,
  findHeaderLineInfo,
  splitCSVLine,
  parseCSVFilePreview
} from './csvImportParse.js'

const NINJA_HEADER =
  'Instrument;Action;Quantity;Price;Time;ID;E/X;Position;Order ID;Name;Commission;Rate;Account display name;Connection;'
const NINJA_ROW =
  'MES JUN26;Sell;1;7200,75;27/04/2026 6:05:02;601743f828ce41728b67d8c9ba4a56ab;Entry;1 S;0fc4852339a74a8f891d0627f37df2a6;Entry;0,62 $;1;Playback101;Playback;'

describe('csvImportParse', () => {
  it('detects semicolon delimiter on NinjaTrader header', () => {
    expect(detectBestDelimiter(NINJA_HEADER)).toBe(';')
  })

  it('does not treat decimal comma as delimiter when semicolons separate fields', () => {
    expect(detectBestDelimiter(NINJA_ROW)).toBe(';')
  })

  it('finds NinjaTrader header row', () => {
    const lines = [NINJA_HEADER, NINJA_ROW]
    const info = findHeaderLineInfo(lines)
    expect(info.index).toBe(0)
    expect(info.delimiter).toBe(';')
    expect(info.fields).toContain('Instrument')
    expect(info.fields).toContain('Action')
  })

  it('splits semicolon rows without breaking on decimal commas', () => {
    const cols = splitCSVLine(NINJA_ROW, ';')
    expect(cols[0]).toBe('MES JUN26')
    expect(cols[3]).toBe('7200,75')
    expect(cols[4]).toContain('27/04/2026')
  })

  it('parseCSVFilePreview returns proper headers and samples', async () => {
    const file = new File([`${NINJA_HEADER}\n${NINJA_ROW}\n`], 'ninja.csv', {
      type: 'text/csv'
    })
    const { headers, sampleRows, delimiter } = await parseCSVFilePreview(file)

    expect(delimiter).toBe(';')
    expect(headers).toContain('Instrument')
    expect(headers).toContain('Price')
    expect(sampleRows.Instrument?.[0]).toBe('MES JUN26')
    expect(sampleRows.Price?.[0]).toBe('7200,75')
  })
})
