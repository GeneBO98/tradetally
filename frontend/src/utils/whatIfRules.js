/**
 * Client-side What-If rule engine.
 *
 * Trades come from GET /analytics/what-if as compact rows:
 *   d  = trade day (YYYY-MM-DD)          p  = P&L (USD)
 *   f  = hindsight pattern flags          e  = entry epoch ms (nullable)
 *   x  = exit epoch ms (nullable)         m  = entry minute of day, user tz (nullable)
 *   tg = tags                             pb = 'broken' | 'followed' | null
 *
 * Rules are applied in two passes:
 *   1. Filters that only look at the trade itself (hindsight patterns, tags,
 *      entry cutoff, broken playbook).
 *   2. Sequential daily rules (max trades per day, daily loss limit) that walk
 *      the surviving trades of each day in entry order. A trade is skipped by
 *      the loss limit only when trades that had already closed before its
 *      entry brought the day's realized P&L to -limit or worse.
 */

export const DEFAULT_RULE_CONFIG = Object.freeze({
  patternKeys: [],
  tags: [],
  entryCutoffMinute: null,
  skipBrokenPlaybook: false,
  maxTradesPerDay: null,
  dailyLossLimit: null
})

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function positiveNumberOrNull(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

function normalizeConfig(config = {}) {
  const cutoff = Number(config.entryCutoffMinute)
  const maxTrades = Math.floor(Number(config.maxTradesPerDay))
  return {
    patternKeys: new Set(config.patternKeys || []),
    tags: new Set(config.tags || []),
    entryCutoffMinute: config.entryCutoffMinute !== null && config.entryCutoffMinute !== undefined && Number.isFinite(cutoff)
      ? cutoff
      : null,
    skipBrokenPlaybook: config.skipBrokenPlaybook === true,
    maxTradesPerDay: Number.isFinite(maxTrades) && maxTrades >= 1 ? maxTrades : null,
    dailyLossLimit: positiveNumberOrNull(config.dailyLossLimit)
  }
}

/**
 * Why a trade is removed by the single-trade filters, or null to keep it.
 */
function staticRemovalReason(trade, cfg) {
  if (cfg.patternKeys.size > 0 && Array.isArray(trade.f) && trade.f.some(flag => cfg.patternKeys.has(flag))) {
    return 'pattern'
  }
  if (cfg.tags.size > 0 && Array.isArray(trade.tg) && trade.tg.some(tag => cfg.tags.has(tag))) {
    return 'tag'
  }
  if (cfg.entryCutoffMinute !== null && trade.m !== null && trade.m !== undefined && trade.m >= cfg.entryCutoffMinute) {
    return 'entry_cutoff'
  }
  if (cfg.skipBrokenPlaybook && trade.pb === 'broken') {
    return 'broken_playbook'
  }
  return null
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null
}

/**
 * Apply the rule config and return which trades are removed and why.
 * @returns {{ removed: Array<string|null> }} reason per trade index (null = kept)
 */
export function classifyTrades(trades, config = {}) {
  const cfg = normalizeConfig(config)
  const list = Array.isArray(trades) ? trades : []
  const removed = list.map(trade => staticRemovalReason(trade, cfg))

  if (cfg.maxTradesPerDay === null && cfg.dailyLossLimit === null) {
    return { removed }
  }

  // Group surviving trades by day, ordered by entry time. Trades without an
  // entry time fall back to their exit time, then to their original position.
  const byDay = new Map()
  list.forEach((trade, idx) => {
    if (removed[idx] !== null) return
    const entry = finiteOrNull(trade.e)
    const exit = finiteOrNull(trade.x)
    const item = {
      idx,
      pnl: Number(trade.p) || 0,
      start: entry ?? exit,
      close: exit ?? entry
    }
    const day = trade.d || ''
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(item)
  })

  for (const items of byDay.values()) {
    items.sort((a, b) => {
      if (a.start === null && b.start === null) return a.idx - b.idx
      if (a.start === null) return 1
      if (b.start === null) return -1
      return a.start - b.start || a.idx - b.idx
    })

    const kept = []
    for (const item of items) {
      if (cfg.maxTradesPerDay !== null && kept.length >= cfg.maxTradesPerDay) {
        removed[item.idx] = 'max_trades'
        continue
      }

      if (cfg.dailyLossLimit !== null) {
        let realized = 0
        for (const prior of kept) {
          // Without an entry time we cannot tell what had closed, so every
          // earlier kept trade counts as realized.
          if (item.start === null || prior.close === null || prior.close <= item.start) {
            realized += prior.pnl
          }
        }
        if (realized <= -cfg.dailyLossLimit) {
          removed[item.idx] = 'daily_loss_limit'
          continue
        }
      }

      kept.push(item)
    }
  }

  return { removed }
}

/**
 * Totals for the trades the config keeps.
 */
export function summarizeSimulation(trades, config = {}) {
  const list = Array.isArray(trades) ? trades : []
  const { removed } = classifyTrades(list, config)
  let totalPnl = 0
  let wins = 0
  let kept = 0
  const removedByReason = {}

  list.forEach((trade, idx) => {
    const reason = removed[idx]
    if (reason) {
      removedByReason[reason] = (removedByReason[reason] || 0) + 1
      return
    }
    kept += 1
    totalPnl += Number(trade.p) || 0
    if (trade.p > 0) wins += 1
  })

  return {
    removed,
    removedCount: list.length - kept,
    removedByReason,
    simulated: {
      tradeCount: kept,
      totalPnl: round2(totalPnl),
      winRate: kept > 0 ? Math.round((wins / kept) * 1000) / 10 : 0
    }
  }
}

/**
 * Net P&L change from applying one rule on its own (positive = rule helps).
 */
export function ruleImpact(trades, ruleConfig) {
  const list = Array.isArray(trades) ? trades : []
  const actualTotal = list.reduce((sum, t) => sum + (Number(t.p) || 0), 0)
  const result = summarizeSimulation(list, ruleConfig)
  return {
    delta: round2(result.simulated.totalPnl - actualTotal),
    removedCount: result.removedCount
  }
}

/**
 * Actual vs simulated cumulative P&L series. Groups by day when there are many
 * trades so the chart stays readable.
 */
export function buildEquitySeries(trades, removed, { groupByDayThreshold = 80 } = {}) {
  const list = Array.isArray(trades) ? trades : []
  const labels = []
  const actualSeries = []
  const simSeries = []
  let actualCum = 0
  let simCum = 0

  if (list.length > groupByDayThreshold) {
    const dayMap = new Map()
    list.forEach((trade, idx) => {
      const key = trade.d || 'Trade'
      const entry = dayMap.get(key) || { actual: 0, sim: 0 }
      entry.actual += Number(trade.p) || 0
      if (!removed[idx]) entry.sim += Number(trade.p) || 0
      dayMap.set(key, entry)
    })
    for (const [day, totals] of dayMap.entries()) {
      actualCum = round2(actualCum + totals.actual)
      simCum = round2(simCum + totals.sim)
      labels.push(day)
      actualSeries.push(actualCum)
      simSeries.push(simCum)
    }
  } else {
    list.forEach((trade, idx) => {
      actualCum = round2(actualCum + (Number(trade.p) || 0))
      if (!removed[idx]) simCum = round2(simCum + (Number(trade.p) || 0))
      labels.push(trade.d || `#${idx + 1}`)
      actualSeries.push(actualCum)
      simSeries.push(simCum)
    })
  }

  return { labels, actualSeries, simSeries }
}

export function formatMinuteOfDay(minute) {
  const total = ((Math.round(Number(minute)) % 1440) + 1440) % 1440
  const hour = Math.floor(total / 60)
  const mins = total % 60
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:${String(mins).padStart(2, '0')} ${suffix}`
}
