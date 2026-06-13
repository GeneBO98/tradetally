<template>
  <div class="content-wrapper py-8">
    <!-- Back Button -->
    <div class="mb-6">
      <button 
        @click="$router.go(-1)"
        class="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        <span class="ml-1 text-sm">Back</span>
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="trade" class="space-y-8">
      <!-- Header -->
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="heading-page">
            {{ trade.symbol }} Trade
          </h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ formatDate(trade.trade_date) }} • {{ trade.side }}
          </p>
        </div>
        <div v-if="isOwner" class="flex flex-wrap gap-3 sm:justify-end">
          <button
            @click="toggleAIPanel"
            class="btn-primary inline-flex items-center gap-2"
          >
            <SparklesIcon class="h-4 w-4" />
            <span>{{ showAIPanel ? 'Hide Analysis' : 'Analyze Trade' }}</span>
          </button>
          <button
            v-if="trade.entry_price !== null && trade.entry_price !== undefined"
            @click="showShareCard = true"
            class="btn-secondary inline-flex items-center gap-2"
          >
            <ShareIcon class="h-4 w-4" />
            <span>Share</span>
          </button>
          <router-link :to="`/analysis/trade-management?tradeId=${trade.id}`" class="btn-secondary">
            Manage
          </router-link>
          <router-link :to="{ path: `/trades/${trade.id}/edit`, query: { from: 'trade-detail' } }" class="btn-secondary">
            Edit
          </router-link>
          <button @click="deleteTrade" class="btn-danger">
            Delete
          </button>
        </div>
      </div>

      <!-- Shareable trade card generator -->
      <TradeShareCard v-if="trade" v-model="showShareCard" :trade="trade" @made-public="trade.is_public = true" />

      <!-- Stored AI Analyses -->
      <div v-if="storedAIResponseCount > 0" class="rounded-lg border border-primary-200 bg-primary-50/60 dark:border-primary-900/50 dark:bg-primary-900/10">
        <button
          @click="storedAIExpanded = !storedAIExpanded"
          class="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        >
          <div class="flex items-center gap-3">
            <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              <SparklesIcon class="h-4 w-4" />
            </span>
            <div>
              <div class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ storedAIResponseCount }} AI response{{ storedAIResponseCount === 1 ? '' : 's' }} stored
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">
                {{ storedAIAnalyses.length }} analysis session{{ storedAIAnalyses.length === 1 ? '' : 's' }} for this trade
              </div>
            </div>
          </div>
          <svg
            class="h-5 w-5 text-gray-500 transition-transform dark:text-gray-400"
            :class="{ 'rotate-180': storedAIExpanded }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div v-if="storedAIExpanded" class="border-t border-primary-200 px-4 py-4 dark:border-primary-900/50">
          <div v-if="loadingStoredAIAnalyses" class="text-sm text-gray-500 dark:text-gray-400">
            Loading stored AI responses...
          </div>
          <div v-else class="space-y-5">
            <div
              v-for="analysis in storedAIAnalyses"
              :key="analysis.id"
              class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            >
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div class="text-sm font-medium text-gray-900 dark:text-white">
                  Analysis from {{ formatDateTime(analysis.created_at) }}
                </div>
                <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span v-if="analysis.position_group"
                    class="px-1.5 py-0.5 font-semibold rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 whitespace-nowrap"
                    :title="`Analyzed as a combined ${analysis.position_group.leg_count}-leg strategy`">
                    {{ formatPositionGroupLabel(analysis.position_group) }}
                  </span>
                  <span v-if="formatAIModelLabel(analysis.ai_metadata)">
                    {{ formatAIModelLabel(analysis.ai_metadata) }}
                  </span>
                  <span>{{ analysis.response_count }} response{{ analysis.response_count === 1 ? '' : 's' }}</span>
                </div>
              </div>
              <div class="space-y-4">
                <div
                  v-for="response in analysis.responses"
                  :key="response.id"
                  class="rounded-md bg-gray-50 px-4 py-3 dark:bg-gray-800"
                >
                  <div class="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    {{ formatDateTime(response.created_at) }}
                  </div>
                  <AIReportRenderer :content="response.content" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- AI Single Trade Analysis -->
      <div v-if="showAIPanel" class="card">
        <AIConversationPanel
          :trade-id="trade.id"
          title="AI Trade Analysis"
          subtitle="Analyze this trade using its executions, notes, enrichment, news, charts, and images."
          empty-title="Analyze This Trade"
          empty-description="Start a focused AI review of this trade to diagnose what went wrong, evaluate the technical setup, and turn the available chart, image, news, sector, and execution data into specific next steps."
          start-label="Analyze This Trade"
          loading-text="Analyzing this trade..."
          auto-start
          @session-created="loadStoredAIAnalyses"
        />
      </div>

      <!-- Incomplete Calculation Banner -->
      <div v-if="hasIncompleteQuality" class="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-4 border border-yellow-200 dark:border-yellow-800">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Incomplete Calculation
            </h3>
            <div class="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              <p>
                Some quality metrics could not be retrieved. This may be due to API rate limits, missing data, or future-dated trades. The quality grade shown is based on available metrics only.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Trade Details -->
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <!-- Main Details -->
        <div class="lg:col-span-2 space-y-6">
          <div class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Trade Details</h3>
              <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-6">
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Symbol</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">{{ trade.symbol }}</dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Side</dt>
                  <dd class="mt-1">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      :class="[
                        trade.side === 'long'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      ]">
                      {{ trade.side }}
                    </span>
                  </dd>
                </div>
                <!-- Options-specific fields -->
                <div v-if="trade.instrument_type === 'option'">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Instrument Type</dt>
                  <dd class="mt-1">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                      Option
                    </span>
                  </dd>
                </div>
                <div v-if="trade.instrument_type === 'option' && trade.option_type">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Option Type</dt>
                  <dd class="mt-1">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      :class="[
                        trade.option_type === 'call'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      ]">
                      {{ trade.option_type.toUpperCase() }}
                    </span>
                  </dd>
                </div>
                <div v-if="trade.instrument_type === 'option' && trade.strike_price">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Strike Price</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">{{ formatCurrency(trade.strike_price) }}</dd>
                </div>
                <div v-if="trade.instrument_type === 'option' && trade.expiration_date">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Expiration Date</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ formatDate(trade.expiration_date) }}</dd>
                </div>
                <div v-if="trade.instrument_type === 'option' && trade.contract_size">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Contract Size</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ trade.contract_size }} shares/contract</dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {{ trade.instrument_type === 'option' ? 'Entry Price (per share)' : 'Entry Price' }}
                  </dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">{{ formatCurrency(trade.entry_price) }}</dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {{ trade.instrument_type === 'option' ? 'Exit Price (per share)' : 'Exit Price' }}
                  </dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">
                    <template v-if="trade.exit_time">{{ formatCurrency(trade.exit_price) }}</template>
                    <template v-else-if="manualOptionPrice !== null">
                      {{ formatCurrency(manualOptionPrice) }}
                      <span class="text-xs text-gray-500 dark:text-gray-400 font-normal ml-1">(current)</span>
                    </template>
                    <template v-else>Open</template>
                  </dd>
                </div>
                <div v-if="trade.stopLoss || trade.stop_loss">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Stop Loss</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">{{ formatCurrency(trade.stop_loss || trade.stopLoss) }}</dd>
                </div>
                <div v-if="trade.takeProfit || trade.take_profit || (trade.take_profit_targets && trade.take_profit_targets.length > 0)">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Take Profit</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono flex flex-wrap gap-x-4 gap-y-1">
                    <!-- Show single take_profit as TP1 only when NO take_profit_targets exist -->
                    <span v-if="(trade.take_profit || trade.takeProfit) && (!trade.take_profit_targets || trade.take_profit_targets.length === 0)">
                      <span class="text-xs text-gray-400 mr-1">TP1:</span>{{ formatCurrency(trade.take_profit || trade.takeProfit) }}
                    </span>
                    <!-- Show all targets from take_profit_targets as TP1, TP2, etc. -->
                    <span v-for="(target, index) in (trade.take_profit_targets || [])" :key="index">
                      <span class="text-xs text-gray-400 mr-1">TP{{ index + 1 }}:</span>{{ formatCurrency(target.price) }}
                      <span v-if="target.shares" class="text-xs text-gray-400 ml-0.5">({{ target.shares }})</span>
                    </span>
                  </dd>
                </div>
                <div v-if="trade.rValue !== null && trade.rValue !== undefined">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">R-Multiple</dt>
                  <dd class="mt-1">
                    <span class="text-sm font-semibold font-mono"
                      :class="[
                        Number(trade.rValue) >= 2
                          ? 'text-green-600 dark:text-green-400'
                          : Number(trade.rValue) >= 0
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                      ]">
                      {{ Number(trade.rValue).toFixed(1) }}R
                    </span>
                    <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      ({{ Number(trade.rValue) >= 2 ? 'Excellent' : Number(trade.rValue) >= 0 ? 'Good' : 'Loss' }})
                    </span>
                  </dd>
                </div>
                <div v-if="trade.mae !== null && trade.mae !== undefined">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">MAE</dt>
                  <dd class="mt-1 text-sm font-mono" :class="trade.mae !== null && trade.mae !== undefined ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'">
                    {{ trade.mae !== null && trade.mae !== undefined ? formatExcursionValue(trade.mae) : '—' }}
                  </dd>
                </div>
                <div v-if="trade.mfe !== null && trade.mfe !== undefined">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">MFE</dt>
                  <dd class="mt-1 text-sm font-mono" :class="trade.mfe !== null && trade.mfe !== undefined ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'">
                    {{ trade.mfe !== null && trade.mfe !== undefined ? formatExcursionValue(trade.mfe) : '—' }}
                  </dd>
                </div>
                <div v-if="(trade.post_exit_mae ?? trade.postExitMae) !== null && (trade.post_exit_mae ?? trade.postExitMae) !== undefined">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">After-Trade MAE</dt>
                  <dd class="mt-1 text-sm font-mono" :class="(trade.post_exit_mae ?? trade.postExitMae) !== null && (trade.post_exit_mae ?? trade.postExitMae) !== undefined ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'">
                    {{ (trade.post_exit_mae ?? trade.postExitMae) !== null && (trade.post_exit_mae ?? trade.postExitMae) !== undefined ? formatExcursionValue(trade.post_exit_mae ?? trade.postExitMae) : '—' }}
                  </dd>
                </div>
                <div v-if="(trade.post_exit_mfe ?? trade.postExitMfe) !== null && (trade.post_exit_mfe ?? trade.postExitMfe) !== undefined">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">After-Trade MFE</dt>
                  <dd class="mt-1 text-sm font-mono" :class="(trade.post_exit_mfe ?? trade.postExitMfe) !== null && (trade.post_exit_mfe ?? trade.postExitMfe) !== undefined ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'">
                    {{ (trade.post_exit_mfe ?? trade.postExitMfe) !== null && (trade.post_exit_mfe ?? trade.postExitMfe) !== undefined ? formatExcursionValue(trade.post_exit_mfe ?? trade.postExitMfe) : '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {{ trade.instrument_type === 'option' ? 'Contracts' : (!trade.exit_time ? 'Quantity Held' : 'Total Traded') }}
                  </dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    <!-- For open positions: show net position (quantity held), for closed: show total traded -->
                    {{ formatQuantity(!trade.exit_time && executionSummary.finalPosition > 0 ? executionSummary.finalPosition : (executionSummary.totalShareQuantity > 0 ? executionSummary.totalShareQuantity : trade.quantity)) }}
                    <span v-if="trade.instrument_type === 'option' && trade.contract_size" class="text-xs text-gray-500 dark:text-gray-400 ml-1">
                      ({{ formatQuantity((!trade.exit_time && executionSummary.finalPosition > 0 ? executionSummary.finalPosition : trade.quantity) * trade.contract_size) }} shares)
                    </span>
                    <!-- For open positions with partial sales, show total traded as supplementary info -->
                    <div
                      v-if="!trade.exit_time && executionSummary.totalShareQuantity > 0 && executionSummary.totalShareQuantity !== executionSummary.finalPosition"
                      class="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                    >
                      {{ formatQuantity(executionSummary.totalShareQuantity) }} total traded
                    </div>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                  <dd class="mt-1">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      :class="[
                        trade.exit_time
                          ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400'
                      ]">
                      {{ trade.exit_time ? 'Closed' : 'Open' }}
                    </span>
                  </dd>
                </div>
                <div v-if="trade.confidence">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Confidence Level</dt>
                  <dd class="mt-1">
                    <div class="flex items-center space-x-3">
                      <div class="flex space-x-1">
                        <div v-for="i in 10" :key="i" class="w-2 h-2 rounded-full"
                          :class="i <= trade.confidence ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'">
                        </div>
                      </div>
                      <span class="text-sm font-medium text-gray-900 dark:text-white">{{ trade.confidence }}/10</span>
                    </div>
                  </dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Setup Quality</dt>
                  <dd class="mt-1">
                    <div v-if="trade.qualityGrade" class="flex items-center space-x-3">
                      <span class="px-3 py-1 inline-flex text-sm font-semibold rounded"
                        :class="{
                          'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': trade.qualityGrade === 'A',
                          'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400': trade.qualityGrade === 'B',
                          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400': trade.qualityGrade === 'C',
                          'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400': trade.qualityGrade === 'D',
                          'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400': trade.qualityGrade === 'F'
                        }">
                        Grade {{ trade.qualityGrade }}
                      </span>
                      <span v-if="trade.qualityScore" class="text-sm text-gray-600 dark:text-gray-400">
                        ({{ Number(trade.qualityScore).toFixed(1) }}/5.0)
                      </span>
                    </div>
                    <div v-else-if="trade.instrument_type === 'future'">
                      <span class="text-sm text-gray-500 dark:text-gray-400">Not available for futures</span>
                    </div>
                    <div v-else class="flex items-center space-x-2">
                      <span class="text-sm text-gray-500 dark:text-gray-400">Not calculated</span>
                      <button
                        @click="calculateQuality"
                        :disabled="calculatingQuality"
                        class="text-xs px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                      >
                        {{ calculatingQuality ? 'Calculating...' : 'Calculate Setup Quality' }}
                      </button>
                    </div>
                  </dd>
                </div>
                <div v-if="trade.sector">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Sector</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ trade.sector }}</dd>
                </div>
                <div v-if="trade.broker">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Broker</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ trade.broker }}</dd>
                </div>
                <div v-if="trade.account_identifier">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Account</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white font-mono">{{ redactAccountId(trade.account_identifier) }}</dd>
                </div>
                <div v-if="trade.strategy">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Strategy</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ trade.strategy }}</dd>
                </div>
                <div v-if="trade.setup">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Setup</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ trade.setup }}</dd>
                </div>
                <div v-if="detailCommission">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {{ detailCommission < 0 ? 'Commission (Rebate)' : 'Commission' }}
                  </dt>
                  <dd class="mt-1 text-sm" :class="[
                    detailCommission < 0
                      ? 'text-green-600 dark:text-green-400'
                      : detailCommission > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-900 dark:text-white'
                  ]">
                    {{ formatSignedCurrency(-detailCommission) }}
                  </dd>
                </div>
                <div v-if="detailFees">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Fees</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">{{ formatCurrency(detailFees) }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <!-- Setup Quality Breakdown -->
          <div v-if="trade.qualityGrade && trade.qualityMetrics" class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white" :class="trade.qualityMetrics.dataSymbol ? 'mb-1' : 'mb-4'">Setup Quality Breakdown</h3>
              <p v-if="trade.qualityMetrics.dataSymbol" class="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Option trade - graded using market data for the underlying {{ trade.qualityMetrics.dataSymbol }}
              </p>

              <div class="space-y-4">
                <div v-for="metric in qualityBreakdown" :key="metric.key" class="border-l-4 pl-4 py-2"
                  :class="[
                    metric.excluded ? 'border-gray-300 dark:border-gray-600' :
                    metric.score >= 0.8 ? 'border-green-400' :
                    metric.score >= 0.6 ? 'border-blue-400' :
                    metric.score >= 0.4 ? 'border-yellow-400' :
                    'border-red-400'
                  ]">
                  <div class="flex items-center justify-between mb-2">
                    <div>
                      <h4 class="text-sm font-semibold text-gray-900 dark:text-white">{{ metric.label }}</h4>
                      <p class="text-xs text-gray-500 dark:text-gray-400">Weight: {{ metric.weight }}%</p>
                    </div>
                    <div class="text-right">
                      <div v-if="metric.excluded" class="text-sm font-semibold text-gray-500 dark:text-gray-400">
                        No data
                      </div>
                      <div v-else class="text-sm font-semibold"
                        :class="[
                          metric.score >= 0.8 ? 'text-green-600 dark:text-green-400' :
                          metric.score >= 0.6 ? 'text-blue-600 dark:text-blue-400' :
                          metric.score >= 0.4 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                        ]">
                        {{ (metric.score * 100).toFixed(0) }}%
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ metric.excluded ? 'Excluded from score' : metric.display }}
                      </div>
                    </div>
                  </div>
                  <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div v-if="!metric.excluded" class="h-2 rounded-full transition-all"
                      :class="[
                        metric.score >= 0.8 ? 'bg-green-500' :
                        metric.score >= 0.6 ? 'bg-blue-500' :
                        metric.score >= 0.4 ? 'bg-yellow-500' :
                        'bg-red-500'
                      ]"
                      :style="{ width: (metric.score * 100) + '%' }">
                    </div>
                  </div>
                </div>
              </div>

              <!-- Overall Score Summary -->
              <div class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Overall Setup Quality</h4>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      {{ hasExcludedQualityMetrics
                        ? 'Weighted average of metrics with data - metrics without data are excluded and the remaining weights are rescaled'
                        : 'Weighted average of all metrics' }}
                    </p>
                  </div>
                  <div class="text-right">
                    <div class="text-2xl font-bold"
                      :class="{
                        'text-green-600 dark:text-green-400': trade.qualityGrade === 'A',
                        'text-blue-600 dark:text-blue-400': trade.qualityGrade === 'B',
                        'text-yellow-600 dark:text-yellow-400': trade.qualityGrade === 'C',
                        'text-orange-600 dark:text-orange-400': trade.qualityGrade === 'D',
                        'text-red-600 dark:text-red-400': trade.qualityGrade === 'F'
                      }">
                      {{ Number(trade.qualityScore).toFixed(1) }}/5.0
                    </div>
                    <div class="text-sm font-semibold text-gray-600 dark:text-gray-400">
                      Grade {{ trade.qualityGrade }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-body">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
                <div>
                  <h3 class="text-lg font-medium text-gray-900 dark:text-white">Playbook Adherence</h3>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Review this trade against a structured setup and measure whether you followed plan.
                  </p>
                </div>
                <router-link to="/analysis/playbooks" class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
                  Manage playbooks
                </router-link>
              </div>

              <div class="mb-5 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex flex-wrap items-center gap-3">
                  <div class="text-sm font-medium text-gray-700 dark:text-gray-300">Setup Quality</div>
                  <span
                    v-if="trade.setupQuality?.grade"
                    class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold"
                    :class="{
                      'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400': trade.setupQuality.grade === 'A',
                      'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400': trade.setupQuality.grade === 'B',
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400': trade.setupQuality.grade === 'C',
                      'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400': trade.setupQuality.grade === 'D',
                      'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400': trade.setupQuality.grade === 'F'
                    }"
                  >
                    Grade {{ trade.setupQuality.grade }}
                  </span>
                  <span v-if="trade.setupQuality?.score" class="text-sm text-gray-500 dark:text-gray-400">
                    {{ Number(trade.setupQuality.score).toFixed(1) }}/5.0
                  </span>
                  <span v-else class="text-sm text-gray-500 dark:text-gray-400">
                    Calculate setup quality to pair setup context with adherence.
                  </span>
                </div>
              </div>

              <ProUpgradePrompt
                v-if="authStore.user && !isPlaybookFeatureAvailable"
                variant="banner"
                description="Structured playbooks and adherence reviews are available on Pro."
              />

              <div v-else-if="loadingPlaybooks" class="text-sm text-gray-500 dark:text-gray-400">
                Loading playbooks...
              </div>

              <div v-else-if="playbooks.length === 0" class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-5 text-sm text-gray-500 dark:text-gray-400">
                Create a structured playbook first, then return here to score this trade against it.
              </div>

              <div v-else class="space-y-5">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Playbook</label>
                  <BaseSelect
                    v-model="selectedPlaybookId"
                    :options="playbookOptions"
                    placeholder="Select a playbook"
                    @change="onPlaybookChange"
                  />
                </div>

                <div v-if="selectedPlaybook" class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <div class="flex items-center justify-between mb-3">
                      <div>
                        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Checklist</h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                          {{ checklistCompletion.checked }}/{{ checklistCompletion.total }} items checked
                        </p>
                      </div>
                      <span
                        v-if="selectedReview"
                        class="inline-flex rounded-full px-3 py-1 text-sm font-semibold"
                        :class="selectedReview.adherenceScore >= 80
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : selectedReview.adherenceScore >= 60
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'"
                      >
                        {{ Number(selectedReview.adherenceScore || 0).toFixed(2) }} adherence
                      </span>
                    </div>

                    <div class="space-y-3">
                      <label
                        v-for="item in reviewForm.checklistResponses"
                        :key="item.checklistItemId"
                        class="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-3"
                      >
                        <input
                          v-model="item.checked"
                          type="checkbox"
                          class="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <div class="flex-1">
                          <div class="text-sm font-medium text-gray-900 dark:text-white">
                            {{ item.label }}
                          </div>
                          <div class="mt-1 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span>Weight {{ Number(item.weight || 1).toFixed(2) }}</span>
                            <span v-if="item.isRequired" class="text-orange-600 dark:text-orange-400">Required</span>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Followed plan?</label>
                      <BaseSelect
                        v-model="reviewForm.followedPlan"
                        :options="[
                          { value: 'true', label: 'Yes' },
                          { value: 'false', label: 'No' }
                        ]"
                        placeholder="Not set"
                      />
                    </div>

                    <div>
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Review notes</label>
                      <textarea
                        v-model="reviewForm.reviewNotes"
                        rows="5"
                        class="input"
                        placeholder="What matched the playbook? What broke down?"
                      ></textarea>
                    </div>

                    <button
                      @click="savePlaybookReview"
                      :disabled="savingPlaybookReview || selectedPlaybook?.isActive === false"
                      class="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {{ savingPlaybookReview ? 'Saving...' : 'Save Review' }}
                    </button>
                    <p v-if="selectedPlaybook?.isActive === false" class="text-xs text-amber-600 dark:text-amber-400">
                      Archived playbooks remain visible on old reviews but cannot be used for new submissions.
                    </p>
                  </div>
                </div>

                <div v-if="selectedPlaybook" class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div class="flex items-center justify-between mb-3">
                    <div>
                      <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Hard Rule Results</h4>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        Fixed checks run when a review is saved.
                      </p>
                    </div>
                    <div v-if="selectedReview?.reviewedAt" class="text-xs text-gray-500 dark:text-gray-400">
                      Reviewed {{ formatDateTime(selectedReview.reviewedAt) }}
                    </div>
                  </div>

                  <div v-if="selectedReview?.ruleResults?.length" class="space-y-3">
                    <div
                      v-for="rule in selectedReview.ruleResults"
                      :key="rule.key"
                      class="rounded-lg border px-3 py-3"
                      :class="rule.passed
                        ? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/10'
                        : 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10'"
                    >
                      <div class="flex items-center justify-between gap-4">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">{{ rule.label }}</div>
                        <span :class="rule.passed ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'" class="text-xs font-semibold uppercase tracking-wide">
                          {{ rule.passed ? 'Passed' : 'Failed' }}
                        </span>
                      </div>
                      <div class="mt-2 text-xs text-gray-600 dark:text-gray-400">
                        <div><span class="font-medium">Expected:</span> {{ Array.isArray(rule.expected) ? rule.expected.join(', ') : (rule.expected || 'N/A') }}</div>
                        <div><span class="font-medium">Actual:</span> {{ Array.isArray(rule.actual) ? rule.actual.join(', ') : (rule.actual || 'N/A') }}</div>
                        <div v-if="rule.violationMessage" class="mt-1 text-red-700 dark:text-red-300">{{ rule.violationMessage }}</div>
                      </div>
                    </div>
                  </div>

                  <p v-else class="text-sm text-gray-500 dark:text-gray-400">
                    Save a review to evaluate stop loss, target R, side, timeframe, and any configured strategy/setup/tag rules.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Executions -->
          <div v-if="processedExecutions && processedExecutions.length > 0" class="card">
            <div class="card-body">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                  Executions ({{ processedExecutions.length }})
                </h3>
                <div v-if="processedExecutions.length >= 2 && trade.exit_price && trade.exit_time" class="flex items-center space-x-2">
                  <template v-if="splitMode">
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ selectedExecutions.size }} selected</span>
                    <button
                      @click="splitSelectedTrades"
                      :disabled="splittingTrade || selectedExecutions.size === 0 || selectedExecutions.size === entryExecutionIndices.length"
                      class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                    >
                      <svg v-if="splittingTrade" class="animate-spin -ml-0.5 mr-1.5 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {{ splittingTrade ? 'Splitting...' : 'Split Selected' }}
                    </button>
                    <button
                      @click="splitMode = false; selectedExecutions = new Set()"
                      class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none"
                    >
                      Cancel
                    </button>
                  </template>
                  <button
                    v-else
                    @click="splitMode = true"
                    class="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    Select to Split
                  </button>
                </div>
              </div>
              
              <!-- Desktop Table View -->
              <div class="hidden md:block overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead class="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th v-if="splitMode" class="px-3 py-3 w-10"></th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Action
                      </th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Entry Price
                      </th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Exit Price
                      </th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Gross P&L
                      </th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Net P&L
                      </th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Commission
                      </th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fees
                      </th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Entry Time
                      </th>
                      <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Exit Time
                      </th>
                    </tr>
                  </thead>
                  <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    <tr v-for="(execution, index) in processedExecutions" :key="index"
                        class="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td v-if="splitMode" class="px-3 py-4 whitespace-nowrap">
                        <input
                          v-if="isEntryExecution(execution)"
                          type="checkbox"
                          :checked="selectedExecutions.has(index)"
                          @change="toggleExecution(index)"
                          class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span v-else class="block h-4 w-4"></span>
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                              :class="[
                                (execution.action || execution.side || '').toLowerCase() === 'buy' || (execution.action || execution.side || '').toLowerCase() === 'long'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                  : (execution.action || execution.side || '').toLowerCase() === 'sell' || (execution.action || execution.side || '').toLowerCase() === 'short'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              ]">
                          {{ ((execution.action || execution.side) || 'N/A').toUpperCase() }}
                        </span>
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                        {{ formatQuantity(execution.quantity) }}
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                        {{ execution.entryPrice !== null && execution.entryPrice !== undefined ? formatCurrency(execution.entryPrice) : '-' }}
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                        {{ execution.exitPrice !== null && execution.exitPrice !== undefined ? formatCurrency(execution.exitPrice) : '-' }}
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap text-sm font-mono"
                          :class="[
                            execution.grossPnl > 0
                              ? 'text-green-600 dark:text-green-400'
                              : execution.grossPnl < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-900 dark:text-white'
                          ]">
                        {{ execution.grossPnl !== undefined && execution.grossPnl !== null ? formatCurrency(execution.grossPnl) : '-' }}
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap text-sm font-mono"
                          :class="[
                            execution.netPnl > 0
                              ? 'text-green-600 dark:text-green-400'
                              : execution.netPnl < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-900 dark:text-white'
                          ]">
                        {{ execution.netPnl !== undefined && execution.netPnl !== null ? formatCurrency(execution.netPnl) : '-' }}
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap text-sm font-mono"
                          :class="[
                            execution.commission < 0
                              ? 'text-green-600 dark:text-green-400'
                              : execution.commission > 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-600 dark:text-gray-400'
                          ]">
                        {{ execution.commission ? formatSignedCurrency(-execution.commission) : '-' }}
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap text-sm font-mono text-gray-600 dark:text-gray-400">
                        {{ execution.fees ? formatCurrency(execution.fees) : '-' }}
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {{ execution.entryTime ? formatDateTime(execution.entryTime) : '-' }}
                      </td>
                      <td class="px-3 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {{ execution.exitTime ? formatDateTime(execution.exitTime) : '-' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Mobile Card View -->
              <div class="md:hidden space-y-3">
                <div v-for="(execution, index) in processedExecutions" :key="index"
                     class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-2">
                      <input
                        v-if="splitMode && isEntryExecution(execution)"
                        type="checkbox"
                        :checked="selectedExecutions.has(index)"
                        @change="toggleExecution(index)"
                        class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          :class="[
                            (execution.action || execution.side || '').toLowerCase() === 'buy' || (execution.action || execution.side || '').toLowerCase() === 'long'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              : (execution.action || execution.side || '').toLowerCase() === 'sell' || (execution.action || execution.side || '').toLowerCase() === 'short'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          ]">
                      {{ ((execution.action || execution.side) || 'N/A').toUpperCase() }}
                    </span>
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {{ execution.entryTime ? formatDateTime(execution.entryTime) : (execution.exitTime ? formatDateTime(execution.exitTime) : '-') }}
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div class="text-gray-500 dark:text-gray-400 text-xs">Quantity</div>
                      <div class="font-mono text-gray-900 dark:text-white">
                        {{ formatNumber(execution.quantity, 0) }}
                      </div>
                    </div>
                    <div v-if="execution.entryPrice !== null && execution.entryPrice !== undefined">
                      <div class="text-gray-500 dark:text-gray-400 text-xs">Entry Price</div>
                      <div class="font-mono text-gray-900 dark:text-white">
                        {{ formatCurrency(execution.entryPrice) }}
                      </div>
                    </div>
                    <div v-if="execution.exitPrice !== null && execution.exitPrice !== undefined">
                      <div class="text-gray-500 dark:text-gray-400 text-xs">Exit Price</div>
                      <div class="font-mono text-gray-900 dark:text-white">
                        {{ formatCurrency(execution.exitPrice) }}
                      </div>
                    </div>
                    <div v-if="execution.exitTime">
                      <div class="text-gray-500 dark:text-gray-400 text-xs">Exit Time</div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ formatDateTime(execution.exitTime) }}
                      </div>
                    </div>
                    <div v-if="execution.grossPnl !== undefined && execution.grossPnl !== null">
                      <div class="text-gray-500 dark:text-gray-400 text-xs">Gross P&L</div>
                      <div class="font-mono"
                           :class="[
                             execution.grossPnl > 0
                               ? 'text-green-600 dark:text-green-400'
                               : execution.grossPnl < 0
                               ? 'text-red-600 dark:text-red-400'
                               : 'text-gray-900 dark:text-white'
                           ]">
                        {{ formatCurrency(execution.grossPnl) }}
                      </div>
                    </div>
                    <div v-if="execution.netPnl !== undefined && execution.netPnl !== null">
                      <div class="text-gray-500 dark:text-gray-400 text-xs">Net P&L</div>
                      <div class="font-mono"
                           :class="[
                             execution.netPnl > 0
                               ? 'text-green-600 dark:text-green-400'
                               : execution.netPnl < 0
                               ? 'text-red-600 dark:text-red-400'
                               : 'text-gray-900 dark:text-white'
                           ]">
                        {{ formatCurrency(execution.netPnl) }}
                      </div>
                    </div>
                    <div v-if="execution.commission">
                      <div class="text-gray-500 dark:text-gray-400 text-xs">
                        {{ execution.commission < 0 ? 'Commission (Rebate)' : 'Commission' }}
                      </div>
                      <div class="font-mono" :class="[
                        execution.commission < 0
                          ? 'text-green-600 dark:text-green-400'
                          : execution.commission > 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-600 dark:text-gray-400'
                      ]">
                        {{ formatSignedCurrency(-execution.commission) }}
                      </div>
                    </div>
                    <div v-if="execution.fees">
                      <div class="text-gray-500 dark:text-gray-400 text-xs">Fees</div>
                      <div class="font-mono text-gray-600 dark:text-gray-400">
                        {{ formatCurrency(execution.fees) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Summary Row -->
              <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <div class="text-gray-500 dark:text-gray-400 text-xs">Total Executions</div>
                    <div class="font-semibold text-gray-900 dark:text-white">{{ processedExecutions.length }}</div>
                  </div>
                  <div>
                    <div class="text-gray-500 dark:text-gray-400 text-xs">Total Volume</div>
                    <div class="font-semibold font-mono text-gray-900 dark:text-white">
                      {{ formatCurrency(executionSummary.totalVolume) }}
                    </div>
                  </div>
                  <div>
                    <div class="text-gray-500 dark:text-gray-400 text-xs">Total Commission</div>
                    <div class="font-semibold font-mono text-gray-900 dark:text-white">
                      {{ formatCurrency(executionSummary.totalCommission) }}
                    </div>
                  </div>
                  <div>
                    <div class="text-gray-500 dark:text-gray-400 text-xs">Total Fees</div>
                    <div class="font-semibold font-mono text-gray-900 dark:text-white">
                      {{ formatCurrency(executionSummary.totalFees) }}
                    </div>
                  </div>
                  <div>
                    <div class="text-gray-500 dark:text-gray-400 text-xs">Shares Held</div>
                    <div class="font-semibold font-mono text-gray-900 dark:text-white">
                      {{ formatNumber(executionSummary.finalPosition, 0) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div v-if="trade.tags && trade.tags.length > 0" class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Tags</h3>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="tag in trade.tags"
                  :key="tag"
                  class="px-3 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-sm rounded-full"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>

          <!-- Trade Chart Visualization (Collapsible) -->
          <div v-if="trade.exit_price && trade.exit_time" class="card">
            <div class="card-body">
              <button
                @click="toggleChartSection"
                class="w-full flex items-center justify-between text-left"
              >
                <h3 class="text-lg font-medium text-gray-900 dark:text-white">Chart Visualization</h3>
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 transition-transform duration-200"
                  :class="{ 'rotate-180': !chartSectionCollapsed }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div v-show="!chartSectionCollapsed" class="mt-4">
                <TradeChartVisualization :trade-id="trade.id" />
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="trade.notes" class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Notes</h3>
              <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ trade.notes }}</p>
            </div>
          </div>

          <!-- TradingView Charts -->
          <TradeCharts
            v-if="trade.charts && trade.charts.length > 0"
            :trade-id="trade.id"
            :charts="trade.charts"
            :can-delete="trade.user_id === authStore.user?.id"
            @deleted="handleChartDeleted"
          />

          <!-- Trade Images -->
          <TradeImages
            :trade-id="trade.id"
            :images="trade.attachments || []"
            :can-delete="trade.user_id === authStore.user?.id"
            @deleted="handleImageDeleted"
          />

          <!-- Comments (Collapsible) -->
          <div class="card">
            <div class="card-body">
              <button
                @click="toggleCommentsSection"
                class="w-full flex items-center justify-between text-left"
              >
                <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                  Comments ({{ comments.length }})
                </h3>
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 transition-transform duration-200"
                  :class="{ 'rotate-180': !commentsSectionCollapsed }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div v-show="!commentsSectionCollapsed" class="mt-4">
                <div v-if="loadingComments" class="flex justify-center py-8">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>

                <div v-else>
                  <div v-if="comments.length === 0" class="text-center py-8">
                    <ChatBubbleLeftIcon class="mx-auto h-12 w-12 text-gray-400" />
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      No comments yet. Be the first to comment!
                    </p>
                  </div>

                  <div v-else class="space-y-4 mb-6">
                    <div
                      v-for="comment in comments"
                    :key="comment.id"
                    class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                  >
                    <div class="flex items-start space-x-3">
                      <div class="flex-shrink-0">
                        <img
                          v-if="comment.avatar_url"
                          :src="comment.avatar_url"
                          :alt="comment.username"
                          class="h-8 w-8 rounded-full"
                        />
                        <div
                          v-else
                          class="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center"
                        >
                          <span class="text-xs font-medium text-white">
                            {{ comment.username.charAt(0).toUpperCase() }}
                          </span>
                        </div>
                      </div>
                      <div class="flex-1">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center space-x-2">
                            <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                              {{ comment.username }}
                            </h4>
                            <span class="text-xs text-gray-500 dark:text-gray-400">
                              {{ formatCommentDate(comment.created_at) }}
                              <span v-if="comment.edited_at" class="italic">(edited)</span>
                            </span>
                          </div>
                          <div v-if="comment.user_id === authStore.user?.id" class="flex items-center space-x-2">
                            <button
                              @click="startEditComment(comment)"
                              class="text-xs text-gray-500 hover:text-primary-600 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              @click="deleteTradeComment(comment.id)"
                              class="text-xs text-red-500 hover:text-red-700 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        
                        <!-- Edit form or comment text -->
                        <div v-if="editingCommentId === comment.id" class="mt-2">
                          <textarea
                            v-model="editCommentText"
                            rows="3"
                            class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 px-3 py-2"
                            :disabled="submittingComment"
                            @keydown="handleEditKeydown"
                          ></textarea>
                          <div class="mt-2 flex justify-end space-x-2">
                            <button
                              @click="cancelEditComment"
                              class="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              @click="saveEditComment(comment.id)"
                              :disabled="submittingComment || !editCommentText.trim()"
                              class="text-xs bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                        <p v-else class="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {{ comment.comment }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Add Comment Form -->
                <form v-if="authStore.isAuthenticated" @submit.prevent="submitComment" class="mt-6">
                  <div>
                    <label for="comment" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Add a comment
                    </label>
                    <div class="mt-1">
                      <textarea
                        id="comment"
                        v-model="newComment"
                        rows="3"
                        class="shadow-sm block w-full sm:text-sm border-gray-300 dark:border-gray-600 rounded-md focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white px-3 py-2"
                        placeholder="Share your thoughts..."
                        :disabled="submittingComment"
                        @keydown="handleCommentKeydown"
                      />
                    </div>
                  </div>
                  <div class="mt-4 flex justify-end">
                    <button
                      type="submit"
                      class="btn-primary"
                      :disabled="!newComment.trim() || submittingComment"
                    >
                      <span v-if="submittingComment">Posting...</span>
                      <span v-else>Post Comment</span>
                    </button>
                  </div>
                </form>
              </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Summary -->
        <div class="space-y-6">
          <div class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Performance</h3>
              <dl class="space-y-4">
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Net P&L
                    <span v-if="!trade.exit_time && openUnrealizedPnL !== null" class="text-xs font-normal text-gray-400">(unrealized)</span>
                  </dt>
                  <dd class="mt-1 text-2xl font-semibold" :class="[
                    (trade.exit_time ? displayPnl : openUnrealizedPnL) >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    <template v-if="trade.exit_time">{{ formatCurrency(displayPnl) }}</template>
                    <template v-else-if="openUnrealizedPnL !== null">{{ formatCurrency(openUnrealizedPnL) }}</template>
                    <template v-else>Open</template>
                  </dd>
                </div>
                <div v-if="trade.pnl_percent || openUnrealizedPnLPercent !== null">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">P&L %</dt>
                  <dd class="mt-1 text-lg font-semibold" :class="[
                    (trade.exit_time ? trade.pnl_percent : openUnrealizedPnLPercent) >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    <template v-if="trade.exit_time">{{ trade.pnl_percent > 0 ? '+' : '' }}{{ formatNumber(trade.pnl_percent) }}%</template>
                    <template v-else>{{ openUnrealizedPnLPercent > 0 ? '+' : '' }}{{ formatNumber(openUnrealizedPnLPercent) }}%</template>
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Price Change</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    {{ calculateRiskReward() }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Value</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    {{ formatCurrency(trade.entry_price * trade.quantity) }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <!-- Timeline -->
          <div class="card">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Timeline</h3>
              <dl class="space-y-3">
                <div v-if="trade.entry_time">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Entry <span class="text-xs font-normal">({{ timezoneLabel }})</span>
                  </dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    {{ formatDateTime(trade.entry_time) }}
                  </dd>
                </div>
                <div v-if="trade.exit_time">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Exit <span class="text-xs font-normal">({{ timezoneLabel }})</span>
                  </dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    {{ formatDateTime(trade.exit_time) }}
                  </dd>
                </div>
                <div v-if="trade.exit_time && trade.entry_time">
                  <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Duration</dt>
                  <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                    {{ calculateDuration() }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <!-- News Section -->
          <div v-if="trade.has_news && trade.news_events && trade.news_events.length > 0" class="card">
            <div class="card-body">
              <div class="flex items-center justify-between mb-4">
                <h3 class="heading-card">Breaking News</h3>
                <span class="px-3 py-1 text-xs font-semibold rounded-full"
                  :class="[
                    trade.news_sentiment === 'positive' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                    trade.news_sentiment === 'negative' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                    trade.news_sentiment === 'mixed' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  ]">
                  {{ trade.news_sentiment || 'neutral' }} sentiment
                </span>
              </div>
              
              <div class="space-y-4">
                <div v-for="(article, index) in trade.news_events" :key="index" 
                     class="border-l-4 pl-4 py-3"
                     :class="[
                       article.sentiment === 'positive' ? 'border-green-400' :
                       article.sentiment === 'negative' ? 'border-red-400' :
                       'border-gray-400'
                     ]">
                  <div class="flex items-start justify-between">
                    <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                      {{ article.headline }}
                    </h4>
                    <span class="flex-shrink-0 ml-2 px-2 py-1 text-xs rounded-full"
                      :class="[
                        article.sentiment === 'positive' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                        article.sentiment === 'negative' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      ]">
                      {{ article.sentiment }}
                    </span>
                  </div>
                  
                  <p v-if="article.summary" class="text-sm text-gray-600 dark:text-gray-400 mb-2 overflow-hidden" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                    {{ article.summary }}
                  </p>
                  
                  <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ article.source || 'Unknown Source' }}</span>
                    <span>{{ formatNewsDate(article.datetime) }}</span>
                  </div>
                  
                  <div class="mt-2">
                    <a v-if="article.url" 
                       :href="article.url" 
                       target="_blank" 
                       rel="noopener noreferrer"
                       class="inline-flex items-center text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">
                      Read full article
                      <svg class="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-12">
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Trade not found</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        The trade you're looking for doesn't exist or you don't have permission to view it.
      </p>
      <div class="mt-6">
        <router-link to="/trades" class="btn-primary">
          Back to Trades
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTradesStore } from '@/stores/trades'
import { useNotification } from '@/composables/useNotification'
import { useUserTimezone } from '@/composables/useUserTimezone'
import { format, formatDistanceToNow, formatDistance } from 'date-fns'
import { DocumentIcon, ChatBubbleLeftIcon, SparklesIcon, ShareIcon } from '@heroicons/vue/24/outline'
import TradeShareCard from '@/components/trades/TradeShareCard.vue'
import { useCurrencyFormatter } from '@/composables/useCurrencyFormatter'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import TradeChartVisualization from '@/components/trades/TradeChartVisualization.vue'
import TradeImages from '@/components/trades/TradeImages.vue'
import TradeCharts from '@/components/trades/TradeCharts.vue'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'
import AIConversationPanel from '@/components/ai/AIConversationPanel.vue'
import AIReportRenderer from '@/components/ai/AIReportRenderer.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import { useAIStore } from '@/stores/ai'
import { getTradeDateOnlyParts } from '@/utils/date'

