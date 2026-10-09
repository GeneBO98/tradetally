<template>
  <canvas ref="canvas"></canvas>
</template>

<script setup>
// Daily win-rate + P/L-ratio chart (mixed bar + line) for the dashboard's
// win-rate-chart section. Owns its full Chart.js lifecycle; data comes in via
// props and day clicks are emitted up for navigation.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Chart } from '@/lib/chartSetup'
import { formatTradeDate } from '@/utils/date'

const props = defineProps({
  dailyWinRate: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select-date'])

const canvas = ref(null)
let chartInstance = null

function renderChart() {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
  if (!canvas.value) return

  const ctx = canvas.value.getContext('2d')
  const winRateData = props.dailyWinRate || []

  // Color each bar by its win rate using four discrete bands:
  //   <40%      red    — meaningfully losing day
  //   40–50%    orange — slightly underwater
  //   50–60%    yellow — barely profitable
  //   ≥60%      green  — solid winning day
  const barColorPair = pct => {
    const v = parseFloat(pct) || 0
    if (v >= 60) return { fill: 'rgba(22, 163, 74, 0.7)',  border: '#16a34a' }  // green-600
    if (v >= 50) return { fill: 'rgba(234, 179, 8, 0.7)',  border: '#eab308' }  // yellow-500
    if (v >= 40) return { fill: 'rgba(240, 129, 42, 0.7)', border: '#F0812A' }  // primary orange
    return         { fill: 'rgba(220, 38, 38, 0.7)',  border: '#dc2626' }       // red-600
  }
  const winRateColors = winRateData.map(d => barColorPair(d.win_rate))

  // Cap P/L ratio display at 5.0 so a single outsized day doesn't squash
  // the rest of the scale. Tooltips still show the true value.
  const PL_DISPLAY_CAP = 5
  const rawPlRatios = winRateData.map(d => parseFloat(d.pl_ratio) || 0)
  const cappedPlRatios = rawPlRatios.map(v => Math.min(v, PL_DISPLAY_CAP))

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: winRateData.map(d => formatTradeDate(d.trade_date, 'MMM dd')),
      datasets: [
        {
          label: 'Win Rate (%)',
          data: winRateData.map(d => parseFloat(d.win_rate) || 0),
          backgroundColor: winRateColors.map(c => c.fill),
          borderColor: winRateColors.map(c => c.border),
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'P/L Ratio',
          data: cappedPlRatios,
          showLine: false,
          pointStyle: 'line',
          pointRadius: 8,
          pointHoverRadius: 10,
          pointBorderColor: '#3f3f46',  // zinc-700
          pointBorderWidth: 2,
          yAxisID: 'yPL'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          emit('select-date', winRateData[index].trade_date)
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.dataset.label === 'P/L Ratio') {
                const raw = rawPlRatios[context.dataIndex] || 0
                if (raw >= 999) return ' P/L Ratio: ∞ (no losses)'
                if (raw > PL_DISPLAY_CAP) return ` P/L Ratio: ${raw.toFixed(2)} (capped at ${PL_DISPLAY_CAP} on chart)`
                return ` P/L Ratio: ${raw.toFixed(2)}`
              }
              return ` Win Rate: ${(parseFloat(context.raw) || 0).toFixed(1)}%`
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          position: 'left',
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            callback: function(value) {
              return value + '%'
            }
          },
          title: {
            display: true,
            text: 'Win Rate'
          }
        },
        yPL: {
          beginAtZero: true,
          max: PL_DISPLAY_CAP,
          position: 'right',
          grid: { display: false },
          ticks: {
            callback: function(value) {
              return value === PL_DISPLAY_CAP ? `${value}+` : value
            }
          },
          title: {
            display: true,
            text: 'P/L Ratio'
          }
        },
        x: {
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          }
        }
      }
    }
  })
}

onMounted(renderChart)
watch(() => props.dailyWinRate, renderChart, { deep: true })
onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>
