<template>
  <div class="w-full h-full">
    <canvas ref="chartCanvas"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'
import { format } from 'date-fns'

Chart.register(...registerables)

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  label: {
    type: String,
    default: 'Count'
  },
  color: {
    type: String,
    default: '#3B82F6'
  },
  dataKey: {
    type: String,
    default: 'count'
  },
  dateKey: {
    type: String,
    default: 'date'
  },
  showArea: {
    type: Boolean,
    default: true
  }
})

const chartCanvas = ref(null)
let chart = null

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function createChart() {
  if (chart) {
    chart.destroy()
  }

  if (!chartCanvas.value || !props.data || props.data.length === 0) {
    return
  }

  const isDark = document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#E5E7EB' : '#374151'
  const gridColor = isDark ? '#374151' : '#E5E7EB'

  const ctx = chartCanvas.value.getContext('2d')

  const labels = props.data.map(d => {
    const date = new Date(d[props.dateKey])
    return format(date, 'MMM dd')
  })

  const values = props.data.map(d => d[props.dataKey] || 0)

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: props.label,
          data: values,
          borderColor: props.color,
          backgroundColor: props.showArea ? hexToRgba(props.color, 0.1) : 'transparent',
          tension: 0.4,
          fill: props.showArea,
          pointRadius: 3,
          pointHoverRadius: 5
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
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
          titleColor: isDark ? '#E5E7EB' : '#374151',
          bodyColor: isDark ? '#E5E7EB' : '#374151',
          borderColor: isDark ? '#374151' : '#E5E7EB',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColor,
            maxRotation: 45,
            minRotation: 0
          },
          grid: {
            color: gridColor,
            display: false
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: textColor,
            precision: 0
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
  if (props.data && props.data.length > 0) {
    createChart()
  }
})

onUnmounted(() => {
  if (chart) {
    chart.destroy()
    chart = null
  }
})

watch(() => props.data, () => {
  createChart()
}, { deep: true })

// Watch for dark mode changes
const observer = new MutationObserver(() => {
  if (props.data && props.data.length > 0) {
    createChart()
  }
})

onMounted(() => {
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })
})

onUnmounted(() => {
  observer.disconnect()
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