const route = useRoute()
const router = useRouter()
const tradesStore = useTradesStore()
const authStore = useAuthStore()
const aiStore = useAIStore()
const { showSuccess, showError, showConfirmation } = useNotification()
const { formatDateTime: formatDateTimeTz, formatTime: formatTimeTz, timezoneLabel } = useUserTimezone()
const { formatCurrency, currencySymbol, formatSignedCurrency } = useCurrencyFormatter()

function formatExcursionValue(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  const currentTrade = trade.value || {}
  if ((currentTrade.instrument_type ?? currentTrade.instrumentType) !== 'future') return formatCurrency(numeric)

  const quantity = Math.abs(Number(currentTrade.quantity) || 0)
  const pointValue = Number(currentTrade.point_value ?? currentTrade.pointValue) || 0
  if (quantity <= 0 || pointValue <= 0) return formatCurrency(numeric)

  const scale = quantity * pointValue
  const captured = getCapturedMoveDollars(currentTrade, scale)
  const legacyPointUnits = hasLegacyFuturesExcursionUnits(currentTrade, captured, scale)
  const points = legacyPointUnits ? numeric : numeric / scale
  const dollars = legacyPointUnits ? numeric * scale : numeric
  return `${points.toFixed(2)} pts (${formatCurrency(dollars)})`
}

