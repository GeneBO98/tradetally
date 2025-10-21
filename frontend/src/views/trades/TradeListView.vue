<template>
  <div :class="[isFullWidth ? 'max-w-full px-4 sm:px-6 lg:px-12' : 'max-w-7xl px-4 sm:px-6 lg:px-8', 'mx-auto py-8 transition-all duration-300']">
    <!-- Title -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Trades</h1>
      <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">
        A list of all your trades including their details and performance.
      </p>
    </div>
    
    <!-- Buttons Row -->
    <div class="flex items-center justify-between mb-6">
      <button 
        @click="goBack" 
        class="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
        Back
      </button>
      <router-link to="/trades/new" class="btn-primary">
        Add trade
      </router-link>
    </div>

    <!-- Enrichment Status -->
    <EnrichmentStatus />

    <div class="mt-8 card">
      <div class="card-body">
        <TradeFilters @filter="handleFilter" />
      </div>
    </div>


    <!-- Total P/L Summary for Filtered Results -->
    <div v-if="tradesStore.trades.length > 0" class="mt-6">
      <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <!-- Mobile Layout: Stack vertically -->
        <div class="block sm:hidden space-y-4">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Total P&L ({{ tradesStore.totalTrades }} {{ tradesStore.totalTrades === 1 ? 'trade' : 'trades' }})
              </h3>
              <div class="text-lg font-semibold" :class="[
                tradesStore.totalPnL >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              ]">
                {{ tradesStore.totalPnL >= 0 ? '+' : '' }}${{ formatNumber(Math.abs(tradesStore.totalPnL)) }}
              </div>
            </div>
            <!-- Fullwidth Toggle (Mobile) -->
            <button
              @click="toggleFullWidth"
              class="inline-flex items-center p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              :title="isFullWidth ? 'Exit fullwidth mode' : 'Enter fullwidth mode'"
            >
              <svg v-if="!isFullWidth" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
              </svg>
              <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"></path>
              </svg>
            </button>
          </div>
          <div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">Win Rate</div>
            <div class="text-lg font-medium text-gray-900 dark:text-white">{{ tradesStore.winRate }}%</div>
          </div>
        </div>
        
        <!-- Desktop Layout: Side by side -->
        <div class="hidden sm:flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Total P&L ({{ tradesStore.totalTrades }} {{ tradesStore.totalTrades === 1 ? 'trade' : 'trades' }})
            </h3>
            <div class="text-lg font-semibold" :class="[
              tradesStore.totalPnL >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            ]">
              {{ tradesStore.totalPnL >= 0 ? '+' : '' }}${{ formatNumber(Math.abs(tradesStore.totalPnL)) }}
            </div>
          </div>
          <div class="flex items-center gap-6">
            <div class="text-right">
              <div class="text-sm text-gray-500 dark:text-gray-400">Win Rate</div>
              <div class="text-lg font-medium text-gray-900 dark:text-white">{{ tradesStore.winRate }}%</div>
            </div>
            <!-- Fullwidth Toggle -->
            <button
              @click="toggleFullWidth"
              class="inline-flex items-center p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              :title="isFullWidth ? 'Exit fullwidth mode' : 'Enter fullwidth mode'"
            >
              <svg v-if="!isFullWidth" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
              </svg>
              <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-8">
      <div v-if="tradesStore.loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="tradesStore.trades.length === 0" class="text-center py-12">
        <DocumentTextIcon class="mx-auto h-12 w-12 text-gray-400" />
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No trades</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Get started by creating a new trade.
        </p>
        <div class="mt-6">
          <router-link to="/trades/new" class="btn-primary">
            Add trade
          </router-link>
        </div>
      </div>

      <!-- Show trades when available -->
      <div v-else :key="tradesStore.trades.length">
        <!-- Bulk Actions Bar -->
        <div v-if="selectedTrades.length > 0" class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div class="flex items-center justify-between">
            <span class="text-sm text-blue-800 dark:text-blue-200">
              {{ selectedTrades.length }} trade{{ selectedTrades.length === 1 ? '' : 's' }} selected
            </span>
            <div class="flex items-center space-x-2">
              <button
                @click="clearSelection"
                class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Clear selection
              </button>
              <button
                @click="showBulkTagModal = true"
                class="px-3 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Add tags
              </button>
              <button
                @click="confirmBulkDelete"
                class="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete selected
              </button>
            </div>
          </div>
        </div>

        <!-- Mobile Column Customizer -->
        <div class="block md:hidden mb-4 flex justify-end">
          <ColumnCustomizer :columns="tableColumns" @update:columns="handleColumnsUpdate" />
        </div>

        <!-- Mobile view (cards) -->
        <div class="block md:hidden space-y-4" :key="'mobile-' + tradesStore.trades.length">
        <div v-for="trade in tradesStore.trades" :key="trade.id" 
             class="bg-white dark:bg-gray-800 shadow rounded-lg p-4 hover:shadow-md transition-shadow">
          <div class="flex items-start space-x-3 mb-3">
            <input
              type="checkbox"
              :value="trade.id"
              v-model="selectedTrades"
              @click.stop
              class="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <div class="flex-1 cursor-pointer" @click="$router.push(`/trades/${trade.id}`)">
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center space-x-2">
                <div class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ trade.symbol }}
                </div>
                <span class="px-2 py-1 text-xs font-semibold rounded-full"
                  :class="[
                    trade.side === 'long' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  ]">
                  {{ trade.side }}
                </span>
                <!-- News badge for mobile -->
                <span v-if="trade.has_news" 
                  :class="getNewsBadgeClasses(trade.news_sentiment)"
                  class="px-2 py-1 text-xs font-semibold rounded-full flex items-center"
                  :title="`${trade.news_events?.length || 0} news article(s) - ${trade.news_sentiment || 'neutral'} sentiment`">
                  <MdiIcon :icon="newspaperIcon" :size="14" class="mr-1" />
                  <span>{{ trade.news_events?.length || 0 }}</span>
                </span>
              </div>
            <span class="px-2 py-1 text-xs font-semibold rounded-full"
              :class="[
                trade.exit_price 
                  ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
              ]">
              {{ trade.exit_price ? 'Closed' : 'Open' }}
            </span>
          </div>
          
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-gray-500 dark:text-gray-400">Date</div>
              <div class="text-gray-900 dark:text-white">{{ formatDate(trade.trade_date) }}</div>
            </div>
            <div>
              <div class="text-gray-500 dark:text-gray-400">Entry</div>
              <div class="text-gray-900 dark:text-white">${{ formatNumber(trade.entry_price) }}</div>
            </div>
            <div>
              <div class="text-gray-500 dark:text-gray-400">Exit</div>
              <div class="text-gray-900 dark:text-white">
                {{ trade.exit_price ? `$${formatNumber(trade.exit_price)}` : '-' }}
              </div>
            </div>
            <div>
              <div class="text-gray-500 dark:text-gray-400">P&L</div>
              <div class="font-medium" :class="[
                trade.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              ]">
                {{ trade.pnl ? `$${formatNumber(trade.pnl)}` : '-' }}
                <span v-if="trade.pnl_percent" class="text-xs ml-1">
                  ({{ trade.pnl_percent > 0 ? '+' : '' }}{{ formatNumber(trade.pnl_percent) }}%)
                </span>
              </div>
            </div>
          </div>
          
          <!-- Confidence Level -->
          <div v-if="trade.confidence" class="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <div class="text-xs text-gray-500 dark:text-gray-400">Confidence</div>
              <div class="flex items-center space-x-2">
                <div class="flex space-x-1">
                  <div v-for="i in 10" :key="i" class="w-2 h-2 rounded-full"
                    :class="i <= trade.confidence ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'">
                  </div>
                </div>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{ trade.confidence }}/10</span>
              </div>
            </div>
          </div>
          
          <!-- Sector Information -->
          <div v-if="trade.sector" class="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div class="text-xs text-gray-500 dark:text-gray-400">Sector</div>
            <div class="text-sm text-gray-900 dark:text-white">{{ trade.sector }}</div>
          </div>
          
          <div class="flex justify-between items-center mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <button
              @click.stop="openComments(trade)"
              class="inline-flex items-center text-gray-500 hover:text-primary-600 transition-colors"
            >
              <ChatBubbleLeftIcon class="h-4 w-4 mr-1" />
              <span class="text-sm">{{ trade.comment_count || 0 }}</span>
            </button>
            <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
        </div>
        </div>
        </div>

        <!-- Desktop view (table) -->
        <div class="hidden md:block shadow ring-1 ring-black ring-opacity-5 md:rounded-lg" :key="'desktop-' + tradesStore.trades.length">
        <!-- Top scroll bar wrapper -->
        <div ref="topScroll" class="overflow-x-auto overflow-y-hidden bg-gray-100 dark:bg-gray-800" @scroll="syncBottomScroll" style="height: 17px;">
          <div :style="{width: tableScrollWidth, height: '1px'}"></div>
        </div>
        <!-- Main table wrapper -->
        <div ref="bottomScroll" class="overflow-x-auto relative" @scroll="syncTopScroll">
          <table class="w-full divide-y divide-gray-300 dark:divide-gray-700" :style="tableLayoutStyle">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <template v-for="column in tableColumns" :key="column.key">
                <th v-if="column.visible && column.key === 'checkbox'" :class="[getHeaderPadding, 'text-left']">
                  <input
                    type="checkbox"
                    :checked="isAllSelected"
                    @change="toggleSelectAll"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </th>
                <th v-else-if="column.visible"
                    :class="[getHeaderPadding, 'text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider', { 'text-center': column.key === 'comments' }]">
                  {{ column.label }}
                </th>
              </template>
              <!-- Column Customizer in header -->
              <th class="px-2 py-3 text-center relative" style="width: 40px;">
                <ColumnCustomizer :columns="tableColumns" @update:columns="handleColumnsUpdate" />
              </th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="trade in tradesStore.trades" :key="trade.id" 
                class="hover:bg-gray-50 dark:hover:bg-gray-800">
              <template v-for="column in tableColumns" :key="`${trade.id}-${column.key}`">
                <!-- Checkbox Column -->
                <td v-if="column.visible && column.key === 'checkbox'" :class="[getCellPadding, 'whitespace-nowrap']">
                  <input
                    type="checkbox"
                    :value="trade.id"
                    v-model="selectedTrades"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </td>
                
                <!-- Symbol Column -->
                <td v-else-if="column.visible && column.key === 'symbol'"
                    :class="[getCellPadding, 'cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div class="flex items-center gap-1.5 flex-wrap max-w-xs">
                    <div class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px]" :title="trade.symbol">
                      {{ trade.symbol }}
                    </div>
                    <!-- Instrument type badge -->
                    <span v-if="trade.instrument_type === 'option'"
                      class="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400 whitespace-nowrap flex-shrink-0"
                      :title="`${trade.option_type?.toUpperCase()} - Strike: $${trade.strike_price} - Exp: ${trade.expiration_date}`">
                      OPT
                    </span>
                    <span v-else-if="trade.instrument_type === 'future'"
                      class="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400 whitespace-nowrap flex-shrink-0"
                      :title="`Futures contract`">
                      FUT
                    </span>
                    <!-- News badge -->
                    <span v-if="trade.has_news"
                      :class="getNewsBadgeClasses(trade.news_sentiment)"
                      class="px-1.5 py-0.5 text-xs font-semibold rounded-full flex items-center whitespace-nowrap flex-shrink-0"
                      :title="`${trade.news_events?.length || 0} news article(s) - ${trade.news_sentiment || 'neutral'} sentiment`">
                      <MdiIcon :icon="newspaperIcon" :size="12" class="mr-0.5" />
                      <span>{{ trade.news_events?.length || 0 }}</span>
                    </span>
                  </div>
                </td>
                
                <!-- Date Column -->
                <td v-else-if="column.visible && column.key === 'date'"
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div class="text-sm text-gray-900 dark:text-white leading-tight">
                    <div>{{ formatDateMonthDay(trade.trade_date) }}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">{{ formatDateYear(trade.trade_date) }}</div>
                  </div>
                </td>
                
                <!-- Side Column -->
                <td v-else-if="column.visible && column.key === 'side'" 
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                    :class="[
                      trade.side === 'long' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    ]">
                    {{ trade.side }}
                  </span>
                </td>
                
                <!-- Entry Column -->
                <td v-else-if="column.visible && column.key === 'entry'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  ${{ formatNumber(trade.entry_price) }}
                </td>
                
                <!-- Exit Column -->
                <td v-else-if="column.visible && column.key === 'exit'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.exit_price ? `$${formatNumber(trade.exit_price)}` : '-' }}
                </td>
                
                <!-- P&L Column -->
                <td v-else-if="column.visible && column.key === 'pnl'" 
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div class="text-sm font-medium" :class="[
                    trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    {{ trade.pnl ? `$${formatNumber(trade.pnl)}` : '-' }}
                  </div>
                  <div v-if="trade.pnl_percent" class="text-xs text-gray-500 dark:text-gray-400">
                    {{ trade.pnl_percent > 0 ? '+' : '' }}{{ formatNumber(trade.pnl_percent) }}%
                  </div>
                </td>
                
                <!-- Confidence Column -->
                <td v-else-if="column.visible && column.key === 'confidence'" 
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div v-if="trade.confidence" class="flex items-center space-x-2">
                    <div class="flex space-x-1">
                      <div v-for="i in 5" :key="i" class="w-2 h-2 rounded-full"
                        :class="i <= Math.ceil(trade.confidence / 2) ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'">
                      </div>
                    </div>
                    <span class="text-sm text-gray-900 dark:text-white">{{ trade.confidence }}/10</span>
                  </div>
                  <div v-else class="text-sm text-gray-500 dark:text-gray-400">-</div>
                </td>
                
                <!-- Sector Column -->
                <td v-else-if="column.visible && column.key === 'sector'" 
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div class="text-sm text-gray-900 dark:text-white">
                    {{ trade.sector || '-' }}
                  </div>
                </td>
                
                <!-- Status Column -->
                <td v-else-if="column.visible && column.key === 'status'" 
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                    :class="[
                      trade.exit_price 
                        ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    ]">
                    {{ trade.exit_price ? 'Closed' : 'Open' }}
                  </span>
                </td>
                
                <!-- Comments Column -->
                <td v-else-if="column.visible && column.key === 'comments'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-center']">
                  <button
                    @click.stop="openComments(trade)"
                    class="inline-flex items-center text-gray-500 hover:text-primary-600 transition-colors"
                  >
                    <ChatBubbleLeftIcon class="h-4 w-4 mr-1" />
                    <span class="text-sm">{{ trade.comment_count || 0 }}</span>
                  </button>
                </td>
                
                <!-- Additional Columns -->
                <td v-else-if="column.visible && column.key === 'quantity'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.quantity || '-' }}
                </td>
                
                <td v-else-if="column.visible && column.key === 'commission'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.commission ? `$${formatNumber(trade.commission)}` : '-' }}
                </td>
                
                <td v-else-if="column.visible && column.key === 'fees'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.fees ? `$${formatNumber(trade.fees)}` : '-' }}
                </td>
                
                <td v-else-if="column.visible && column.key === 'strategy'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.strategy || '-' }}
                </td>
                
                <td v-else-if="column.visible && column.key === 'broker'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.broker || '-' }}
                </td>
                
                <td v-else-if="column.visible && column.key === 'tags'" 
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div class="flex flex-wrap gap-1">
                    <span v-for="tag in (trade.tags || [])" :key="tag" 
                          class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                      {{ tag }}
                    </span>
                    <span v-if="!trade.tags || trade.tags.length === 0" class="text-sm text-gray-500 dark:text-gray-400">-</span>
                  </div>
                </td>
                
                <td v-else-if="column.visible && column.key === 'notes'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div class="truncate max-w-xs" :title="trade.notes">
                    {{ trade.notes || '-' }}
                  </div>
                </td>
                
                <td v-else-if="column.visible && column.key === 'holdTime'" 
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']" 
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ formatHoldTime(trade) }}
                </td>
                
                <td v-else-if="column.visible && column.key === 'roi'"
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div class="text-sm font-medium" :class="[
                    (trade.pnl_percent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    {{ trade.pnl_percent != null ? `${trade.pnl_percent > 0 ? '+' : ''}${formatNumber(trade.pnl_percent)}%` : '-' }}
                  </div>
                </td>

                <!-- Risk Management Fields -->
                <td v-else-if="column.visible && column.key === 'stopLoss'"
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div class="text-sm text-gray-900 dark:text-white font-mono">
                    {{ trade.stopLoss ? `$${formatNumber(trade.stopLoss)}` : '-' }}
                  </div>
                </td>

                <td v-else-if="column.visible && column.key === 'takeProfit'"
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div class="text-sm text-gray-900 dark:text-white font-mono">
                    {{ trade.takeProfit ? `$${formatNumber(trade.takeProfit)}` : '-' }}
                  </div>
                </td>

                <td v-else-if="column.visible && column.key === 'rValue'"
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  <div v-if="trade.rValue != null && trade.rValue !== undefined" class="text-sm font-medium" :class="[
                    trade.rValue >= 2 ? 'text-green-600 dark:text-green-400' :
                    trade.rValue >= 0 ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-red-600 dark:text-red-400'
                  ]">
                    {{ Number(trade.rValue).toFixed(1) }}R
                  </div>
                  <div v-else class="text-sm text-gray-500">-</div>
                </td>

                <!-- Options/Futures Fields -->
                <td v-else-if="column.visible && column.key === 'instrumentType'"
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  <span v-if="trade.instrument_type" class="capitalize">{{ trade.instrument_type }}</span>
                  <span v-else>Stock</span>
                </td>

                <td v-else-if="column.visible && column.key === 'underlyingSymbol'"
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.underlying_symbol || '-' }}
                </td>

                <td v-else-if="column.visible && column.key === 'optionType'"
                    :class="[getCellPadding, 'whitespace-nowrap cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  <span v-if="trade.option_type"
                        class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full uppercase"
                        :class="[
                          trade.option_type === 'call'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        ]">
                    {{ trade.option_type }}
                  </span>
                  <span v-else class="text-sm text-gray-500 dark:text-gray-400">-</span>
                </td>

                <td v-else-if="column.visible && column.key === 'strikePrice'"
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.strike_price ? `$${formatNumber(trade.strike_price)}` : '-' }}
                </td>

                <td v-else-if="column.visible && column.key === 'expirationDate'"
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.expiration_date ? formatDate(trade.expiration_date) : '-' }}
                </td>

                <td v-else-if="column.visible && column.key === 'contractSize'"
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.contract_size || '-' }}
                </td>

                <td v-else-if="column.visible && column.key === 'heartRate'"
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.heart_rate ? `${Math.round(trade.heart_rate)} BPM` : '-' }}
                </td>

                <td v-else-if="column.visible && column.key === 'sleepHours'"
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.sleep_hours ? `${Number(trade.sleep_hours).toFixed(1)}h` : '-' }}
                </td>

                <td v-else-if="column.visible && column.key === 'sleepScore'"
                    :class="[getCellPadding, 'whitespace-nowrap text-sm text-gray-900 dark:text-white cursor-pointer']"
                    @click="$router.push(`/trades/${trade.id}`)">
                  {{ trade.sleep_score ? Math.round(trade.sleep_score) : '-' }}
                </td>
              </template>
              <!-- Empty cell to align with column customizer -->
              <td class="px-2 py-4" style="width: 40px;"></td>
            </tr>
          </tbody>
          </table>
        </div>
        </div>
      </div>
        
      <!-- Pagination (shared for both mobile and desktop) -->
      <div v-if="tradesStore.pagination.totalPages > 1" class="mt-4">
        <div class="bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6 rounded-lg shadow">
          <div class="flex-1 flex justify-between sm:hidden">
            <button 
              @click="prevPage"
              :disabled="tradesStore.pagination.page === 1"
              class="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button 
              @click="nextPage"
              :disabled="tradesStore.pagination.page === tradesStore.pagination.totalPages"
              class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p class="text-sm text-gray-700 dark:text-gray-300">
                Showing
                <span class="font-medium">{{ (tradesStore.pagination.page - 1) * tradesStore.pagination.limit + 1 }}</span>
                to
                <span class="font-medium">{{ Math.min(tradesStore.pagination.page * tradesStore.pagination.limit, tradesStore.pagination.total) }}</span>
                of
                <span class="font-medium">{{ tradesStore.pagination.total }}</span>
                results
              </p>
            </div>
            <div>
              <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button 
                  @click="prevPage"
                  :disabled="tradesStore.pagination.page === 1"
                  class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span class="sr-only">Previous</span>
                  <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
                
                <button
                  v-for="page in visiblePages"
                  :key="page"
                  @click="goToPage(page)"
                  :class="[
                    page === tradesStore.pagination.page
                      ? 'z-10 bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700',
                    'relative inline-flex items-center px-4 py-2 border text-sm font-medium'
                  ]"
                >
                  {{ page }}
                </button>
                
                <button 
                  @click="nextPage"
                  :disabled="tradesStore.pagination.page === tradesStore.pagination.totalPages"
                  class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span class="sr-only">Next</span>
                  <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Comments Dialog -->
    <TradeCommentsDialog
      v-if="selectedTrade"
      :is-open="showCommentsDialog"
      :trade-id="selectedTrade.id"
      @close="showCommentsDialog = false"
      @comment-added="handleCommentAdded"
      @comment-deleted="handleCommentDeleted"
    />

    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div class="mt-3 text-center">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Delete Trades</h3>
          <div class="mt-2 px-7 py-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to delete {{ selectedTrades.length }} trade{{ selectedTrades.length === 1 ? '' : 's' }}?
              This action cannot be undone.
            </p>
          </div>
          <div class="flex justify-center space-x-4 px-4 py-3">
            <button
              @click="showDeleteConfirm = false"
              class="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md shadow-sm hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Cancel
            </button>
            <button
              @click="executeBulkDelete"
              class="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Bulk Tag Modal -->
    <div v-if="showBulkTagModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" @click.self="showBulkTagModal = false">
      <div class="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Add Tags to {{ selectedTrades.length }} Trade{{ selectedTrades.length === 1 ? '' : 's' }}</h3>
          <button
            @click="showBulkTagModal = false"
            class="text-gray-400 hover:text-gray-500"
          >
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select tags to add
          </label>
          <TagManagement v-model="bulkTagsToAdd" />
        </div>

        <div class="flex justify-end space-x-2">
          <button
            @click="showBulkTagModal = false"
            class="px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md shadow-sm hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Cancel
          </button>
          <button
            @click="executeBulkAddTags"
            :disabled="bulkTagsToAdd.length === 0"
            class="px-4 py-2 bg-primary-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Tags
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, computed, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTradesStore } from '@/stores/trades'
import { format } from 'date-fns'
import { DocumentTextIcon, ChatBubbleLeftIcon } from '@heroicons/vue/24/outline'
import TradeFilters from '@/components/trades/TradeFilters.vue'
import TradeCommentsDialog from '@/components/trades/TradeCommentsDialog.vue'
import EnrichmentStatus from '@/components/trades/EnrichmentStatus.vue'
import ColumnCustomizer from '@/components/trades/ColumnCustomizer.vue'
import TagManagement from '@/components/trades/TagManagement.vue'
import MdiIcon from '@/components/MdiIcon.vue'
import { mdiNewspaper } from '@mdi/js'
import api from '@/services/api'

