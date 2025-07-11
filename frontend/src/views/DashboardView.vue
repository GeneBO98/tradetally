<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Header with Filters -->
    <div class="mb-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Trading performance analytics and insights
          </p>
        </div>
        
        <!-- Filters -->
        <div class="mt-4 sm:mt-0 flex flex-wrap gap-3">
          <select v-model="filters.timeRange" @change="applyFilters" class="input text-sm">
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
            <option value="feb2025">February 2025</option>
            <option value="march2025">March 2025</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="1y">Last Year</option>
            <option value="ytd">Year to Date</option>
          </select>
          
          <!-- Custom Date Range Inputs -->
          <div v-if="filters.timeRange === 'custom'" class="flex gap-2">
            <input 
              type="date" 
              v-model="filters.startDate"
              @change="applyFilters"
              @keydown.enter="applyFilters"
              class="input text-sm"
              placeholder="Start Date"
            />
            <input 
              type="date" 
              v-model="filters.endDate"
              @change="applyFilters"
              @keydown.enter="applyFilters"
              class="input text-sm"
              placeholder="End Date"
            />
          </div>
          
          <select v-model="filters.symbol" @change="applyFilters" class="input text-sm">
            <option value="">All Symbols</option>
            <option v-for="symbol in symbols" :key="symbol" :value="symbol">
              {{ symbol }}
            </option>
          </select>
          
          <select v-model="filters.strategy" @change="applyFilters" class="input text-sm">
            <option value="">All Strategies</option>
            <option v-for="strategy in strategies" :key="strategy" :value="strategy">
              {{ strategy }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else class="space-y-8">
      <!-- Open Trades Section -->
      <div v-if="openTrades.length > 0" class="card">
        <div class="card-body">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Open Positions</h3>
              <button 
                @click="navigateToOpenTrades"
                class="ml-3 text-sm text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
              >
                View all →
              </button>
            </div>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
              {{ openTrades.length }} {{ openTrades.length === 1 ? 'position' : 'positions' }}
            </span>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Side
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Quantity
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Avg Entry Price
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Cost
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Current Price
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Current Value
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Unrealized P&L
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Individual Trades
                  </th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <template v-for="position in openTrades" :key="position.symbol">
                  <!-- Position Summary Row -->
                  <tr class="bg-gray-50 dark:bg-gray-800/50 font-medium">
                    <td class="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white">
                      {{ position.symbol }}
                    </td>
                    <td class="px-3 py-2 text-sm">
                      <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                        :class="[
                          position.side === 'long' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        ]">
                        {{ position.side }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white text-right">
                      {{ position.totalQuantity.toLocaleString() }}
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white text-right">
                      ${{ formatCurrency(position.avgPrice) }}
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white text-right">
                      ${{ formatCurrency(position.totalCost) }}
                    </td>
                    <td class="px-3 py-2 text-sm text-right">
                      <div v-if="position.currentPrice !== null" class="font-bold text-gray-900 dark:text-white">
                        ${{ formatCurrency(position.currentPrice) }}
                        <div v-if="position.dayChange !== undefined" class="text-xs" :class="[
                          position.dayChange >= 0 ? 'text-green-600' : 'text-red-600'
                        ]">
                          {{ position.dayChange >= 0 ? '+' : '' }}{{ formatCurrency(position.dayChange) }}
                          ({{ position.dayChangePercent >= 0 ? '+' : '' }}{{ formatNumber(position.dayChangePercent) }}%)
                        </div>
                      </div>
                      <span v-else class="text-xs text-gray-400">No quote</span>
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-right">
                      <span v-if="position.currentValue !== null" class="text-gray-900 dark:text-white">
                        ${{ formatCurrency(position.currentValue) }}
                      </span>
                      <span v-else class="text-xs text-gray-400">-</span>
                    </td>
                    <td class="px-3 py-2 text-sm font-bold text-right">
                      <div v-if="position.unrealizedPnL !== null">
                        <div :class="[
                          position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                        ]">
                          {{ position.unrealizedPnL >= 0 ? '+' : '' }}${{ formatCurrency(Math.abs(position.unrealizedPnL)) }}
                        </div>
                        <div class="text-xs" :class="[
                          position.unrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                        ]">
                          {{ position.unrealizedPnLPercent >= 0 ? '+' : '' }}{{ formatNumber(position.unrealizedPnLPercent) }}%
                        </div>
                      </div>
                      <span v-else class="text-xs text-gray-400">-</span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {{ position.trades.length }} {{ position.trades.length === 1 ? 'trade' : 'trades' }}
                    </td>
                    <td class="px-3 py-2 text-sm text-right">
                      <span class="text-xs text-gray-400">Position Total</span>
                    </td>
                  </tr>
                  
                  <!-- Individual Trade Rows -->
                  <tr v-for="trade in position.trades" :key="trade.id" class="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 pl-6">
                      <span class="text-xs">└─</span> Trade #{{ trade.id }}
                    </td>
                    <td class="px-3 py-2 text-sm">
                      <span class="px-1.5 inline-flex text-xs leading-4 font-medium rounded"
                        :class="[
                          trade.side === 'long' 
                            ? 'bg-green-50 text-green-700 dark:bg-green-900/10 dark:text-green-400'
                            : 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-400'
                        ]">
                        {{ trade.side }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                      {{ trade.quantity.toLocaleString() }}
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                      ${{ formatCurrency(trade.entry_price) }}
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 text-right">
                      ${{ formatCurrency(trade.entry_price * trade.quantity) }}
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-400 text-right">
                      <span class="text-xs">-</span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-400 text-right">
                      <span class="text-xs">-</span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-400 text-right">
                      <span class="text-xs">-</span>
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {{ formatDate(trade.trade_date) }}
                    </td>
                    <td class="px-3 py-2 text-sm text-right">
                      <router-link
                        :to="`/trades/${trade.id}`"
                        class="text-primary-600 hover:text-primary-900 dark:hover:text-primary-400 font-medium text-xs"
                      >
                        View
                      </router-link>
                    </td>
                  </tr>
                </template>
              </tbody>
              <tfoot class="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <tr>
                  <td colspan="4" class="px-3 py-3 text-sm font-bold text-gray-900 dark:text-white text-right">
                    Total:
                  </td>
                  <td class="px-3 py-3 text-sm font-bold text-gray-900 dark:text-white text-right">
                    ${{ formatCurrency(totalOpenCost) }}
                  </td>
                  <td colspan="2" class="px-3 py-3"></td>
                  <td class="px-3 py-3 text-sm font-bold text-right">
                    <div v-if="totalUnrealizedPnL !== null">
                      <div :class="[
                        totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                      ]">
                        {{ totalUnrealizedPnL >= 0 ? '+' : '' }}${{ formatCurrency(Math.abs(totalUnrealizedPnL)) }}
                      </div>
                      <div class="text-xs" :class="[
                        totalUnrealizedPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'
                      ]">
                        {{ totalUnrealizedPnLPercent >= 0 ? '+' : '' }}{{ formatNumber(totalUnrealizedPnLPercent) }}%
                      </div>
                    </div>
                    <span v-else class="text-xs text-gray-400">-</span>
                  </td>
                  <td colspan="2" class="px-3 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <!-- Upcoming Earnings Section -->
      <UpcomingEarningsSection 
        v-if="openTradeSymbols.length > 0" 
        :symbols="openTradeSymbols" 
      />

      <!-- Trade News Section -->
      <TradeNewsSection 
        v-if="openTradeSymbols.length > 0" 
        :symbols="openTradeSymbols" 
      />

      <!-- Key Metrics Cards -->
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Total P&L
            </dt>
            <dd class="mt-1 text-3xl font-semibold" :class="[
              analytics.summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
            ]">
              ${{ formatCurrency(analytics.summary.totalPnL) }}
            </dd>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Avg: ${{ formatCurrency(analytics.summary.avgPnL) }}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Win Rate
            </dt>
            <dd class="mt-1 text-3xl font-semibold" :class="[
              analytics.summary.winRate >= 50 ? 'text-green-600' : 'text-red-600'
            ]">
              {{ formatPercent(analytics.summary.winRate) }}%
            </dd>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ analytics.summary.winningTrades }}/{{ analytics.summary.totalTrades }} trades
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Profit Factor
            </dt>
            <dd class="mt-1 text-3xl font-semibold" :class="[
              analytics.summary.profitFactor >= 1 ? 'text-green-600' : 'text-red-600'
            ]">
              {{ formatNumber(analytics.summary.profitFactor) }}
            </dd>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {{ analytics.summary.profitFactor >= 1 ? 'Profitable' : 'Unprofitable' }}
            </div>
          </div>
        </div>

        <div class="card cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToAnalytics('drawdown')">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Max Drawdown
            </dt>
            <dd class="mt-1 text-3xl font-semibold text-red-600">
              ${{ formatCurrency(Math.abs(analytics.summary.maxDrawdown)) }}
            </dd>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Peak decline
            </div>
          </div>
        </div>
      </div>

      <!-- Additional Metrics Row -->
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div class="card cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToTradesFiltered('avgWin')">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Average Win
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-green-600">
              ${{ formatCurrency(analytics.summary.avgWin) }}
            </dd>
          </div>
        </div>

        <div class="card cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToTradesFiltered('avgLoss')">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Average Loss
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-red-600">
              ${{ formatCurrency(Math.abs(analytics.summary.avgLoss)) }}
            </dd>
          </div>
        </div>

        <div class="card cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToTradesFiltered('best')">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Best Trade
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-green-600">
              ${{ formatCurrency(analytics.summary.bestTrade) }}
            </dd>
          </div>
        </div>

        <div class="card cursor-pointer hover:shadow-lg transition-shadow" @click="navigateToTradesFiltered('worst')">
          <div class="card-body">
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              Worst Trade
            </dt>
            <dd class="mt-1 text-2xl font-semibold text-red-600">
              ${{ formatCurrency(analytics.summary.worstTrade) }}
            </dd>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- P&L Over Time Chart (2/3 width) -->
        <div class="lg:col-span-2 card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Cumulative P&L Over Time
            </h3>
            <div class="h-80">
              <canvas ref="pnlChart"></canvas>
            </div>
          </div>
        </div>

        <!-- Win/Loss Distribution (1/3 width) -->
        <div class="lg:col-span-1 card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Win/Loss Distribution
            </h3>
            <div class="h-80">
              <canvas ref="distributionChart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Daily Win Rate Chart Row -->
      <div class="grid grid-cols-1 gap-8">
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Daily Win Rate
            </h3>
            <div class="h-80">
              <canvas ref="winRateChart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Tables Row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Performance by Symbol -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Performance by Symbol
            </h3>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Trades
                    </th>
                    <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      P&L
                    </th>
                    <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Avg
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="symbol in analytics.performanceBySymbol.slice(0, 10)" :key="symbol.symbol" 
                      @click="navigateToTradesWithSymbol(symbol.symbol)"
                      class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td class="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">
                      {{ symbol.symbol }}
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {{ symbol.trades }}
                    </td>
                    <td class="px-3 py-2 text-sm text-right" :class="[
                      symbol.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    ]">
                      ${{ formatCurrency(symbol.total_pnl) }}
                    </td>
                    <td class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                      ${{ formatCurrency(symbol.avg_pnl) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Best and Worst Trades -->
        <div class="card">
          <div class="card-body">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Top Trades
            </h3>
            
            <div class="space-y-4">
              <div>
                <h4 class="text-sm font-medium text-green-600 mb-2">Best Trades</h4>
                <div class="space-y-1">
                  <div v-for="trade in analytics.topTrades.best" :key="`best-${trade.symbol}-${trade.trade_date}`" 
                       @click="navigateToTradesBySymbolAndDate(trade.symbol, trade.trade_date)"
                       class="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-2 transition-colors">
                    <span class="text-gray-900 dark:text-white">
                      {{ trade.symbol }} {{ formatDate(trade.trade_date) }}
                    </span>
                    <span class="text-green-600 font-medium">
                      ${{ formatCurrency(trade.pnl) }}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 class="text-sm font-medium text-red-600 mb-2">Worst Trades</h4>
                <div class="space-y-1">
                  <div v-for="trade in analytics.topTrades.worst" :key="`worst-${trade.symbol}-${trade.trade_date}`" 
                       @click="navigateToTradesBySymbolAndDate(trade.symbol, trade.trade_date)"
                       class="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-2 transition-colors">
                    <span class="text-gray-900 dark:text-white">
                      {{ trade.symbol }} {{ formatDate(trade.trade_date) }}
                    </span>
                    <span class="text-red-600 font-medium">
                      ${{ formatCurrency(trade.pnl) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Additional Stats -->
      <div class="card">
        <div class="card-body">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Additional Statistics
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                Sharpe Ratio
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {{ formatNumber(analytics.summary.sharpeRatio) }}
              </dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                Total Commissions
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                ${{ formatCurrency(analytics.summary.totalCosts) }}
              </dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                Symbols Traded
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {{ analytics.summary.symbolsTraded }}
              </dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                Trading Days
              </dt>
              <dd class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {{ analytics.summary.tradingDays }}
              </dd>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { format } from 'date-fns'
import Chart from 'chart.js/auto'
import api from '@/services/api'
import TradeNewsSection from '@/components/dashboard/TradeNewsSection.vue'
import UpcomingEarningsSection from '@/components/dashboard/UpcomingEarningsSection.vue'

const authStore = useAuthStore()
const router = useRouter()

const loading = ref(true)
const analytics = ref({
  summary: {},
  performanceBySymbol: [],
  dailyPnL: [],
  dailyWinRate: [],
  topTrades: { best: [], worst: [] }
})
const openTrades = ref([])
const symbols = ref([])
const strategies = ref([])

const filters = ref({
  timeRange: 'all',
  symbol: '',
  strategy: '',
  startDate: '',
  endDate: ''
})

const pnlChart = ref(null)
const distributionChart = ref(null)
const winRateChart = ref(null)
let pnlChartInstance = null
let distributionChartInstance = null
let winRateChartInstance = null

const openTradeSymbols = computed(() => {
  return [...new Set(openTrades.value.map(position => position.symbol))]
})

const totalOpenCost = computed(() => {
  return openTrades.value.reduce((sum, position) => sum + (position.totalCost || 0), 0)
})

const totalUnrealizedPnL = computed(() => {
  const hasQuotes = openTrades.value.some(position => position.unrealizedPnL !== null)
  if (!hasQuotes) return null
  
  return openTrades.value.reduce((sum, position) => sum + (position.unrealizedPnL || 0), 0)
})

const totalUnrealizedPnLPercent = computed(() => {
  if (totalUnrealizedPnL.value === null || totalOpenCost.value === 0) return 0
  return (totalUnrealizedPnL.value / totalOpenCost.value) * 100
})

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '0.00'
  return Math.abs(amount).toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })
}

function formatNumber(num) {
  if (!num && num !== 0) return '0.00'
  return parseFloat(num).toFixed(2)
}

function formatPercent(num) {
  if (!num && num !== 0) return '0.0'
  return parseFloat(num).toFixed(1)
}

function formatDate(dateStr) {
  return format(new Date(dateStr), 'MMM dd')
}

function getDateRange(range) {
  if (range === 'all') {
    return { startDate: undefined, endDate: undefined }
  }
  
  if (range === 'custom') {
    return {
      startDate: filters.value.startDate || undefined,
      endDate: filters.value.endDate || undefined
    }
  }
  
  const now = new Date()
  const start = new Date()
  
  switch (range) {
    case 'feb2025':
      return {
        startDate: '2025-02-01',
        endDate: '2025-02-28'
      }
    case 'march2025':
      return {
        startDate: '2025-03-01',
        endDate: '2025-03-31'
      }
    case '7d':
      start.setDate(now.getDate() - 7)
      break
    case '30d':
      start.setDate(now.getDate() - 30)
      break
    case '90d':
      start.setDate(now.getDate() - 90)
      break
    case '1y':
      start.setFullYear(now.getFullYear() - 1)
      break
    case 'ytd':
      start.setMonth(0, 1)
      break
    default:
      return { startDate: undefined, endDate: undefined }
  }
  
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: now.toISOString().split('T')[0]
  }
}