function getCapturedMoveDollars(currentTrade, scale) {
  const entry = Number(currentTrade.entry_price ?? currentTrade.entryPrice)
  const exit = Number(currentTrade.exit_price ?? currentTrade.exitPrice)
  if (!Number.isFinite(entry) || !Number.isFinite(exit)) return null
  const move = currentTrade.side === 'short' ? entry - exit : exit - entry
  return Math.max(0, move * scale)
}

function hasLegacyFuturesExcursionUnits(currentTrade, captured, scale) {
  if (!captured || captured <= 0 || scale <= 1) return false
  const candidates = [
    currentTrade.mfe,
    currentTrade.post_exit_mfe ?? currentTrade.postExitMfe
  ].map(Number).filter(value => Number.isFinite(value) && value > 0)
  return candidates.some(value => value < captured - 0.005 && value * scale >= captured - 0.005)
}

const loading = ref(true)
const trade = ref(null)
// True only for the trade's owner. Guests/other users viewing a public trade get
// a read-only view: owner actions and owner-only data fetches are skipped.
const isOwner = computed(() => !!authStore.user && !!trade.value && trade.value.user_id === authStore.user.id)
const calculatingQuality = ref(false)
const splittingTrade = ref(false)
const splitMode = ref(false)
const selectedExecutions = ref(new Set())
const playbooks = ref([])
const playbookOptions = computed(() =>
  playbooks.value.map(playbook => ({
    value: playbook.id,
    label: `${playbook.name}${playbook.isActive === false ? ' (Archived)' : ''}`,
    disabled: playbook.isActive === false && playbook.id !== trade.value?.playbookId
  }))
)
const loadingPlaybooks = ref(false)
const savingPlaybookReview = ref(false)
const showAIPanel = ref(false)
const showShareCard = ref(false)
const storedAIAnalyses = ref([])
const storedAIExpanded = ref(false)
const loadingStoredAIAnalyses = ref(false)
const selectedPlaybookId = ref('')
const reviewForm = reactive({
  checklistResponses: [],
  followedPlan: '',
  reviewNotes: ''
})

