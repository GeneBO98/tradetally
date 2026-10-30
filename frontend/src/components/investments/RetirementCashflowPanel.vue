<template>
  <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
    <div v-if="!affordability || affordability.available === false" data-testid="cashflow-empty">
      <p class="text-sm font-semibold text-gray-900 dark:text-white">See what you can actually afford</p>
      <p class="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
        Link a bank account and TradeTally reads your income, spending, debt payments, and what you
        already set aside, then checks whether this plan fits.
      </p>
      <router-link
        to="/cashflow"
        class="mt-3 inline-flex items-center text-sm font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
      >
        Link a bank account
        <ArrowRightIcon class="ml-1.5 h-4 w-4" />
      </router-link>
    </div>

    <div v-else data-testid="cashflow-summary">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-gray-900 dark:text-white">Your cash flow, from linked accounts</p>
          <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Monthly averages over {{ cashflow.months_covered }}
            {{ cashflow.months_covered === 1 ? "month" : "months" }} ·
            {{ cashflow.transaction_count }} transactions
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 text-xs font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-50 dark:text-primary-300 dark:hover:text-primary-200"
          :disabled="loading"
          @click="$emit('refresh')"
        >
          {{ loading ? "Rebuilding..." : "Rebuild" }}
        </button>
      </div>

      <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt class="text-xs text-gray-500 dark:text-gray-400">Take-home income</dt>
          <dd class="font-semibold text-gray-950 dark:text-white">{{ money(cashflow.monthly.income) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 dark:text-gray-400">Spending</dt>
          <dd class="font-semibold text-gray-950 dark:text-white">{{ money(cashflow.monthly.spending) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 dark:text-gray-400">Debt payments</dt>
          <dd class="font-semibold text-gray-950 dark:text-white">{{ money(cashflow.monthly.debt_payments) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 dark:text-gray-400">Already saving</dt>
          <dd class="font-semibold text-gray-950 dark:text-white">{{ money(cashflow.monthly.savings) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 dark:text-gray-400">Left over</dt>
          <dd
            class="font-semibold"
            :class="cashflow.monthly.left_over < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-950 dark:text-white'"
          >
            {{ money(cashflow.monthly.left_over) }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 dark:text-gray-400">Could save</dt>
          <dd class="font-semibold text-primary-700 dark:text-primary-300">{{ money(cashflow.monthly.capacity) }}</dd>
        </div>
      </dl>

      <div
        v-if="!cashflow.income_detected"
        data-testid="no-income-notice"
        class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
      >
        <p class="font-semibold">No income found in your linked accounts.</p>
        <p class="mt-0.5">
          Without income the plan cannot tell what you could save. If your pay lands in another
          account, link it. If a deposit below is your pay, set its category to Income and every
          matching deposit is updated with it.
        </p>
      </div>

      <div v-if="cashflow.income_detected" class="mt-3 flex flex-wrap gap-2">
        <button
          v-if="suggestions.monthly_contribution_current_saving > 0"
          type="button"
          data-testid="use-current-saving"
          class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          @click="$emit('apply', { field: 'monthly_contribution', value: suggestions.monthly_contribution_current_saving })"
        >
          Use what you already save ({{ money(suggestions.monthly_contribution_current_saving) }})
        </button>
        <button
          v-if="suggestions.monthly_contribution_capacity > 0"
          type="button"
          data-testid="use-capacity"
          class="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-200 dark:hover:bg-primary-900/40"
          @click="$emit('apply', { field: 'monthly_contribution', value: suggestions.monthly_contribution_capacity })"
        >
          Use everything you could save ({{ money(suggestions.monthly_contribution_capacity) }})
        </button>
      </div>

      <p class="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {{ basisLine }}
      </p>

      <details class="mt-3" :open="reviewOpen">
        <summary
          data-testid="review-toggle"
          class="cursor-pointer list-none text-xs font-semibold text-gray-700 marker:content-none hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
          @click.prevent="toggleReview"
        >
          <span class="inline-flex items-center gap-1">
            <ChevronDownIcon class="h-3.5 w-3.5 transition-transform" :class="{ 'rotate-180': reviewOpen }" />
            Review the largest transactions
          </span>
        </summary>
        <div class="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <p v-if="transactions.length > 0" class="border-b border-gray-100 px-3 py-2 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Changing a category applies to every transaction with the same description.
          </p>
          <p v-if="loading && transactions.length === 0" class="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
            Loading transactions...
          </p>
          <p v-else-if="transactions.length === 0" class="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
            No posted bank transactions in this window yet.
          </p>
          <ul v-else class="max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
            <li
              v-for="group in groupedTransactions"
              :key="group.key"
              class="px-3 py-2"
              :data-testid="`group-${group.firstId}`"
            >
              <div class="flex items-start justify-between gap-3">
                <p class="min-w-0 flex-1 text-xs font-medium leading-4 text-gray-900 dark:text-white" :title="group.name">
                  {{ group.name }}
                </p>
                <span
                  class="shrink-0 text-xs font-semibold tabular-nums"
                  :class="group.direction === 'in' ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-white'"
                  :title="group.count > 1 ? `${group.count} transactions, ${money(group.total)} in total` : group.date_range"
                >
                  {{ group.direction === "in" ? "+" : "−" }}{{ money(group.average) }}<span v-if="group.count > 1" class="font-normal text-gray-500 dark:text-gray-400"> avg</span>
                </span>
              </div>
              <div class="mt-1 flex items-center justify-between gap-3">
                <p class="min-w-0 truncate text-[11px] text-gray-500 dark:text-gray-400" :title="`${group.date_range} · ${group.account_name}`">
                  <template v-if="group.count > 1">{{ group.count }} × · </template>{{ group.date_range }} · {{ group.account_name }}<span v-if="group.source"> · {{ sourceLabel(group.source) }}</span>
                </p>
                <select
                  :data-testid="`category-${group.firstId}`"
                  class="input w-40 shrink-0 py-1 text-xs"
                  :value="group.category || ''"
                  @change="$emit('categorize', { id: group.firstId, category: $event.target.value })"
                >
                  <option value="" disabled>Uncategorized</option>
                  <option v-for="category in categories" :key="category" :value="category">
                    {{ categoryLabel(category) }}
                  </option>
                </select>
              </div>
            </li>
          </ul>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ArrowRightIcon, ChevronDownIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  affordability: { type: Object, default: null },
  transactions: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  formatCurrency: { type: Function, required: true }
})

const emit = defineEmits(['apply', 'refresh', 'categorize', 'open-review'])

const reviewOpen = ref(false)

const cashflow = computed(() => props.affordability?.cashflow || { monthly: {}, months_covered: 0, transaction_count: 0 })

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function monthLabel(date) {
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? date : MONTH_FORMAT.format(parsed)
}

// One row per description. A category change is applied server-side to every
// transaction with the same description, so the list mirrors that unit.
const groupedTransactions = computed(() => {
  const groups = new Map()
  for (const transaction of props.transactions) {
    const key = String(transaction.description || transaction.merchant_name || '').trim().toLowerCase()
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        firstId: transaction.id,
        name: transaction.merchant_name || transaction.description,
        account_name: transaction.account_name,
        direction: transaction.direction,
        category: transaction.cashflow_category || null,
        source: transaction.cashflow_source || null,
        count: 0,
        total: 0,
        min_date: transaction.transaction_date,
        max_date: transaction.transaction_date
      }
      groups.set(key, group)
    }
    group.count += 1
    group.total += Math.abs(Number(transaction.amount) || 0)
    if (transaction.transaction_date < group.min_date) group.min_date = transaction.transaction_date
    if (transaction.transaction_date > group.max_date) group.max_date = transaction.transaction_date
    // Prefer a user-set category when rows in the group disagree.
    if (transaction.cashflow_source === 'user') {
      group.category = transaction.cashflow_category
      group.source = 'user'
    }
  }
  return [...groups.values()]
    .map(group => ({
      ...group,
      average: group.total / group.count,
      date_range: group.min_date === group.max_date
        ? monthLabel(group.min_date)
        : `${monthLabel(group.min_date)} to ${monthLabel(group.max_date)}`
    }))
    .sort((a, b) => b.total - a.total)
})
const suggestions = computed(() => props.affordability?.suggestions || {})

const CATEGORY_LABELS = {
  income: 'Income',
  essential: 'Essential',
  discretionary: 'Discretionary',
  debt_payment: 'Debt payment',
  savings: 'Savings',
  transfer: 'Own transfer',
  refund: 'Refund',
  other: 'Other'
}

const SOURCE_LABELS = {
  rule: 'auto',
  ai: 'AI guess',
  user: 'you'
}

const basisLine = computed(() => {
  const classification = props.affordability?.classification || {}
  const sources = cashflow.value.classification_sources || {}
  const parts = []
  if (sources.rule) parts.push(`${sources.rule} categorized by rules`)
  if (sources.ai) parts.push(`${sources.ai} by the AI classifier`)
  if (sources.user) parts.push(`${sources.user} by you`)
  const unclassified = Number(cashflow.value.unclassified_count) || 0
  let line = parts.length > 0 ? parts.join(', ') + '.' : 'No transactions categorized yet.'
  if (unclassified > 0) {
    line += ` ${unclassified} left uncategorized and excluded.`
  }
  if (classification.ai_reason === 'no_ai_provider') {
    line += ' Configure an AI provider to categorize the rest automatically.'
  }
  line += ' Transfers between your own accounts are netted out. Spending on unlinked cards is not seen.'
  return line
})

function money(value) {
  return props.formatCurrency(Math.round(Number(value) || 0), { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category
}

function sourceLabel(source) {
  return SOURCE_LABELS[source] || source
}

function toggleReview() {
  reviewOpen.value = !reviewOpen.value
  if (reviewOpen.value) emit('open-review')
}
</script>