async function fetchAnalytics() {
  try {
    loading.value = true
    
    const dateRange = getDateRange(filters.value.timeRange)
    const params = new URLSearchParams()
    
    // Only add parameters if they have values
    if (dateRange.startDate) params.append('startDate', dateRange.startDate)
    if (dateRange.endDate) params.append('endDate', dateRange.endDate)
    if (filters.value.symbol) params.append('symbol', filters.value.symbol)
    if (filters.value.strategy) params.append('strategy', filters.value.strategy)
    
    console.log('Dashboard: Fetching analytics with params:', params.toString())
    const response = await api.get(`/trades/analytics?${params}`)
    analytics.value = response.data
    
    console.log('Dashboard: Analytics response:', analytics.value)
    console.log('Dashboard: Daily P&L data length:', analytics.value.dailyPnL?.length)
    console.log('Dashboard: Daily P&L data:', analytics.value.dailyPnL)
    console.log('Dashboard: Summary data:', analytics.value.summary)
    console.log('Dashboard: Top trades data:', analytics.value.topTrades)
    console.log('Dashboard: Win/Loss counts:', {
      wins: analytics.value.summary?.winningTrades,
      losses: analytics.value.summary?.losingTrades,
      breakeven: analytics.value.summary?.breakevenTrades
    })
    
    await nextTick()
    // Use setTimeout to ensure DOM is fully rendered
    setTimeout(() => {
      createCharts()
    }, 100)
  } catch (error) {
    console.error('Failed to fetch analytics:', error)
  } finally {
    loading.value = false
  }
}

