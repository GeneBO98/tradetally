<template>
    <div class="content-wrapper py-8">
        <!-- Back Button and Title -->
        <div class="flex items-center justify-between mb-6">
            <button
                @click="$router.back()"
                class="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
                Back
            </button>
        </div>

        <div class="mb-8">
            <h1 class="heading-page">Aggregate Analytics</h1>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
                Full aggregate analytics across all users (admin view)
            </p>
        </div>

        <!-- Initial Loading -->
        <div v-if="initialLoading" class="flex justify-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>

        <!-- Main Content -->
        <div v-else class="space-y-6 relative">
            <!-- Refresh indicator -->
            <div v-if="loading" class="absolute top-0 right-0 z-10">
                <div class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
                    <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
                </div>
            </div>

            <!-- Filters Row -->
            <div class="flex flex-wrap items-center gap-4">
                <!-- Period Selector -->
                <div class="flex items-center space-x-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Period:</label>
                    <select
                        v-model="period"
                        @change="loadData"
                        class="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    >
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                        <option value="180d">Last 180 Days</option>
                        <option value="all">All Time</option>
                    </select>
                </div>

                <!-- Asset Class Filter -->
                <div class="flex items-center space-x-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Asset Class:</label>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="opt in instrumentTypeOptions"
                            :key="opt.value"
                            @click="toggleInstrumentType(opt.value)"
                            :class="[
                                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                                isInstrumentTypeSelected(opt.value)
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500'
                            ]"
                        >
                            {{ opt.label }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Overview Stats -->
            <div v-if="data.overview" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="card p-4">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Total Trades</div>
                    <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatNumber(data.overview.total_trades, 0) }}</div>
                </div>
                <div class="card p-4">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Active Traders</div>
                    <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ data.overview.active_traders }}</div>
                </div>
                <div class="card p-4">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Symbols Traded</div>
                    <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ data.overview.symbols_traded }}</div>
                </div>
                <div class="card p-4">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Overall Win Rate</div>
                    <div class="text-2xl font-bold" :class="data.overview.overall_win_rate >= 50 ? 'text-green-600' : 'text-red-600'">
                        {{ data.overview.overall_win_rate }}%
                    </div>
                </div>
                <div class="card p-4">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Total P&L</div>
                    <div class="text-2xl font-bold" :class="data.overview.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'">
                        ${{ formatNumber(data.overview.total_pnl) }}
                    </div>
                </div>
                <div class="card p-4">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Avg P&L/Trade</div>
                    <div class="text-2xl font-bold" :class="data.overview.avg_pnl_per_trade >= 0 ? 'text-green-600' : 'text-red-600'">
                        ${{ formatNumber(data.overview.avg_pnl_per_trade) }}
                    </div>
                </div>
                <div class="card p-4">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Avg Hold Time</div>
                    <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatHoldTime(data.overview.avg_hold_time_minutes) }}</div>
                </div>
            </div>

            <!-- Hold Time Comparison -->
            <div v-if="data.hold_time && (data.hold_time.winner || data.hold_time.loser)" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-if="data.hold_time.winner" class="card p-4 border-l-4 border-green-500">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Winners Avg Hold</div>
                    <div class="text-2xl font-bold text-green-600">{{ formatHoldTime(data.hold_time.winner.avg_hold_minutes) }}</div>
                    <div class="text-xs text-gray-400 mt-1">Median: {{ formatHoldTime(data.hold_time.winner.median_hold_minutes) }} ({{ formatNumber(data.hold_time.winner.trade_count, 0) }} trades)</div>
                </div>
                <div v-if="data.hold_time.loser" class="card p-4 border-l-4 border-red-500">
                    <div class="text-sm text-gray-500 dark:text-gray-400">Losers Avg Hold</div>
                    <div class="text-2xl font-bold text-red-600">{{ formatHoldTime(data.hold_time.loser.avg_hold_minutes) }}</div>
                    <div class="text-xs text-gray-400 mt-1">Median: {{ formatHoldTime(data.hold_time.loser.median_hold_minutes) }} ({{ formatNumber(data.hold_time.loser.trade_count, 0) }} trades)</div>
                </div>
            </div>

            <!-- Most Traded Today -->
            <div v-if="data.most_traded_today && data.most_traded_today.length > 0" class="card">
                <div class="card-body">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Most Traded Today</h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead>
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Symbol</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Trades</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Users</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Avg P&L</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Win Rate</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr v-for="s in data.most_traded_today" :key="s.symbol">
                                    <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ s.symbol }}</td>
                                    <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.trade_count }}</td>
                                    <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.user_count }}</td>
                                    <td class="px-4 py-3 text-sm text-right" :class="s.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(s.avg_pnl) }}</td>
                                    <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.win_rate }}%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="border-b border-gray-200 dark:border-gray-700">
                <nav class="-mb-px flex space-x-8 overflow-x-auto">
                    <button
                        v-for="tab in tabs"
                        :key="tab.key"
                        @click="activeTab = tab.key"
                        :class="[
                            activeTab === tab.key
                                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300',
                            'whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm'
                        ]"
                    >
                        {{ tab.label }}
                    </button>
                </nav>
            </div>

            <!-- Symbol Performance Tab -->
            <div v-if="activeTab === 'symbols'" class="card">
                <div class="card-body">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Symbol Performance (Full Data)</h3>
                    <div v-if="data.symbols && data.symbols.length > 0">
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead>
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" @click="sortSymbols('symbol')">Symbol</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" @click="sortSymbols('trade_count')">Trades</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" @click="sortSymbols('user_count')">Users</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" @click="sortSymbols('avg_pnl')">Avg P&L</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" @click="sortSymbols('total_pnl')">Total P&L</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" @click="sortSymbols('win_rate')">Win Rate</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg Win</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg Loss</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg R</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                    <tr v-for="s in sortedSymbols" :key="s.symbol">
                                        <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ s.symbol }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.trade_count }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.user_count }}</td>
                                        <td class="px-4 py-3 text-sm text-right" :class="s.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(s.avg_pnl) }}</td>
                                        <td class="px-4 py-3 text-sm text-right" :class="s.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(s.total_pnl) }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.win_rate }}%</td>
                                        <td class="px-4 py-3 text-sm text-right text-green-600">${{ formatNumber(s.avg_win) }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-red-600">${{ formatNumber(s.avg_loss) }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.avg_r_value || '-' }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
                        Not enough data to display (minimum 10 trades from 3+ users required).
                    </div>
                </div>
            </div>

            <!-- Sentiment Tab -->
            <div v-if="activeTab === 'sentiment'" class="card">
                <div class="card-body">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Long/Short Sentiment</h3>
                    <div v-if="data.sentiment && data.sentiment.length > 0">
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead>
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Symbol</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Long</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Short</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Long %</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Users</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                    <tr v-for="s in data.sentiment" :key="s.symbol">
                                        <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ s.symbol }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.total_count }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-green-600">{{ s.long_count }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-red-600">{{ s.short_count }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.long_percent }}%</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.user_count }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">Not enough sentiment data available.</div>
                </div>
            </div>

            <!-- Time Analysis Tab -->
            <div v-if="activeTab === 'time'" class="space-y-6">
                <div class="card">
                    <div class="card-body">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Hourly Performance</h3>
                        <div v-if="data.time_analysis && data.time_analysis.hourly.length > 0">
                            <div class="overflow-x-auto">
                                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead>
                                        <tr>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Hour</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Trades</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Users</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg P&L</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total P&L</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Win Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                        <tr v-for="h in data.time_analysis.hourly" :key="h.hour">
                                            <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ h.hour }}:00</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ h.trade_count }}</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ h.user_count }}</td>
                                            <td class="px-4 py-3 text-sm text-right" :class="h.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(h.avg_pnl) }}</td>
                                            <td class="px-4 py-3 text-sm text-right" :class="h.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(h.total_pnl) }}</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ h.win_rate }}%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">Not enough hourly data available.</div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Day of Week Performance</h3>
                            <label class="inline-flex items-center cursor-pointer">
                                <span class="text-xs text-gray-500 dark:text-gray-400 mr-2">Weekdays only</span>
                                <div class="relative">
                                    <input type="checkbox" v-model="weekdaysOnly" class="sr-only peer">
                                    <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-gray-500 peer-checked:bg-primary-600"></div>
                                </div>
                            </label>
                        </div>
                        <div v-if="filteredDow.length > 0">
                            <div class="overflow-x-auto">
                                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead>
                                        <tr>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Day</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Trades</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Users</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg P&L</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total P&L</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Win Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                        <tr v-for="d in filteredDow" :key="d.day_of_week">
                                            <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ DAY_NAMES[d.day_of_week] }}</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ d.trade_count }}</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ d.user_count }}</td>
                                            <td class="px-4 py-3 text-sm text-right" :class="d.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(d.avg_pnl) }}</td>
                                            <td class="px-4 py-3 text-sm text-right" :class="d.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(d.total_pnl) }}</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ d.win_rate }}%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">Not enough day-of-week data available.</div>
                    </div>
                </div>
            </div>

            <!-- Strategy Tab -->
            <div v-if="activeTab === 'strategies'" class="card">
                <div class="card-body">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Strategy Analysis (Full Data)</h3>
                    <div v-if="data.strategies && data.strategies.length > 0">
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead>
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Strategy</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Trades</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Users</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg P&L</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total P&L</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Win Rate</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Profit Factor</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg R</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg Hold</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                    <tr v-for="s in data.strategies" :key="s.strategy">
                                        <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white cursor-help" :title="STRATEGY_DESCRIPTIONS[s.strategy] || ''">{{ s.strategy }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.trade_count }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.user_count }}</td>
                                        <td class="px-4 py-3 text-sm text-right" :class="s.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(s.avg_pnl) }}</td>
                                        <td class="px-4 py-3 text-sm text-right" :class="s.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(s.total_pnl) }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.win_rate }}%</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.profit_factor }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ s.avg_r_value || '-' }}</td>
                                        <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ formatHoldTime(s.avg_hold_time_minutes) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">Not enough strategy data available.</div>
                </div>
            </div>

            <!-- Behavioral Tab -->
            <div v-if="activeTab === 'behavioral'" class="space-y-6">
                <div v-if="data.behavioral && (data.behavioral.patterns.length > 0 || data.behavioral.revenge_trading)">
                    <!-- Consecutive Loss Analysis -->
                    <div v-if="data.consecutive_loss && data.consecutive_loss.length > 0" class="card">
                        <div class="card-body">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Consecutive Loss Recovery</h3>
                            <div class="overflow-x-auto">
                                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead>
                                        <tr>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Streak</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Occurrences</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Users</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Next Trade Avg P&L</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Next Trade Win Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                        <tr v-for="c in data.consecutive_loss" :key="c.streak_length">
                                            <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ c.streak_length }} losses</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ c.occurrences }}</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ c.user_count }}</td>
                                            <td class="px-4 py-3 text-sm text-right" :class="c.avg_next_trade_pnl >= 0 ? 'text-green-600' : 'text-red-600'">${{ formatNumber(c.avg_next_trade_pnl) }}</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ c.next_trade_win_rate }}%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Revenge Trading -->
                    <div v-if="data.behavioral.revenge_trading" class="card mb-6">
                        <div class="card-body">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Revenge Trading (Aggregate)</h3>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <div class="text-sm text-gray-500 dark:text-gray-400">Total Events</div>
                                    <div class="text-xl font-bold text-gray-900 dark:text-white">{{ data.behavioral.revenge_trading.total_events }}</div>
                                </div>
                                <div>
                                    <div class="text-sm text-gray-500 dark:text-gray-400">Affected Users</div>
                                    <div class="text-xl font-bold text-gray-900 dark:text-white">{{ data.behavioral.revenge_trading.affected_users }}</div>
                                </div>
                                <div>
                                    <div class="text-sm text-gray-500 dark:text-gray-400">Avg Additional Loss</div>
                                    <div class="text-xl font-bold text-red-600">${{ formatNumber(data.behavioral.revenge_trading.avg_additional_loss) }}</div>
                                </div>
                                <div>
                                    <div class="text-sm text-gray-500 dark:text-gray-400">Pattern Broken Rate</div>
                                    <div class="text-xl font-bold text-green-600">{{ data.behavioral.revenge_trading.pattern_broken_rate }}%</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Patterns -->
                    <div v-if="data.behavioral.patterns.length > 0" class="card">
                        <div class="card-body">
                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Behavioral Patterns</h3>
                            <div class="overflow-x-auto">
                                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead>
                                        <tr>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pattern</th>
                                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Severity</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Occurrences</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Affected Users</th>
                                            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avg Confidence</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                        <tr v-for="p in data.behavioral.patterns" :key="`${p.pattern_type}-${p.severity}`">
                                            <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white capitalize">{{ p.pattern_type.replace(/_/g, ' ') }}</td>
                                            <td class="px-4 py-3 text-sm">
                                                <span
                                                    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                                    :class="{
                                                        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400': p.severity === 'high',
                                                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400': p.severity === 'medium',
                                                        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400': p.severity === 'low'
                                                    }"
                                                >
                                                    {{ p.severity }}
                                                </span>
                                            </td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ p.occurrence_count }}</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ p.affected_users }}</td>
                                            <td class="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">{{ p.avg_confidence }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">Not enough behavioral data available.</div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'

const loading = ref(false)
const initialLoading = ref(true)
const period = ref('all')
const activeTab = ref('symbols')
const symbolSortKey = ref('avg_pnl')
const symbolSortDir = ref('desc')
const instrumentTypes = ref([])
const weekdaysOnly = ref(true)

const INSTRUMENT_TYPE_LABELS = {
    stock: 'Stocks',
    option: 'Options',
    future: 'Futures',
    crypto: 'Crypto'
}

const STRATEGY_DESCRIPTIONS = {
    scalper: 'Quick trades lasting seconds to minutes, capturing small price movements',
    momentum: 'Trading in the direction of strong price movement or trend',
    mean_reversion: 'Betting that prices will return to their average after extreme moves',
    swing: 'Holding positions for days to weeks to capture medium-term moves',
    day_trading: 'Opening and closing positions within the same trading day',
    position: 'Long-term holds lasting weeks to months based on fundamentals or macro trends',
    breakout: 'Entering when price breaks through a key support or resistance level',
    reversal: 'Trading against the current trend at anticipated turning points',
    trend_following: 'Following established trends using indicators like moving averages',
    contrarian: 'Taking positions opposite to prevailing market sentiment',
    news_momentum: 'Trading the initial move after a news catalyst',
    news_swing: 'Holding positions for days after news to capture the extended reaction',
    news_uncertainty: 'Trading volatility around anticipated news events like earnings'
}

const instrumentTypeOptions = computed(() => {
    const opts = [{ value: 'all', label: 'All' }]
    if (data.value.available_instrument_types) {
        for (const item of data.value.available_instrument_types) {
            opts.push({
                value: item.instrument_type,
                label: INSTRUMENT_TYPE_LABELS[item.instrument_type] || item.instrument_type
            })
        }
    }
    return opts
})

const data = ref({
    overview: null,
    symbols: [],
    time_analysis: { hourly: [], day_of_week: [] },
    strategies: [],
    behavioral: { patterns: [], revenge_trading: null },
    hold_time: null,
    consecutive_loss: [],
    sentiment: [],
    most_traded_today: [],
    revenge_cost: null,
    available_instrument_types: []
})

const tabs = [
    { key: 'symbols', label: 'Symbols' },
    { key: 'sentiment', label: 'Sentiment' },
    { key: 'time', label: 'Time Analysis' },
    { key: 'strategies', label: 'Strategies' },
    { key: 'behavioral', label: 'Behavioral' }
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const filteredDow = computed(() => {
    if (!data.value.time_analysis || !data.value.time_analysis.day_of_week) return []
    if (weekdaysOnly.value) {
        return data.value.time_analysis.day_of_week.filter(d => d.day_of_week >= 1 && d.day_of_week <= 5)
    }
    return data.value.time_analysis.day_of_week
})

const sortedSymbols = computed(() => {
    if (!data.value.symbols) return []
    const key = symbolSortKey.value
    const dir = symbolSortDir.value === 'asc' ? 1 : -1
    return [...data.value.symbols].sort((a, b) => {
        if (key === 'symbol') return dir * a.symbol.localeCompare(b.symbol)
        return dir * ((a[key] || 0) - (b[key] || 0))
    })
})

function isInstrumentTypeSelected(value) {
    if (value === 'all') return instrumentTypes.value.length === 0
    return instrumentTypes.value.includes(value)
}

function toggleInstrumentType(value) {
    if (value === 'all') {
        instrumentTypes.value = []
    } else {
        const idx = instrumentTypes.value.indexOf(value)
        if (idx >= 0) {
            instrumentTypes.value.splice(idx, 1)
        } else {
            instrumentTypes.value.push(value)
        }
    }
    loadData()
}

function sortSymbols(key) {
    if (symbolSortKey.value === key) {
        symbolSortDir.value = symbolSortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
        symbolSortKey.value = key
        symbolSortDir.value = 'desc'
    }
}

function formatNumber(val, decimals = 2) {
    if (val == null) return '-'
    return Number(val).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function formatHoldTime(minutes) {
    if (!minutes) return '-'
    if (minutes < 60) return `${Math.round(minutes)}m`
    if (minutes < 1440) {
        const hours = Math.floor(minutes / 60)
        const mins = Math.round(minutes % 60)
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }
    const days = Math.floor(minutes / 1440)
    const remainingHours = Math.round((minutes % 1440) / 60)
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

function buildParams() {
    const params = { period: period.value }
    if (instrumentTypes.value.length > 0) {
        params.instrumentTypes = instrumentTypes.value.join(',')
    }
    return params
}

async function loadData() {
    loading.value = true
    try {
        const response = await api.get('/admin/aggregate-analytics', { params: buildParams() })
        data.value = response.data
    } catch (error) {
        console.error('[ADMIN AGGREGATE] Error loading data:', error)
    } finally {
        loading.value = false
        initialLoading.value = false
    }
}

onMounted(() => {
    loadData()
})
</script>
