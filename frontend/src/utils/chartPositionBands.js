// The risk and reward bands of the planned-position overlay are drawn between
// price levels that are frequently outside the visible price range: a stop far
// below the bars currently on screen, a target far above them. klinecharts
// scales its y-axis to the *visible* candles, so `convertToPixel` happily
// returns coordinates thousands of pixels outside the pane for those levels.
// Drawing a rectangle straight from them makes the overlay appear to expand
// without bound, which is why every band has to be clipped to the pane first.
export function clipBandToPane(fromY, toY, paneHeight) {
  if (![fromY, toY, paneHeight].every(Number.isFinite)) return null
  if (paneHeight <= 0) return null

  const top = Math.min(fromY, toY)
  const bottom = Math.max(fromY, toY)

  // Entirely above or entirely below the pane: nothing to draw.
  if (bottom < 0 || top > paneHeight) return null

  const clippedTop = Math.min(Math.max(top, 0), paneHeight)
  const clippedBottom = Math.min(Math.max(bottom, 0), paneHeight)

  // A band that is visible but degenerate still deserves a hairline, matching
  // the previous behaviour for a stop or target sitting on the entry price.
  return { y: clippedTop, height: Math.max(1, clippedBottom - clippedTop) }
}