async function fetchOpenTrades() {
  try {
    // Use the new endpoint that includes real-time quotes
    console.log('Fetching open positions with quotes...')
    const response = await api.get('/trades/open-positions-quotes')
    
    console.log('Open positions response:', response.data)
    
    if (response.data.error) {
      console.warn('Real-time quotes not available:', response.data.error)
    }
    
    openTrades.value = response.data.positions || []
    console.log('Set openTrades to:', openTrades.value)
    
  } catch (error) {
    console.error('Failed to fetch open trades:', error)
    
    // Fallback to original endpoint if the new one fails
    try {
      const fallbackResponse = await api.get('/trades', {
        params: { status: 'open', limit: 100 }
      })
      const trades = fallbackResponse.data.trades || fallbackResponse.data
      
      // Group trades by symbol and calculate totals (without real-time data)
      const grouped = {}
      trades.forEach(trade => {
        if (!grouped[trade.symbol]) {
          grouped[trade.symbol] = {
            symbol: trade.symbol,
            side: trade.side,
            trades: [],
            totalQuantity: 0,
            totalCost: 0,
            avgPrice: 0
          }
        }
        
        grouped[trade.symbol].trades.push(trade)
        grouped[trade.symbol].totalQuantity += trade.quantity
        grouped[trade.symbol].totalCost += (trade.entry_price * trade.quantity)
      })
      
      // Calculate average prices and convert to array
      openTrades.value = Object.values(grouped).map(group => {
        group.avgPrice = group.totalCost / group.totalQuantity
        return group
      }).sort((a, b) => a.symbol.localeCompare(b.symbol))
      
    } catch (fallbackError) {
      console.error('Fallback fetch also failed:', fallbackError)
      openTrades.value = []
    }
  }
}