const isPlaybookFeatureAvailable = computed(() => {
  if (!authStore.user) return false
  return authStore.user.billingEnabled === false || authStore.user.tier === 'pro' || authStore.user.role === 'admin'
})

const selectedPlaybook = computed(() => {
  return playbooks.value.find(playbook => playbook.id === selectedPlaybookId.value) || null
})

const selectedReview = computed(() => {
  const review = trade.value?.playbookReview
  if (!review || review.playbookId !== selectedPlaybookId.value) {
    return null
  }
  return review
})

const checklistCompletion = computed(() => {
  const total = reviewForm.checklistResponses.length
  if (total === 0) return { checked: 0, total: 0 }

  const checked = reviewForm.checklistResponses.filter(item => item.checked).length
  return { checked, total }
})

const storedAIResponseCount = computed(() => {
  return storedAIAnalyses.value.reduce((sum, analysis) => sum + (analysis.response_count || 0), 0)
})

// Helper function to safely get numeric score value
const getScore = (value) => {
  if (value === null || value === undefined) return 0
  return Number(value)
}

// Helper function to safely format float value
const formatFloat = (value) => {
  if (value === null || value === undefined || value === 0) return 'N/A'
  const num = Number(value)
  if (isNaN(num)) return 'N/A'
  return num.toFixed(2) + 'M'
}