const tradesStore = useTradesStore()
const route = useRoute()
const router = useRouter()

// MDI icons
const newspaperIcon = mdiNewspaper

// Fullwidth mode
const isFullWidth = ref(false)

// Scroll synchronization
const topScroll = ref(null)
const bottomScroll = ref(null)
const tableScrollWidth = ref('0px')

// Load fullwidth preference from localStorage
const loadFullWidthPreference = () => {
  const saved = localStorage.getItem('tradeListFullWidth')
  if (saved !== null) {
    isFullWidth.value = saved === 'true'
  }
}

// Toggle fullwidth mode
const toggleFullWidth = () => {
  isFullWidth.value = !isFullWidth.value
  localStorage.setItem('tradeListFullWidth', isFullWidth.value.toString())
}

// Scroll synchronization functions
const syncBottomScroll = () => {
  if (topScroll.value && bottomScroll.value) {
    bottomScroll.value.scrollLeft = topScroll.value.scrollLeft
  }
}

const syncTopScroll = () => {
  if (topScroll.value && bottomScroll.value) {
    topScroll.value.scrollLeft = bottomScroll.value.scrollLeft
  }
}

const updateTableScrollWidth = () => {
  if (bottomScroll.value) {
    const table = bottomScroll.value.querySelector('table')
    if (table) {
      tableScrollWidth.value = `${table.scrollWidth}px`
    }
  }
}

