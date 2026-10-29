<template>
  <div class="overflow-hidden">
    <!-- Results Count and Sort -->
    <div class="flex items-center justify-between mb-4">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        <span class="font-medium text-gray-900 dark:text-white">{{ pagination.total }}</span>
        {{ pagination.total === 1 ? 'stock' : 'stocks' }} match{{ pagination.total === 1 ? 'es' : '' }} criteria
        <span
          v-if="hiddenOutdatedRows > 0"
          class="text-gray-400 dark:text-gray-500"
          title="These stocks were scanned with an older 8 Pillars formula and would not match their detail pages. They return after the next scan."
        >
          ({{ hiddenOutdatedRows.toLocaleString() }} older results hidden until the rescan)
        </span>
      </p>

      <div class="flex items-center space-x-2">
        <label class="text-sm text-gray-500 dark:text-gray-400">Sort by:</label>
        <div class="w-44">
          <BaseSelect
            :model-value="sortBy"
            @change="handleSortChange"
            :options="[
              { value: 'pillars_passed', label: 'Pillars Passed' },
              { value: 'symbol', label: 'Symbol' },
              { value: 'company_name', label: 'Company' },
              { value: 'current_price', label: 'Price' },
              { value: 'market_cap', label: 'Market Cap' },
            ]"
          />
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Symbol
            </th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden sm:table-cell">
              Company
            </th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Price
            </th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Pass
            </th>
            <!-- Pillar columns -->
            <th
              v-for="pillar in 8"
              :key="pillar"
              class="px-2 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hidden lg:table-cell"
              :title="pillarNames[pillar]"
            >
              {{ pillar }}
            </th>
          </tr>
        </thead>
        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          <tr
            v-for="stock in results"
            :key="stock.symbol"
            @click="viewStock(stock.symbol)"
            class="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
          >
            <td class="px-4 py-3 whitespace-nowrap">
              <div class="flex items-center gap-2">
                <StockLogo
                  :symbol="stock.symbol"
                  :logo-url="stock.logo"
                  size-class="w-8 h-8"
                />
                <span class="text-sm font-medium text-primary-600 dark:text-primary-400">
                  {{ stock.symbol }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
              <span class="text-sm text-gray-900 dark:text-white truncate max-w-[200px] block">
                {{ stock.companyName || '-' }}
              </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
              <span class="text-sm text-gray-900 dark:text-white">
                {{ formatPrice(stock.currentPrice) }}
              </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-center">
              <span
                :class="[
                  'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium',
                  getPillarsPassedClass(stock.pillarsPassed)
                ]"
              >
                {{ stock.pillarsPassed }}/8
              </span>
            </td>
            <!-- Pillar pass/fail indicators -->
            <td
              v-for="pillar in 8"
              :key="pillar"
              class="px-2 py-3 text-center hidden lg:table-cell"
            >
              <span
                v-if="stock.pillars[pillar]?.pass"
                class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30"
              >
                <svg class="w-3 h-3 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </span>
              <span
                v-else
                class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30"
              >
                <svg class="w-3 h-3 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="pagination.totalPages > 1" class="mt-4 flex items-center justify-between">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Page {{ pagination.page }} of {{ pagination.totalPages }}
      </p>
      <div class="flex items-center space-x-2">
        <button
          @click="goToPage(pagination.page - 1)"
          :disabled="pagination.page <= 1"
          class="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Previous
        </button>
        <button
          @click="goToPage(pagination.page + 1)"
          :disabled="pagination.page >= pagination.totalPages"
          class="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Next
        </button>
      </div>
    </div>

    <!-- Empty State: results hidden because they came from an outdated formula -->
    <div v-if="results.length === 0 && !loading && outdatedResultsHidden" class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <p class="mt-2 text-gray-900 dark:text-white font-medium">
        {{ isScanRunning ? 'Recalculating scan results' : 'Scan results are outdated' }}
      </p>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        <template v-if="isScanRunning">
          The 8 Pillars formula changed since the last scan. Results reappear here as each stock is recalculated.
        </template>
        <template v-else>
          The 8 Pillars formula changed since the last scan, so its results no longer match
          what you see on a stock's page. A fresh scan runs automatically at the next daily check.
        </template>
      </p>
    </div>

    <!-- Empty State -->
    <div v-else-if="results.length === 0 && !loading" class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p class="mt-2 text-gray-500 dark:text-gray-400">
        No stocks match your selected criteria
      </p>
      <button
        @click="clearFilters"
        class="mt-3 text-primary-600 dark:text-primary-400 hover:underline text-sm"
      >
        Clear all filters
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useScannerStore } from '@/stores/scanner'
import StockLogo from '@/components/common/StockLogo.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'

const router = useRouter()
const scannerStore = useScannerStore()

const results = computed(() => scannerStore.scanResults)
const pagination = computed(() => scannerStore.pagination)
const loading = computed(() => scannerStore.loading)
const sortBy = computed(() => scannerStore.sortBy)
const pillarNames = scannerStore.pillarNames
const isScanRunning = computed(() => scannerStore.isScanRunning)
const hiddenOutdatedRows = computed(() => scannerStore.scanInfo?.hiddenOutdatedRows || 0)
// True when the latest scan has rows but they were all hidden as outdated
// (older CALCULATION_VERSION) and no pillar filter is narrowing the list.
const outdatedResultsHidden = computed(() =>
  hiddenOutdatedRows.value > 0 &&
  pagination.value.total === 0 &&
  scannerStore.selectedPillars.length === 0
)

function handleSortChange(value) {
  scannerStore.setSort(value)
  scannerStore.fetchResults(1)
}

function goToPage(page) {
  scannerStore.goToPage(page)
}

function clearFilters() {
  scannerStore.clearFilters()
  scannerStore.fetchResults(1)
}

function viewStock(symbol) {
  router.push({ name: 'stock-analysis', params: { symbol }, query: { from: 'scanner' } })
}

function formatPrice(price) {
  if (!price) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(price)
}

function getPillarsPassedClass(count) {
  if (count >= 7) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
  if (count >= 5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
}
</script>