// User's quality grading weights, for the breakdown display (defaults until fetched)
// Quality weight profiles, for showing each metric's configured weight
const qualityProfiles = ref(null)

async function fetchQualityWeights() {
  try {
    const response = await api.get('/users/quality-weights')
    qualityProfiles.value = response.data.profiles || { stock: response.data.qualityWeights }
  } catch (error) {
    console.error('Error fetching quality weights:', error)
  }
}

// Helper: build a breakdown row from stored metric fields
function buildQualityRow(m, { key, label, weight, valueField, scoreField, format }) {
  const raw = m[valueField]
  const rawScore = m[scoreField]
  return {
    key,
    label,
    weight,
    raw,
    rawScore,
    display: raw != null ? format(raw) : 'N/A',
    excluded: raw == null || rawScore == null,
    score: getScore(rawScore)
  }
}

const qualityBreakdown = computed(() => {
  const m = trade.value?.qualityMetrics
  if (!m) return []

  // Resolve the grading profile (stored on the metrics; legacy rows are stock)
  const profileType = m.profile === 'option' ? 'option' : 'stock'
  const w = qualityProfiles.value?.[profileType] || {}

  const signedPct = (v) => (Number(v) > 0 ? '+' : '') + Number(v).toFixed(2) + '%'

  if (profileType === 'option') {
    return [
      { key: 'newsSentiment', label: 'News Sentiment', weight: w.news ?? 25, valueField: 'newsSentiment', scoreField: 'newsSentimentScore', format: v => Number(v).toFixed(2) },
      { key: 'gap', label: 'Underlying Gap', weight: w.gap ?? 15, valueField: 'gap', scoreField: 'gapScore', format: signedPct },
      { key: 'relativeVolume', label: 'Underlying Relative Volume', weight: w.relativeVolume ?? 15, valueField: 'relativeVolume', scoreField: 'relativeVolumeScore', format: v => Number(v).toFixed(1) + 'x' },
      { key: 'dte', label: 'Days to Expiration', weight: w.dte ?? 25, valueField: 'dte', scoreField: 'dteScore', format: v => `${Number(v)} day${Number(v) === 1 ? '' : 's'}` },
      { key: 'moneyness', label: 'Strike Distance (Moneyness)', weight: w.moneyness ?? 20, valueField: 'moneyness', scoreField: 'moneynessScore', format: v => `${signedPct(v)} ITM` }
    ].map(def => buildQualityRow(m, def))
  }

  return [
    { key: 'newsSentiment', label: 'News Sentiment', weight: w.news ?? 30, valueField: 'newsSentiment', scoreField: 'newsSentimentScore', format: v => Number(v).toFixed(2) },
    { key: 'gap', label: 'Gap from Previous Close', weight: w.gap ?? 20, valueField: 'gap', scoreField: 'gapScore', format: signedPct },
    { key: 'relativeVolume', label: 'Relative Volume', weight: w.relativeVolume ?? 20, valueField: 'relativeVolume', scoreField: 'relativeVolumeScore', format: v => Number(v).toFixed(1) + 'x' },
    { key: 'float', label: 'Float (Shares Outstanding)', weight: w.float ?? 15, valueField: 'float', scoreField: 'floatScore', format: v => formatFloat(v) },
    { key: 'priceRange', label: 'Price Range', weight: w.priceRange ?? 15, valueField: 'price', scoreField: 'priceScore', format: v => formatCurrency(v) }
  ].map(def => buildQualityRow(m, def))
})

