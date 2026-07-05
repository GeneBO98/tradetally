/**
 * What-if analysis for trade replay.
 *
 * Given the session's bars, the trade's fills, and the trade record, price a
 * set of alternative exits and compare each against the actual result:
 *   - honored the stop loss
 *   - held to the take-profit target
 *   - perfect exit at the session's best price after entry
 *   - held to the session close
 *
 * When the entry fill sits inside the entry bar's range, the chart data and
 * the fills share a price space, so scenarios are computed directly against
 * the trade's average entry price and levels are used as-is — every number is
 * exactly comparable to the actual exit. When the data is mismatched
 * (different venue, demo trades), scenarios fall back to a market-space
 * anchor at the entry bar's close, with levels translated by their distance
 * from entry. Estimates exclude commissions and fees.
 */

function barAtOrBefore(bars, time) {
  let index = 0
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].time > time) break
    index = i
  }
  return index
}

export function computeReplayScenarios({ bars, fills, trade }) {
  if (!bars?.length || !fills?.length || !trade) return null
  if (trade.exit_price === null || trade.exit_price === undefined) return null

  const sign = trade.side === 'short' ? -1 : 1
  const quantity = Math.abs(Number(trade.quantity)) || 0
  const multiplier = Number(trade.multiplier) || 1
  const entryPrice = Number(trade.entry_price)
  const actualPnl = Number(trade.pnl) || 0
  if (!quantity || !Number.isFinite(entryPrice)) return null

  const entryIndex = barAtOrBefore(bars, fills[0].time)
  const entryBar = bars[entryIndex]
  const entryFillPrice = Number(fills[0].price)
  const aligned = Number.isFinite(entryFillPrice) &&
    entryFillPrice >= Number(entryBar.low) && entryFillPrice <= Number(entryBar.high)

  // P&L basis: average entry price when the data is aligned with the fills,
  // otherwise the market price at the moment of entry
  const basis = aligned ? entryPrice : Number(entryBar.close)
  const mapLevel = (level) => (aligned ? Number(level) : basis + (Number(level) - entryPrice))
  const pnlAt = (price) => sign * (price - basis) * quantity * multiplier

  const afterEntry = bars.slice(entryIndex + 1)
  if (afterEntry.length === 0) return null

  const scenarios = []

  if (trade.stop_loss !== null && trade.stop_loss !== undefined) {
    const level = mapLevel(trade.stop_loss)
    const hitBar = afterEntry.find((bar) =>
      sign === 1 ? Number(bar.low) <= level : Number(bar.high) >= level
    )
    scenarios.push({
      key: 'stop',
      label: 'Honored your stop',
      hit: !!hitBar,
      hit_time: hitBar ? hitBar.time : null,
      exit_price: hitBar ? level : null,
      detail: hitBar ? null : 'Stop was never hit this session',
      pnl: hitBar ? pnlAt(level) : null
    })
  }

  if (trade.take_profit !== null && trade.take_profit !== undefined) {
    const level = mapLevel(trade.take_profit)
    const hitBar = afterEntry.find((bar) =>
      sign === 1 ? Number(bar.high) >= level : Number(bar.low) <= level
    )
    scenarios.push({
      key: 'target',
      label: 'Held to your target',
      hit: !!hitBar,
      hit_time: hitBar ? hitBar.time : null,
      exit_price: hitBar ? level : null,
      detail: hitBar ? null : 'Target was never reached this session',
      pnl: hitBar ? pnlAt(level) : null
    })
  }

  let bestPrice = null
  let bestTime = null
  for (const bar of afterEntry) {
    const candidate = sign === 1 ? Number(bar.high) : Number(bar.low)
    if (bestPrice === null || (sign === 1 ? candidate > bestPrice : candidate < bestPrice)) {
      bestPrice = candidate
      bestTime = bar.time
    }
  }
  scenarios.push({
    key: 'best',
    label: 'Perfect exit',
    hit: true,
    hit_time: bestTime,
    exit_price: bestPrice,
    detail: null,
    pnl: pnlAt(bestPrice)
  })

  const lastBar = afterEntry[afterEntry.length - 1]
  scenarios.push({
    key: 'close',
    label: 'Held to session close',
    hit: true,
    hit_time: lastBar.time,
    exit_price: Number(lastBar.close),
    detail: null,
    pnl: pnlAt(Number(lastBar.close))
  })

  for (const scenario of scenarios) {
    scenario.delta = scenario.pnl === null ? null : scenario.pnl - actualPnl
  }

  const best = scenarios.find((s) => s.key === 'best')
  const leftOnTable = best && best.pnl !== null ? Math.max(0, best.pnl - actualPnl) : null

  return {
    actual_pnl: actualPnl,
    actual_exit_price: Number(trade.exit_price),
    actual_exit_time: fills[fills.length - 1].time,
    aligned,
    left_on_table: leftOnTable,
    scenarios
  }
}
