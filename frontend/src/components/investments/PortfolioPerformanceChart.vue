<template>
  <div class="w-full h-full">
    <canvas ref="chartCanvas"></canvas>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { Chart, registerables } from 'chart.js'
import { formatTradeDate } from '@/utils/date'

Chart.register(...registerables)

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  benchmarkLabel: {
    type: String,
    default: 'SPY'
  }
})

const chartCanvas = ref(null)
let chart = null

function createChart() {
  if (!chartCanvas.value) return

  if (chart) {
    chart.destroy()
  }

  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#E5E7EB' : '#1F2937'
  const gridColor = isDark ? 'rgba(75, 85, 99, 0.35)' : 'rgba(209, 213, 219, 0.7)'

  const labels = props.data.map(point => formatTradeDate(point.date, 'MMM d'))
  const portfolioData = props.data.map(point => point.portfolioIndex)
  const benchmarkData = props.data.map(point => point.benchmarkIndex)

  chart = new Chart(chartCanvas.value.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Portfolio',
          data: portfolioData,
          borderColor: '#0F766E',
          backgroundColor: 'rgba(15, 118, 110, 0.14)',
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0.32
        },
        {
          label: props.benchmarkLabel,
          data: benchmarkData,
          borderColor: '#94A3B8',
          backgroundColor: 'rgba(148, 163, 184, 0.08)',
          borderWidth: 2,
          borderDash: [6, 6],
          fill: false,
          pointRadius: 0,
          tension: 0.24
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
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${Number(context.raw).toFixed(2)} index points`
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
            color: gridColor
          }
        },
        y: {
          title: {
            display: true,
            text: 'Indexed value (100 = period start)',
            color: textColor,
            font: {
              size: 12,
              weight: '500'
            }
          },
          ticks: {
            color: textColor,
            callback(value) {
              return Number(value).toFixed(0)
            }
          },
          grid: {
            color: gridColor
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
  } else if (chart) {
    chart.destroy()
    chart = null
  }
}, { deep: true })

watch(() => props.benchmarkLabel, () => {
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
