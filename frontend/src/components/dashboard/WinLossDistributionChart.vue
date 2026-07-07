<template>
  <canvas ref="canvas"></canvas>
</template>

<script setup>
// Win/Loss distribution doughnut for the dashboard's (legacy) charts section.
// Owns its full Chart.js lifecycle; the surrounding card, center win-rate label
// and custom legend stay in the parent view. Summary comes in via props; a
// segment click ('profit' | 'loss' | 'breakeven') is emitted up for navigation.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Chart } from '@/lib/chartSetup'

const props = defineProps({
  summary: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['select-segment'])

const canvas = ref(null)
let chartInstance = null

function renderChart() {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
  if (!canvas.value) return

  const ctx = canvas.value.getContext('2d')
  const summary = props.summary || {}
  const isDark = document.documentElement.classList.contains('dark')

  const wins = parseInt(summary.winningTrades) || 0
  const losses = parseInt(summary.losingTrades) || 0
  const breakeven = parseInt(summary.breakevenTrades) || 0

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Wins', 'Losses', 'Breakeven'],
      datasets: [{
        data: [wins, losses, breakeven],
        backgroundColor: ['#10b981', '#ef4444', '#9ca3af'],
        hoverBackgroundColor: ['#34d399', '#f87171', '#b0b5bf'],
        borderWidth: 0,
        hoverOffset: 6,
        spacing: 4,
        borderRadius: 20
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      rotation: -90,
      circumference: 180,
      cutout: '72%',
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const clickedSegment = ['profit', 'loss', 'breakeven'][index]
          emit('select-segment', clickedSegment)
        }
      },
      animation: {
        animateRotate: true,
        duration: 800
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#374151' : '#1f2937',
          titleColor: '#f9fafb',
          bodyColor: '#d1d5db',
          borderColor: isDark ? '#4b5563' : '#374151',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          displayColors: true,
          boxPadding: 4,
          callbacks: {
            label: function(context) {
              const total = wins + losses + breakeven
              const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0
              return ` ${context.raw} trades (${pct}%)`
            }
          }
        }
      }
    }
  })
}

onMounted(renderChart)
watch(() => props.summary, renderChart, { deep: true })
onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>
