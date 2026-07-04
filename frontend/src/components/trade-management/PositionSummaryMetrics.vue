<template>
  <div class="bg-white dark:bg-gray-800 shadow-sm rounded-lg">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">Position Summary</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Combined multi-leg position · {{ trade.leg_count }} legs
        </p>
      </div>
    </div>

    <div class="p-6">
      <!-- Combined metrics -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Risk Amount</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ formatCurrency(analysis.risk_amount) }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            Sum across {{ analysis.analyzed_leg_count }} analyzed {{ analysis.analyzed_leg_count === 1 ? 'leg' : 'legs' }}
          </div>
        </div>

        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Net P&L</div>
          <div class="text-lg font-semibold" :class="pnlClass">
            {{ formatCurrency(trade.pnl) }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            All legs combined
          </div>
        </div>

        <div v-if="analysis.target_pl_amount !== null && analysis.target_pl_amount !== undefined">
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Target P&L</div>
          <div class="text-lg font-semibold text-primary-600 dark:text-primary-400">
            {{ formatCurrency(analysis.target_pl_amount) }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {{ analysis.target_capped_at_max_profit ? 'Capped at strategy max profit' : 'If held to target' }}
          </div>
        </div>
        <div v-else>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Target P&L</div>
          <div class="text-lg text-gray-400 dark:text-gray-500">
            N/A
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            Requires targets on every leg
          </div>
        </div>

        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Risk:Reward</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ riskRewardActual }}
          </div>
          <div v-if="riskRewardPlanned" class="text-xs text-gray-500 dark:text-gray-400">
            Planned: {{ riskRewardPlanned }}
          </div>
        </div>
      </div>

      <div class="border-t border-gray-200 dark:border-gray-700 my-6"></div>

      <!-- Position details -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Symbol</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ trade.symbol }}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Legs</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ trade.leg_count }}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Quantity</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ trade.quantity }}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Opened / Closed</div>
          <div class="text-sm font-semibold text-gray-900 dark:text-white">
            {{ formatDateTimeSafe(trade.entry_time) }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            to {{ formatDateTimeSafe(trade.exit_time) }}
          </div>
        </div>
      </div>

      <div class="border-t border-gray-200 dark:border-gray-700 my-6"></div>

      <!-- Per-leg breakdown -->
      <div>
        <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Legs</div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th class="pb-2 pr-4 font-medium">Leg</th>
                <th class="pb-2 pr-4 font-medium">Side</th>
                <th class="pb-2 pr-4 font-medium text-right">Qty</th>
                <th class="pb-2 pr-4 font-medium text-right">Entry</th>
                <th class="pb-2 pr-4 font-medium text-right">Exit</th>
                <th class="pb-2 pr-4 font-medium text-right">Stop Loss</th>
                <th class="pb-2 pr-4 font-medium text-right">P&L</th>
                <th class="pb-2 pr-4 font-medium text-right">Actual R</th>
                <th class="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              <tr v-for="leg in trade.legs" :key="leg.id">
                <td class="py-2 pr-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">{{ leg.symbol }}</td>
                <td class="py-2 pr-4">
                  <span
                    :class="[
                      'text-xs px-2 py-0.5 rounded-full',
                      leg.side === 'long'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    ]"
                  >
                    {{ leg.side }}
                  </span>
                </td>
                <td class="py-2 pr-4 text-right text-gray-900 dark:text-white">{{ formatQuantity(leg.quantity) }}</td>
                <td class="py-2 pr-4 text-right text-gray-900 dark:text-white">{{ formatCurrency(leg.entry_price) }}</td>
                <td class="py-2 pr-4 text-right text-gray-900 dark:text-white">{{ formatCurrency(leg.exit_price) }}</td>
                <td class="py-2 pr-4 text-right" :class="leg.stop_loss ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'">
                  {{ leg.stop_loss ? formatCurrency(leg.stop_loss) : 'Not set' }}
                </td>
                <td class="py-2 pr-4 text-right font-medium" :class="parseFloat(leg.pnl) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                  {{ formatCurrency(leg.pnl) }}
                </td>
                <td class="py-2 pr-4 text-right">
                  <span v-if="leg.included_in_analysis" :class="leg.actual_r >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                    {{ formatR(leg.actual_r) }}
                  </span>
                  <span v-else class="text-xs text-gray-400 dark:text-gray-500" title="Excluded from the combined analysis">
                    Excluded
                  </span>
                </td>
                <td class="py-2 text-right">
                  <router-link
                    :to="{ name: 'trade-detail', params: { id: leg.id } }"
                    class="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                  >
                    View
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Stop loss and take profit are managed per leg. Open a leg to adjust its levels, or disable
          whole-trade position grouping in Settings to analyze legs individually.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUserTimezone } from '@/composables/useUserTimezone'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import { formatR } from '@/utils/rFormat'

const { formatDateTime: formatDateTimeTz } = useUserTimezone()
const { formatCurrency } = useCurrencyFormatter()

const props = defineProps({
  trade: {
    type: Object,
    required: true
  },
  analysis: {
    type: Object,
    required: true
  }
})

const pnlClass = computed(() => {
  const pnl = parseFloat(props.trade.pnl)
  return pnl >= 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'
})

const riskRewardActual = computed(() => {
  const actualR = props.analysis.actual_r
  if (actualR === null || actualR === undefined) return 'N/A'
  return `1:${actualR.toFixed(2)}`
})

const riskRewardPlanned = computed(() => {
  const targetR = props.analysis.target_r
  if (targetR === null || targetR === undefined) return null
  return `1:${targetR.toFixed(2)}`
})

function formatQuantity(value) {
  const num = parseFloat(value)
  if (!Number.isFinite(num)) return '-'
  return Number.isInteger(num) ? String(num) : num.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

function formatDateTimeSafe(value) {
  if (!value) return '-'
  try {
    return formatDateTimeTz(value)
  } catch {
    return value
  }
}
</script>
