<template>
  <div class="content-wrapper py-8">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <router-link to="/metrics" class="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">Back to analytics</router-link>
        <h1 class="heading-page mt-2">Allocation report</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Proportional results for your private allocation groups. Normal analytics and tags are unchanged.
        </p>
      </div>
      <router-link to="/settings" class="btn-secondary">Manage allocation groups</router-link>
    </div>

    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="!enabled" class="card">
      <div class="card-body py-12 text-center">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Trade allocations are not enabled</h2>
        <p class="mx-auto mt-2 max-w-lg text-sm text-gray-500 dark:text-gray-400">
          This optional accounting tool can be enabled from the collapsed Optional accounting tools section in Trading settings.
        </p>
        <router-link to="/settings" class="btn-primary mt-5 inline-flex">Open settings</router-link>
      </div>
    </div>

    <div v-else class="relative space-y-8">
      <div v-if="loading" class="absolute right-0 top-0 z-10 flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90">
        <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
        <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
      </div>

      <div v-if="groups.length === 0" class="card">
        <div class="card-body py-12 text-center">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">No allocation groups yet</h2>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Create at least two groups before allocating trades.</p>
          <router-link to="/settings" class="btn-primary mt-5 inline-flex">Create groups</router-link>
        </div>
      </div>

      <template v-else>
        <div class="flex justify-end">
          <div class="w-full sm:w-64">
            <label for="allocation-report-group" class="label">Allocation group</label>
            <select id="allocation-report-group" v-model="selectedGroupId" class="input">
              <option value="">All groups</option>
              <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
          </div>
        </div>

        <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article class="card">
            <div class="card-body">
              <div class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Allocated P&amp;L</div>
              <div class="mt-2 text-2xl font-semibold" :class="totalPnl >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatCurrency(totalPnl) }}</div>
            </div>
          </article>
          <article class="card">
            <div class="card-body">
              <div class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Groups</div>
              <div class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ visibleGroups.length }}</div>
            </div>
          </article>
          <article class="card">
            <div class="card-body">
              <div class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Allocated trades</div>
              <div class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ visibleAllocatedTradeCount }}</div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Distinct trades across all groups</p>
            </div>
          </article>
          <article class="card">
            <div class="card-body">
              <div class="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Not allocated</div>
              <div class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ unallocatedTradeCount }}</div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">These remain in normal analytics</p>
            </div>
          </article>
        </section>

        <section class="card">
          <div class="card-body">
            <div class="mb-5">
              <h2 class="heading-card">Group performance</h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Each trade is counted once in every group participating in its split; monetary totals are proportional.</p>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr class="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <th class="px-3 py-3">Group</th>
                    <th class="px-3 py-3 text-right">Trades</th>
                    <th class="px-3 py-3 text-right">Win rate</th>
                    <th class="px-3 py-3 text-right">Commission &amp; fees</th>
                    <th class="px-3 py-3 text-right">P&amp;L</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr v-for="group in visibleGroups" :key="group.id">
                    <td class="px-3 py-4">
                      <div class="flex items-center gap-2">
                        <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: group.color }"></span>
                        <span class="font-medium text-gray-900 dark:text-white">{{ group.name }}</span>
                        <span v-if="group.archived_at" class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">Archived</span>
                      </div>
                    </td>
                    <td class="px-3 py-4 text-right text-sm text-gray-700 dark:text-gray-300">{{ group.trade_count }}</td>
                    <td class="px-3 py-4 text-right text-sm text-gray-700 dark:text-gray-300">{{ winRate(group) }}</td>
                    <td class="px-3 py-4 text-right text-sm text-gray-700 dark:text-gray-300">{{ formatCurrency(Number(group.allocated_commission) + Number(group.allocated_fees)) }}</td>
                    <td class="px-3 py-4 text-right text-sm font-semibold" :class="Number(group.allocated_pnl) >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatCurrency(Number(group.allocated_pnl)) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section v-if="monthlyRows.length > 0" class="card">
          <div class="card-body">
            <h2 class="heading-card">Monthly allocation history</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">A compact reconciliation view of allocated P&amp;L by month.</p>
            <div class="mt-5 overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr class="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <th class="px-3 py-3">Month</th>
                    <th v-for="group in visibleGroups" :key="group.id" class="px-3 py-3 text-right">{{ group.name }}</th>
                    <th class="px-3 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr v-for="row in monthlyRows" :key="row.month">
                    <td class="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900 dark:text-white">{{ formatMonth(row.month) }}</td>
                    <td v-for="group in visibleGroups" :key="group.id" class="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-700 dark:text-gray-300">{{ formatCurrency(row.values[group.id] || 0) }}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-right text-sm font-semibold" :class="row.total >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatCurrency(row.total) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api from '@/services/api'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'

const { formatCurrency } = useCurrencyFormatter()
const { selectedAccount } = useGlobalAccountFilter()

const loading = ref(true)
const initialLoading = ref(true)
const enabled = ref(false)
const groups = ref([])
const monthly = ref([])
const selectedGroupId = ref('')
const allocatedTradeCount = ref(0)
const unallocatedTradeCount = ref(0)

const visibleGroups = computed(() => selectedGroupId.value
  ? groups.value.filter((group) => group.id === selectedGroupId.value)
  : groups.value)
const totalPnl = computed(() => visibleGroups.value.reduce((sum, group) => sum + Number(group.allocated_pnl || 0), 0))
const visibleAllocatedTradeCount = computed(() => selectedGroupId.value
  ? Number(visibleGroups.value[0]?.trade_count || 0)
  : allocatedTradeCount.value)

const monthlyRows = computed(() => {
  const byMonth = new Map()
  for (const item of monthly.value) {
    if (selectedGroupId.value && item.allocation_group_id !== selectedGroupId.value) continue
    const key = String(item.month).slice(0, 10)
    if (!byMonth.has(key)) byMonth.set(key, { month: key, values: {}, total: 0 })
    const row = byMonth.get(key)
    const value = Number(item.allocated_pnl || 0)
    row.values[item.allocation_group_id] = value
    row.total += value
  }
  return Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month))
})

function winRate(group) {
  const wins = Number(group.winning_trades || 0)
  const losses = Number(group.losing_trades || 0)
  const count = wins + losses
  return count > 0 ? `${((wins / count) * 100).toFixed(1)}%` : '—'
}

function formatMonth(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

async function fetchData() {
  loading.value = true
  try {
    const settingsResponse = await api.get('/settings')
    enabled.value = settingsResponse.data?.settings?.tradeAllocationsEnabled === true
    if (!enabled.value) return
    const params = {}
    if (selectedAccount.value) params.accounts = selectedAccount.value
    const response = await api.get('/trade-allocations/summary', { params })
    groups.value = response.data.groups || []
    monthly.value = response.data.monthly || []
    allocatedTradeCount.value = Number(response.data.allocated_trade_count || 0)
    unallocatedTradeCount.value = Number(response.data.unallocated_trade_count || 0)
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

watch(selectedAccount, () => {
  console.log('[ALLOCATION-REPORT] Global account filter changed to:', selectedAccount.value || 'All Accounts')
  fetchData()
})

onMounted(fetchData)
</script>