const hasExcludedQualityMetrics = computed(() => qualityBreakdown.value.some(metric => metric.excluded))

// Comments state
const comments = ref([])
const loadingComments = ref(false)
const newComment = ref('')
const submittingComment = ref(false)
const editingCommentId = ref(null)
const editCommentText = ref('')
const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

// Collapsible section state (persisted to localStorage)
const chartSectionCollapsed = ref(localStorage.getItem('tradeDetail_chartCollapsed') === 'true')
const commentsSectionCollapsed = ref(localStorage.getItem('tradeDetail_commentsCollapsed') === 'true')

function toggleChartSection() {
  chartSectionCollapsed.value = !chartSectionCollapsed.value
  localStorage.setItem('tradeDetail_chartCollapsed', chartSectionCollapsed.value.toString())
}

function toggleCommentsSection() {
  commentsSectionCollapsed.value = !commentsSectionCollapsed.value
  localStorage.setItem('tradeDetail_commentsCollapsed', commentsSectionCollapsed.value.toString())
}

function toggleAIPanel() {
  showAIPanel.value = !showAIPanel.value
  if (showAIPanel.value) {
    aiStore.reset()
  }
}

// Computed property to check if quality calculation is incomplete
const hasIncompleteQuality = computed(() => {
  if (!trade.value || !trade.value.qualityGrade || !trade.value.qualityMetrics) {
    return false
  }

  const metrics = trade.value.qualityMetrics

  // Check if any of the key metrics are null or undefined
  const hasNullMetrics =
    metrics.newsSentiment === null || metrics.newsSentiment === undefined ||
    metrics.gap === null || metrics.gap === undefined ||
    metrics.relativeVolume === null || metrics.relativeVolume === undefined ||
    metrics.float === null || metrics.float === undefined ||
    metrics.price === null || metrics.price === undefined

  return hasNullMetrics
})

function buildChecklistResponses(playbook, existingReview = null) {
  const storedResponses = new Map(
    (existingReview?.checklistResponses || []).map(response => [response.checklistItemId, response])
  )

  return (playbook?.checklistItems || []).map(item => ({
    checklistItemId: item.id,
    label: item.label,
    checked: storedResponses.get(item.id)?.checked === true,
    isRequired: item.isRequired === true,
    weight: item.weight ?? 1
  }))
}

function syncReviewForm() {
  const playbook = selectedPlaybook.value
  const review = selectedReview.value

  if (!playbook) {
    reviewForm.checklistResponses = []
    reviewForm.followedPlan = ''
    reviewForm.reviewNotes = ''
    return
  }

  reviewForm.checklistResponses = buildChecklistResponses(playbook, review)
  reviewForm.followedPlan = review?.followedPlan === true ? 'true' : review?.followedPlan === false ? 'false' : ''
  reviewForm.reviewNotes = review?.reviewNotes || ''
}

async function loadPlaybooks() {
  if (!isPlaybookFeatureAvailable.value) {
    playbooks.value = []
    selectedPlaybookId.value = ''
    syncReviewForm()
    return
  }

  try {
    loadingPlaybooks.value = true
    const response = await api.get('/playbooks', { params: { includeArchived: true } })
    playbooks.value = response.data.playbooks || []

    if (trade.value?.playbookReview?.playbookId) {
      selectedPlaybookId.value = trade.value.playbookReview.playbookId
    } else if (selectedPlaybookId.value && playbooks.value.some(playbook => playbook.id === selectedPlaybookId.value)) {
      selectedPlaybookId.value = selectedPlaybookId.value
    } else {
      selectedPlaybookId.value = ''
    }

    syncReviewForm()
  } catch (error) {
    console.error('Failed to load playbooks:', error)
    showError('Error', 'Failed to load playbooks')
  } finally {
    loadingPlaybooks.value = false
  }
}

function onPlaybookChange() {
  syncReviewForm()
}

async function savePlaybookReview() {
  if (!trade.value?.id || !selectedPlaybookId.value) {
    showError('Validation', 'Select a playbook before saving a review')
    return
  }

  try {
    savingPlaybookReview.value = true
    const response = await api.put(`/playbooks/trades/${trade.value.id}/review`, {
      playbookId: selectedPlaybookId.value,
      checklistResponses: reviewForm.checklistResponses.map(item => ({
        checklistItemId: item.checklistItemId,
        checked: item.checked === true
      })),
      followedPlan: reviewForm.followedPlan === ''
        ? null
        : reviewForm.followedPlan === 'true',
      reviewNotes: reviewForm.reviewNotes?.trim() || null
    })

    trade.value.playbookId = response.data.review.playbookId
    trade.value.playbookReview = response.data.review
    syncReviewForm()
    showSuccess('Success', 'Playbook review saved')
  } catch (error) {
    console.error('Failed to save playbook review:', error)
    showError('Error', error.response?.data?.error || 'Failed to save playbook review')
  } finally {
    savingPlaybookReview.value = false
  }
}

// Ref to track if chart image failed to load
const chartImageFailed = ref(false)

// Computed property to extract TradingView snapshot image URL
const tradingViewImageUrl = computed(() => {
  if (chartImageFailed.value) return null

  const chartUrl = trade.value?.chart_url || trade.value?.chartUrl
  if (!chartUrl) return null

  // TradingView snapshot URLs: https://www.tradingview.com/x/ABCD1234/
  // Proxy image through backend to avoid intermittent cross-origin blocking
  const snapshotMatch = chartUrl.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/i)
  if (snapshotMatch) {
    return `${apiBaseUrl}/trades/tradingview/snapshot/${snapshotMatch[1]}`
  }

  // If it's already a direct image URL, use it
  if (chartUrl.match(/\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i)) {
    return chartUrl
  }

  return null
})

// Dumb mapper: read engine-stamped realized_pnl off each execution.
// trade.pnl is canonical (= SUM of realized_pnl); displayPnl is just trade.pnl.
const processedExecutions = computed(() => {
  if (!trade.value) return []

  const isOption = trade.value.instrument_type === 'option'
  const isFuture = trade.value.instrument_type === 'future'
  const contractSize = isOption ? (trade.value.contract_size || 100) : 1
  const pointValue = isFuture ? (trade.value.point_value || 1) : 1
  const valueMultiplier = isFuture ? pointValue : contractSize
  const tradeSide = trade.value.side

  if (!Array.isArray(trade.value.executions) || trade.value.executions.length === 0) {
    const quantity = parseFloat(trade.value.quantity) || 0
    const entryPrice = parseFloat(trade.value.entry_price) || 0
    const rawExitPrice = trade.value.exit_price
    const exitPrice = rawExitPrice != null && rawExitPrice !== '' ? parseFloat(rawExitPrice) : null
    const commission = parseFloat(trade.value.commission) || 0
    const fees = parseFloat(trade.value.fees) || 0

    let grossPnl = null
    let netPnl = null
    if (exitPrice != null && quantity > 0) {
      grossPnl = tradeSide === 'short'
        ? (entryPrice - exitPrice) * quantity * valueMultiplier
        : (exitPrice - entryPrice) * quantity * valueMultiplier
      netPnl = grossPnl - commission - fees
    }

    return [{
      side: tradeSide,
      action: tradeSide,
      quantity,
      entryPrice,
      exitPrice,
      entryTime: trade.value.entry_time,
      exitTime: trade.value.exit_time || null,
      commission,
      fees,
      grossPnl,
      netPnl,
      pnl: netPnl ?? (trade.value.pnl ?? 0)
    }]
  }

  const executions = trade.value.executions
  const isGroupedFormat = executions.some((e) =>
    e && (e.entryPrice !== undefined || e.entry_price !== undefined || e.entryTime !== undefined || e.entry_time !== undefined)
  )

  let runningPosition = 0
  return executions.map((execution) => {
    if (!execution) {
      return { action: 'N/A', quantity: 0, price: 0, value: 0, commission: 0, fees: 0, runningPosition: 0, avgCost: null, datetime: null, grossPnl: null, netPnl: null, pnl: null }
    }

    const quantity = parseFloat(execution.quantity) || 0
    const commission = parseFloat(execution.commission) || 0
    const fees = parseFloat(execution.fees) || 0
    const realizedPnl = execution.realized_pnl != null ? parseFloat(execution.realized_pnl) : null

    if (isGroupedFormat) {
      const entryPrice = parseFloat(execution.entryPrice ?? execution.entry_price) || 0
      const rawExit = execution.exitPrice ?? execution.exit_price
      const exitPrice = rawExit != null ? parseFloat(rawExit) : null
      const grossPnl = (exitPrice != null && quantity > 0)
        ? (tradeSide === 'short' ? (entryPrice - exitPrice) * quantity * valueMultiplier : (exitPrice - entryPrice) * quantity * valueMultiplier)
        : null

      return {
        ...execution,
        action: execution.side || tradeSide,
        quantity,
        price: entryPrice,
        value: quantity * entryPrice * valueMultiplier,
        commission,
        fees,
        datetime: execution.entryTime ?? execution.entry_time,
        runningPosition: 0,
        avgCost: entryPrice,
        entryPrice,
        exitPrice,
        entryTime: execution.entryTime ?? execution.entry_time,
        exitTime: execution.exitTime ?? execution.exit_time,
        grossPnl,
        netPnl: realizedPnl ?? (grossPnl != null ? grossPnl - commission - fees : null),
        pnl: realizedPnl ?? (grossPnl != null ? grossPnl - commission - fees : null)
      }
    }

    const action = execution.action || execution.side || 'unknown'
    const price = parseFloat(execution.price) || parseFloat(execution.entryPrice) || parseFloat(execution.entry_price) || parseFloat(execution.exitPrice) || parseFloat(execution.exit_price) || 0
    const value = quantity * price * valueMultiplier
    const datetime = execution.datetime || execution.entry_time
    const isOpening = (tradeSide === 'long' && (action === 'buy' || action === 'long')) ||
                      (tradeSide === 'short' && (action === 'sell' || action === 'short'))

    if (action === 'buy' || action === 'long') runningPosition += quantity
    else if (action === 'sell' || action === 'short') runningPosition -= quantity

    return {
      ...execution,
      action,
      quantity,
      price,
      value,
      commission,
      fees,
      datetime,
      runningPosition,
      avgCost: isOpening ? price : null,
      entryPrice: execution.entryPrice ?? execution.entry_price ?? (isOpening ? price : null),
      exitPrice: execution.exitPrice ?? execution.exit_price ?? (isOpening ? null : price),
      entryTime: execution.entryTime ?? execution.entry_time ?? (isOpening ? datetime : null),
      exitTime: execution.exitTime ?? execution.exit_time ?? (isOpening ? null : datetime),
      grossPnl: null,
      netPnl: realizedPnl,
      pnl: realizedPnl ?? (execution.pnl ?? execution.p_l ?? execution.profit_loss ?? null)
    }
  })
})