async function fetchFilterOptions() {
  try {
    const [symbolsResponse, strategiesResponse] = await Promise.all([
      api.get('/trades/symbols'),
      api.get('/trades/strategies')
    ])
    
    symbols.value = symbolsResponse.data.symbols
    strategies.value = strategiesResponse.data.strategies
  } catch (error) {
    console.error('Failed to fetch filter options:', error)
  }
}

function createPnLChart() {
  console.log('Dashboard: Creating P&L chart...');
  if (pnlChartInstance) {
    pnlChartInstance.destroy();
  }

  const ctx = pnlChart.value.getContext('2d');
  const dailyData = analytics.value.dailyPnL || [];
  const pnlValues = dailyData.map(d => parseFloat(d.cumulative_pnl) || 0);

  const positiveColor = 'rgba(16, 185, 129, 1)'; // Solid green
  const negativeColor = 'rgba(239, 68, 68, 1)'; // Solid red
  const positiveFillColor = 'rgba(16, 185, 129, 0.2)'; // Lighter green fill
  const negativeFillColor = 'rgba(239, 68, 68, 0.2)'; // Lighter red fill

  try {
    pnlChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dailyData.map(d => format(new Date(d.trade_date), 'MMM dd')),
        datasets: [{
          label: 'Cumulative P&L',
          data: pnlValues,
          fill: {
            target: 'origin',
            above: positiveFillColor, 
            below: negativeFillColor
          },
          segment: {
            borderColor: ctx => {
              const y = ctx.p1.parsed.y;
              return y >= 0 ? positiveColor : negativeColor;
            },
          },
          tension: 0.1,
          pointBackgroundColor: 'orange',
          pointBorderColor: 'orange',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const clickedDate = dailyData[index].trade_date;
            navigateToTradesByDate(clickedDate);
          }
        },
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            grid: {
              color: 'rgba(156, 163, 175, 0.1)'
            },
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          },
          x: {
            grid: {
              color: 'rgba(156, 163, 175, 0.1)'
            }
          }
        }
      }
    });
    console.log('Dashboard: P&L chart created successfully');
  } catch (error) {
    console.error('Dashboard: Error creating P&L chart:', error);
  }
}