// Comments dialog
const showCommentsDialog = ref(false)
const selectedTrade = ref(null)

// Bulk selection
const selectedTrades = ref([])
const showDeleteConfirm = ref(false)
const showBulkTagModal = ref(false)
const bulkTagsToAdd = ref([])

// Column management
const tableColumns = ref([])

const handleColumnsUpdate = (columns) => {
  tableColumns.value = columns
  console.log('[TRADE LIST] Columns updated, visible columns:', columns.filter(c => c.visible).map(c => c.label))
}

// Dynamic table layout based on visible columns
const tableLayoutStyle = computed(() => {
  const visibleColumns = tableColumns.value.filter(col => col.visible).length

  // Use auto layout for better scaling, only force fixed when there are many columns
  if (visibleColumns <= 8) {
    return {
      tableLayout: 'auto'
    }
  } else if (visibleColumns <= 12) {
    return {
      tableLayout: 'fixed',
      minWidth: '100%'
    }
  } else {
    // For many columns, allow horizontal scroll
    return {
      tableLayout: 'fixed',
      minWidth: '1800px'
    }
  }
})

// Dynamic cell padding based on visible columns
const getCellPadding = computed(() => {
  const visibleColumns = tableColumns.value.filter(col => col.visible).length

  if (visibleColumns <= 6) {
    return 'px-6 py-4'
  } else if (visibleColumns <= 10) {
    return 'px-4 py-3'
  } else {
    return 'px-3 py-2'
  }
})

