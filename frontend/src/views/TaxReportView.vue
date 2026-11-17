<template>
  <div class="content-wrapper py-8">
    <!-- Header -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="heading-page">Tax Report</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Realized gains and losses for a tax year, laid out for Form 8949 and Schedule D.
        </p>
      </div>
      <div v-if="yearOptions.length > 0" class="flex items-center gap-3">
        <label for="tax-year" class="text-sm font-medium text-gray-700 dark:text-gray-300">Tax year</label>
        <div class="w-28 text-sm">
          <BaseSelect id="tax-year" v-model="selectedYear" :options="yearOptions" :searchable="false" />
        </div>
      </div>
    </div>

    <div v-if="loading && !report" class="flex justify-center py-12">
      <div class="spinner spinner-lg"></div>
    </div>

    <div v-else-if="loadError" class="callout-danger" data-testid="tax-error">
      {{ loadError }}
      <button type="button" class="btn-link ml-2" @click="loadReport">Try again</button>
    </div>

    <!-- No closed trades in any year -->
    <div v-else-if="report && yearOptions.length === 0" class="py-16 text-center" data-testid="tax-empty">
      <h3 class="heading-sub">Nothing to report yet</h3>
      <p class="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
        The tax report fills in once you have closed trades. Import or log trades and come back.
      </p>
      <router-link to="/import" class="btn-primary mt-6 inline-flex">Import trades</router-link>
    </div>

    <div v-else-if="report" class="space-y-6">
      <div class="callout-info" data-testid="tax-disclaimer">
        This is an estimate built from your journal, not a tax document. File from your broker's Form 1099-B,
        and use this report to preview the year, check the 1099-B, and catch wash sales across accounts that
        no single broker can see. It is not tax advice.
      </div>

      <!-- Headline figures -->
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="card-dense">
          <div class="card-dense-body">
            <div class="text-label">Net gain or loss</div>
            <div class="stat-value mt-1" :class="toneClass(summary.netGainLoss)" data-testid="tax-net">
              {{ signedMoney(summary.netGainLoss) }}
            </div>
            <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ report.year }}, all categories</div>
          </div>
        </div>
        <div class="card-dense">
          <div class="card-dense-body">
            <div class="text-label">Short-term</div>
            <div class="stat-value mt-1" :class="toneClass(summary.shortTerm.gainLoss)">
              {{ signedMoney(summary.shortTerm.gainLoss) }}
            </div>
            <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ countLabel(summary.shortTerm.count, 'sale') }}</div>
          </div>
        </div>
        <div class="card-dense">
          <div class="card-dense-body">
            <div class="text-label">Long-term</div>
            <div class="stat-value mt-1" :class="toneClass(summary.longTerm.gainLoss)">
              {{ signedMoney(summary.longTerm.gainLoss) }}
            </div>
            <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ countLabel(summary.longTerm.count, 'sale') }}</div>
          </div>
        </div>
        <div class="card-dense">
          <div class="card-dense-body">
            <div class="text-label">Wash sale losses disallowed</div>
            <div class="stat-value mt-1 text-gray-900 dark:text-white" data-testid="tax-wash">
              {{ money(summary.washSales.disallowed) }}
            </div>
            <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ countLabel(summary.washSales.count, 'sale') }} adjusted</div>
          </div>
        </div>
      </div>

      <!-- Schedule D style totals -->
      <div class="card-dense">
        <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 class="heading-card">Totals for Schedule D</h2>
        </div>
        <!-- Phones: one block per category so the gain is never off-screen. -->
        <ul class="divide-y divide-gray-200 dark:divide-gray-700 sm:hidden" data-testid="tax-totals-mobile">
          <li v-for="line in totalLines" :key="line.label" class="px-4 py-3">
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ line.label }}</span>
              <span class="text-mono-num text-sm font-medium" :class="toneClass(line.gainLoss)">{{ signedMoney(line.gainLoss) }}</span>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ line.note }}</div>
            <dl v-if="!line.netOnly" class="text-mono-num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
              <div class="flex justify-between gap-2"><dt class="text-gray-500 dark:text-gray-400">Proceeds</dt><dd>{{ money(line.proceeds) }}</dd></div>
              <div class="flex justify-between gap-2"><dt class="text-gray-500 dark:text-gray-400">Basis</dt><dd>{{ money(line.costBasis) }}</dd></div>
              <div v-if="line.adjustments" class="flex justify-between gap-2"><dt class="text-gray-500 dark:text-gray-400">Adjustments</dt><dd>{{ money(line.adjustments) }}</dd></div>
            </dl>
          </li>
        </ul>
        <div class="hidden overflow-x-auto sm:block">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700" data-testid="tax-totals">
            <thead class="table-head">
              <tr>
                <th class="table-th px-4 py-2 text-left">Category</th>
                <th class="table-th px-4 py-2 text-right">Proceeds</th>
                <th class="table-th px-4 py-2 text-right">Cost basis</th>
                <th class="table-th px-4 py-2 text-right">Adjustments</th>
                <th class="table-th px-4 py-2 text-right">Gain or loss</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <tr v-for="line in totalLines" :key="line.label">
                <td class="px-4 py-3">
                  <div class="font-medium text-gray-900 dark:text-white">{{ line.label }}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">{{ line.note }}</div>
                </td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ line.netOnly ? '—' : money(line.proceeds) }}</td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ line.netOnly ? '—' : money(line.costBasis) }}</td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                  {{ line.adjustments ? money(line.adjustments) : '—' }}
                </td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-right font-medium" :class="toneClass(line.gainLoss)">
                  {{ signedMoney(line.gainLoss) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="summary.section1256.count > 0"
          class="border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
          data-testid="tax-1256"
        >
          Futures are section 1256 contracts, reported on Form 6781 and not on Form 8949. Of the
          {{ signedMoney(summary.section1256.gainLoss) }} net, 60% ({{ signedMoney(summary.section1256.longTermPortion) }})
          is treated as long-term and 40% ({{ signedMoney(summary.section1256.shortTermPortion) }}) as short-term.
        </p>
      </div>

      <!-- Things left out or estimated -->
      <div v-if="notices.length > 0" class="callout-warning" data-testid="tax-notices">
        <ul class="list-disc space-y-1 pl-5">
          <li v-for="notice in notices" :key="notice">{{ notice }}</li>
        </ul>
      </div>

      <!-- Export -->
      <div class="card-dense">
        <div class="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 class="heading-card">Export {{ report.year }}</h2>
        </div>
        <!-- Free plans see the whole report; the files are the Pro part. -->
        <div v-if="showProLock" class="card-dense-body" data-testid="tax-export-locked">
          <ProUpgradePrompt
            variant="compact"
            :description="`Download ${report.year} as a TurboTax file or a Form 8949 CSV, wash sale adjustments included, with TradeTally Pro.`"
          />
        </div>
        <div v-else class="card-dense-body space-y-4">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div class="sm:w-80">
              <label for="tax-box" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                How your broker reported these sales
              </label>
              <BaseSelect id="tax-box" v-model="exportBox" :options="boxOptions" :searchable="false" />
            </div>
            <div class="flex flex-wrap gap-3">
              <button
                type="button"
                class="btn-primary"
                :disabled="exporting !== null || !hasAnyRows"
                data-testid="tax-export-txf"
                @click="downloadExport('txf')"
              >
                {{ exporting === 'txf' ? 'Preparing…' : 'TurboTax file (.txf)' }}
              </button>
              <button
                type="button"
                class="btn-secondary"
                :disabled="exporting !== null || !hasAnyRows"
                data-testid="tax-export-csv"
                @click="downloadExport('csv')"
              >
                {{ exporting === 'csv' ? 'Preparing…' : 'Form 8949 CSV' }}
              </button>
            </div>
          </div>
          <p v-if="exportError" class="text-sm text-red-600 dark:text-red-400">{{ exportError }}</p>
          <details class="text-sm text-gray-600 dark:text-gray-400">
            <summary class="cursor-pointer font-medium text-gray-700 dark:text-gray-300">Importing into TurboTax</summary>
            <div class="mt-2 space-y-2">
              <p>
                The .txf file works with TurboTax Desktop (also H&amp;R Block and TaxAct desktop software): choose
                File, then Import, then From Accounting Software, and pick the file. Each sale arrives as its own
                Form 8949 line, with wash sale adjustments included.
              </p>
              <p>
                TurboTax Online does not read .txf files. There, enter the short-term and long-term totals from
                the table above as summary entries, and keep the CSV as the supporting statement.
              </p>
              <p>Futures totals are not in either file. Enter the section 1256 figure on Form 6781.</p>
            </div>
          </details>
        </div>
      </div>

      <!-- Form 8949 lines -->
      <div class="card-dense">
        <div class="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
          <h2 class="heading-card">Form 8949 lines</h2>
          <div class="segmented" role="group" aria-label="Filter sales">
            <button
              v-for="option in rowFilters"
              :key="option.value"
              type="button"
              class="segment"
              :class="rowFilter === option.value ? 'segment-active' : ''"
              :aria-pressed="rowFilter === option.value"
              @click="rowFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div v-if="report.rows.length === 0" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {{ rowFilter === 'all' ? `No stock, option or crypto sales in ${report.year}.` : 'No sales match this filter.' }}
        </div>
        <ul
          v-if="report.rows.length > 0"
          class="divide-y divide-gray-200 dark:divide-gray-700 sm:hidden"
          :class="loading ? 'opacity-60' : ''"
          data-testid="tax-rows-mobile"
        >
          <li v-for="(row, index) in report.rows" :key="`m-${row.tradeId}-${index}`" class="px-4 py-3">
            <div class="flex items-baseline justify-between gap-3">
              <router-link
                :to="`/trades/${row.tradeId}`"
                class="min-w-0 truncate text-sm font-medium text-primary-700 hover:text-primary-500 dark:text-primary-400"
              >
                {{ row.description }}
              </router-link>
              <span class="text-mono-num shrink-0 text-sm font-medium" :class="toneClass(row.gainLoss)">{{ signedMoney(row.gainLoss) }}</span>
            </div>
            <div class="text-mono-num mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{{ usDate(row.dateAcquired) }} to {{ usDate(row.dateSold) }}</span>
              <span>{{ row.term === 'long' ? 'Long-term' : 'Short-term' }}</span>
              <span v-if="row.side === 'short'" class="badge-neutral">Short sale</span>
              <span v-if="row.approximate" class="badge-warning">Estimated</span>
            </div>
            <div class="text-mono-num mt-1 text-xs text-gray-700 dark:text-gray-300">
              {{ money(row.proceeds) }} proceeds, {{ money(row.costBasis) }} basis<template v-if="row.adjustmentCode">, {{ money(row.adjustmentAmount) }} wash sale</template>
            </div>
          </li>
        </ul>
        <div v-if="report.rows.length > 0" class="hidden overflow-x-auto sm:block" :class="loading ? 'opacity-60' : ''">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700" data-testid="tax-rows">
            <thead class="table-head">
              <tr>
                <th class="table-th px-4 py-2 text-left">Description</th>
                <th class="table-th px-4 py-2 text-left">Acquired</th>
                <th class="table-th px-4 py-2 text-left">Sold</th>
                <th class="table-th px-4 py-2 text-right">Proceeds</th>
                <th class="table-th px-4 py-2 text-right">Cost basis</th>
                <th class="table-th px-4 py-2 text-right">Adjustment</th>
                <th class="table-th px-4 py-2 text-right">Gain or loss</th>
                <th class="table-th px-4 py-2 text-left">Term</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <tr
                v-for="(row, index) in report.rows"
                :key="`${row.tradeId}-${index}`"
                class="hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                <td class="whitespace-nowrap px-4 py-3">
                  <router-link
                    :to="`/trades/${row.tradeId}`"
                    class="font-medium text-primary-700 hover:text-primary-500 dark:text-primary-400"
                  >
                    {{ row.description }}
                  </router-link>
                  <span v-if="row.side === 'short'" class="badge-neutral ml-2">Short sale</span>
                  <span
                    v-if="row.approximate"
                    class="badge-warning ml-2"
                    title="The fills or dates on this trade did not add up, so it is shown as one line from the trade totals."
                  >
                    Estimated
                  </span>
                </td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">{{ usDate(row.dateAcquired) }}</td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">{{ usDate(row.dateSold) }}</td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ money(row.proceeds) }}</td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">{{ money(row.costBasis) }}</td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                  <template v-if="row.adjustmentCode">
                    <span class="badge-neutral mr-1.5" title="Wash sale: this much of the loss is disallowed and moved into the replacement's cost basis.">W</span>{{ money(row.adjustmentAmount) }}
                  </template>
                  <template v-else>—</template>
                </td>
                <td class="text-mono-num whitespace-nowrap px-4 py-3 text-right font-medium" :class="toneClass(row.gainLoss)">
                  {{ signedMoney(row.gainLoss) }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">{{ row.term === 'long' ? 'Long' : 'Short' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="report.pagination.totalPages > 1"
          class="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-700"
        >
          <span class="text-gray-500 dark:text-gray-400">
            {{ pageStart }}–{{ pageEnd }} of {{ report.pagination.totalRows.toLocaleString('en-US') }}
          </span>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary btn-sm" :disabled="page <= 1 || loading" @click="page -= 1">Previous</button>
            <button type="button" class="btn-secondary btn-sm" :disabled="page >= report.pagination.totalPages || loading" @click="page += 1">Next</button>
          </div>
        </div>
      </div>

      <!-- Method -->
      <details class="card-dense">
        <summary class="cursor-pointer px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
          How this is calculated, and what it leaves out
        </summary>
        <div class="space-y-3 border-t border-gray-200 px-4 py-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
          <p>
            <span class="font-medium text-gray-900 dark:text-white">Lots.</span>
            Within each trade, closing fills are matched to opening fills first in, first out. Commissions and
            fees on a purchase are added to cost basis; those on a sale reduce proceeds. Dates use your account
            timezone ({{ report.timezone }}).
          </p>
          <p>
            <span class="font-medium text-gray-900 dark:text-white">Wash sales.</span>
            A loss is disallowed when the same stock or the same option contract is bought within 30 days
            before or after the sale, in any of your accounts. The disallowed loss moves into the cost basis of
            the replacement, so it comes back when that position is sold. Lines marked W show the amount.
          </p>
          <p>
            <span class="font-medium text-gray-900 dark:text-white">Short sales</span>
            are reported in the year they are closed, as short-term.
            <span class="font-medium text-gray-900 dark:text-white">Crypto</span>
            is listed on Form 8949 but is not subject to wash sale rules.
          </p>
          <p>
            <span class="font-medium text-gray-900 dark:text-white">Not handled.</span>
            Options are not matched against their underlying stock for wash sales, and a replacement's holding
            period is not extended by the lot it replaced. Open futures are not marked to market at year end.
            Trader tax status with a section 475 election, corporate actions, option exercise and assignment,
            dividends and interest are outside this report. Your broker's 1099-B covers what they report;
            a tax professional covers the rest.
          </p>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'
import { useProAccess } from '@/composables/useProAccess'
import api from '@/services/api'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'

const PAGE_SIZE = 100

const { selectedAccount } = useGlobalAccountFilter()
const { showProLock } = useProAccess()

const report = ref(null)
const loading = ref(false)
const loadError = ref(null)
const selectedYear = ref(null)
const rowFilter = ref('all')
const page = ref(1)
const exportBox = ref('A')
const exporting = ref(null)
const exportError = ref(null)
// The server picks the year on the first load; this stops that answer from
// triggering a second, identical request.
let settingYearFromServer = false
let requestId = 0

const rowFilters = [
  { value: 'all', label: 'All' },
  { value: 'short', label: 'Short-term' },
  { value: 'long', label: 'Long-term' },
  { value: 'wash', label: 'Wash sales' }
]

const boxOptions = [
  { value: 'A', label: 'On a 1099-B, with cost basis' },
  { value: 'B', label: 'On a 1099-B, without cost basis' },
  { value: 'C', label: 'Not on a 1099-B' }
]

const summary = computed(() => report.value?.summary)
const yearOptions = computed(() => report.value?.availableYears || [])
const hasAnyRows = computed(() => (summary.value?.shortTerm.count || 0) + (summary.value?.longTerm.count || 0) > 0)

const totalLines = computed(() => {
  const s = summary.value
  if (!s) return []
  const lines = [
    { label: 'Short-term', note: 'Form 8949 Part I. Held one year or less.', ...s.shortTerm },
    { label: 'Long-term', note: 'Form 8949 Part II. Held more than one year.', ...s.longTerm }
  ]
  if (s.section1256.count > 0) {
    // Form 6781 takes the net result only; there are no proceeds or basis columns to fill.
    lines.push({ label: 'Futures (section 1256)', note: 'Form 6781. Net result only.', gainLoss: s.section1256.gainLoss, netOnly: true })
  }
  return lines
})

const notices = computed(() => {
  const excluded = report.value?.excluded || {}
  const list = []
  if (excluded.approximated > 0) {
    list.push(`${countLabel(excluded.approximated, 'line')} marked Estimated: the fills or dates on those trades did not add up, so each is reported as a single sale from the trade totals.`)
  }
  if (excluded.otherCurrency > 0) {
    list.push(`${countLabel(excluded.otherCurrency, 'closed trade')} in a currency other than US dollars ${excluded.otherCurrency === 1 ? 'is' : 'are'} left out.`)
  }
  if (excluded.missingMultiplier > 0) {
    list.push(`${countLabel(excluded.missingMultiplier, 'futures trade')} with no point value ${excluded.missingMultiplier === 1 ? 'is' : 'are'} left out. Set the contract multiplier on the trade to include it.`)
  }
  if (excluded.unusable > 0) {
    list.push(`${countLabel(excluded.unusable, 'trade')} could not be read (missing prices, quantities or dates) and ${excluded.unusable === 1 ? 'is' : 'are'} left out.`)
  }
  return list
})

const pageStart = computed(() => (report.value.pagination.page - 1) * report.value.pagination.pageSize + 1)
const pageEnd = computed(() => pageStart.value + report.value.rows.length - 1)

// Tax figures are US dollar amounts whatever the display currency is set to.
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function money(value) {
  return usd.format(Number(value) || 0)
}

function signedMoney(value) {
  const amount = Number(value) || 0
  if (amount > 0) return `+${usd.format(amount)}`
  if (amount < 0) return `-${usd.format(Math.abs(amount))}`
  return usd.format(0)
}

function toneClass(value) {
  const amount = Number(value) || 0
  if (amount > 0) return 'text-green-700 dark:text-green-400'
  if (amount < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-900 dark:text-white'
}

function countLabel(count, noun) {
  const n = Number(count) || 0
  return `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`
}

function usDate(isoDate) {
  if (!isoDate) return '—'
  const [year, month, day] = isoDate.split('-')
  return `${month}/${day}/${year}`
}

function requestParams() {
  const params = {}
  if (selectedYear.value) params.year = selectedYear.value
  if (selectedAccount.value) params.accounts = selectedAccount.value
  return params
}

async function loadReport() {
  const id = ++requestId
  loading.value = true
  loadError.value = null
  try {
    const params = { ...requestParams(), page: page.value, pageSize: PAGE_SIZE }
    if (rowFilter.value === 'wash') params.washOnly = 'true'
    else if (rowFilter.value !== 'all') params.term = rowFilter.value

    const response = await api.get('/tax-report', { params })
    if (id !== requestId) return
    report.value = response.data
    if (selectedYear.value !== response.data.year) {
      settingYearFromServer = true
      selectedYear.value = response.data.year
    }
  } catch (error) {
    if (id !== requestId) return
    loadError.value = error.response?.data?.message || error.response?.data?.error || 'The tax report could not be loaded.'
  } finally {
    if (id === requestId) loading.value = false
  }
}

async function downloadExport(format) {
  exporting.value = format
  exportError.value = null
  try {
    const response = await api.get('/tax-report/export', {
      params: { ...requestParams(), format, box: exportBox.value },
      responseType: 'blob'
    })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `tradetally-form-8949-${selectedYear.value}.${format}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    exportError.value = 'The export could not be created. Please try again.'
  } finally {
    exporting.value = null
  }
}

// Changing the year also resets the filter and the page; coalesce those into
// one request.
let loadQueued = false
function scheduleLoad() {
  if (loadQueued) return
  loadQueued = true
  nextTick(() => {
    loadQueued = false
    loadReport()
  })
}

watch(selectedYear, () => {
  if (settingYearFromServer) {
    settingYearFromServer = false
    return
  }
  page.value = 1
  rowFilter.value = 'all'
  scheduleLoad()
})

watch(rowFilter, () => {
  page.value = 1
  scheduleLoad()
})

watch(page, scheduleLoad)

watch(selectedAccount, () => {
  page.value = 1
  scheduleLoad()
})

onMounted(loadReport)
</script>