function createDistributionChart() {
  console.log('Dashboard: Creating distribution chart...')
  console.log('Dashboard: distributionChart.value exists:', !!distributionChart.value)
  console.log('Dashboard: summary data:', analytics.value.summary)
  
  if (distributionChartInstance) {
    distributionChartInstance.destroy()
  }
  
  const ctx = distributionChart.value.getContext('2d')
  const summary = analytics.value.summary
  
  console.log('Dashboard: Distribution data:', [
    summary.winningTrades || 0,
    summary.losingTrades || 0,
    summary.breakevenTrades || 0
  ])
  
  distributionChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Wins', 'Losses', 'Breakeven'],
      datasets: [{
        data: [
          parseInt(summary.winningTrades) || 0,
          parseInt(summary.losingTrades) || 0,
          parseInt(summary.breakevenTrades) || 0
        ],
        backgroundColor: [
          '#10b981',
          '#ef4444',
          '#6b7280'
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const clickedSegment = ['profit', 'loss', 'breakeven'][index]
          navigateToTradesByPnLType(clickedSegment)
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          onClick: null // Disable legend clicking
        }
      }
    }
  })
}

function createWinRateChart() {
  console.log('Dashboard: Creating win rate chart...')
  console.log('Dashboard: winRateChart.value exists:', !!winRateChart.value)
  console.log('Dashboard: dailyWinRate data:', analytics.value.dailyWinRate)
  
  if (winRateChartInstance) {
    winRateChartInstance.destroy()
  }
  
  const ctx = winRateChart.value.getContext('2d')
  const winRateData = analytics.value.dailyWinRate || []
  
  console.log('Dashboard: Processed winRateData for chart:', winRateData)
  
  winRateChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: winRateData.map(d => format(new Date(d.trade_date), 'MMM dd')),
      datasets: [{
        label: 'Win Rate (%)',
        data: winRateData.map(d => parseFloat(d.win_rate) || 0),
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: '#10b981',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index
          const clickedDate = winRateData[index].trade_date
          navigateToTradesByDate(clickedDate)
        }
      },
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            callback: function(value) {
              return value + '%'
            }
          }
        },
        x: {
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          }
        }
      }
    }
  })
}