const displayPnl = computed(() => trade.value?.pnl ?? null)

// Open option positions can have a user-entered current premium stored by the
// dashboard's Open Positions table (localStorage key matches DashboardView).
// Read it here so the trade detail surfaces the same unrealized P&L instead of
// just showing "Open".
const manualOptionPrice = computed(() => {
  if (!trade.value) return null
  const isOption = trade.value.instrument_type === 'option'
  const isOpen = !trade.value.exit_time
  if (!isOption || !isOpen) return null
  try {
    const stored = localStorage.getItem('tradetally_manual_option_prices')
    if (!stored) return null
    const map = JSON.parse(stored)
    const price = map[trade.value.symbol]
    return typeof price === 'number' && !Number.isNaN(price) ? price : null
  } catch (e) {
    return null
  }
})

const openOptionUnrealizedPnL = computed(() => {
  if (manualOptionPrice.value === null) return null
  const t = trade.value
  if (!t) return null
  const quantity = Number(t.quantity || 0)
  const multiplier = Number(t.contract_size || 100)
  const entryPrice = Number(t.entry_price || 0)
  if (!quantity || !entryPrice) return null
  const currentValue = manualOptionPrice.value * quantity * multiplier
  const entryValue = entryPrice * quantity * multiplier
  return t.side === 'short' ? entryValue - currentValue : currentValue - entryValue
})

const openOptionUnrealizedPnLPercent = computed(() => {
  if (openOptionUnrealizedPnL.value === null) return null
  const t = trade.value
  const entryValue = Number(t.entry_price || 0) * Number(t.quantity || 0) * Number(t.contract_size || 100)
  if (!entryValue) return null
  return (openOptionUnrealizedPnL.value / entryValue) * 100
})

// Unrealized P&L for ANY open position. Stocks/futures use the live quote the
// backend now attaches (trade.unrealizedPnl / currentPrice); options use the
// manually-entered premium from the dashboard's Open Positions table.
const openCurrentPrice = computed(() => {
  const t = trade.value
  if (!t || t.exit_time) return null
  if (t.instrument_type === 'option') return manualOptionPrice.value
  const p = Number(t.currentPrice ?? t.current_price)
  return Number.isFinite(p) && p > 0 ? p : null
})

const openUnrealizedPnL = computed(() => {
  const t = trade.value
  if (!t || t.exit_time) return null
  if (t.instrument_type === 'option') return openOptionUnrealizedPnL.value
  const v = Number(t.unrealizedPnl)
  return Number.isFinite(v) ? v : null
})

const openUnrealizedPnLPercent = computed(() => {
  const t = trade.value
  if (!t || t.exit_time) return null
  if (t.instrument_type === 'option') return openOptionUnrealizedPnLPercent.value
  const v = Number(t.unrealizedPnlPercent)
  return Number.isFinite(v) ? v : null
})

const executionSummary = computed(() => {
  if (!processedExecutions.value || !Array.isArray(processedExecutions.value)) return {
    totalVolume: 0,
    totalShareQuantity: 0,
    totalCommission: 0,
    totalFees: 0,
    finalPosition: 0
  }

  // Check if this is an options trade and get contract multiplier
  const isOption = trade.value.instrument_type === 'option'
  const contractSize = isOption ? (trade.value.contract_size || 100) : 1

  let totalVolume = 0
  let totalShareQuantity = 0
  let totalCommission = 0
  let totalFees = 0
  let finalPosition = 0

  processedExecutions.value.forEach(execution => {
    if (!execution) return

    const quantity = parseFloat(execution.quantity) || 0
    const price = parseFloat(execution.price) || parseFloat(execution.entryPrice) || parseFloat(execution.entry_price) || parseFloat(execution.exitPrice) || parseFloat(execution.exit_price) || 0  // Use price from execution, fallback to entry_price from trade record
    const commission = parseFloat(execution.commission) || 0
    const fees = parseFloat(execution.fees) || 0
    const action = execution.action || execution.side || 'unknown'  // Use action from execution, fallback to side from trade record

    // For options, include contract multiplier in volume calculation
    totalVolume += isOption ? (quantity * price * contractSize) : (quantity * price)
    totalShareQuantity += Math.abs(quantity)  // Sum of all absolute quantities
    totalCommission += commission
    totalFees += fees

    // Round-trip rows (have both entry and exit) close out — no position contribution
    const isClosedRoundTrip = (execution.entryPrice ?? execution.entry_price) != null
      && (execution.exitPrice ?? execution.exit_price) != null
    if (isClosedRoundTrip) {
      return
    }

    if (action === 'buy' || action === 'long') {
      finalPosition += quantity
    } else if (action === 'sell' || action === 'short') {
      finalPosition -= quantity
    }
  })

  return {
    totalVolume,
    totalShareQuantity,
    totalCommission,
    totalFees,
    finalPosition
  }
})

const detailCommission = computed(() => {
  const tradeCommission = parseFloat(trade.value?.commission) || 0
  return processedExecutions.value?.length ? executionSummary.value.totalCommission : tradeCommission
})

const detailFees = computed(() => {
  const tradeFees = parseFloat(trade.value?.fees) || 0
  return processedExecutions.value?.length ? executionSummary.value.totalFees : tradeFees
})

function formatNumber(num, decimals = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num || 0)
}

// Redact account identifier for privacy (show only last 4 characters)
function redactAccountId(accountId) {
  if (!accountId) return null
  const str = String(accountId).trim()
  if (str.length <= 4) return str
  return '****' + str.slice(-4)
}

function formatQuantity(num) {
  if (!num && num !== 0) return '0'
  // If it's a whole number, show no decimals
  if (num % 1 === 0) {
    return new Intl.NumberFormat('en-US').format(num)
  }
  // Otherwise, show up to 4 decimal places, removing trailing zeros
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  }).format(num)
}

function formatDate(date) {
  if (!date) return 'N/A'
  try {
    const dateOnlyParts = getTradeDateOnlyParts(date)
    if (dateOnlyParts) {
      const { year, month, day } = dateOnlyParts
      // Create date in local timezone (month is 0-indexed)
      const dateObj = new Date(year, month - 1, day)
      return format(dateObj, 'MMM dd, yyyy')
    }

    // For datetime strings with non-midnight times, use as-is
    const dateObj = new Date(date)
    if (isNaN(dateObj.getTime())) return 'Invalid Date'
    return format(dateObj, 'MMM dd, yyyy')
  } catch (error) {
    console.error('Date formatting error:', error, 'for date:', date)
    return 'Invalid Date'
  }
}

function formatDateTime(date) {
  if (!date) return 'N/A'
  // Use timezone-aware formatting from composable
  return formatDateTimeTz(date)
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatAIModelLabel(metadata) {
  if (!metadata) return ''
  const provider = metadata.provider ? String(metadata.provider) : ''
  const model = metadata.model ? String(metadata.model) : ''
  if (provider && model) return `${provider} / ${model}`
  return model || provider
}

function formatPositionGroupLabel(group) {
  if (!group) return ''
  const label = (group.strategy_label || 'multi-leg strategy').replace(/\b\w/g, c => c.toUpperCase())
  return group.leg_count ? `${label} (${group.leg_count} legs)` : label
}

function calculateRiskReward() {
  const isLongSide = trade.value.side === 'long'

  // Open position: show the move from entry to the live current price.
  if (!trade.value.exit_time) {
    const entry = Number(trade.value.entry_price)
    const current = openCurrentPrice.value
    if (!Number.isFinite(entry) || entry === 0 || current === null) return 'Open'
    const move = isLongSide
      ? ((current - entry) / entry) * 100
      : ((entry - current) / entry) * 100
    if (move > 0) return `+${move.toFixed(2)}%`
    if (move < 0) return `${move.toFixed(2)}%`
    return 'Breakeven'
  }

  // For closed trades, we can't calculate a true risk/reward ratio without stop-loss/target levels
  // Instead, we'll show the actual outcome as a ratio
  const entryPrice = trade.value.entry_price
  const exitPrice = trade.value.exit_price
  const isLong = trade.value.side === 'long'

  // Calculate the price movement as a percentage
  const priceChange = isLong
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - exitPrice) / entryPrice) * 100

  if (priceChange > 0) {
    return `+${priceChange.toFixed(2)}%`
  } else if (priceChange < 0) {
    return `${priceChange.toFixed(2)}%`
  } else {
    return 'Breakeven'
  }
}

