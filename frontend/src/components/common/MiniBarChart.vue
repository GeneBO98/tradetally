<template>
  <!-- Diverging mini bar chart: one bar per value, drawn above a zero line
       for positive values and below it for negative ones. The zero line
       floats based on the positive/negative range so bars use the full
       height. When `fill` is set the SVG stretches to its container; the
       viewBox width tracks the measured pixel width so bars stay crisp and
       undistorted at any size (same approach as the sparkline it replaced). -->
  <svg
    ref="svgEl"
    :width="fill ? '100%' : width"
    :height="height"
    :viewBox="`0 0 ${renderWidth} ${height}`"
    preserveAspectRatio="none"
    role="img"
    aria-hidden="true"
    class="block"
  >
    <line
      v-if="bars.length"
      x1="0"
      :x2="renderWidth"
      :y1="zeroY"
      :y2="zeroY"
      stroke="currentColor"
      stroke-width="1"
      vector-effect="non-scaling-stroke"
      class="text-gray-300 dark:text-gray-600"
    />
    <rect
      v-for="(b, i) in bars"
      :key="i"
      :x="b.x"
      :y="b.y"
      :width="b.w"
      :height="b.h"
      :rx="b.rx"
      :fill="b.color"
    >
      <title v-if="labels[i]">{{ labels[i] }}</title>
    </rect>
  </svg>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  // Array of numbers; positive values draw up, negative draw down.
  values: {
    type: Array,
    required: true,
    default: () => []
  },
  // Optional per-bar tooltip strings (parallel to `values`).
  labels: {
    type: Array,
    default: () => []
  },
  width: {
    type: Number,
    default: 120
  },
  height: {
    type: Number,
    default: 36
  },
  positiveColor: {
    type: String,
    default: '#16a34a'
  },
  negativeColor: {
    type: String,
    default: '#dc2626'
  },
  neutralColor: {
    type: String,
    default: '#9ca3af'
  },
  // Fraction of each bar's slot left as gap between bars.
  gap: {
    type: Number,
    default: 0.35
  },
  // When true the SVG stretches horizontally to fill its container.
  fill: {
    type: Boolean,
    default: true
  }
})

// Track the rendered width so the viewBox maps 1:1 to pixels (no stretch).
const svgEl = ref(null)
const measuredWidth = ref(props.width)
let resizeObserver = null

onMounted(() => {
  if (!props.fill || !svgEl.value) return
  const update = () => {
    const w = svgEl.value?.clientWidth
    if (w && w > 0) measuredWidth.value = w
  }
  update()
  resizeObserver = new ResizeObserver(update)
  resizeObserver.observe(svgEl.value)
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

const renderWidth = computed(() => (props.fill ? measuredWidth.value : props.width))

const PAD = 2
const MIN_BAR = 1 // keep tiny/breakeven days visible

const nums = computed(() => props.values.map(v => Number(v)).filter(v => Number.isFinite(v)))

// Where the zero baseline sits, and how much height each sign gets. The line
// floats so the larger of the two directions uses its full share of height.
const layout = computed(() => {
  const vals = nums.value
  const drawableH = props.height - PAD * 2
  if (vals.length === 0) {
    return { maxPos: 0, maxNeg: 0, posH: drawableH / 2, negH: drawableH / 2, zeroY: PAD + drawableH / 2 }
  }
  const maxPos = vals.reduce((m, v) => (v > m ? v : m), 0)
  const maxNeg = vals.reduce((m, v) => (-v > m ? -v : m), 0)
  const range = maxPos + maxNeg || 1
  const posH = (maxPos / range) * drawableH
  return { maxPos, maxNeg, posH, negH: drawableH - posH, zeroY: PAD + posH }
})

const zeroY = computed(() => layout.value.zeroY)

const bars = computed(() => {
  const vals = nums.value
  const n = vals.length
  if (n === 0) return []

  const w = renderWidth.value
  const slot = w / n
  const barW = Math.max(1, slot * (1 - props.gap))
  const { maxPos, maxNeg, posH, negH, zeroY: zy } = layout.value

  return vals.map((v, i) => {
    const x = i * slot + (slot - barW) / 2
    let y
    let h
    let color
    if (v > 0) {
      h = maxPos > 0 ? Math.max(MIN_BAR, (v / maxPos) * posH) : MIN_BAR
      y = zy - h
      color = props.positiveColor
    } else if (v < 0) {
      h = maxNeg > 0 ? Math.max(MIN_BAR, (-v / maxNeg) * negH) : MIN_BAR
      y = zy
      color = props.negativeColor
    } else {
      h = MIN_BAR
      y = zy - MIN_BAR / 2
      color = props.neutralColor
    }
    return { x, y, w: barW, h, color, rx: Math.min(1.5, barW / 2) }
  })
})
</script>
