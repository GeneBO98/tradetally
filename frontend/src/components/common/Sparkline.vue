<template>
  <!-- When `fill` is set, the SVG stretches to its container's width via
       width="100%" while the viewBox keeps the path math intact and the
       preserveAspectRatio stretches the curve to fill. Otherwise the
       component renders at the fixed pixel size from props. -->
  <svg
    :width="fill ? '100%' : width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    :preserveAspectRatio="fill ? 'none' : 'xMidYMid meet'"
    role="img"
    aria-hidden="true"
    class="block"
  >
    <template v-if="points.length >= 2">
      <path
        v-if="fill"
        :d="areaPath"
        :fill="strokeColor"
        fill-opacity="0.12"
      />
      <path
        :d="linePath"
        fill="none"
        :stroke="strokeColor"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle
        v-if="showEndDot"
        :cx="points[points.length - 1].x"
        :cy="points[points.length - 1].y"
        :r="strokeWidth + 0.6"
        :fill="strokeColor"
      />
    </template>
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  values: {
    type: Array,
    required: true,
    default: () => []
  },
  width: {
    type: Number,
    default: 80
  },
  height: {
    type: Number,
    default: 24
  },
  strokeWidth: {
    type: Number,
    default: 1.5
  },
  // 'auto' picks green/red based on first vs last value.
  // Pass an explicit color string to override.
  color: {
    type: String,
    default: 'auto'
  },
  fill: {
    type: Boolean,
    default: true
  },
  showEndDot: {
    type: Boolean,
    default: true
  },
  // When true, the SVG stretches horizontally to fill its container; the
  // `width` prop still drives the viewBox aspect ratio.
  fill: {
    type: Boolean,
    default: false
  }
})

const strokeColor = computed(() => {
  if (props.color !== 'auto') return props.color
  if (props.values.length < 2) return '#9ca3af'
  const first = Number(props.values[0])
  const last = Number(props.values[props.values.length - 1])
  return last >= first ? '#16a34a' : '#dc2626'
})

const points = computed(() => {
  const vals = props.values.map(v => Number(v)).filter(v => Number.isFinite(v))
  if (vals.length < 2) return []

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const pad = props.strokeWidth + 0.5

  const drawableW = props.width - pad * 2
  const drawableH = props.height - pad * 2

  return vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * drawableW
    const y = pad + drawableH - ((v - min) / range) * drawableH
    return { x, y }
  })
})

const linePath = computed(() => {
  if (points.value.length < 2) return ''
  return points.value
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')
})

const areaPath = computed(() => {
  if (points.value.length < 2) return ''
  const baselineY = props.height
  const first = points.value[0]
  const last = points.value[points.value.length - 1]
  return [
    `M ${first.x.toFixed(2)} ${baselineY}`,
    `L ${first.x.toFixed(2)} ${first.y.toFixed(2)}`,
    ...points.value.slice(1).map(p => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
    `L ${last.x.toFixed(2)} ${baselineY}`,
    'Z'
  ].join(' ')
})
</script>
