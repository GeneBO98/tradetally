<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-12">
    <div class="w-full max-w-lg">
      <!-- Brand -->
      <div class="mb-6 flex items-center justify-center gap-2.5">
        <img src="/favicon.svg" alt="TradeTally" class="h-9 w-auto" />
        <span class="text-lg font-semibold text-gray-900 dark:text-white">TradeTally</span>
      </div>

      <div class="card">
        <div class="card-body">
          <!-- Loading -->
          <div v-if="loading" class="flex justify-center py-10">
            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>

          <!-- Not found -->
          <div v-else-if="notFound" class="text-center py-6">
            <XCircleIcon class="mx-auto h-12 w-12 text-gray-400" />
            <h1 class="mt-3 text-lg font-semibold text-gray-900 dark:text-white">Verification not found</h1>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This code doesn't match any verified trade. The link may be mistyped
              or the verification may have been removed.
            </p>
          </div>

          <!-- Revoked -->
          <div v-else-if="verification.status === 'revoked'" class="text-center py-6">
            <ExclamationTriangleIcon class="mx-auto h-12 w-12 text-warning" />
            <h1 class="mt-3 text-lg font-semibold text-gray-900 dark:text-white">Verification revoked</h1>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This trade was verified at one point, but its details were changed
              afterward. Treat any shared image of it as unverified.
            </p>
          </div>

          <!-- Verified -->
          <template v-else>
            <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
                <CheckBadgeIcon class="h-6 w-6 text-success" />
              </span>
              <div>
                <h1 class="text-lg font-semibold text-gray-900 dark:text-white">Broker-verified trade</h1>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Imported via authenticated {{ brokerLabel }} sync · unchanged since verification
                </p>
              </div>
            </div>

            <div class="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
              <div class="flex items-baseline justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xl font-bold text-gray-900 dark:text-white">{{ verification.symbol }}</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-bold uppercase"
                    :class="verification.side === 'short' ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'"
                  >{{ verification.side }}</span>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">{{ formatTradeDate(verification.trade_date, 'MMM dd, yyyy') }}</span>
              </div>

              <div class="mt-3 flex items-baseline gap-3">
                <span class="text-3xl font-bold" :class="verification.is_win ? 'text-success' : 'text-danger'">
                  {{ heroValue }}
                </span>
                <span v-if="secondaryValue" class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ secondaryValue }}</span>
              </div>

              <div v-if="verification.entry_price != null" class="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Entry</div>
                  <div class="font-medium text-gray-900 dark:text-white">${{ Number(verification.entry_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}</div>
                </div>
                <div>
                  <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Exit</div>
                  <div class="font-medium text-gray-900 dark:text-white">${{ Number(verification.exit_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}</div>
                </div>
                <div>
                  <div class="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">{{ verification.instrument_type === 'option' ? 'Contracts' : 'Shares' }}</div>
                  <div class="font-medium text-gray-900 dark:text-white">{{ Number(verification.quantity).toLocaleString('en-US') }}</div>
                </div>
              </div>
            </div>

            <dl class="mt-5 space-y-2 text-sm">
              <div class="flex justify-between">
                <dt class="text-gray-500 dark:text-gray-400">Shared by</dt>
                <dd class="font-medium text-gray-900 dark:text-white">{{ verification.username }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500 dark:text-gray-400">Broker</dt>
                <dd class="font-medium text-gray-900 dark:text-white">{{ brokerLabel }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500 dark:text-gray-400">Verified</dt>
                <dd class="font-medium text-gray-900 dark:text-white">{{ formatTradeDate(verification.verified_at, 'MMM dd, yyyy') }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500 dark:text-gray-400">Verification code</dt>
                <dd class="font-mono text-gray-900 dark:text-white">{{ verification.public_code }}</dd>
              </div>
            </dl>

            <p class="mt-5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Broker-verified means this trade's executions were imported directly
              from the owner's brokerage account through an authenticated API
              connection, and its prices, size, and timestamps have not been edited
              since verification. TradeTally re-checks this every time the page loads.
            </p>
          </template>
        </div>
      </div>

      <p class="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
        <router-link to="/register" class="text-primary-600 hover:text-primary-500 dark:text-primary-400">
          Journal and verify your own trades with TradeTally
        </router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { CheckBadgeIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import { formatTradeDate } from '@/utils/date'

const route = useRoute()
const loading = ref(true)
const notFound = ref(false)
const verification = ref({})

const BROKER_LABELS = {
  schwab: 'Charles Schwab',
  ibkr: 'Interactive Brokers',
  tradestation: 'TradeStation',
  alpaca: 'Alpaca'
}

const brokerLabel = computed(() => BROKER_LABELS[verification.value.broker] || verification.value.broker || 'broker')

const heroValue = computed(() => {
  const v = verification.value
  if (v.pnl != null) {
    const abs = Math.abs(v.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `${v.pnl < 0 ? '-' : '+'}$${abs}`
  }
  if (v.pnl_percent != null) return `${v.pnl_percent >= 0 ? '+' : ''}${v.pnl_percent.toFixed(2)}%`
  if (v.r_value != null) return `${v.r_value >= 0 ? '+' : ''}${v.r_value.toFixed(1)}R`
  return v.is_win ? 'WIN' : 'LOSS'
})

const secondaryValue = computed(() => {
  const v = verification.value
  const parts = []
  if (v.pnl != null && v.pnl_percent != null) parts.push(`${v.pnl_percent >= 0 ? '+' : ''}${v.pnl_percent.toFixed(2)}%`)
  if (v.r_value != null) parts.push(`${v.r_value >= 0 ? '+' : ''}${v.r_value.toFixed(1)}R`)
  return parts.join(' · ')
})

onMounted(async () => {
  try {
    const response = await api.get(`/verify/${encodeURIComponent(route.params.code)}`)
    verification.value = response.data.verification
  } catch (error) {
    notFound.value = true
  } finally {
    loading.value = false
  }
})
</script>
