import { ref, computed, onUnmounted, getCurrentInstance } from 'vue'

/**
 * Client-side trade replay engine.
 *
 * Holds the pre-fetched bars and normalized fills from /api/replay and advances
 * a real-time market clock. At 1x speed on intraday bars, 1 second of market
 * time equals 1 second of wall-clock time, with the active candle forming
 * smoothly across the bar's duration (open -> extrema -> close) so playback
 * feels alive rather than frozen between minute boundaries.
 *
 * Daily degraded mode (where 1 bar = 1 trading day) steps 1 bar/sec at 1x.
 *
 * All times are epoch seconds UTC, matching the backend payload.
 */

const REALTIME_SPEED_OPTIONS = [1, 2, 5, 10, 30, 60, 300]
const BAR_STEP_SPEED_OPTIONS = [1, 2, 5, 10, 30]
const TICK_INTERVAL_MS = 100
const DAILY_BASE_BAR_MS = 1000
const BAR_STEP_BASE_MS = 700

const RESOLUTION_SECONDS = {
  '1min': 60,
  '5min': 5 * 60,
  '15min': 15 * 60,
  '1hour': 60 * 60,
  'daily': 24 * 60 * 60
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

/**
 * Deterministically synthesize the developing state of a candle at progress p in [0, 1].
 * Bullish bars trace open -> low -> high -> close; bearish bars trace open -> high -> low -> close.
 * High/low envelopes expand monotonically and always match the exact real candle at p = 1.
 */
export function interpolateBar(bar, progress) {
  if (!bar) return null
  const p = Math.max(0, Math.min(1, Number(progress)))
  const open = Number(bar.open)
  const high = Number(bar.high)
  const low = Number(bar.low)
  const close = Number(bar.close)
  const volume = Number(bar.volume) || 0

  if (!Number.isFinite(p) || p >= 1) {
    return { time: bar.time, open, high, low, close, volume }
  }

  const bullish = close >= open
  const firstPivot = bullish ? low : high
  const secondPivot = bullish ? high : low

  let liveClose
  let liveHigh = open
  let liveLow = open

  if (p <= 0.25) {
    const t = p / 0.25
    liveClose = open + (firstPivot - open) * t
  } else if (p <= 0.75) {
    const t = (p - 0.25) / 0.5
    liveClose = firstPivot + (secondPivot - firstPivot) * t
    liveHigh = Math.max(liveHigh, firstPivot)
    liveLow = Math.min(liveLow, firstPivot)
  } else {
    const t = (p - 0.75) / 0.25
    liveClose = secondPivot + (close - secondPivot) * t
    liveHigh = Math.max(liveHigh, firstPivot, secondPivot)
    liveLow = Math.min(liveLow, firstPivot, secondPivot)
  }

  liveHigh = Math.max(liveHigh, liveClose)
  liveLow = Math.min(liveLow, liveClose)

  return {
    time: bar.time,
    open,
    high: liveHigh,
    low: liveLow,
    close: liveClose,
    volume: Number.isInteger(volume) ? Math.round(volume * p) : Number((volume * p).toFixed(6))
  }
}

export function useReplayEngine(options = {}) {
  const barStepMode = Boolean(options.barStepMode)
  const SPEED_OPTIONS = barStepMode ? BAR_STEP_SPEED_OPTIONS : REALTIME_SPEED_OPTIONS

  const bars = ref([])
  const fills = ref([])
  const trade = ref(null)
  const resolution = ref('1min')
  const cursor = ref(0)
  const barElapsedMs = ref(60_000) // exact market ms elapsed within bars[cursor]
  const playing = ref(false)
  const speed = ref(1)
  const loaded = ref(false)

  let timer = null
  let lastTickMs = 0
  let stepAccumulatorMs = 0
  let visibilityListenerAttached = false

  const isDailyMode = computed(() => resolution.value === 'daily')
  const isSteppedMode = computed(() => barStepMode || isDailyMode.value)

  // Nominal duration of a single candle in seconds (e.g. 60 for 1-min bars).
  const barSpan = computed(() => {
    if (RESOLUTION_SECONDS[resolution.value]) {
      return RESOLUTION_SECONDS[resolution.value]
    }
    if (bars.value.length < 2) return 60
    const diffs = []
    for (let i = 1; i < Math.min(bars.value.length, 30); i += 1) {
      const diff = bars.value[i].time - bars.value[i - 1].time
      if (diff > 0) diffs.push(diff)
    }
    if (diffs.length === 0) return 60
    diffs.sort((a, b) => a - b)
    return Math.max(1, diffs[Math.floor(diffs.length / 2)])
  })

  const barSpanMs = computed(() => barSpan.value * 1000)
  const barProgress = computed(() =>
    barSpanMs.value > 0 ? Math.min(1, barElapsedMs.value / barSpanMs.value) : 1
  )

  function handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.hidden && playing.value) {
      pause()
    }
  }

  function attachVisibilityListener() {
    if (!visibilityListenerAttached && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
      visibilityListenerAttached = true
    }
  }

  function detachVisibilityListener() {
    if (visibilityListenerAttached && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      visibilityListenerAttached = false
    }
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    detachVisibilityListener()
  }

  function tick() {
    if (!playing.value || !loaded.value) return
    const now = nowMs()
    const deltaMs = Math.max(0, now - lastTickMs)
    lastTickMs = now
    if (deltaMs === 0) return

    if (isSteppedMode.value) {
      const baseBarMs = barStepMode ? BAR_STEP_BASE_MS : DAILY_BASE_BAR_MS
      stepAccumulatorMs += deltaMs * speed.value
      const steps = Math.floor(stepAccumulatorMs / baseBarMs)
      if (steps > 0) {
        stepAccumulatorMs -= steps * baseBarMs
        const nextIndex = cursor.value + steps
        if (nextIndex >= bars.value.length - 1) {
          cursor.value = bars.value.length - 1
          barElapsedMs.value = barSpanMs.value
          pause()
        } else {
          cursor.value = nextIndex
          barElapsedMs.value = barSpanMs.value
        }
      }
      return
    }

    // Intraday true real-time advancement in monotonic market milliseconds:
    // At 1x, 1000ms wall-clock advances exactly 1000ms of market time without dropping delayed ticks.
    const spanMs = barSpanMs.value
    let nextElapsed = barElapsedMs.value + Math.round(deltaMs * speed.value)
    let nextCursor = cursor.value

    while (nextElapsed >= spanMs) {
      if (nextCursor >= bars.value.length - 1) {
        cursor.value = bars.value.length - 1
        barElapsedMs.value = spanMs
        pause()
        return
      }
      nextCursor += 1
      nextElapsed -= spanMs
    }

    cursor.value = nextCursor
    barElapsedMs.value = nextElapsed
  }

  function startTimer() {
    stopTimer()
    lastTickMs = nowMs()
    stepAccumulatorMs = 0
    attachVisibilityListener()
    timer = setInterval(tick, TICK_INTERVAL_MS)
  }

  function barIndexContaining(time) {
    const list = bars.value
    if (list.length === 0) return 0
    if (time <= list[0].time) return 0
    let lo = 0
    let hi = list.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (list[mid].time <= time) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return lo
  }

  function firstFillBarIndex() {
    if (fills.value.length === 0 || bars.value.length === 0) return 0
    return barIndexContaining(fills.value[0].time)
  }

  function resetToEntryPosition() {
    if (bars.value.length === 0) {
      cursor.value = 0
      barElapsedMs.value = barSpanMs.value
      return
    }
    const entryIdx = firstFillBarIndex()
    if (!isSteppedMode.value && ((fills.value.length > 0 && entryIdx === 0) || bars.value.length === 1)) {
      // Entry is inside the first available candle (or this is a 1-candle replay):
      // initialize at progress 0 so playback animates cleanly through the entry instead of skipping it.
      cursor.value = 0
      barElapsedMs.value = 0
      return
    }
    // Start 1 completed bar before the first fill so full prior chart context is
    // visible immediately and clicking Play at 1x begins forming the entry candle right away.
    cursor.value = Math.max(0, entryIdx - 1)
    barElapsedMs.value = barSpanMs.value
  }

  function load(payload) {
    stopTimer()
    bars.value = payload.candles || []
    fills.value = payload.fills || []
    trade.value = payload.trade || null
    resolution.value = payload.resolution || (payload.degraded ? 'daily' : '1min')
    playing.value = false
    loaded.value = bars.value.length > 0
    resetToEntryPosition()
  }

  function play() {
    if (!loaded.value) return
    if (cursor.value >= bars.value.length - 1 && barElapsedMs.value >= barSpanMs.value) {
      resetToEntryPosition()
    }
    // If paused on a completed bar with more bars ahead, open the next bar right away
    // so pressing Play gives immediate visual motion instead of waiting a full bar.
    if (!isSteppedMode.value && barElapsedMs.value >= barSpanMs.value && cursor.value < bars.value.length - 1) {
      cursor.value += 1
      barElapsedMs.value = 0
    }
    playing.value = true
    startTimer()
  }

  function pause() {
    playing.value = false
    stopTimer()
  }

  function toggle() {
    if (playing.value) pause()
    else play()
  }

  function seek(index) {
    const clamped = Math.max(0, Math.min(bars.value.length - 1, Math.round(index)))
    cursor.value = clamped
    barElapsedMs.value = barSpanMs.value
    if (playing.value) {
      lastTickMs = nowMs()
      stepAccumulatorMs = 0
    }
  }

  function stepForward() {
    pause()
    seek(cursor.value + 1)
  }

  function stepBack() {
    pause()
    seek(cursor.value - 1)
  }

  function setSpeed(value) {
    speed.value = value
    if (playing.value) startTimer()
  }

  function jumpToEntry() {
    pause()
    resetToEntryPosition()
  }

  function jumpToExit() {
    pause()
    if (fills.value.length === 0) return
    const lastFillTime = fills.value[fills.value.length - 1].time
    seek(barIndexContaining(lastFillTime))
  }

  const currentBar = computed(() => bars.value[cursor.value] || null)

  const liveBar = computed(() => {
    if (!currentBar.value) return null
    if (isSteppedMode.value || barProgress.value >= 1) return currentBar.value
    return interpolateBar(currentBar.value, barProgress.value)
  })

  const currentTime = computed(() => {
    if (!currentBar.value) return null
    if (isSteppedMode.value) return currentBar.value.time
    const offsetSec = barElapsedMs.value >= barSpanMs.value
      ? Math.max(0, barSpan.value - 1)
      : Math.floor(barElapsedMs.value / 1000)
    return currentBar.value.time + offsetSec
  })

  const progress = computed(() =>
    bars.value.length > 1 ? cursor.value / (bars.value.length - 1) : 0
  )

  // Fills that have executed as of the current replay clock.
  // When a bar is complete (barProgress >= 1, e.g. scrubbed/stepped), include all fills
  // through the end of the bar; during live intra-bar playback, trigger fills on the exact second.
  const executedFills = computed(() => {
    if (!currentBar.value) return []
    const next = bars.value[cursor.value + 1]
    const barEnd = next ? next.time : currentBar.value.time + barSpan.value
    if (isSteppedMode.value || barProgress.value >= 1) {
      return fills.value.filter((fill) => fill.time < barEnd)
    }
    const cutoff = Math.min(barEnd, (currentTime.value ?? currentBar.value.time) + 1)
    return fills.value.filter((fill) => fill.time < cutoff)
  })

  // Market price at the exact moment a fill executed. For intraday real-time playback,
  // always derive this deterministically from fill.time inside its containing bar so the
  // unrealized P&L basis stays continuous across bar rollovers, pauses, and scrubs.
  // In bar-step / daily mode, mark against the containing bar's close.
  // Realized P&L always uses the true fill prices.
  function marketPriceAtFill(fill) {
    const list = bars.value
    if (list.length === 0) return fill.price
    const candidate = list[barIndexContaining(fill.time)]
    if (!isSteppedMode.value) {
      const span = barSpan.value
      const fillProgress = span > 0 ? Math.max(0, Math.min(1, (fill.time - candidate.time) / span)) : 1
      return Number(interpolateBar(candidate, fillProgress).close)
    }
    return Number(candidate.close)
  }

  /**
   * Running position and P&L from executed fills. Average-cost accounting;
   * works symmetrically for short positions (negative signed position).
   * Realized P&L is marked between fill prices (the trader's truth);
   * unrealized P&L is marked between market prices (the chart's truth).
   */
  const stats = computed(() => {
    const multiplier = Number(trade.value?.multiplier) || 1
    let position = 0
    let avgCost = 0
    let avgMarketCost = 0
    let realized = 0

    for (const fill of executedFills.value) {
      const qty = fill.action === 'buy' ? fill.quantity : -fill.quantity
      const marketPrice = marketPriceAtFill(fill)
      if (position === 0 || Math.sign(qty) === Math.sign(position)) {
        // Opening or adding: update average costs
        const newPosition = position + qty
        if (newPosition !== 0) {
          avgCost = (avgCost * Math.abs(position) + fill.price * Math.abs(qty)) / Math.abs(newPosition)
          avgMarketCost = (avgMarketCost * Math.abs(position) + marketPrice * Math.abs(qty)) / Math.abs(newPosition)
        } else {
          avgCost = 0
          avgMarketCost = 0
        }
        position = newPosition
      } else {
        // Reducing or flipping
        const closingQty = Math.min(Math.abs(qty), Math.abs(position))
        realized += (fill.price - avgCost) * closingQty * Math.sign(position) * multiplier
        position += qty
        if (Math.sign(position) === Math.sign(qty) && position !== 0) {
          // Flipped through zero: remainder opens at fill price
          avgCost = fill.price
          avgMarketCost = marketPrice
        } else if (position === 0) {
          avgCost = 0
          avgMarketCost = 0
        }
      }
    }

    const markPrice = liveBar.value ? Number(liveBar.value.close) : null
    const unrealized = position !== 0 && markPrice !== null
      ? (markPrice - avgMarketCost) * Math.abs(position) * Math.sign(position) * multiplier
      : 0
    const total = realized + unrealized

    let rMultiple = null
    const entryPrice = Number(trade.value?.entry_price)
    const stopLoss = Number(trade.value?.stop_loss)
    const quantity = Number(trade.value?.quantity)
    if (trade.value?.stop_loss != null && Number.isFinite(stopLoss) && Number.isFinite(entryPrice) && entryPrice !== stopLoss && quantity > 0) {
      const totalRisk = Math.abs(entryPrice - stopLoss) * quantity * multiplier
      if (totalRisk > 0) rMultiple = total / totalRisk
    }

    return {
      position,
      avg_cost: position !== 0 ? avgCost : null,
      realized_pnl: realized,
      unrealized_pnl: unrealized,
      total_pnl: total,
      r_multiple: rMultiple
    }
  })

  const atEnd = computed(() =>
    loaded.value && cursor.value >= bars.value.length - 1 && barProgress.value >= 1
  )

  if (getCurrentInstance()) {
    onUnmounted(stopTimer)
  }

  return {
    bars,
    fills,
    trade,
    resolution,
    cursor,
    barProgress,
    playing,
    speed,
    loaded,
    load,
    play,
    pause,
    toggle,
    seek,
    stepForward,
    stepBack,
    setSpeed,
    jumpToEntry,
    jumpToExit,
    currentBar,
    liveBar,
    currentTime,
    progress,
    executedFills,
    stats,
    atEnd,
    SPEED_OPTIONS
  }
}
