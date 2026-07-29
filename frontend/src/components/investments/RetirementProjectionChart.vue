<template>
  <div class="relative h-full w-full">
    <canvas
      ref="chartCanvas"
      role="img"
      aria-label="Retirement balance projection chart"
    ></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Chart } from '@/lib/chartSetup'

const props = defineProps({
  scenarios: {
    type: Array,
    default: () => []
  },
  targetInTodayDollars: {
    type: Number,
    default: 0
  },
  inflationRatePercent: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'USD'
  }
})

const chartCanvas = ref(null)
let chart = null

function compactCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: props.currency,
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value) || 0)
}

function createChart() {
  if (!chartCanvas.value || props.scenarios.length === 0) return
  chart?.destroy()

  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#D1D5DB' : '#374151'
  const gridColor = isDark ? 'rgba(75, 85, 99, 0.32)' : 'rgba(209, 213, 219, 0.65)'
  const primaryColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-primary-500').trim() || '#F0812A'
  const historicalColors = ['#64748B', '#0F766E', '#7C3AED']
  const longestTimeline = props.scenarios.reduce(
    (longest, scenario) => scenario.timeline?.length > longest.length ? scenario.timeline : longest,
    []
  )
  const labels = longestTimeline.map(point => `Age ${point.age}`)
  const datasets = props.scenarios.map((scenario, index) => ({
    label: scenario.label,
    data: scenario.timeline.map(point => point.balance),
    borderColor: scenario.source === 'custom'
      ? primaryColor
      : historicalColors[(index - 1 + historicalColors.length) % historicalColors.length],
    backgroundColor: 'transparent',
    borderWidth: scenario.source === 'custom' ? 3 : 2,
    borderDash: scenario.source === 'custom' ? [] : [6, 5],
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.24
  }))
  const inflationRate = (Number(props.inflationRatePercent) || 0) / 100

  datasets.push({
    label: 'Portfolio goal (amount needed)',
    data: longestTimeline.map(point => props.targetInTodayDollars * ((1 + inflationRate) ** point.year)),
    borderColor: isDark ? '#FCA5A5' : '#DC2626',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderDash: [3, 4],
    pointRadius: 0,
    tension: 0
  })

  chart = new Chart(chartCanvas.value.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            boxWidth: 24,
            padding: 18,
            usePointStyle: false
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${compactCurrency(context.raw)}`
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColor,
            maxTicksLimit: 8
          },
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            color: textColor,
            callback: compactCurrency
          },
          grid: {
            color: gridColor
          },
          beginAtZero: true
        }
      }
    }
  })
}

onMounted(createChart)

watch(
  () => [props.scenarios, props.targetInTodayDollars, props.inflationRatePercent, props.currency],
  createChart,
  { deep: true }
)

onBeforeUnmount(() => {
  chart?.destroy()
  chart = null
})
</script>