const getHeaderPadding = computed(() => {
  const visibleColumns = tableColumns.value.filter(col => col.visible).length

  if (visibleColumns <= 6) {
    return 'px-6 py-3'
  } else if (visibleColumns <= 10) {
    return 'px-4 py-2'
  } else {
    return 'px-3 py-2'
  }
})

// Dynamic text size for better fit
const getTextSize = computed(() => {
  const visibleColumns = tableColumns.value.filter(col => col.visible).length

  if (visibleColumns <= 8) {
    return 'text-sm'
  } else if (visibleColumns <= 12) {
    return 'text-xs'
  } else {
    return 'text-xs'
  }
})

// Pagination computed properties
const visiblePages = computed(() => {
  const current = tradesStore.pagination.page
  const total = tradesStore.pagination.totalPages
  const pages = []
  
  // Show 5 pages around current page
  const start = Math.max(1, current - 2)
  const end = Math.min(total, current + 2)
  
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  
  return pages
})

// Bulk selection computed properties
const isAllSelected = computed(() => {
  return tradesStore.trades.length > 0 && selectedTrades.value.length === tradesStore.trades.length
})

// Watch for pagination changes and refetch
watch(
  () => tradesStore.pagination.page,
  () => {
    tradesStore.fetchTrades()
  }
)

