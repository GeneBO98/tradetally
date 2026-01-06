<template>
  <div>
    <!-- SEC EDGAR Quick Links -->
    <div class="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h4 class="text-sm font-medium text-gray-900 dark:text-white">SEC EDGAR Filings</h4>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            View official SEC filings for {{ symbol }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a
            v-if="secEdgar10KUrl"
            :href="secEdgar10KUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
          >
            View 10-K Filings
            <svg class="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <a
            v-if="secEdgar10QUrl"
            :href="secEdgar10QUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/30"
          >
            View 10-Q Filings
            <svg class="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <a
            v-if="secEdgarCompanyUrl"
            :href="secEdgarCompanyUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            All Filings
            <svg class="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>

    <!-- Filings List -->
    <div v-if="filings && filings.length > 0" class="space-y-3">
      <div
        v-for="filing in filings"
        :key="`${filing.formType}-${filing.fiscalYear}-${filing.fiscalPeriod}`"
        class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      >
        <!-- Filing Header -->
        <div
          @click="toggleFiling(filing)"
          class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          <div class="flex items-center space-x-4">
            <!-- Form Type Badge -->
            <span
              :class="[
                'px-2 py-1 text-xs font-bold rounded',
                filing.formType === '10-K'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              ]"
            >
              {{ filing.formType }}
            </span>

            <!-- Filing Info -->
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">
                {{ filing.formType === '10-K' ? 'Annual Report' : 'Quarterly Report' }}
                - {{ filing.fiscalYear }} {{ filing.fiscalPeriod !== 'FY' ? filing.fiscalPeriod : '' }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Filed: {{ formatDate(filing.filedDate) }}
              </p>
            </div>
          </div>

          <div class="flex items-center space-x-3">
            <!-- SEC Link -->
            <a
              v-if="filing.secEdgarUrl"
              :href="filing.secEdgarUrl"
              target="_blank"
              rel="noopener noreferrer"
              @click.stop
              class="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
              title="View on SEC EDGAR"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            <!-- Expand Icon -->
            <svg
              :class="['w-5 h-5 text-gray-400 transition-transform', isExpanded(filing) ? 'rotate-180' : '']"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <!-- Expanded Content -->
        <div
          v-if="isExpanded(filing)"
          class="px-4 py-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700"
        >
          <h5 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-3">Key Financial Highlights</h5>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Revenue</p>
              <p class="text-sm font-medium text-gray-900 dark:text-white">
                {{ formatLargeNumber(filing.highlights?.revenue) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Net Income</p>
              <p
                :class="[
                  'text-sm font-medium',
                  getValueClass(filing.highlights?.netIncome)
                ]"
              >
                {{ formatLargeNumber(filing.highlights?.netIncome) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Total Assets</p>
              <p class="text-sm font-medium text-gray-900 dark:text-white">
                {{ formatLargeNumber(filing.highlights?.totalAssets) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Total Equity</p>
              <p class="text-sm font-medium text-gray-900 dark:text-white">
                {{ formatLargeNumber(filing.highlights?.totalEquity) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Operating Cash Flow</p>
              <p
                :class="[
                  'text-sm font-medium',
                  getValueClass(filing.highlights?.operatingCashFlow)
                ]"
              >
                {{ formatLargeNumber(filing.highlights?.operatingCashFlow) }}
              </p>
            </div>
          </div>

          <!-- Direct Link to Full Filing -->
          <div v-if="filing.secEdgarUrl" class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <a
              :href="filing.secEdgarUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center"
            >
              View full {{ filing.formType }} filing on SEC EDGAR
              <svg class="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- No Filings State -->
    <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p class="mt-2">No SEC filings available</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { format } from 'date-fns'

defineProps({
  filings: {
    type: Array,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  secEdgarCompanyUrl: {
    type: String,
    default: null
  },
  secEdgar10KUrl: {
    type: String,
    default: null
  },
  secEdgar10QUrl: {
    type: String,
    default: null
  }
})

const expandedFilings = ref(new Set())

function toggleFiling(filing) {
  const key = `${filing.formType}-${filing.fiscalYear}-${filing.fiscalPeriod}`
  if (expandedFilings.value.has(key)) {
    expandedFilings.value.delete(key)
  } else {
    expandedFilings.value.add(key)
  }
}

function isExpanded(filing) {
  const key = `${filing.formType}-${filing.fiscalYear}-${filing.fiscalPeriod}`
  return expandedFilings.value.has(key)
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A'
  try {
    return format(new Date(dateStr), 'MMM d, yyyy')
  } catch {
    return dateStr
  }
}

function formatLargeNumber(value) {
  if (value === null || value === undefined) return '-'
  const absValue = Math.abs(value)
  const isNegative = value < 0
  const prefix = isNegative ? '(' : ''
  const suffix = isNegative ? ')' : ''

  if (absValue >= 1e12) return `${prefix}$${(absValue / 1e12).toFixed(2)}T${suffix}`
  if (absValue >= 1e9) return `${prefix}$${(absValue / 1e9).toFixed(2)}B${suffix}`
  if (absValue >= 1e6) return `${prefix}$${(absValue / 1e6).toFixed(2)}M${suffix}`
  if (absValue >= 1e3) return `${prefix}$${(absValue / 1e3).toFixed(2)}K${suffix}`
  return `${prefix}$${absValue.toFixed(0)}${suffix}`
}

function getValueClass(value) {
  if (value === null || value === undefined) return 'text-gray-900 dark:text-white'
  return value >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'
}
</script>
