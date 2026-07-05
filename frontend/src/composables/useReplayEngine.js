import { ref, computed, onUnmounted } from 'vue'

/**
 * Client-side trade replay engine.
 *
 * Holds the pre-fetched bars and normalized fills from /api/replay and steps a
 * cursor through the bars on a timer. All derived state (open position,
 * running P&L, R-multiple) is computed from fills whose time has passed the
 * cursor. Rendering is left to the caller: watch `cursor` and feed bars to the
 * chart.
 *
 * All times are epoch seconds UTC, matching the backend payload.
 */

const SPEED_OPTIONS = [1, 2, 5, 10, 30]
const BASE_BAR_INTERVAL_MS = 700

export function useReplayEngine() {
  const bars = ref([])
  const fills = ref([])
  const trade = ref(null)
  const cursor = ref(0)
  const playing = ref(false)
  const speed = ref(5)
  const loaded = ref(false)

  let timer = null

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function startTimer() {
    stopTimer()
    timer = setInterval(() => {
      if (cursor.value >= bars.value.length - 1) {
        pause()
        return
      }
      cursor.value += 1
    }, BASE_BAR_INTERVAL_MS / speed.value)
  }

  function load(payload) {
    stopTimer()
    bars.value = payload.candles || []
    fills.value = payload.fills || []
    trade.value = payload.trade || null
    playing.value = false
    loaded.value = bars.value.length > 0
    // Start a few bars before the first fill so the entry doesn't happen
    // off-screen immediately.
    cursor.value = Math.max(0, firstFillBarIndex() - 10)
  }

  function firstFillBarIndex() {
    if (fills.value.length === 0 || bars.value.length === 0) return 0
    const firstFillTime = fills.value[0].time
    const index = bars.value.findIndex((bar) => bar.time >= firstFillTime)
    return index === -1 ? bars.value.length - 1 : index
  }

  function barIndexAtOrAfter(time) {
    const index = bars.value.findIndex((bar) => bar.time >= time)
    return index === -1 ? bars.value.length - 1 : index
  }

  function play() {
    if (!loaded.value) return
    if (cursor.value >= bars.value.length - 1) {
      cursor.value = Math.max(0, firstFillBarIndex() - 10)
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
    seek(Math.max(0, firstFillBarIndex() - 5))
  }

  function jumpToExit() {
    pause()
    if (fills.value.length === 0) return
    const lastFillTime = fills.value[fills.value.length - 1].time
    seek(barIndexAtOrAfter(lastFillTime))
  }

  const currentBar = computed(() => bars.value[cursor.value] || null)
  const currentTime = computed(() => currentBar.value ? currentBar.value.time : null)
  const progress = computed(() =>
    bars.value.length > 1 ? cursor.value / (bars.value.length - 1) : 0
  )

  // Fills that have "happened" as of the cursor. A fill belongs to the bar
  // covering its timestamp, so include fills up to the END of the current bar.
  // Bar span is derived from the data so this works for both 1-min bars and
  // the daily degraded mode.
  const barSpan = computed(() => {
    if (bars.value.length < 2) return 60
    return Math.max(1, bars.value[1].time - bars.value[0].time)
  })

  const executedFills = computed(() => {
    if (!currentBar.value) return []
    const next = bars.value[cursor.value + 1]
    const barEnd = next ? next.time : currentBar.value.time + barSpan.value
    return fills.value.filter((fill) => fill.time < barEnd)
  })

  // Market price at the moment a fill executed (close of the bar containing
  // it). Used as the basis for unrealized P&L so the running number tracks
  // actual market movement even when the user's fill prices don't sit inside
  // the chart data (different execution venue, adjusted data, demo trades).
  // Realized P&L always uses the true fill prices.
  function marketPriceAtFill(fill) {
    const list = bars.value
    if (list.length === 0) return fill.price
    let candidate = list[0]
    for (const bar of list) {
      if (bar.time > fill.time) break
      candidate = bar
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

    const markPrice = currentBar.value ? Number(currentBar.value.close) : null
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

  const atEnd = computed(() => loaded.value && cursor.value >= bars.value.length - 1)

  onUnmounted(stopTimer)

  return {
    bars,
    fills,
    trade,
    cursor,
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
    currentTime,
    progress,
    executedFills,
    stats,
    atEnd,
    SPEED_OPTIONS
  }
}