// Watch for trades changes to update scroll width
watch(
  () => tradesStore.trades.length,
  () => {
    // Use nextTick to ensure DOM has updated
    setTimeout(() => updateTableScrollWidth(), 100)
  }
)

// Watch for column changes to update scroll width
watch(
  () => tableColumns.value.filter(c => c.visible).length,
  () => {
    setTimeout(() => updateTableScrollWidth(), 100)
  }
)

function formatNumber(num) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num || 0)
}

function formatDate(date) {
  if (!date) return 'N/A'
  try {
    // Parse date string manually to avoid timezone issues
    // If it's a date-only string (YYYY-MM-DD), parse components directly
    const dateStr = date.toString()
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-').map(Number)
      // Create date in local timezone (month is 0-indexed)
      const dateObj = new Date(year, month - 1, day)
      return format(dateObj, 'MMM dd, yyyy')
    }
    // For datetime strings, use as-is
    return format(new Date(date), 'MMM dd, yyyy')
  } catch (error) {
    console.error('Date formatting error:', error, 'for date:', date)
    return 'Invalid Date'
  }
}

function formatDateMonthDay(date) {
  if (!date) return 'N/A'
  try {
    const dateStr = date.toString()
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-').map(Number)
      const dateObj = new Date(year, month - 1, day)
      return format(dateObj, 'MMM dd')
    }
    return format(new Date(date), 'MMM dd')
  } catch (error) {
    console.error('Date formatting error:', error, 'for date:', date)
    return 'N/A'
  }
}

