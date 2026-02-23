<template>
    <div class="content-wrapper py-8">
        <div class="mb-8">
            <h1 class="heading-page">TradeTally Market Pulse</h1>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
                Real-time aggregated trading activity from the TradeTally community
            </p>
        </div>

        <!-- Loading -->
        <div v-if="initialLoading" class="flex justify-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>

        <!-- No Data -->
        <div v-else-if="!pulse" class="text-center py-16">
            <p class="text-gray-500 dark:text-gray-400 text-lg">Not enough community data to display the Market Pulse yet.</p>
            <p class="text-gray-400 dark:text-gray-500 mt-2 text-sm">Check back when more traders are active on TradeTally.</p>
        </div>

        <!-- Main Content -->
        <div v-else class="space-y-8">
            <!-- Overview Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="card p-5">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Trades (30d)</div>
                    <div class="text-3xl font-bold text-gray-900 dark:text-white mt-1">{{ formatNumber(pulse.overview.total_trades, 0) }}</div>
                </div>
                <div class="card p-5">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Community Win Rate</div>
                    <div class="text-3xl font-bold mt-1" :class="pulse.overview.overall_win_rate >= 50 ? 'text-green-600' : 'text-red-600'">
                        {{ pulse.overview.overall_win_rate }}%
                    </div>
                </div>
                <div class="card p-5">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Avg Hold Time</div>
                    <div class="text-3xl font-bold text-gray-900 dark:text-white mt-1">{{ formatHoldTime(pulse.overview.avg_hold_time_minutes) }}</div>
                </div>
                <div class="card p-5">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Trades Today</div>
                    <div class="text-3xl font-bold text-primary-600 mt-1">{{ pulse.trades_today || 0 }}</div>
                </div>
            </div>

            <!-- Hold Time Comparison -->
            <div v-if="pulse.hold_time && (pulse.hold_time.winner || pulse.hold_time.loser)" class="card">
                <div class="card-body">
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Hold Time: Winners vs Losers</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div v-if="pulse.hold_time.winner" class="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                            <div class="text-sm font-medium text-green-700 dark:text-green-400">Winning Trades</div>
                            <div class="text-2xl font-bold text-green-600 mt-1">{{ formatHoldTime(pulse.hold_time.winner.avg_hold_minutes) }}</div>
                            <div class="text-xs text-green-600/70 mt-1">{{ formatNumber(pulse.hold_time.winner.trade_count, 0) }} trades</div>
                        </div>
                        <div v-if="pulse.hold_time.loser" class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                            <div class="text-sm font-medium text-red-700 dark:text-red-400">Losing Trades</div>
                            <div class="text-2xl font-bold text-red-600 mt-1">{{ formatHoldTime(pulse.hold_time.loser.avg_hold_minutes) }}</div>
                            <div class="text-xs text-red-600/70 mt-1">{{ formatNumber(pulse.hold_time.loser.trade_count, 0) }} trades</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Most Traded Today -->
            <div v-if="pulse.most_traded_today && pulse.most_traded_today.length > 0" class="card">
                <div class="card-body">
                    <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Most Traded Today</h2>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead>
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Symbol</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Trades</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Avg P&L</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Win Rate</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr v-for="s in pulse.most_traded_today" :key="s.symbol">
                                    <td class="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">{{ s.symbol }}</td>
                                    <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.trade_count }}</td>
                                    <td class="px-4 py-3 text-sm text-right" :class="s.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(s.avg_pnl) }}</td>
                                    <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.win_rate }}%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- CTA -->
            <div class="text-center py-8">
                <p class="text-gray-600 dark:text-gray-400 mb-4">Sign up to see how your trading compares to the community</p>
                <router-link to="/register" class="btn-primary text-lg px-8 py-3">
                    Get Started Free
                </router-link>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const initialLoading = ref(true)
const pulse = ref(null)

function formatNumber(val, decimals = 2) {
    if (val == null) return '-'
    return Number(val).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function formatHoldTime(minutes) {
    if (!minutes) return '-'
    if (minutes < 60) return `${Math.round(minutes)}m`
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

onMounted(async () => {
    try {
        const response = await api.get('/community-insights/public/pulse')
        pulse.value = response.data
    } catch (error) {
        console.log('[MARKET PULSE] Data not available:', error.response?.status)
        pulse.value = null
    } finally {
        initialLoading.value = false
    }
})
</script>