function createCharts() {
  console.log('Dashboard: createCharts called')
  console.log('Dashboard: pnlChart.value exists:', !!pnlChart.value)
  console.log('Dashboard: distributionChart.value exists:', !!distributionChart.value)
  console.log('Dashboard: winRateChart.value exists:', !!winRateChart.value)
  console.log('Dashboard: analytics.value exists:', !!analytics.value)
  console.log('Dashboard: Chart.js imported:', typeof Chart)
  
  if (pnlChart.value && distributionChart.value && winRateChart.value) {
    createPnLChart()
    createDistributionChart()
    createWinRateChart()
  } else {
    console.log('Dashboard: Charts not created - missing canvas refs:', {
      pnlChart: !!pnlChart.value,
      distributionChart: !!distributionChart.value, 
      winRateChart: !!winRateChart.value
    })
  }
}

function applyFilters() {
  fetchAnalytics()
}

function navigateToTradesWithSymbol(symbol) {
  router.push({
    name: 'trades',
    query: { symbol }
  }).then(() => {
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTrade(tradeId) {
  console.log('navigateToTrade called with:', tradeId)
  if (!tradeId) {
    console.error('Trade ID is missing! Cannot navigate.')
    alert('This trade cannot be opened - ID is missing. The backend needs to be updated.')
    return
  }
  router.push({
    name: 'trade-detail',
    params: { id: tradeId }
  })
}

function navigateToAnalytics(section) {
  router.push({
    name: 'analytics',
    hash: section ? `#${section}` : ''
  })
}

function navigateToOpenTrades() {
  router.push({
    name: 'trades',
    query: { status: 'open' }
  }).then(() => {
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesBySymbolAndDate(symbol, tradeDate) {
  console.log('Navigating to trades for:', symbol, tradeDate)
  const date = new Date(tradeDate)
  const formattedDate = date.toISOString().split('T')[0]
  
  router.push({
    name: 'trades',
    query: { 
      symbol: symbol,
      startDate: formattedDate,
      endDate: formattedDate
    }
  }).then(() => {
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesFiltered(type) {
  console.log('Navigating to trades filtered by:', type)
  const queryParams = {}
  
  if (type === 'best' && analytics.value.bestTradeDetails) {
    // Filter to show trades for the specific symbol and date of the best trade
    const bestTrade = analytics.value.bestTradeDetails
    queryParams.symbol = bestTrade.symbol
    const date = new Date(bestTrade.trade_date)
    const formattedDate = date.toISOString().split('T')[0]
    queryParams.startDate = formattedDate
    queryParams.endDate = formattedDate
  } else if (type === 'worst' && analytics.value.worstTradeDetails) {
    // Filter to show trades for the specific symbol and date of the worst trade
    const worstTrade = analytics.value.worstTradeDetails
    queryParams.symbol = worstTrade.symbol
    const date = new Date(worstTrade.trade_date)
    const formattedDate = date.toISOString().split('T')[0]
    queryParams.startDate = formattedDate
    queryParams.endDate = formattedDate
  } else if (type === 'avgWin') {
    // Filter to show only profitable trades
    queryParams.pnlType = 'profit'
  } else if (type === 'avgLoss') {
    // Filter to show only losing trades
    queryParams.pnlType = 'loss'
  } else {
    // Fallback to general filtering if trade details aren't available
    if (type === 'best') {
      queryParams.pnlType = 'profit'
    } else if (type === 'worst') {
      queryParams.pnlType = 'loss'
    }
  }
  
  router.push({
    name: 'trades',
    query: queryParams
  }).then(() => {
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

// Chart navigation functions
function navigateToTradesByDate(date) {
  router.push({
    name: 'trades',
    query: {
      startDate: date,
      endDate: date
    }
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function navigateToTradesByPnLType(type) {
  let pnlType = ''
  if (type === 'profit') {
    pnlType = 'profit'
  } else if (type === 'loss') {
    pnlType = 'loss'
  }
  // For breakeven, we don't have a specific filter, so show all trades
  
  const query = {}
  if (pnlType) {
    query.pnlType = pnlType
  }
  
  router.push({
    name: 'trades',
    query
  }).then(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

// Watch for when loading finishes to try creating charts
watch(loading, (newLoading) => {
  if (!newLoading && analytics.value.dailyPnL?.length > 0) {
    console.log('Dashboard: Loading finished, attempting to create charts')
    setTimeout(() => {
      createCharts()
    }, 200)
  }
})

onMounted(async () => {
  await Promise.all([
    fetchAnalytics(),
    fetchFilterOptions(),
    fetchOpenTrades()
  ])
})
</script>