function calculateDuration() {
  if (!trade.value.exit_time) return 'Open'
  
  try {
    const entry = new Date(trade.value.entry_time)
    const exit = new Date(trade.value.exit_time)
    
    if (isNaN(entry.getTime()) || isNaN(exit.getTime())) {
      return 'Invalid Date'
    }
    
    return formatDistance(entry, exit)
  } catch (error) {
    console.error('Duration calculation error:', error)
    return 'Invalid Date'
  }
}

function formatCommentDate(date) {
  if (!date) return 'N/A'
  
  try {
    const dateObj = new Date(date)
    if (isNaN(dateObj.getTime())) return 'Invalid Date'
    
    const now = new Date()
    const diffInHours = (now - dateObj) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return formatTimeTz(date)
    } else if (diffInHours < 48) {
      return 'Yesterday'
    } else if (diffInHours < 168) { // 7 days
      return format(dateObj, 'EEEE')
    } else {
      return format(dateObj, 'MMM dd')
    }
  } catch (error) {
    console.error('Comment date formatting error:', error, 'for date:', date)
    return 'Invalid Date'
  }
}

function formatNewsDate(date) {
  if (!date) return 'N/A'
  
  try {
    const dateObj = new Date(date)
    if (isNaN(dateObj.getTime())) return 'Invalid Date'
    
    const now = new Date()
    const diffInHours = (now - dateObj) / (1000 * 60 * 60)
    
    if (diffInHours < 1) {
      return 'Just now'
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`
    } else if (diffInHours < 48) {
      return 'Yesterday'
    } else {
      return formatDateTimeTz(date)
    }
  } catch (error) {
    console.error('News date formatting error:', error, 'for date:', date)
    return 'Invalid Date'
  }
}

async function loadComments() {
  try {
    loadingComments.value = true
    const response = await api.get(`/trades/${trade.value.id}/comments`)
    comments.value = response.data.comments
  } catch (error) {
    console.error('Failed to load comments:', error)
    showError('Error', 'Failed to load comments')
  } finally {
    loadingComments.value = false
  }
}

async function submitComment() {
  if (!newComment.value.trim() || submittingComment.value) return

  try {
    submittingComment.value = true
    const response = await api.post(`/trades/${trade.value.id}/comments`, {
      comment: newComment.value.trim()
    })
    
    // Add the new comment to the list
    comments.value.unshift({
      ...response.data.comment,
      username: authStore.user?.username || 'You',
      avatar_url: authStore.user?.avatar_url || null
    })
    
    newComment.value = ''
    showSuccess('Success', 'Comment posted successfully')
  } catch (error) {
    console.error('Failed to post comment:', error)
    showError('Error', 'Failed to post comment')
  } finally {
    submittingComment.value = false
  }
}

function startEditComment(comment) {
  editingCommentId.value = comment.id
  editCommentText.value = comment.comment
}

function cancelEditComment() {
  editingCommentId.value = null
  editCommentText.value = ''
}

async function saveEditComment(commentId) {
  if (!editCommentText.value.trim() || submittingComment.value) return
  
  try {
    submittingComment.value = true
    const response = await api.put(`/trades/${trade.value.id}/comments/${commentId}`, {
      comment: editCommentText.value.trim()
    })
    
    // Update the comment in the list
    const index = comments.value.findIndex(c => c.id === commentId)
    if (index !== -1) {
      comments.value[index] = response.data.comment
    }
    
    editingCommentId.value = null
    editCommentText.value = ''
    showSuccess('Success', 'Comment updated successfully')
  } catch (error) {
    console.error('Failed to update comment:', error)
    showError('Error', 'Failed to update comment')
  } finally {
    submittingComment.value = false
  }
}

async function deleteTradeComment(commentId) {
  showConfirmation(
    'Delete Comment',
    'Are you sure you want to delete this comment?',
    async () => {
      try {
        await api.delete(`/trades/${trade.value.id}/comments/${commentId}`)
        
        // Remove the comment from the list
        comments.value = comments.value.filter(c => c.id !== commentId)
        
        showSuccess('Success', 'Comment deleted successfully')
      } catch (error) {
        console.error('Failed to delete comment:', error)
        showError('Error', 'Failed to delete comment')
      }
    }
  )
}

function handleCommentKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submitComment()
  }
}

function handleEditKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const commentId = editingCommentId.value
    if (commentId) {
      saveEditComment(commentId)
    }
  }
}

async function deleteTrade() {
  showConfirmation(
    'Delete Trade',
    'Are you sure you want to delete this trade? This action cannot be undone.',
    async () => {
      try {
        await tradesStore.deleteTrade(trade.value.id)
        showSuccess('Success', 'Trade deleted successfully')
        router.push('/trades')
      } catch (error) {
        showError('Error', 'Failed to delete trade')
      }
    }
  )
}

const entryAction = computed(() => {
  if (!trade.value) return 'buy'
  return trade.value.side === 'long' ? 'buy' : 'sell'
})

const entryExecutionIndices = computed(() => {
  if (!trade.value?.executions || !Array.isArray(trade.value.executions)) return []
  return trade.value.executions
    .map((e, i) => ({ index: i, action: e.action }))
    .filter(e => e.action === entryAction.value)
    .map(e => e.index)
})

function isEntryExecution(execution) {
  const action = (execution.action || execution.side || '').toLowerCase()
  return action === entryAction.value
}

function toggleExecution(index) {
  const next = new Set(selectedExecutions.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  selectedExecutions.value = next
}

async function splitSelectedTrades() {
  const count = selectedExecutions.value.size
  const allSelected = count === entryExecutionIndices.value.length
  const msg = allSelected
    ? `This will split all ${count} entry fills into individual trades and delete the original. This cannot be undone.`
    : `This will split ${count} selected entry fill(s) into new trade(s) and update the original with the remaining entries. This cannot be undone.`

  showConfirmation(
    'Split Trade',
    msg,
    async () => {
      try {
        splittingTrade.value = true
        const indices = Array.from(selectedExecutions.value)
        await api.post(`/trades/${trade.value.id}/split`, { execution_indices: indices })
        showSuccess('Success', `Trade split successfully`)
        await tradesStore.fetchTrades()
        await tradesStore.fetchAnalytics()
        router.push('/trades')
      } catch (error) {
        console.error('Failed to split trade:', error)
        showError('Error', error.response?.data?.error || 'Failed to split trade')
      } finally {
        splittingTrade.value = false
        splitMode.value = false
        selectedExecutions.value = new Set()
      }
    }
  )
}

async function calculateQuality() {
  if (!trade.value || calculatingQuality.value) return

  try {
    calculatingQuality.value = true
    const response = await api.post(`/trades/${trade.value.id}/quality`)

    if (response.data.success) {
      // Update the trade with the new quality data
      trade.value.qualityGrade = response.data.quality.grade
      trade.value.qualityScore = response.data.quality.score
      trade.value.qualityMetrics = response.data.quality.metrics

      trade.value.setupQuality = {
        grade: response.data.quality.grade,
        score: response.data.quality.score,
        metrics: response.data.quality.metrics
      }

      showSuccess('Success', `Setup quality calculated: ${response.data.quality.grade}`)
    } else {
      showError('Error', 'Failed to calculate setup quality')
    }
  } catch (error) {
    console.error('Error calculating quality:', error)
    showError('Error', error.response?.data?.error || 'Failed to calculate setup quality')
  } finally {
    calculatingQuality.value = false
  }
}

async function loadTrade() {
  try {
    loading.value = true
    chartImageFailed.value = false // Reset chart image state for new trade
    trade.value = await tradesStore.fetchTrade(route.params.id)
    if (!trade.value.setupQuality) {
      trade.value.setupQuality = {
        grade: trade.value.qualityGrade || null,
        score: trade.value.qualityScore || null,
        metrics: trade.value.qualityMetrics || null
      }
    }
    // Owner-only data (playbooks, comments, AI analyses) require auth - skip it for
    // guests viewing a public trade so their requests don't 401 and bounce them to login.
    if (trade.value && authStore.isAuthenticated) {
      await loadPlaybooks()
      loadComments()
      loadStoredAIAnalyses()
      fetchQualityWeights()
    }
  } catch (error) {
    // A guest hitting a private/non-existent trade gets a 404; send them to login
    // (the owner can sign in and come back). Authenticated users go to their list.
    if (!authStore.isAuthenticated) {
      router.push({ name: 'login', query: { redirect: route.fullPath } })
    } else {
      showError('Error', 'Failed to load trade')
      router.push('/trades')
    }
  } finally {
    loading.value = false
  }
}

async function loadStoredAIAnalyses() {
  const tradeId = trade.value?.id || route.params.id
  if (!tradeId) return

  try {
    loadingStoredAIAnalyses.value = true
    const response = await api.get(`/ai/trades/${tradeId}/analyses`)
    storedAIAnalyses.value = response.data.analyses || []
  } catch (error) {
    console.error('Failed to load stored AI analyses:', error)
  } finally {
    loadingStoredAIAnalyses.value = false
  }
}

function handleImageDeleted(imageId) {
  if (trade.value && trade.value.attachments) {
    trade.value.attachments = trade.value.attachments.filter(img => img.id !== imageId)
  }
}

function handleChartDeleted(chartId) {
  if (trade.value && trade.value.charts) {
    trade.value.charts = trade.value.charts.filter(chart => chart.id !== chartId)
  }
}

async function copyChartUrl() {
  const chartUrl = trade.value?.chart_url || trade.value?.chartUrl
  if (chartUrl) {
    try {
      await navigator.clipboard.writeText(chartUrl)
      // Could add a toast notification here if desired
    } catch (err) {
      console.error('Failed to copy chart URL:', err)
    }
  }
}

onMounted(() => {
  // Scroll to top when the page loads
  window.scrollTo(0, 0)

  loadTrade()
})
</script>
