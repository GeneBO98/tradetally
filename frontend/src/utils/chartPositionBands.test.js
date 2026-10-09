import { describe, expect, test } from 'vitest'
import { clipBandToPane } from './chartPositionBands'

const PANE = 400

describe('clipBandToPane', () => {
  test('leaves a band that fits inside the pane untouched', () => {
    expect(clipBandToPane(120, 260, PANE)).toEqual({ y: 120, height: 140 })
  })

  test('clips a stop that sits far below the visible price range', () => {
    // Entry on screen, stop 8000px below it — the 15m KO case.
    expect(clipBandToPane(180, 8200, PANE)).toEqual({ y: 180, height: 220 })
  })

  test('clips a target far above the visible price range', () => {
    expect(clipBandToPane(-5000, 210, PANE)).toEqual({ y: 0, height: 210 })
  })

  test('drops a band that lies entirely above the pane', () => {
    expect(clipBandToPane(-900, -400, PANE)).toBeNull()
  })

  test('drops a band that lies entirely below the pane', () => {
    expect(clipBandToPane(700, 1200, PANE)).toBeNull()
  })

  test('spans the pane when both levels are off opposite edges', () => {
    expect(clipBandToPane(-2000, 3000, PANE)).toEqual({ y: 0, height: PANE })
  })

  test('keeps a hairline for a visible but degenerate band', () => {
    expect(clipBandToPane(200, 200, PANE)).toEqual({ y: 200, height: 1 })
  })

  test('accepts reversed coordinates', () => {
    expect(clipBandToPane(260, 120, PANE)).toEqual({ y: 120, height: 140 })
  })

  test('rejects non-finite coordinates rather than drawing NaN geometry', () => {
    expect(clipBandToPane(Number.NaN, 200, PANE)).toBeNull()
    expect(clipBandToPane(100, Number.POSITIVE_INFINITY, PANE)).toBeNull()
    expect(clipBandToPane(100, 200, 0)).toBeNull()
  })
})
