<template>
  <div class="w-full h-full">
    <canvas ref="chartCanvas"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { Chart } from '@/lib/chartSetup'
import { format } from 'date-fns'
import { useDarkMode } from '@/composables/useDarkMode'

const { isDark: darkMode } = useDarkMode()

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  rValueMode: {
    type: Boolean,
    default: false
  }
})

const chartCanvas = ref(null)
let chart = null

// Put zero at the same height on both value axes so a daily bar and the
// cumulative line share one baseline instead of two unrelated scales.
// Each axis gets its own round tick step; both get the same number of
// steps above and below zero, so the ticks stay round and zero lines up.
// Returns [{ min, max, step }, { min, max, step }] (empty objects when an
// axis has no range).
function niceStep(span, targetTicks = 8) {
  const raw = span / targetTicks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / mag
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag
}
function alignedRanges(a, b) {
  const range = values => {
    const nums = values.map(Number).filter(Number.isFinite) // API values may be strings
    return { max: Math.max(0, ...nums), min: Math.min(0, ...nums) }
  }
  const A = range(a)
  const B = range(b)
  if (A.max - A.min === 0 || B.max - B.min === 0) return [{}, {}]
  const stepA = niceStep(A.max - A.min)
  const stepB = niceStep(B.max - B.min)
  const stepsUp = (v, s) => Math.ceil(v / s - 1e-9)
  const above = Math.max(stepsUp(A.max, stepA), stepsUp(B.max, stepB))
  const below = Math.max(stepsUp(-A.min, stepA), stepsUp(-B.min, stepB))
  return [
    { min: -below * stepA, max: above * stepA, step: stepA },
    { min: -below * stepB, max: above * stepB, step: stepB }
  ]
}

function createChart() {
  if (chart) {
    chart.destroy()
  }

  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#E5E7EB' : '#374151'
  const gridColor = isDark ? '#374151' : '#E5E7EB'

  const ctx = chartCanvas.value.getContext('2d')

  // Show the year once the series crosses a year boundary.
  const periods = props.data.map(d => new Date(d.period))
  const spansYears = periods.length > 1 && periods[0].getFullYear() !== periods[periods.length - 1].getFullYear()
  const labels = periods.map(d => format(d, spansYears ? "MMM dd ''yy" : 'MMM dd'))

  // Use R-value data if in R-value mode, otherwise use P&L data
  const dailyData = props.rValueMode
    ? props.data.map(d => d.r_value || 0)
    : props.data.map(d => d.pnl)

  const cumulativeData = props.rValueMode
    ? props.data.map(d => d.cumulative_r_value || 0)
    : props.data.map(d => d.cumulative_pnl)

  const dailyLabel = props.rValueMode ? 'Daily R-Multiple' : 'Daily P&L'
  const cumulativeLabel = props.rValueMode ? 'Cumulative R-Multiple' : 'Cumulative P&L'
  const [yRange, y1Range] = alignedRanges(dailyData, cumulativeData)

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: dailyLabel,
          data: dailyData,
          // Daily values are bars coloured by sign (green gain, red loss);
          // the cumulative line draws on top.
          type: 'bar',
          order: 2,
          backgroundColor: ctx => (ctx.parsed?.y ?? ctx.raw ?? 0) < 0 ? 'rgba(220, 38, 38, 0.85)' : 'rgba(21, 128, 61, 0.85)',
          borderWidth: 0,
          borderRadius: 2,
          yAxisID: 'y'
        },
        {
          label: cumulativeLabel,
          data: cumulativeData,
          borderColor: '#F0812A',
          backgroundColor: 'rgba(240, 129, 42, 0.08)',
          order: 1,
          pointRadius: labels.length > 60 ? 0 : 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: textColor
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColor
          },
          grid: {
            color: gridColor
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          min: yRange.min,
          max: yRange.max,
          title: { display: true, text: dailyLabel, color: textColor },
          ticks: {
            color: textColor,
            stepSize: yRange.step
          },
          grid: {
            color: gridColor
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          min: y1Range.min,
          max: y1Range.max,
          title: { display: true, text: cumulativeLabel, color: textColor },
          ticks: {
            color: textColor,
            stepSize: y1Range.step
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  })
}

onMounted(() => {
  if (props.data.length > 0) {
    createChart()
  }
})

watch(() => props.data, () => {
  if (props.data.length > 0) {
    createChart()
  }
}, { deep: true })

watch(() => props.rValueMode, () => {
  if (props.data.length > 0) {
    createChart()
  }
})

watch(darkMode, () => {
  if (props.data.length > 0) {
    createChart()
  }
})
</script>

<style scoped>
div {
  position: relative;
}

canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
</style>