function formatDateYear(date) {
  if (!date) return ''
  try {
    const dateStr = date.toString()
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year] = dateStr.split('-').map(Number)
      return year.toString()
    }
    return format(new Date(date), 'yyyy')
  } catch (error) {
    console.error('Date formatting error:', error, 'for date:', date)
    return ''
  }
}

function formatHoldTime(trade) {
  // Use hold_time_minutes if available
  if (trade.hold_time_minutes != null) {
    const minutes = trade.hold_time_minutes
    if (minutes < 60) return `${Math.floor(minutes)}m`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${Math.floor(minutes % 60)}m`
    const days = Math.floor(minutes / 1440)
    if (days === 1) return '1 day'
    return `${days} days`
  }

  // Fallback to calculating from dates
  if (!trade.entry_time || !trade.exit_time) return '-'
  const start = new Date(trade.entry_time)
  const end = new Date(trade.exit_time)
  const minutes = Math.floor((end - start) / (1000 * 60))
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${Math.floor(minutes % 60)}m`
  const days = Math.floor(minutes / 1440)
  if (days === 1) return '1 day'
  return `${days} days`
}

function handleFilter(filters) {
  tradesStore.setFilters(filters)
  tradesStore.fetchTrades()
}

function goToPage(page) {
  tradesStore.setPage(page)
}

function nextPage() {
  tradesStore.nextPage()
}

function prevPage() {
  tradesStore.prevPage()
}

function openComments(trade) {
  selectedTrade.value = trade
  showCommentsDialog.value = true
}

function handleCommentAdded() {
  // Increment the comment count for the trade
  const tradeIndex = tradesStore.trades.findIndex(t => t.id === selectedTrade.value.id)
  if (tradeIndex !== -1) {
    tradesStore.trades[tradeIndex].comment_count = (tradesStore.trades[tradeIndex].comment_count || 0) + 1
  }
}

function handleCommentDeleted() {
  // Decrement the comment count for the trade
  const tradeIndex = tradesStore.trades.findIndex(t => t.id === selectedTrade.value.id)
  if (tradeIndex !== -1) {
    tradesStore.trades[tradeIndex].comment_count = Math.max((tradesStore.trades[tradeIndex].comment_count || 0) - 1, 0)
  }
}

function goBack() {
  // Use the browser's back button to preserve scroll position and state
  window.history.back()
}

function clearStrategyFilter() {
  // Navigate to trades page without strategy query parameters
  router.push({ path: '/trades' })
}

// Bulk selection functions
function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedTrades.value = []
  } else {
    selectedTrades.value = tradesStore.trades.map(trade => trade.id)
  }
}

