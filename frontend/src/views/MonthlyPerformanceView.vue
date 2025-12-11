<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Monthly Performance</h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Compare your trading performance month-by-month
          </p>
        </div>

        <div class="mt-4 sm:mt-0 flex items-center gap-3">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Year:</label>
          <select v-model="selectedYear" @change="loadMonthlyData" class="input text-sm">
            <option v-for="year in availableYears" :key="year" :value="year">
              {{ year }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="error" class="card p-8 text-center">
      <p class="text-danger mb-4">{{ error }}</p>
      <button @click="loadMonthlyData" class="btn-primary">Retry</button>
    </div>

    <div v-else class="space-y-6">
      <!-- Year Summary -->
      <div class="card">
        <div class="card-body">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-6">{{ selectedYear }} Year Summary</h2>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ yearTotals.trades.total.toLocaleString() }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">Total Trades</div>
            </div>

            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-2xl font-bold" :class="yearTotals.metrics.winRate >= 50 ? 'text-success' : 'text-danger'">
                {{ formatPercentage(yearTotals.metrics.winRate) }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">Win Rate</div>
            </div>

            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-2xl font-bold" :class="getPnLClass(yearTotals.pnl.total)">
                {{ formatCurrency(yearTotals.pnl.total) }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">Total P&L</div>
            </div>

            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-2xl font-bold" :class="getRValueClass(yearTotals.metrics.totalRValue)">
                {{ formatNumber(yearTotals.metrics.totalRValue, 2) }}R
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">Total R</div>
            </div>

            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-2xl font-bold text-success">
                {{ formatCurrency(yearTotals.pnl.best) }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">Best Trade</div>
            </div>

            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-2xl font-bold text-danger">
                {{ formatCurrency(yearTotals.pnl.worst) }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">Worst Trade</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Monthly Performance Table -->
      <div class="card">
        <div class="card-body">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-6">Month-by-Month Breakdown</h2>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Month</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Trades</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Wins</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Losses</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Win Rate</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total P&L</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Avg P&L</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Avg Win</th>
                  <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Avg Loss</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Avg R</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total R</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Days</th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="month in monthlyData" :key="month.month"
                    :class="month.trades.total === 0 ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-700'">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200">
                      {{ month.monthName }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900 dark:text-white">
                    {{ month.trades.total || '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span v-if="month.trades.wins > 0" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      {{ month.trades.wins }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span v-if="month.trades.losses > 0" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      {{ month.trades.losses }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span v-if="month.trades.total > 0"
                          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          :class="getWinRateBadgeClass(month.metrics.winRate)">
                      {{ formatPercentage(month.metrics.winRate) }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold" :class="month.trades.total > 0 ? getPnLClass(month.pnl.total) : 'text-gray-400'">
                    {{ month.trades.total > 0 ? formatCurrency(month.pnl.total) : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm" :class="month.trades.total > 0 ? getPnLClass(month.pnl.average) : 'text-gray-400'">
                    {{ month.trades.total > 0 ? formatCurrency(month.pnl.average) : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-success">
                    {{ month.trades.wins > 0 ? formatCurrency(month.pnl.avgWin) : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-danger">
                    {{ month.trades.losses > 0 ? formatCurrency(month.pnl.avgLoss) : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-primary-600">
                    {{ month.metrics.avgRValue !== 0 ? formatNumber(month.metrics.avgRValue, 2) + 'R' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold" :class="month.trades.total > 0 ? getRValueClass(month.metrics.totalRValue) : 'text-gray-400'">
                    {{ month.trades.total > 0 && month.metrics.totalRValue !== 0 ? formatNumber(month.metrics.totalRValue, 2) + 'R' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span v-if="month.metrics.tradingDays > 0" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {{ month.metrics.tradingDays }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card">
          <div class="card-body">
            <div class="flex items-center justify-between mb-4">
              <h3 class="heading-card">
                Monthly {{ showRValue ? 'R-Value' : 'P&L' }} Trend
              </h3>
              <button
                @click="toggleRValue"
                class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
                :class="showRValue
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'"
              >
                {{ showRValue ? 'Show P&L ($)' : 'Show R-Value' }}
              </button>
            </div>
            <div class="h-80">
              <canvas ref="pnlChartCanvas" id="pnl-chart"></canvas>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Win Rate by Month</h3>
            <div class="h-80">
              <canvas ref="winRateChartCanvas" id="winrate-chart"></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick, watch } from 'vue';
import { useTradesStore } from '@/stores/trades';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const tradesStore = useTradesStore();

const loading = ref(false);
const error = ref(null);

// Load saved year from localStorage, or default to current year
const getSavedYear = () => {
  const saved = localStorage.getItem('monthlyPerformanceYear');
  if (saved) {
    const year = parseInt(saved);
    const currentYear = new Date().getFullYear();
    // Validate year is reasonable (within 10 years of current)
    if (!isNaN(year) && year >= currentYear - 10 && year <= currentYear) {
      return year;
    }
  }
  return new Date().getFullYear();
};

const selectedYear = ref(getSavedYear());
const monthlyData = ref([]);
const yearTotals = ref({
  trades: { total: 0, wins: 0, losses: 0, breakeven: 0 },
  pnl: { total: 0, best: 0, worst: 0, avgMonthly: 0 },
  metrics: { winRate: 0, avgRValue: 0, totalRValue: 0 }
});

const showRValue = ref(false);

const pnlChartCanvas = ref(null);
const winRateChartCanvas = ref(null);
let pnlChartInstance = null;
let winRateChartInstance = null;

const availableYears = computed(() => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < 5; i++) {
    years.push(currentYear - i);
  }
  return years;
});

// Computed property for total R-values per month
const monthlyTotalRValues = computed(() => {
  return monthlyData.value.map(month => {
    // Use the correct totalRValue from backend (which is SUM of r_value)
    return month.metrics.totalRValue;
  });
});

// Watch for year changes and save to localStorage
watch(selectedYear, (newYear) => {
  localStorage.setItem('monthlyPerformanceYear', newYear.toString());
});

const toggleRValue = () => {
  showRValue.value = !showRValue.value;
  createPnLChart();
};

const loadMonthlyData = async () => {
  loading.value = true;
  error.value = null;

  try {
    const response = await tradesStore.getMonthlyPerformance(selectedYear.value);
    console.log('[MONTHLY] Response received:', response);

    if (response) {
      monthlyData.value = response.monthly || [];
      yearTotals.value = response.yearTotals || {
        trades: { total: 0, wins: 0, losses: 0, breakeven: 0 },
        pnl: { total: 0, best: 0, worst: 0, avgMonthly: 0 },
        metrics: { winRate: 0, avgRValue: 0, totalRValue: 0 }
      };

      console.log('[MONTHLY] Data loaded - months:', monthlyData.value.length);

      // Wait for DOM to update
      await nextTick();
      setTimeout(() => {
        console.log('[CHARTS] Rendering charts after timeout');
        renderCharts();
      }, 100);
    }
  } catch (err) {
    console.error('[ERROR] Failed to load monthly performance:', err);
    error.value = 'Failed to load monthly performance data. Please try again.';
  } finally {
    loading.value = false;
  }
};

const renderCharts = () => {
  console.log('[CHARTS] renderCharts called');
  console.log('[CHARTS] Canvas refs:', {
    pnl: !!pnlChartCanvas.value,
    winRate: !!winRateChartCanvas.value
  });
  console.log('[CHARTS] Data length:', monthlyData.value.length);

  if (monthlyData.value.length > 0) {
    createPnLChart();
    createWinRateChart();
  } else {
    console.warn('[CHARTS] No data available for charts');
  }
};

const createPnLChart = () => {
  if (!pnlChartCanvas.value) {
    console.error('[CHARTS] P&L canvas element not found!');
    return;
  }

  console.log('[CHARTS] Creating chart... showRValue:', showRValue.value);

  // Destroy existing chart
  if (pnlChartInstance) {
    pnlChartInstance.destroy();
  }

  const ctx = pnlChartCanvas.value.getContext('2d');
  const labels = monthlyData.value.map(m => m.monthName.trim().substring(0, 3));

  // Use R-values or P&L based on toggle
  const data = showRValue.value
    ? monthlyTotalRValues.value
    : monthlyData.value.map(m => m.pnl.total);

  const colors = data.map(value => {
    if (value > 0) return 'rgba(16, 185, 129, 0.8)'; // green
    if (value < 0) return 'rgba(239, 68, 68, 0.8)'; // red
    return 'rgba(156, 163, 175, 0.8)'; // gray
  });

  console.log('[CHARTS] Chart data:', { labels, data, showRValue: showRValue.value });

  pnlChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: showRValue.value ? 'Monthly R-Value' : 'Monthly P&L',
        data,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8', '1')),
        borderWidth: 2,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => showRValue.value
              ? `R-Value: ${context.raw.toFixed(2)}R`
              : `P&L: ${formatCurrency(context.raw)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => showRValue.value
              ? `${value.toFixed(1)}R`
              : formatCurrency(value, true)
          }
        }
      }
    }
  });

  console.log('[CHARTS] Chart created successfully');
};

const createWinRateChart = () => {
  if (!winRateChartCanvas.value) {
    console.error('[CHARTS] Win Rate canvas element not found!');
    return;
  }

  console.log('[CHARTS] Creating Win Rate chart...');

  // Destroy existing chart
  if (winRateChartInstance) {
    winRateChartInstance.destroy();
  }

  const ctx = winRateChartCanvas.value.getContext('2d');
  const labels = monthlyData.value.map(m => m.monthName.trim().substring(0, 3));
  const data = monthlyData.value.map(m => m.metrics.winRate);

  console.log('[CHARTS] Win Rate data:', { labels, data });

  winRateChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Win Rate %',
        data,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => `Win Rate: ${context.raw.toFixed(1)}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: (value) => `${value}%`
          }
        }
      }
    }
  });

  console.log('[CHARTS] Win Rate chart created successfully');
};

// Formatting helpers
const formatCurrency = (value, compact = false) => {
  if (value === null || value === undefined) return '-';

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (compact && absValue >= 1000) {
    const formatted = absValue >= 1000000
      ? `${(absValue / 1000000).toFixed(1)}M`
      : `${(absValue / 1000).toFixed(1)}K`;
    return `${sign}$${formatted}`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const formatPercentage = (value) => {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
};

const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined) return '-';
  return value.toFixed(decimals);
};

const getPnLClass = (value) => {
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-danger';
  return 'text-gray-500';
};

const getWinRateBadgeClass = (value) => {
  if (value >= 60) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (value >= 50) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
};

const getRValueClass = (value) => {
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-danger';
  return 'text-gray-500';
};

onMounted(() => {
  console.log('[MONTHLY] Component mounted');
  loadMonthlyData();
});
</script>