function clearSelection() {
  selectedTrades.value = []
}

function confirmBulkDelete() {
  if (selectedTrades.value.length === 0) return
  showDeleteConfirm.value = true
}

async function executeBulkDelete() {
  try {
    await tradesStore.bulkDeleteTrades(selectedTrades.value)
    selectedTrades.value = []
    showDeleteConfirm.value = false
    // Refresh the trades list
    await tradesStore.fetchTrades()
  } catch (error) {
    console.error('Failed to delete trades:', error)
  }
}

async function executeBulkAddTags() {
  if (bulkTagsToAdd.value.length === 0) return

  try {
    const response = await api.post('/trades/bulk/tags', {
      tradeIds: selectedTrades.value,
      tags: bulkTagsToAdd.value
    })

    console.log('[SUCCESS]', response.data.message)

    // Reset state
    selectedTrades.value = []
    bulkTagsToAdd.value = []
    showBulkTagModal.value = false

    // Refresh the trades list
    await tradesStore.fetchTrades()
  } catch (error) {
    console.error('[ERROR] Failed to add tags:', error)
    alert(error.response?.data?.message || 'Failed to add tags to trades')
  }
}

// Get news badge classes based on sentiment
function getNewsBadgeClasses(sentiment) {
  const baseClasses = 'px-2 py-1 text-xs font-semibold rounded-full flex items-center'
  
  switch (sentiment) {
    case 'positive':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    case 'negative':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    case 'neutral':
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }
}

onMounted(() => {
  // Load fullwidth preference
  loadFullWidthPreference()

  // Add debug function to window for testing
  window.debugSymbol = async (symbol) => {
    try {
      const response = await fetch(`/api/trades/debug-symbol?symbol=${symbol}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      console.log('Debug Symbol Results:', data);
      return data;
    } catch (error) {
      console.error('Debug failed:', error);
    }
  };

  // Check if there are URL parameters that the TradeFilters component should handle
  const hasFiltersInUrl = !!(
    route.query.symbol || route.query.startDate || route.query.endDate ||
    route.query.strategy || route.query.sector || route.query.status ||
    route.query.minPrice || route.query.maxPrice || route.query.minQuantity ||
    route.query.maxQuantity || route.query.holdTime || route.query.broker ||
    route.query.minHoldTime || route.query.maxHoldTime || route.query.pnlType
  )

  // Only fetch trades immediately if there are no URL parameters
  // TradeFilters component will handle URL parameters and trigger fetch automatically
  if (!hasFiltersInUrl) {
    tradesStore.fetchTrades()
  }

  // Initialize table scroll width after component is mounted
  setTimeout(() => updateTableScrollWidth(), 200)
})
</script>