<template>
  <div class="w-full content-wrapper py-8">
    <div class="mb-8">
      <h1 class="heading-page">
        {{ isEdit ? 'Edit Trade' : 'Add New Trade' }}
      </h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {{ isEdit ? 'Update your trade details' : 'Enter the details of your trade' }}
      </p>
    </div>

    <!-- Behavioral Alert -->
    <div v-if="behavioralAlert" class="mb-6 card border-l-4 border-l-red-500 bg-red-50 dark:bg-red-900/10">
      <div class="card-body">
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div class="ml-3 flex-1">
            <h3 class="text-lg font-medium text-red-800 dark:text-red-400">Revenge Trading Alert</h3>
            <p class="text-red-700 dark:text-red-300 mt-1">{{ behavioralAlert.message }}</p>
            <div v-if="behavioralAlert.recommendation" class="mt-2">
              <p class="text-sm text-red-600 dark:text-red-400">
                <strong>Recommendation:</strong> {{ behavioralAlert.recommendation }}
              </p>
            </div>
            <div v-if="behavioralAlert.coolingPeriod" class="mt-3">
              <div class="flex items-center space-x-2">
                <button
                  @click="takeCoolingPeriod"
                  class="px-3 py-1 text-sm bg-red-200 text-red-800 rounded hover:bg-red-300 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                >
                  Take {{ behavioralAlert.coolingPeriod }} minute break
                </button>
                <button
                  @click="acknowledgeBehavioralAlert"
                  class="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Continue anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Trade Blocking Warning -->
    <div v-if="tradeBlocked" class="mb-6 card border-l-4 border-l-red-600 bg-red-100 dark:bg-red-900/20">
      <div class="card-body text-center">
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
          <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-red-800 dark:text-red-400 mb-2">Trading Temporarily Blocked</h3>
        <p class="text-red-700 dark:text-red-300 mb-4">
          Based on your recent trading patterns, we recommend taking a break to avoid emotional decision-making.
        </p>
        <p class="text-sm text-red-600 dark:text-red-400">
          Recommended cooling period: {{ tradeBlockingInfo.recommendedCoolingPeriod }} minutes
        </p>
      </div>
    </div>

    <form @submit.prevent="handleSubmit" class="card">
      <div class="card-body space-y-6">
        <!-- Trade Info Section -->
        <div class="border-b border-gray-200 dark:border-gray-700 pb-6">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Trade Information</h2>

          <div class="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label for="symbol" class="label">Symbol *</label>
              <SymbolAutocomplete
                id="symbol"
                v-model="form.symbol"
                :required="true"
                placeholder="AAPL"
              />
            </div>

            <div v-if="!hasGroupedExecutions">
              <label for="side" class="label">Side *</label>
              <select id="side" v-model="form.side" required class="input">
                <option value="">Select side</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>

            <div>
              <label for="instrumentType" class="label">Instrument Type *</label>
              <select id="instrumentType" v-model="form.instrumentType" required class="input">
                <option value="stock">Stock</option>
                <option value="option">Option</option>
                <option value="future">Future</option>
                <option value="crypto">Crypto</option>
              </select>
            </div>
          </div>

          <div v-if="!hasGroupedExecutions" class="grid grid-cols-1 gap-6 sm:grid-cols-2 mt-6">
            <div>
              <label for="stopLoss" class="label">Stop Loss</label>
              <input
                id="stopLoss"
                v-model="form.stopLoss"
                type="number"
                step="any"
                min="0"
                class="input"
                placeholder="0"
              />
            </div>

            <!-- All Take Profit targets in one column using CSS grid for alignment -->
            <div class="space-y-2">
              <!-- TP1 -->
              <div class="grid gap-2 items-end" style="grid-template-columns: 1fr 5rem 1.5rem;">
                <div>
                  <label for="takeProfit" class="label">Take Profit (TP1)</label>
                  <input
                    id="takeProfit"
                    v-model="form.takeProfit"
                    type="number"
                    step="any"
                    min="0"
                    class="input"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label for="takeProfitQty" class="label text-xs">Qty</label>
                  <input
                    id="takeProfitQty"
                    v-model.number="form.takeProfitQty"
                    type="number"
                    step="1"
                    min="1"
                    class="input"
                    placeholder="Qty"
                  />
                </div>
                <div></div>
              </div>

              <!-- TP2+ -->
              <div v-for="(target, tpIndex) in form.takeProfitTargets" :key="tpIndex" class="grid gap-2 items-end" style="grid-template-columns: 1fr 5rem 1.5rem;">
                <div>
                  <label :for="`tp-target-${tpIndex}`" class="label text-xs">TP{{ tpIndex + 2 }}</label>
                  <input
                    :id="`tp-target-${tpIndex}`"
                    v-model.number="form.takeProfitTargets[tpIndex].price"
                    type="number"
                    step="any"
                    min="0"
                    class="input"
                    placeholder="Price"
                  />
                </div>
                <div>
                  <label :for="`tp-shares-${tpIndex}`" class="label text-xs">Shares</label>
                  <input
                    :id="`tp-shares-${tpIndex}`"
                    v-model.number="form.takeProfitTargets[tpIndex].shares"
                    type="number"
                    step="1"
                    min="1"
                    class="input"
                    placeholder="Qty"
                  />
                </div>
                <button
                  type="button"
                  @click="removeTakeProfitTarget(tpIndex)"
                  class="p-1 h-10 flex items-center justify-center text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  title="Remove target"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <button
                type="button"
                @click="addTakeProfitTarget"
                class="inline-flex items-center text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
              >
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add TP Target
              </button>
            </div>
          </div>

          <!-- Target Hit First (only shown when stop loss is set) -->
          <div v-if="!hasGroupedExecutions && form.stopLoss" class="mt-6">
            <label for="manualTargetHitFirst" class="label">Target Hit First</label>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Manually specify which target was hit first (for R-Multiple analysis)
            </p>
            <select
              id="manualTargetHitFirst"
              v-model="form.manualTargetHitFirst"
              class="input"
            >
              <option :value="null">-- Auto-detect (requires API) --</option>
              <option value="take_profit">Take Profit Hit First</option>
              <option value="stop_loss">Stop Loss Hit First</option>
            </select>
          </div>

          <!-- Info message when fields are hidden -->
          <div v-if="hasGroupedExecutions" class="mt-6 p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
            <p class="text-sm text-primary-800 dark:text-primary-200">
              <span class="font-medium">Note:</span> Side, Stop Loss, and Take Profit are configured per execution below since this trade contains grouped complete trades.
            </p>
          </div>
        </div>

        <!-- Executions Section -->
        <div class="border-b border-gray-200 dark:border-gray-700 pb-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-medium text-gray-900 dark:text-white">Executions</h2>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Add individual fills or complete trades (grouped)
              </p>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                @click="addExecution"
                class="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm font-medium"
              >
                + Add Fill
              </button>
              <button
                type="button"
                @click="addGroupedExecution"
                class="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm font-medium"
              >
                + Add Complete Trade
              </button>
            </div>
          </div>

          <!-- Live P&L Preview -->
          <div v-if="computedPnlPreview.hasValidData" class="mb-4 p-4 rounded-lg border"
               :class="computedPnlPreview.value >= 0
                 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                 : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated P&L</p>
                <p class="text-xs text-gray-500 dark:text-gray-400" v-if="computedPnlPreview.instrumentType === 'future'">
                  Point Value: ${{ form.pointValue || 1 }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold"
                   :class="computedPnlPreview.value >= 0
                     ? 'text-green-600 dark:text-green-400'
                     : 'text-red-600 dark:text-red-400'">
                  {{ computedPnlPreview.value >= 0 ? '+' : '' }}${{ computedPnlPreview.value.toFixed(2) }}
                </p>
              </div>
            </div>
          </div>

          <div v-if="form.executions && form.executions.length > 0" class="space-y-4">
            <div
              v-for="(execution, index) in form.executions"
              :key="index"
              class="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
            >
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Execution {{ index + 1 }}
                </h3>
                <button
                  type="button"
                  @click="removeExecution(index)"
                  class="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              </div>

              <!-- Check if this is a grouped trade execution (has entryPrice/exitPrice) or individual fill -->
              <div v-if="execution.entryPrice !== undefined || execution.exitPrice !== undefined" class="space-y-4">
                <!-- Grouped trade execution format -->
                <!-- Row 1: Side and Quantity -->
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label :for="`exec-side-${index}`" class="label">Side *</label>
                    <select
                      :id="`exec-side-${index}`"
                      v-model="execution.side"
                      required
                      class="input"
                    >
                      <option value="">Select</option>
                      <option value="long">Long</option>
                      <option value="short">Short</option>
                    </select>
                  </div>

                  <div>
                    <label :for="`exec-quantity-${index}`" class="label">Quantity *</label>
                    <input
                      :id="`exec-quantity-${index}`"
                      v-model="execution.quantity"
                      type="number"
                      min="0.0001"
                      step="any"
                      required
                      class="input"
                      placeholder="100"
                    />
                  </div>
                </div>

                <!-- Row 2: Entry Price and Exit Price -->
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label :for="`exec-entry-price-${index}`" class="label">Entry Price *</label>
                    <input
                      :id="`exec-entry-price-${index}`"
                      v-model="execution.entryPrice"
                      type="number"
                      step="any"
                      min="0"
                      required
                      class="input"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label :for="`exec-exit-price-${index}`" class="label">Exit Price</label>
                    <input
                      :id="`exec-exit-price-${index}`"
                      v-model="execution.exitPrice"
                      type="number"
                      step="any"
                      min="0"
                      class="input"
                      placeholder="0"
                    />
                  </div>
                </div>

                <!-- Row 3: Entry Time and Exit Time -->
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label :for="`exec-entry-time-${index}`" class="label">
                      Entry Time * <span class="text-xs font-normal text-gray-500">({{ timezoneLabel }})</span>
                    </label>
                    <input
                      :id="`exec-entry-time-${index}`"
                      v-model="execution.entryTime"
                      type="datetime-local"
                      step="1"
                      required
                      class="input"
                    />
                  </div>

                  <div>
                    <label :for="`exec-exit-time-${index}`" class="label">
                      Exit Time <span class="text-xs font-normal text-gray-500">({{ timezoneLabel }})</span>
                    </label>
                    <input
                      :id="`exec-exit-time-${index}`"
                      v-model="execution.exitTime"
                      type="datetime-local"
                      step="1"
                      class="input"
                    />
                  </div>
                </div>

                <!-- Row 4: Commission and Fees -->
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label :for="`exec-commission-${index}`" class="label">Commission</label>
                    <input
                      :id="`exec-commission-${index}`"
                      v-model="execution.commission"
                      type="number"
                      step="any"
                      class="input"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label :for="`exec-fees-${index}`" class="label">Fees</label>
                    <input
                      :id="`exec-fees-${index}`"
                      v-model="execution.fees"
                      type="number"
                      step="any"
                      class="input"
                      placeholder="0"
                    />
                  </div>
                </div>

                <!-- Row 5: Stop Loss and Take Profit -->
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label :for="`exec-stop-loss-${index}`" class="label">Stop Loss</label>
                    <input
                      :id="`exec-stop-loss-${index}`"
                      v-model="execution.stopLoss"
                      type="number"
                      step="any"
                      min="0"
                      class="input"
                      placeholder="0"
                    />
                  </div>

                  <!-- All Take Profit targets using CSS grid for alignment -->
                  <div class="space-y-2">
                    <!-- TP1 -->
                    <div class="grid gap-2 items-end" style="grid-template-columns: 1fr 5rem 1.5rem;">
                      <div>
                        <label :for="`exec-take-profit-${index}`" class="label">Take Profit (TP1)</label>
                        <input
                          :id="`exec-take-profit-${index}`"
                          v-model="execution.takeProfit"
                          type="number"
                          step="any"
                          min="0"
                          class="input"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label :for="`exec-take-profit-qty-${index}`" class="label text-xs">Qty</label>
                        <input
                          :id="`exec-take-profit-qty-${index}`"
                          v-model.number="execution.takeProfitQty"
                          type="number"
                          step="1"
                          min="1"
                          class="input"
                          placeholder="Qty"
                        />
                      </div>
                      <div></div>
                    </div>

                    <!-- TP2+ -->
                    <div v-for="(target, tpIndex) in execution.takeProfitTargets" :key="tpIndex" class="grid gap-2 items-end" style="grid-template-columns: 1fr 5rem 1.5rem;">
                      <div>
                        <label :for="`exec-tp-target-${index}-${tpIndex}`" class="label text-xs">TP{{ tpIndex + 2 }}</label>
                        <input
                          :id="`exec-tp-target-${index}-${tpIndex}`"
                          v-model.number="execution.takeProfitTargets[tpIndex].price"
                          type="number"
                          step="any"
                          min="0"
                          class="input"
                          placeholder="Price"
                        />
                      </div>
                      <div>
                        <label :for="`exec-tp-shares-${index}-${tpIndex}`" class="label text-xs">Shares</label>
                        <input
                          :id="`exec-tp-shares-${index}-${tpIndex}`"
                          v-model.number="execution.takeProfitTargets[tpIndex].shares"
                          type="number"
                          step="1"
                          min="1"
                          class="input"
                          placeholder="Qty"
                        />
                      </div>
                      <button
                        type="button"
                        @click="removeExecutionTakeProfitTarget(index, tpIndex)"
                        class="p-1 h-10 flex items-center justify-center text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        title="Remove target"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <button
                      type="button"
                      @click="addExecutionTakeProfitTarget(index)"
                      class="inline-flex items-center text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Add TP Target
                    </button>
                  </div>
                </div>
              </div>

              <!-- Individual fill format -->
              <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label :for="`exec-datetime-${index}`" class="label">
                    Date/Time * <span class="text-xs font-normal text-gray-500">({{ timezoneLabel }})</span>
                  </label>
                  <input
                    :id="`exec-datetime-${index}`"
                    v-model="execution.datetime"
                    type="datetime-local"
                    step="1"
                    required
                    class="input"
                  />
                </div>

                <div>
                  <label :for="`exec-action-${index}`" class="label">Action *</label>
                  <select
                    :id="`exec-action-${index}`"
                    v-model="execution.action"
                    required
                    class="input"
                  >
                    <option value="">Select</option>
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>

                <div>
                  <label :for="`exec-quantity-${index}`" class="label">Quantity *</label>
                  <input
                    :id="`exec-quantity-${index}`"
                    v-model="execution.quantity"
                    type="number"
                    min="0.0001"
                    step="any"
                    required
                    class="input"
                    placeholder="100"
                  />
                </div>

                <div>
                  <label :for="`exec-price-${index}`" class="label">Price *</label>
                  <input
                    :id="`exec-price-${index}`"
                    v-model="execution.price"
                    type="number"
                    step="any"
                    min="0"
                    required
                    class="input"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label :for="`exec-commission-${index}`" class="label">Commission</label>
                  <input
                    :id="`exec-commission-${index}`"
                    v-model="execution.commission"
                    type="number"
                    step="any"
                    class="input"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label :for="`exec-fees-${index}`" class="label">Fees</label>
                  <input
                    :id="`exec-fees-${index}`"
                    v-model="execution.fees"
                    type="number"
                    step="any"
                    class="input"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <p class="text-gray-500 dark:text-gray-400 mb-2">No executions added yet</p>
            <p class="text-sm text-gray-400 dark:text-gray-500">Click "Add Execution" to add your first fill</p>
          </div>
        </div>

        <!-- Additional Fields Section -->
        <div class="border-b border-gray-200 dark:border-gray-700 pb-6">
          <button
            type="button"
            @click="showAdditionalFields = !showAdditionalFields"
            class="flex items-center justify-between w-full text-left mb-4"
          >
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">Additional Fields</h2>
            <svg
              class="h-5 w-5 text-gray-500 dark:text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': showAdditionalFields }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div v-show="showAdditionalFields" class="grid grid-cols-1 gap-6 sm:grid-cols-2">

          <div>
            <label for="mae" class="label">MAE (Max Adverse Excursion)</label>
            <input
              id="mae"
              v-model="form.mae"
              type="number"
              step="any"
              class="input"
              placeholder="0"
              title="Maximum loss during trade"
            />
          </div>

          <div>
            <label for="mfe" class="label">MFE (Max Favorable Excursion)</label>
            <input
              id="mfe"
              v-model="form.mfe"
              type="number"
              step="any"
              class="input"
              placeholder="0"
              title="Maximum profit during trade"
            />
          </div>

          <div class="relative">
            <label for="broker" class="label">Broker</label>
            <div class="relative">
              <input
                v-if="showBrokerInput"
                id="broker"
                v-model="form.broker"
                type="text"
                class="input pr-20"
                placeholder="Enter broker name"
                @keydown.enter.prevent="handleBrokerInputEnter"
                @blur="handleBrokerInputBlur"
              />
              <select
                v-else
                id="broker"
                v-model="form.broker"
                class="input pr-20"
                @change="handleBrokerSelect"
              >
                <option value="">Select broker</option>
                <option v-if="form.broker && !brokersList.includes(form.broker)" :value="form.broker">{{ form.broker }}</option>
                <option v-for="broker in brokersList" :key="broker" :value="broker">{{ broker }}</option>
                <option value="__custom__">+ Add New Broker</option>
              </select>
              <button
                v-if="showBrokerInput"
                type="button"
                @click="showBrokerInput = false"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1"
              >
                Select
              </button>
            </div>
          </div>

          <div class="relative">
            <label for="account_identifier" class="label">Account</label>
            <div class="relative">
              <input
                v-if="showAccountInput"
                id="account_identifier"
                v-model="form.account_identifier"
                type="text"
                class="input pr-20"
                placeholder="Enter account identifier"
                @keydown.enter.prevent="handleAccountInputEnter"
                @blur="handleAccountInputBlur"
              />
              <select
                v-else
                id="account_identifier"
                v-model="form.account_identifier"
                class="input pr-20"
                @change="handleAccountSelect"
              >
                <option value="">Select account</option>
                <option v-if="form.account_identifier && !accountsList.includes(form.account_identifier)" :value="form.account_identifier">{{ form.account_identifier }}</option>
                <option v-for="account in accountsList" :key="account" :value="account">{{ account }}</option>
                <option value="__custom__">+ Add New Account</option>
              </select>
              <button
                v-if="showAccountInput"
                type="button"
                @click="showAccountInput = false"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1"
              >
                Select
              </button>
            </div>
          </div>

          <!-- Confidence Level -->
          <div class="sm:col-span-2">
            <label for="confidence" class="label">Confidence Level (1-10)</label>
            <div class="mt-2">
              <div class="flex items-center space-x-4">
                <span class="text-sm text-gray-500 dark:text-gray-400">1</span>
                <div class="flex-1 relative">
                  <input
                    id="confidence"
                    v-model="form.confidence"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 slider"
                    :style="{ background: `linear-gradient(to right, #F0812A 0%, #F0812A ${(form.confidence - 1) * 11.11}%, #e5e7eb ${(form.confidence - 1) * 11.11}%, #e5e7eb 100%)` }"
                  />
                  <div class="flex justify-between text-xs text-gray-400 mt-1">
                    <span v-for="i in 10" :key="i" class="w-4 text-center">{{ i }}</span>
                  </div>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">10</span>
              </div>
              <div class="mt-2 text-center">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-300">
                  Confidence: {{ form.confidence }}/10
                </span>
              </div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Rate your confidence level in this trade setup from 1 (very low) to 10 (very high)
              </p>
            </div>
          </div>

          </div>
        </div>

        <!-- More Options Section -->
        <div class="border-b border-gray-200 dark:border-gray-700 pb-6">
          <button
            type="button"
            @click="showMoreOptions = !showMoreOptions"
            class="flex items-center justify-between w-full text-left mb-4"
          >
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">More Options</h2>
            <svg
              class="h-5 w-5 text-gray-500 dark:text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': showMoreOptions }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

      <div v-show="showMoreOptions" class="space-y-6">
        <!-- Options-specific fields -->
        <div v-if="form.instrumentType === 'option'" class="grid grid-cols-1 gap-6 sm:grid-cols-2 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div class="sm:col-span-2 flex items-center justify-between">
            <h3 class="text-md font-medium text-gray-900 dark:text-white">Option Details</h3>
            <div class="flex items-center gap-2">
              <select
                v-model="selectedOptionsTemplate"
                @change="applyOptionsTemplate"
                :disabled="optionsTemplates.length === 0"
                class="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 disabled:opacity-50"
              >
                <option value="">{{ optionsTemplates.length === 0 ? 'No templates saved' : 'Load Template...' }}</option>
                <option v-for="t in optionsTemplates" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <button
                type="button"
                @click="showSaveOptionsTemplateModal = true"
                class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                Save
              </button>
              <button
                v-if="optionsTemplates.length > 0"
                type="button"
                @click="showManageOptionsTemplatesModal = true"
                class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                Manage
              </button>
            </div>
          </div>

          <div>
            <label for="underlyingSymbol" class="label">Underlying Symbol *</label>
            <input
              id="underlyingSymbol"
              v-model="form.underlyingSymbol"
              type="text"
              :required="form.instrumentType === 'option'"
              class="input uppercase"
              placeholder="SPY"
            />
          </div>

          <div>
            <label for="optionType" class="label">Option Type *</label>
            <select id="optionType" v-model="form.optionType" :required="form.instrumentType === 'option'" class="input">
              <option value="">Select type</option>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </div>

          <div>
            <label for="strikePrice" class="label">Strike Price *</label>
            <input
              id="strikePrice"
              v-model="form.strikePrice"
              type="number"
              step="any"
              min="0"
              :required="form.instrumentType === 'option'"
              class="input"
              placeholder="450.00"
            />
          </div>

          <div>
            <label for="expirationDate" class="label">Expiration Date *</label>
            <input
              id="expirationDate"
              v-model="form.expirationDate"
              type="date"
              :required="form.instrumentType === 'option'"
              class="input"
            />
          </div>

          <div>
            <label for="contractSize" class="label">Contract Size</label>
            <input
              id="contractSize"
              v-model="form.contractSize"
              type="number"
              min="1"
              class="input"
              placeholder="100"
            />
          </div>
        </div>

        <!-- Futures-specific fields -->
        <div v-if="form.instrumentType === 'future'" class="grid grid-cols-1 gap-6 sm:grid-cols-2 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div class="sm:col-span-2 flex items-center justify-between">
            <h3 class="text-md font-medium text-gray-900 dark:text-white">Futures Details</h3>
            <div class="flex items-center gap-2">
              <select
                v-model="selectedFuturesTemplate"
                @change="applyFuturesTemplate"
                :disabled="futuresTemplates.length === 0"
                class="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 disabled:opacity-50"
              >
                <option value="">{{ futuresTemplates.length === 0 ? 'No templates saved' : 'Load Template...' }}</option>
                <option v-for="t in futuresTemplates" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <button
                type="button"
                @click="showSaveFuturesTemplateModal = true"
                class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                Save
              </button>
              <button
                v-if="futuresTemplates.length > 0"
                type="button"
                @click="showManageFuturesTemplatesModal = true"
                class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                Manage
              </button>
            </div>
          </div>

          <div>
            <label for="underlyingAsset" class="label">Underlying Asset *</label>
            <input
              id="underlyingAsset"
              v-model="form.underlyingAsset"
              type="text"
              :required="form.instrumentType === 'future'"
              class="input"
              placeholder="E-mini S&P 500"
            />
          </div>

          <div>
            <label for="contractMonth" class="label">Contract Month *</label>
            <select id="contractMonth" v-model="form.contractMonth" :required="form.instrumentType === 'future'" class="input">
              <option value="">Select month</option>
              <option value="JAN">January</option>
              <option value="FEB">February</option>
              <option value="MAR">March</option>
              <option value="APR">April</option>
              <option value="MAY">May</option>
              <option value="JUN">June</option>
              <option value="JUL">July</option>
              <option value="AUG">August</option>
              <option value="SEP">September</option>
              <option value="OCT">October</option>
              <option value="NOV">November</option>
              <option value="DEC">December</option>
            </select>
          </div>

          <div>
            <label for="contractYear" class="label">Contract Year *</label>
            <input
              id="contractYear"
              v-model="form.contractYear"
              type="number"
              min="2020"
              :required="form.instrumentType === 'future'"
              class="input"
              placeholder="2025"
            />
          </div>

          <div>
            <label for="tickSize" class="label">Tick Size</label>
            <input
              id="tickSize"
              v-model="form.tickSize"
              type="number"
              step="any"
              min="0"
              class="input"
              placeholder="0.25"
            />
          </div>

          <div>
            <label for="pointValue" class="label">Point Value</label>
            <input
              id="pointValue"
              v-model="form.pointValue"
              type="number"
              step="any"
              min="0"
              class="input"
              placeholder="50.00"
            />
          </div>
        </div>

        <!-- Strategy Field (Collapsible) -->
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            @click="showStrategy = !showStrategy"
            class="flex items-center justify-between w-full px-4 py-3 text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Strategy</span>
            <svg
              class="h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': showStrategy }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div v-show="showStrategy" class="p-4">
            <div class="relative">
              <input
                v-if="showStrategyInput"
                id="strategy"
                v-model="form.strategy"
                type="text"
                class="input"
                placeholder="Enter strategy name"
                @keydown.enter.prevent="handleStrategyInputEnter"
                @blur="handleStrategyInputBlur"
              />
              <select
                v-else
                id="strategy"
                v-model="form.strategy"
                class="input"
                @change="handleStrategySelect"
              >
                <option value="">Select strategy</option>
                <option v-if="form.strategy && !strategiesList.includes(form.strategy)" :value="form.strategy">{{ form.strategy }}</option>
                <option v-for="strategy in strategiesList" :key="strategy" :value="strategy">{{ strategy }}</option>
                <option value="__custom__">+ Add New Strategy</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Setup Field (Collapsible) -->
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            @click="showSetup = !showSetup"
            class="flex items-center justify-between w-full px-4 py-3 text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Setup</span>
            <svg
              class="h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': showSetup }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div v-show="showSetup" class="p-4">
            <div class="relative">
              <input
                v-if="showSetupInput"
                id="setup"
                v-model="form.setup"
                type="text"
                class="input"
                placeholder="Enter setup name"
                @keydown.enter.prevent="handleSetupInputEnter"
                @blur="handleSetupInputBlur"
              />
              <select
                v-else
                id="setup"
                v-model="form.setup"
                class="input"
                @change="handleSetupSelect"
              >
                <option value="">Select setup</option>
                <option v-if="form.setup && !setupsList.includes(form.setup)" :value="form.setup">{{ form.setup }}</option>
                <option v-for="setup in setupsList" :key="setup" :value="setup">{{ setup }}</option>
                <option value="__custom__">+ Add New Setup</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Tags Field (Collapsible) -->
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            @click="showTags = !showTags"
            class="flex items-center justify-between w-full px-4 py-3 text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Tags</span>
            <svg
              class="h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': showTags }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div v-show="showTags" class="p-4">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Comma separated</p>
            <div class="relative">
              <input
                id="tags"
                v-model="tagsInput"
                type="text"
                class="input"
                placeholder="momentum, earnings, breakout"
                @focus="handleTagsFocus"
                @blur="handleTagsBlur"
                @keydown.down.prevent="moveTagSuggestion(1)"
                @keydown.up.prevent="moveTagSuggestion(-1)"
                @keydown.enter="applyActiveTagSuggestion"
              />
              <div
                v-if="showTagSuggestions"
                class="absolute z-10 mt-1 w-full rounded-md bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 max-h-48 overflow-auto"
              >
                <ul class="py-1 text-sm text-gray-700 dark:text-gray-200">
                  <li
                    v-for="(tag, index) in tagSuggestions"
                    :key="tag"
                    @mousedown.prevent="selectTagSuggestion(tag)"
                    :class="[
                      'px-3 py-1 cursor-pointer flex items-center justify-between',
                      index === activeTagSuggestionIndex
                        ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-100'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    ]"
                  >
                    <span>{{ tag }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Notes Field (Collapsible) -->
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            @click="showNotes = !showNotes"
            class="flex items-center justify-between w-full px-4 py-3 text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</span>
            <svg
              class="h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': showNotes }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div v-show="showNotes" class="p-4">
            <textarea
              id="notes"
              v-model="form.notes"
              rows="4"
              class="input"
              placeholder="Add your trade notes, observations, and learnings..."
              @keydown="handleNotesKeydown"
            ></textarea>
          </div>
        </div>

        <!-- Current Images (when editing) -->
        <div v-if="isEdit && currentImages.length > 0">
          <TradeImages
            :trade-id="route.params.id"
            :images="currentImages"
            :can-delete="true"
            @deleted="handleImageDeleted"
          />
        </div>

        <!-- Chart Management Section (Collapsible) -->
        <div v-if="isEdit && route.params.id" class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            @click="showCharts = !showCharts"
            class="flex items-center justify-between w-full px-4 py-3 text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Charts & Images</span>
            <svg
              class="h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200"
              :class="{ 'rotate-180': showCharts }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div v-show="showCharts" class="p-4 space-y-6">
            <!-- Display existing charts -->
            <TradeCharts
              v-if="trade && trade.charts && trade.charts.length > 0"
              :trade-id="route.params.id"
              :charts="trade.charts"
              :can-delete="true"
              @deleted="handleChartDeleted"
            />

            <!-- Add new charts -->
            <ChartUpload
              :trade-id="route.params.id"
              @added="handleChartAdded"
            />

            <!-- Image Upload Section -->
            <ImageUpload
              :trade-id="route.params.id"
              @uploaded="handleImageUploaded"
            />
          </div>
        </div>
  
        <div class="flex items-center">
          <input
            id="isPublic"
            v-model="form.isPublic"
            type="checkbox"
            class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label for="isPublic" class="ml-2 block text-sm text-gray-900 dark:text-white">
            Make this trade public
          </label>
        </div>
      </div>
        </div>

      <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
        </div>

        <div class="flex justify-end space-x-3">
          <router-link to="/trades" class="btn-secondary">
            Cancel
          </router-link>
          <button
            type="submit"
            :disabled="loading"
            class="btn-primary"
          >
            <span v-if="loading">{{ isEdit ? 'Updating...' : 'Creating...' }}</span>
            <span v-else>{{ isEdit ? 'Update Trade' : 'Create Trade' }}</span>
          </button>
        </div>
      </div>
    </form>

    <!-- Public Profile Modal -->
    <div v-if="showPublicProfileModal" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="closePublicProfileModal"></div>
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div class="sm:flex sm:items-start">
            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 dark:bg-primary-900/20 sm:mx-0 sm:h-10 sm:w-10">
              <svg class="h-6 w-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
              <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                Enable Public Profile?
              </h3>
              <div class="mt-2">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  To share public trades, you need to enable your public profile. This will allow other users to see your public trades and username.
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Would you like to make your profile public now?
                </p>
              </div>
            </div>
          </div>
          <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              @click="enablePublicProfile"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Yes, make my profile public
            </button>
            <button
              type="button"
              @click="closePublicProfileModal"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Futures Template Modal -->
    <div v-if="showSaveFuturesTemplateModal" class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="showSaveFuturesTemplateModal = false"></div>
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
              Save Futures Template
            </h3>
            <div class="mt-4">
              <label for="futuresTemplateName" class="label">Template Name</label>
              <input
                id="futuresTemplateName"
                v-model="newFuturesTemplateName"
                type="text"
                class="input"
                placeholder="e.g., ES E-mini S&P 500"
                @keyup.enter="saveFuturesTemplate"
              />
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                This will save: underlying asset, tick size, and point value.
              </p>
            </div>
          </div>
          <div class="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              type="button"
              :disabled="!newFuturesTemplateName.trim() || savingTemplate"
              @click="saveFuturesTemplate"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {{ savingTemplate ? 'Saving...' : 'Save Template' }}
            </button>
            <button
              type="button"
              @click="showSaveFuturesTemplateModal = false"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Options Template Modal -->
    <div v-if="showSaveOptionsTemplateModal" class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="showSaveOptionsTemplateModal = false"></div>
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
              Save Options Template
            </h3>
            <div class="mt-4">
              <label for="optionsTemplateName" class="label">Template Name</label>
              <input
                id="optionsTemplateName"
                v-model="newOptionsTemplateName"
                type="text"
                class="input"
                placeholder="e.g., SPY Options"
                @keyup.enter="saveOptionsTemplate"
              />
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                This will save: underlying symbol, option type, and contract size.
              </p>
            </div>
          </div>
          <div class="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              type="button"
              :disabled="!newOptionsTemplateName.trim() || savingTemplate"
              @click="saveOptionsTemplate"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {{ savingTemplate ? 'Saving...' : 'Save Template' }}
            </button>
            <button
              type="button"
              @click="showSaveOptionsTemplateModal = false"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Manage Futures Templates Modal -->
    <div v-if="showManageFuturesTemplatesModal" class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="showManageFuturesTemplatesModal = false"></div>
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
              Manage Futures Templates
            </h3>
            <div class="space-y-2 max-h-64 overflow-y-auto">
              <div
                v-for="t in futuresTemplates"
                :key="t.id"
                class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">{{ t.name }}</p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t.underlying_asset || 'No asset' }} | Tick: {{ t.tick_size || '-' }} | Point: {{ t.point_value || '-' }}
                  </p>
                </div>
                <button
                  type="button"
                  @click="deleteTemplate(t.id, 'future')"
                  :disabled="deletingTemplateId === t.id"
                  class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm"
                >
                  {{ deletingTemplateId === t.id ? 'Deleting...' : 'Delete' }}
                </button>
              </div>
              <p v-if="futuresTemplates.length === 0" class="text-gray-500 dark:text-gray-400 text-center py-4">
                No futures templates saved
              </p>
            </div>
          </div>
          <div class="mt-5">
            <button
              type="button"
              @click="showManageFuturesTemplatesModal = false"
              class="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Manage Options Templates Modal -->
    <div v-if="showManageOptionsTemplatesModal" class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="showManageOptionsTemplatesModal = false"></div>
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
              Manage Options Templates
            </h3>
            <div class="space-y-2 max-h-64 overflow-y-auto">
              <div
                v-for="t in optionsTemplates"
                :key="t.id"
                class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">{{ t.name }}</p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t.underlying_symbol || 'No symbol' }} | {{ t.option_type || '-' }} | Size: {{ t.contract_size || 100 }}
                  </p>
                </div>
                <button
                  type="button"
                  @click="deleteTemplate(t.id, 'option')"
                  :disabled="deletingTemplateId === t.id"
                  class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm"
                >
                  {{ deletingTemplateId === t.id ? 'Deleting...' : 'Delete' }}
                </button>
              </div>
              <p v-if="optionsTemplates.length === 0" class="text-gray-500 dark:text-gray-400 text-center py-4">
                No options templates saved
              </p>
            </div>
          </div>
          <div class="mt-5">
            <button
              type="button"
              @click="showManageOptionsTemplatesModal = false"
              class="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTradesStore } from '@/stores/trades'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { useAnalytics } from '@/composables/useAnalytics'
import { useUserTimezone } from '@/composables/useUserTimezone'
import ImageUpload from '@/components/trades/ImageUpload.vue'
import TradeImages from '@/components/trades/TradeImages.vue'
import ChartUpload from '@/components/trades/ChartUpload.vue'
import TradeCharts from '@/components/trades/TradeCharts.vue'
import api from '@/services/api'
import SymbolAutocomplete from '@/components/common/SymbolAutocomplete.vue'

// Load section preferences from localStorage
const defaultSectionPrefs = {
  additionalFields: true,
  moreOptions: false,
  // Individual optional fields within More Options
  strategy: true,
  setup: true,
  tags: true,
  notes: true,
  charts: true
}

function loadSectionPreferences() {
  try {
    const saved = localStorage.getItem('tradeFormSections')
    if (saved) {
      return { ...defaultSectionPrefs, ...JSON.parse(saved) }
    }
  } catch (e) {
    console.warn('Failed to load section preferences:', e)
  }
  return { ...defaultSectionPrefs }
}

function saveSectionPreferences() {
  try {
    localStorage.setItem('tradeFormSections', JSON.stringify(sectionPrefs.value))
  } catch (e) {
    console.warn('Failed to save section preferences:', e)
  }
}

const sectionPrefs = ref(loadSectionPreferences())
const showMoreOptions = computed({
  get: () => sectionPrefs.value.moreOptions,
  set: (val) => {
    sectionPrefs.value.moreOptions = val
    saveSectionPreferences()
  }
})
const showAdditionalFields = computed({
  get: () => sectionPrefs.value.additionalFields,
  set: (val) => {
    sectionPrefs.value.additionalFields = val
    saveSectionPreferences()
  }
})
const showStrategy = computed({
  get: () => sectionPrefs.value.strategy,
  set: (val) => {
    sectionPrefs.value.strategy = val
    saveSectionPreferences()
  }
})
const showSetup = computed({
  get: () => sectionPrefs.value.setup,
  set: (val) => {
    sectionPrefs.value.setup = val
    saveSectionPreferences()
  }
})
const showTags = computed({
  get: () => sectionPrefs.value.tags,
  set: (val) => {
    sectionPrefs.value.tags = val
    saveSectionPreferences()
  }
})
const showNotes = computed({
  get: () => sectionPrefs.value.notes,
  set: (val) => {
    sectionPrefs.value.notes = val
    saveSectionPreferences()
  }
})
const showCharts = computed({
  get: () => sectionPrefs.value.charts,
  set: (val) => {
    sectionPrefs.value.charts = val
    saveSectionPreferences()
  }
})

const route = useRoute()
const router = useRouter()
const tradesStore = useTradesStore()
const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()
const { trackTradeAction } = useAnalytics()
const { toLocalInput, toUTC, getCurrentTimeLocal, timezoneLabel } = useUserTimezone()

const loading = ref(false)
const error = ref(null)
const behavioralAlert = ref(null)
const tradeBlocked = ref(false)
const tradeBlockingInfo = ref(null)
const hasProAccess = ref(false)
const showPublicProfileModal = ref(false)
const previousIsPublicValue = ref(false)

const isEdit = computed(() => !!route.params.id)

// Check if we have grouped executions (complete trades with entry/exit)
const hasGroupedExecutions = computed(() => {
  return form.value.executions &&
    form.value.executions.length > 0 &&
    form.value.executions.some(exec =>
      exec.entryPrice !== undefined ||
      exec.exitPrice !== undefined ||
      exec.entryTime !== undefined
    )
})

// Live P&L preview calculation
const computedPnlPreview = computed(() => {
  const instrumentType = form.value.instrumentType || 'stock'
  const side = form.value.side
  const pointValue = instrumentType === 'future' ? (parseFloat(form.value.pointValue) || 1) : 1
  const contractSize = instrumentType === 'option' ? (parseFloat(form.value.contractSize) || 100) : 1
  const multiplier = instrumentType === 'future' ? pointValue : (instrumentType === 'option' ? contractSize : 1)

  let totalPnl = 0
  let hasValidData = false

  // Check if we have individual fills (action-based executions)
  const hasIndividualFills = form.value.executions &&
    form.value.executions.length > 0 &&
    form.value.executions.some(exec => exec.action !== undefined)

  if (hasIndividualFills) {
    // Calculate from individual fills
    const executions = form.value.executions.filter(e => e.action && e.price && e.quantity)
    if (executions.length >= 2) {
      // Separate buys and sells
      let totalBuyQty = 0, totalBuyValue = 0
      let totalSellQty = 0, totalSellValue = 0

      executions.forEach(exec => {
        const qty = parseFloat(exec.quantity) || 0
        const price = parseFloat(exec.price) || 0
        if (exec.action === 'buy') {
          totalBuyQty += qty
          totalBuyValue += qty * price
        } else if (exec.action === 'sell') {
          totalSellQty += qty
          totalSellValue += qty * price
        }
      })

      // Calculate P&L based on trade side
      const matchedQty = Math.min(totalBuyQty, totalSellQty)
      if (matchedQty > 0) {
        const avgBuyPrice = totalBuyValue / totalBuyQty
        const avgSellPrice = totalSellValue / totalSellQty
        // For short: profit when sell high, buy low (sell - buy)
        // For long: profit when buy low, sell high (sell - buy)
        totalPnl = (avgSellPrice - avgBuyPrice) * matchedQty * multiplier
        hasValidData = true
      }
    }
  } else if (hasGroupedExecutions.value) {
    // Calculate from grouped executions (entryPrice/exitPrice format)
    form.value.executions.forEach(exec => {
      const entryPrice = parseFloat(exec.entryPrice)
      const exitPrice = parseFloat(exec.exitPrice)
      const quantity = parseFloat(exec.quantity) || 0
      const execSide = exec.side || side

      if (!isNaN(entryPrice) && !isNaN(exitPrice) && quantity > 0) {
        if (execSide === 'long') {
          totalPnl += (exitPrice - entryPrice) * quantity * multiplier
        } else if (execSide === 'short') {
          totalPnl += (entryPrice - exitPrice) * quantity * multiplier
        }
        hasValidData = true
      }
    })
  } else {
    // Simple trade (single entry/exit at form level)
    const entryPrice = parseFloat(form.value.entryPrice)
    const exitPrice = parseFloat(form.value.exitPrice)
    const quantity = parseFloat(form.value.quantity) || 0

    if (!isNaN(entryPrice) && !isNaN(exitPrice) && quantity > 0 && side) {
      if (side === 'long') {
        totalPnl = (exitPrice - entryPrice) * quantity * multiplier
      } else if (side === 'short') {
        totalPnl = (entryPrice - exitPrice) * quantity * multiplier
      }
      hasValidData = true
    }
  }

  // Subtract commission and fees
  const commission = (parseFloat(form.value.entryCommission) || 0) + (parseFloat(form.value.exitCommission) || 0)
  const fees = parseFloat(form.value.fees) || 0
  totalPnl -= (commission + fees)

  return {
    value: totalPnl,
    hasValidData,
    multiplier,
    instrumentType
  }
})

const form = ref({
  symbol: '',
  entryTime: '',
  exitTime: '',
  entryPrice: '',
  exitPrice: '',
  quantity: '',
  side: '',
  instrumentType: 'stock',
  entryCommission: 0,
  exitCommission: 0,
  fees: 0,
  mae: null,
  mfe: null,
  broker: '',
  account_identifier: '',
  strategy: '',
  setup: '',
  notes: '',
  isPublic: false,
  confidence: 5,
  // Risk management fields
  stopLoss: null,
  takeProfit: null,
  takeProfitQty: null,
  takeProfitTargets: [],
  manualTargetHitFirst: null,
  // Options-specific fields
  underlyingSymbol: '',
  optionType: '',
  strikePrice: null,
  expirationDate: '',
  contractSize: 100,
  // Futures-specific fields
  underlyingAsset: '',
  contractMonth: '',
  contractYear: null,
  tickSize: null,
  pointValue: null,
  // Executions array for multiple fills
  executions: []
})

const tagsInput = ref('')
const allTags = ref([]) // All saved tags for the user
const tagsInputFocused = ref(false)
const activeTagSuggestionIndex = ref(0)
const currentImages = ref([])
const trade = ref(null) // Store full trade data including charts
const strategiesList = ref([])
const setupsList = ref([])
const brokersList = ref([])

// Instrument templates
const futuresTemplates = ref([])
const optionsTemplates = ref([])
const selectedFuturesTemplate = ref('')
const selectedOptionsTemplate = ref('')
const showSaveFuturesTemplateModal = ref(false)
const showSaveOptionsTemplateModal = ref(false)
const showManageFuturesTemplatesModal = ref(false)
const showManageOptionsTemplatesModal = ref(false)
const newFuturesTemplateName = ref('')
const newOptionsTemplateName = ref('')
const savingTemplate = ref(false)
const deletingTemplateId = ref(null)
const accountsList = ref([])
const userSettings = ref(null)
const showBrokerInput = ref(false)
const showAccountInput = ref(false)
const showStrategyInput = ref(false)
const showSetupInput = ref(false)

function formatDateTimeLocal(date) {
  if (!date) return ''
  // Convert UTC datetime to user's local timezone for form input
  return toLocalInput(date)
}

function formatDateOnly(date) {
  if (!date) return ''
  
  // If already in YYYY-MM-DD format, return as-is
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date
  }
  
  // For date-only fields, parse the date string directly to avoid timezone issues
  // Split the date string and reconstruct it to avoid timezone conversion
  const dateStr = date.toString()
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`
  }
  
  // Fallback to Date object if the above doesn't work
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Convert month number (01-12) to month abbreviation (JAN-DEC)
function convertMonthNumberToAbbreviation(monthNumber) {
  if (!monthNumber) return ''

  // If it's already an abbreviation, return it
  const validAbbreviations = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  if (validAbbreviations.includes(monthNumber.toString().toUpperCase())) {
    return monthNumber.toString().toUpperCase()
  }

  const monthMap = {
    '01': 'JAN', '1': 'JAN',
    '02': 'FEB', '2': 'FEB',
    '03': 'MAR', '3': 'MAR',
    '04': 'APR', '4': 'APR',
    '05': 'MAY', '5': 'MAY',
    '06': 'JUN', '6': 'JUN',
    '07': 'JUL', '7': 'JUL',
    '08': 'AUG', '8': 'AUG',
    '09': 'SEP', '9': 'SEP',
    '10': 'OCT',
    '11': 'NOV',
    '12': 'DEC'
  }

  return monthMap[monthNumber.toString()] || ''
}

// Convert month abbreviation (JAN-DEC) to month number (01-12)
function convertMonthAbbreviationToNumber(monthAbbr) {
  if (!monthAbbr) return null

  const monthMap = {
    'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
    'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
    'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
  }

  return monthMap[monthAbbr.toUpperCase()] || null
}

async function loadTrade() {
  if (!isEdit.value) return

  try {
    loading.value = true
    trade.value = await tradesStore.fetchTrade(route.params.id)

    // Create local reference for easier access
    const tradeData = trade.value

    form.value = {
      symbol: tradeData.symbol,
      entryTime: formatDateTimeLocal(tradeData.entry_time),
      exitTime: tradeData.exit_time ? formatDateTimeLocal(tradeData.exit_time) : '',
      entryPrice: tradeData.entry_price != null ? Number(tradeData.entry_price) : '',
      exitPrice: tradeData.exit_price != null ? Number(tradeData.exit_price) : '',
      quantity: tradeData.quantity != null ? Number(tradeData.quantity) : '',
      side: tradeData.side,
      instrumentType: tradeData.instrument_type || 'stock',
      entryCommission: tradeData.entry_commission != null ? Number(tradeData.entry_commission) : (tradeData.commission != null ? Number(tradeData.commission) : 0),
      exitCommission: tradeData.exit_commission != null ? Number(tradeData.exit_commission) : 0,
      fees: tradeData.fees != null ? Number(tradeData.fees) : 0,
      mae: tradeData.mae != null ? Number(tradeData.mae) : null,
      mfe: tradeData.mfe != null ? Number(tradeData.mfe) : null,
      stopLoss: (tradeData.stop_loss || tradeData.stopLoss) != null ? Number(tradeData.stop_loss || tradeData.stopLoss) : null,
      // Take profit values: use take_profit_targets array as source of truth
      // This prevents stale data issues when editing from multiple tabs
      takeProfit: (() => {
        const targets = tradeData.take_profit_targets || tradeData.takeProfitTargets || [];
        const firstTarget = targets[0];
        // Prefer first target's price, fall back to take_profit field
        if (firstTarget?.price != null) {
          return Number(firstTarget.price);
        }
        return (tradeData.take_profit || tradeData.takeProfit) != null ? Number(tradeData.take_profit || tradeData.takeProfit) : null;
      })(),
      takeProfitQty: (() => {
        // Get TP1 quantity from first take_profit_targets entry
        const targets = tradeData.take_profit_targets || tradeData.takeProfitTargets || [];
        const firstTarget = targets[0];
        const qty = firstTarget?.shares || firstTarget?.quantity;
        return qty != null ? Number(qty) : null;
      })(),
      takeProfitTargets: (() => {
        const raw = tradeData.take_profit_targets || tradeData.takeProfitTargets || [];
        console.log('[TRADE FORM LOAD] Raw take_profit_targets from API:', raw);
        // ALWAYS skip the first entry - it's TP1 which is stored in takeProfit/takeProfitQty fields
        // This prevents duplicate entries when take_profit and take_profit_targets[0] have different values
        const additionalTargets = raw.slice(1);
        console.log('[TRADE FORM LOAD] Additional targets (TP2+):', additionalTargets);
        return additionalTargets.map(t => ({
          price: t.price != null ? Number(t.price) : null,
          shares: t.shares != null ? Number(t.shares) : null
        }));
      })(),
      manualTargetHitFirst: tradeData.manual_target_hit_first || null,
      broker: tradeData.broker || '',
      account_identifier: tradeData.account_identifier || '',
      strategy: tradeData.strategy || '',
      setup: tradeData.setup || '',
      notes: tradeData.notes || '',
      isPublic: tradeData.is_public || false,
      confidence: tradeData.confidence || 5,
      // Options-specific fields
      underlyingSymbol: tradeData.underlying_symbol || '',
      optionType: tradeData.option_type || '',
      strikePrice: tradeData.strike_price != null ? Number(tradeData.strike_price) : null,
      expirationDate: tradeData.expiration_date ? formatDateOnly(tradeData.expiration_date) : '',
      contractSize: tradeData.contract_size || 100,
      // Futures-specific fields
      underlyingAsset: tradeData.underlying_asset || '',
      contractMonth: convertMonthNumberToAbbreviation(tradeData.contract_month || tradeData.contractMonth) || '',
      contractYear: tradeData.contract_year || tradeData.contractYear || null,
      tickSize: (tradeData.tick_size || tradeData.tickSize) != null ? Number(tradeData.tick_size || tradeData.tickSize) : null,
      pointValue: (tradeData.point_value || tradeData.pointValue) != null ? Number(tradeData.point_value || tradeData.pointValue) : null,
      // Executions
      executions: (() => {
        console.log('[TRADE FORM] Raw tradeData.executions:', JSON.stringify(tradeData.executions, null, 2))
        if (tradeData.executions && Array.isArray(tradeData.executions) && tradeData.executions.length > 0) {
          // Calculate total quantity for proportional distribution (used when distributing trade-level commission)
          const totalQuantity = tradeData.executions.reduce((sum, exec) => sum + (parseFloat(exec.quantity) || 0), 0)
          const tradeCommission = parseFloat(tradeData.commission) || 0
          const tradeFees = parseFloat(tradeData.fees) || 0

          // Use existing executions - preserve format (grouped vs individual)
          const mapped = tradeData.executions.map(exec => {
            console.log('[TRADE FORM] Processing execution:', exec)

            // Calculate proportional commission/fees if not set at execution level
            const execQuantity = parseFloat(exec.quantity) || 0
            const proportion = totalQuantity > 0 ? execQuantity / totalQuantity : 0

            // Determine commission/fees for this specific execution:
            // 1. If this execution has a commission field (even if 0) - use it (previously processed)
            // 2. If no commission field but has non-zero fees - use fees as commission (fresh CSV import)
            // 3. Otherwise - distribute trade-level commission proportionally
            let execCommission = 0
            let execFees = 0

            const thisExecHasCommission = exec.commission !== undefined && exec.commission !== null
            const thisExecHasNonZeroFees = exec.fees !== undefined && exec.fees !== null && parseFloat(exec.fees) !== 0

            if (thisExecHasCommission) {
              // Execution has commission field set (from previous save) - use it directly
              execCommission = parseFloat(exec.commission) || 0
              // Only include fees if they're separate from commission
              execFees = parseFloat(exec.fees) || 0
            } else if (thisExecHasNonZeroFees) {
              // No commission field, but has non-zero fees - use fees as commission
              // This handles CSV imports where commission is stored in execution.fees
              // Set fees to 0 to avoid double-counting in P&L calculation
              execCommission = parseFloat(exec.fees) || 0
              execFees = 0
            } else {
              // Neither commission field nor non-zero fees - distribute trade-level proportionally
              execCommission = tradeCommission * proportion
              execFees = tradeFees * proportion
            }

            // Check if this is a grouped execution (complete trade with entry/exit)
            if (exec.entryPrice !== undefined || exec.exitPrice !== undefined || exec.entryTime !== undefined) {
              // Preserve grouped format
              const result = {
                side: exec.side,
                quantity: exec.quantity != null ? Number(exec.quantity) : '',
                entryPrice: exec.entryPrice != null ? Number(exec.entryPrice) : '',
                exitPrice: exec.exitPrice != null ? Number(exec.exitPrice) : null,
                entryTime: exec.entryTime ? formatDateTimeLocal(exec.entryTime) : '',
                exitTime: exec.exitTime ? formatDateTimeLocal(exec.exitTime) : null,
                commission: execCommission,
                fees: execFees,
                pnl: exec.pnl != null ? Number(exec.pnl) : null,
                // Fall back to trade-level stop loss if not in execution
                stopLoss: (() => { const v = exec.stopLoss || exec.stop_loss || tradeData.stop_loss || tradeData.stopLoss; return v != null ? Number(v) : null; })(),
                // Use targets array as source of truth for take profit
                takeProfit: (() => {
                  const targets = exec.takeProfitTargets || exec.take_profit_targets || [];
                  if (targets[0]?.price != null) return Number(targets[0].price);
                  const v = exec.takeProfit || exec.take_profit || tradeData.take_profit || tradeData.takeProfit;
                  return v != null ? Number(v) : null;
                })(),
                takeProfitQty: (() => {
                  const targets = exec.takeProfitTargets || exec.take_profit_targets || [];
                  const firstTarget = targets[0];
                  let qty = firstTarget?.shares ?? firstTarget?.quantity;
                  if (qty != null) return Number(qty);
                  // Fall back to trade-level TP1 quantity when execution has no targets
                  const tradeTargets = tradeData.take_profit_targets || tradeData.takeProfitTargets || [];
                  const tradeFirst = tradeTargets[0];
                  qty = tradeFirst?.shares ?? tradeFirst?.quantity;
                  return qty != null ? Number(qty) : null;
                })(),
                takeProfitTargets: (() => {
                  const targets = exec.takeProfitTargets || exec.take_profit_targets || [];
                  // ALWAYS skip first entry - it's TP1 stored in takeProfit/takeProfitQty
                  const additional = targets.length > 0
                    ? targets.slice(1)
                    : (tradeData.take_profit_targets || tradeData.takeProfitTargets || []).slice(1);
                  return additional.map(t => ({
                    price: t.price != null ? Number(t.price) : null,
                    shares: t.shares != null ? Number(t.shares) : null
                  }));
                })()
              }
              console.log('[TRADE FORM] Mapped grouped execution:', result)
              return result
            } else {
              // Individual fill format
              let action = exec.action || exec.side || ''
              // Normalize action to 'buy' or 'sell'
              if (action === 'long') action = 'buy'
              if (action === 'short') action = 'sell'

              const result = {
                action: action,
                quantity: exec.quantity != null ? Number(exec.quantity) : '',
                price: exec.price != null ? Number(exec.price) : '',
                datetime: exec.datetime ? formatDateTimeLocal(exec.datetime) : '',
                commission: execCommission,
                fees: execFees,
                // Fall back to trade-level stop loss if not in execution
                stopLoss: (() => { const v = exec.stopLoss || exec.stop_loss || tradeData.stop_loss || tradeData.stopLoss; return v != null ? Number(v) : null; })(),
                // Use targets array as source of truth for take profit
                takeProfit: (() => {
                  const targets = exec.takeProfitTargets || exec.take_profit_targets || [];
                  if (targets[0]?.price != null) return Number(targets[0].price);
                  const v = exec.takeProfit || exec.take_profit || tradeData.take_profit || tradeData.takeProfit;
                  return v != null ? Number(v) : null;
                })(),
                takeProfitQty: (() => {
                  const targets = exec.takeProfitTargets || exec.take_profit_targets || [];
                  const firstTarget = targets[0];
                  let qty = firstTarget?.shares ?? firstTarget?.quantity;
                  if (qty != null) return Number(qty);
                  // Fall back to trade-level TP1 quantity when execution has no targets
                  const tradeTargets = tradeData.take_profit_targets || tradeData.takeProfitTargets || [];
                  const tradeFirst = tradeTargets[0];
                  qty = tradeFirst?.shares ?? tradeFirst?.quantity;
                  return qty != null ? Number(qty) : null;
                })(),
                takeProfitTargets: (() => {
                  const targets = exec.takeProfitTargets || exec.take_profit_targets || [];
                  // ALWAYS skip first entry - it's TP1 stored in takeProfit/takeProfitQty
                  const additional = targets.length > 0
                    ? targets.slice(1)
                    : (tradeData.take_profit_targets || tradeData.takeProfitTargets || []).slice(1);
                  return additional.map(t => ({
                    price: t.price != null ? Number(t.price) : null,
                    shares: t.shares != null ? Number(t.shares) : null
                  }));
                })()
              }
              console.log('[TRADE FORM] Mapped individual fill:', result)
              return result
            }
          })
          console.log('[TRADE FORM] All mapped executions:', mapped)
          return mapped
        } else {
          // No executions array - create a synthetic grouped execution from trade entry/exit data
          // Use the grouped format (entryPrice/exitPrice) for easier editing
          return [{
            side: tradeData.side,
            quantity: tradeData.quantity != null ? Number(tradeData.quantity) : '',
            entryPrice: tradeData.entry_price != null ? Number(tradeData.entry_price) : '',
            exitPrice: tradeData.exit_price != null ? Number(tradeData.exit_price) : null,
            entryTime: tradeData.entry_time ? formatDateTimeLocal(tradeData.entry_time) : '',
            exitTime: tradeData.exit_time ? formatDateTimeLocal(tradeData.exit_time) : null,
            commission: tradeData.commission != null ? Number(tradeData.commission) : 0,
            fees: tradeData.fees != null ? Number(tradeData.fees) : 0,
            pnl: tradeData.pnl != null ? Number(tradeData.pnl) : 0,
            stopLoss: (tradeData.stop_loss || tradeData.stopLoss) != null ? Number(tradeData.stop_loss || tradeData.stopLoss) : null,
            // Use targets array as source of truth for take profit
            takeProfit: (() => {
              const targets = tradeData.take_profit_targets || tradeData.takeProfitTargets || [];
              if (targets[0]?.price != null) return Number(targets[0].price);
              return (tradeData.take_profit || tradeData.takeProfit) != null ? Number(tradeData.take_profit || tradeData.takeProfit) : null;
            })(),
            takeProfitQty: (() => {
              const targets = tradeData.take_profit_targets || tradeData.takeProfitTargets || [];
              const firstTarget = targets[0];
              const qty = firstTarget?.shares || firstTarget?.quantity;
              return qty != null ? Number(qty) : null;
            })(),
            takeProfitTargets: (() => {
              const targets = tradeData.take_profit_targets || tradeData.takeProfitTargets || [];
              // ALWAYS skip first entry - it's TP1 stored in takeProfit/takeProfitQty
              return targets.slice(1).map(t => ({
                price: t.price != null ? Number(t.price) : null,
                shares: t.shares != null ? Number(t.shares) : null
              }));
            })()
          }]
        }
      })()
    }

    tagsInput.value = tradeData.tags ? tradeData.tags.join(', ') : ''
    currentImages.value = tradeData.attachments || []
  } catch (err) {
    showError('Error', 'Failed to load trade')
    router.push('/trades')
  } finally {
    loading.value = false
  }
}

function handleNotesKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}

async function handleSubmit() {
  loading.value = true
  error.value = null

  try {
    // Check for trade blocking if user has Pro access and it's a new trade
    if (!isEdit.value && hasProAccess.value) {
      const blockStatus = await checkTradeBlocking()
      if (blockStatus.shouldBlock) {
        return
      }
    }

    // Calculate values from executions if they exist
    let calculatedQuantity = parseFloat(form.value.quantity) || 0
    let calculatedEntryTime = form.value.entryTime
    let calculatedExitTime = form.value.exitTime
    let calculatedEntryPrice = parseFloat(form.value.entryPrice) || 0
    let calculatedExitPrice = form.value.exitPrice ? parseFloat(form.value.exitPrice) : null
    // Commission/fees: positive = fee paid, negative = rebate received
    let calculatedCommission = (parseFloat(form.value.entryCommission) || 0) + (parseFloat(form.value.exitCommission) || 0)
    let calculatedFees = parseFloat(form.value.fees) || 0

    const processedExecutions = form.value.executions && form.value.executions.length > 0
      ? form.value.executions.map(exec => {
          // Check if this is a grouped execution (has entryPrice/exitPrice/entryTime) or individual fill
          // IMPORTANT: This check must match the check in loadTrade (line 1668) to ensure consistency
          if (exec.entryPrice !== undefined || exec.exitPrice !== undefined || exec.entryTime !== undefined) {
            // Grouped format - keep entry/exit fields
            // Convert times from user's local timezone to UTC
            return {
              side: exec.side,
              quantity: parseFloat(exec.quantity),
              entryPrice: parseFloat(exec.entryPrice),
              exitPrice: exec.exitPrice ? parseFloat(exec.exitPrice) : null,
              entryTime: toUTC(exec.entryTime),
              exitTime: exec.exitTime ? toUTC(exec.exitTime) : null,
              commission: parseFloat(exec.commission) || 0,  // Can be negative for rebates
              fees: parseFloat(exec.fees) || 0,  // Can be negative for rebates
              pnl: exec.pnl || 0,
              stopLoss: exec.stopLoss && exec.stopLoss !== '' ? parseFloat(exec.stopLoss) : null,
              takeProfit: exec.takeProfit && exec.takeProfit !== '' ? parseFloat(exec.takeProfit) : null,
              takeProfitTargets: (() => {
                const targets = [];
                // Include TP1 with quantity if both price and quantity are set
                if (exec.takeProfit && exec.takeProfit !== '') {
                  targets.push({
                    price: parseFloat(exec.takeProfit),
                    shares: exec.takeProfitQty ? parseInt(exec.takeProfitQty) : null
                  });
                }
                // Add TP2+ from takeProfitTargets array
                const additionalTargets = (exec.takeProfitTargets || []).filter(t => t.price != null && t.price !== '').map(t => ({
                  price: parseFloat(t.price),
                  shares: t.shares ? parseInt(t.shares) : null
                }));
                targets.push(...additionalTargets);
                return targets;
              })()
            }
          } else {
            // Individual fill format - keep action/price/datetime
            // Normalize action to 'buy' or 'sell' (same logic as loadTrade)
            let action = exec.action || exec.side || ''
            if (action === 'long') action = 'buy'
            if (action === 'short') action = 'sell'

            // Convert datetime from user's local timezone to UTC
            return {
              action: action,
              quantity: parseFloat(exec.quantity),
              price: parseFloat(exec.price),
              datetime: toUTC(exec.datetime),
              commission: parseFloat(exec.commission) || 0,  // Can be negative for rebates
              fees: parseFloat(exec.fees) || 0,  // Can be negative for rebates
              stopLoss: exec.stopLoss && exec.stopLoss !== '' ? parseFloat(exec.stopLoss) : null,
              takeProfit: exec.takeProfit && exec.takeProfit !== '' ? parseFloat(exec.takeProfit) : null,
              takeProfitTargets: (() => {
                const targets = [];
                // Include TP1 with quantity if both price and quantity are set
                if (exec.takeProfit && exec.takeProfit !== '') {
                  targets.push({
                    price: parseFloat(exec.takeProfit),
                    shares: exec.takeProfitQty ? parseInt(exec.takeProfitQty) : null
                  });
                }
                // Add TP2+ from takeProfitTargets array
                const additionalTargets = (exec.takeProfitTargets || []).filter(t => t.price != null && t.price !== '').map(t => ({
                  price: parseFloat(t.price),
                  shares: t.shares ? parseInt(t.shares) : null
                }));
                targets.push(...additionalTargets);
                return targets;
              })()
            }
          }
        })
      : undefined

    // If we have executions, calculate summary values from them
    if (processedExecutions && processedExecutions.length > 0) {
      // Check if we have grouped executions (with entryPrice/exitPrice/entryTime) or individual fills
      // IMPORTANT: This check must match the check above to ensure consistency
      const hasGroupedExecutions = processedExecutions.some(e => e.entryPrice !== undefined || e.exitPrice !== undefined || e.entryTime !== undefined)

      if (hasGroupedExecutions) {
        // For grouped executions, calculate weighted average stop loss/take profit from executions
        // and set at trade level (backend ignores execution updates from non-imports)
        const executionsWithStopLoss = processedExecutions.filter(e => e.stopLoss !== null && e.stopLoss !== undefined);
        const executionsWithTakeProfit = processedExecutions.filter(e => e.takeProfit !== null && e.takeProfit !== undefined);

        if (executionsWithStopLoss.length > 0) {
          const totalQty = executionsWithStopLoss.reduce((sum, e) => sum + e.quantity, 0);
          const weightedStopLoss = executionsWithStopLoss.reduce((sum, e) => sum + (e.stopLoss * e.quantity), 0) / totalQty;
          form.value.stopLoss = weightedStopLoss;
        }

        if (executionsWithTakeProfit.length > 0) {
          const totalQty = executionsWithTakeProfit.reduce((sum, e) => sum + e.quantity, 0);
          const weightedTakeProfit = executionsWithTakeProfit.reduce((sum, e) => sum + (e.takeProfit * e.quantity), 0) / totalQty;
          form.value.takeProfit = weightedTakeProfit;
        }

        // Handle grouped executions (round-trip sub-trades)
        // Total quantity is sum of ALL execution quantities
        calculatedQuantity = processedExecutions.reduce((sum, exec) => sum + exec.quantity, 0)

        // Total commission and fees from all executions (can be negative for rebates)
        calculatedCommission = processedExecutions.reduce((sum, exec) => sum + (exec.commission || 0), 0)
        calculatedFees = processedExecutions.reduce((sum, exec) => sum + (exec.fees || 0), 0)

        // For grouped executions, use the first execution's entry time
        calculatedEntryTime = processedExecutions[0].entryTime

        // For exit time, use the latest exit time (if any)
        const executionsWithExit = processedExecutions.filter(e => e.exitTime)
        if (executionsWithExit.length > 0) {
          const sortedByExitTime = [...executionsWithExit].sort((a, b) =>
            new Date(b.exitTime) - new Date(a.exitTime)
          )
          calculatedExitTime = sortedByExitTime[0].exitTime
        }

        // Entry price is weighted average of all entry prices
        const totalEntryValue = processedExecutions.reduce((sum, exec) => sum + (exec.entryPrice * exec.quantity), 0)
        calculatedEntryPrice = totalEntryValue / calculatedQuantity

        // Exit price is weighted average of exit prices (if any)
        if (executionsWithExit.length > 0) {
          const totalExitValue = executionsWithExit.reduce((sum, exec) => sum + (exec.exitPrice * exec.quantity), 0)
          const totalExitQty = executionsWithExit.reduce((sum, exec) => sum + exec.quantity, 0)
          calculatedExitPrice = totalExitValue / totalExitQty
        }
      } else {
        // Handle individual fill format
        // Entry time is earliest execution
        const sortedByTime = [...processedExecutions].sort((a, b) =>
          new Date(a.datetime) - new Date(b.datetime)
        )
        calculatedEntryTime = sortedByTime[0].datetime

        // Determine which action is entry vs exit based on trade side
        // For LONG trades: buy = entry, sell = exit
        // For SHORT trades: sell = entry, buy = exit
        const tradeSide = form.value.side
        const entryAction = tradeSide === 'short' ? 'sell' : 'buy'
        const exitAction = tradeSide === 'short' ? 'buy' : 'sell'

        // Entry price is weighted average of entry executions
        const entryExecutions = processedExecutions.filter(e => e.action === entryAction)
        const exitExecutions = processedExecutions.filter(e => e.action === exitAction)

        let totalEntryQty = 0
        let totalExitQty = 0

        if (entryExecutions.length > 0) {
          const totalEntryValue = entryExecutions.reduce((sum, exec) => sum + (exec.price * exec.quantity), 0)
          totalEntryQty = entryExecutions.reduce((sum, exec) => sum + exec.quantity, 0)
          calculatedEntryPrice = totalEntryValue / totalEntryQty
        }

        if (exitExecutions.length > 0) {
          const totalExitValue = exitExecutions.reduce((sum, exec) => sum + (exec.price * exec.quantity), 0)
          totalExitQty = exitExecutions.reduce((sum, exec) => sum + exec.quantity, 0)
          calculatedExitPrice = totalExitValue / totalExitQty
        }

        // Calculate net position (entry qty - exit qty)
        const netPosition = totalEntryQty - totalExitQty

        // Only set exit time if position is fully closed (net position is 0)
        // For partial exits, the trade remains open
        if (totalExitQty > 0 && netPosition <= 0) {
          // Fully closed - set exit time to latest execution
          calculatedExitTime = sortedByTime[sortedByTime.length - 1].datetime
          // Quantity is the total entry quantity (what was traded)
          calculatedQuantity = totalEntryQty
        } else {
          // Open position (no exits or partial exits)
          calculatedExitTime = null
          calculatedExitPrice = null
          // Quantity is the NET position (what is still held)
          calculatedQuantity = netPosition > 0 ? netPosition : totalEntryQty
        }

        // Total commission and fees from all executions (can be negative for rebates)
        calculatedCommission = processedExecutions.reduce((sum, exec) => sum + (exec.commission || 0), 0)
        calculatedFees = processedExecutions.reduce((sum, exec) => sum + (exec.fees || 0), 0)
      }
    }

    // Derive side from first execution if main form side is empty (grouped executions mode)
    const derivedSide = form.value.side || (form.value.executions.length > 0 ? form.value.executions[0].side : '')

    // Convert times from user's local timezone to UTC
    // (execution times are already converted above in processedExecutions)
    // For simple trades without executions, times come from form values which need conversion
    const hasExecutions = processedExecutions && processedExecutions.length > 0
    const finalEntryTime = hasExecutions ? calculatedEntryTime : toUTC(calculatedEntryTime)
    const finalExitTime = hasExecutions ? calculatedExitTime : (calculatedExitTime ? toUTC(calculatedExitTime) : null)

    const tradeData = {
      symbol: form.value.symbol,
      side: derivedSide,
      instrumentType: form.value.instrumentType,
      entryTime: finalEntryTime,
      exitTime: finalExitTime || null,
      entryPrice: calculatedEntryPrice,
      exitPrice: calculatedExitPrice,
      quantity: calculatedQuantity,
      commission: calculatedCommission,
      fees: calculatedFees,
      mae: form.value.mae ? parseFloat(form.value.mae) : null,
      mfe: form.value.mfe ? parseFloat(form.value.mfe) : null,
      confidence: parseInt(form.value.confidence) || 5,
      broker: form.value.broker || '',
      account_identifier: form.value.account_identifier || '',
      strategy: form.value.strategy || '',
      setup: form.value.setup || '',
      notes: form.value.notes || '',
      isPublic: form.value.isPublic || false,
      tags: tagsInput.value ? tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean) : [],
      // Risk management fields
      stopLoss: form.value.stopLoss && form.value.stopLoss !== '' ? parseFloat(form.value.stopLoss) : null,
      takeProfit: form.value.takeProfit && form.value.takeProfit !== '' ? parseFloat(form.value.takeProfit) : null,
      takeProfitTargets: (() => {
        const execs = form.value.executions || [];
        // When there's exactly one grouped execution, use its TP data for trade-level so payload has full set (user edits execution card)
        if (execs.length === 1 && (execs[0].entryPrice !== undefined || execs[0].entryTime !== undefined)) {
          const e = execs[0];
          const targets = [];
          if (e.takeProfit != null && e.takeProfit !== '') {
            targets.push({
              price: parseFloat(e.takeProfit),
              shares: e.takeProfitQty ? parseInt(e.takeProfitQty) : null
            });
          }
          const additional = (e.takeProfitTargets || []).filter(t => t.price != null && t.price !== '').map(t => ({
            price: parseFloat(t.price),
            shares: t.shares ? parseInt(t.shares) : null
          }));
          targets.push(...additional);
          console.log('[TRADE FORM] Submitting takeProfitTargets from single execution:', targets);
          return targets;
        }
        // Default: form-level (no executions or multiple executions)
        const targets = [];
        if (form.value.takeProfit && form.value.takeProfit !== '') {
          targets.push({
            price: parseFloat(form.value.takeProfit),
            shares: form.value.takeProfitQty ? parseInt(form.value.takeProfitQty) : null
          });
        }
        const additionalTargets = (form.value.takeProfitTargets || []).filter(t => t.price != null && t.price !== '').map(t => ({
          price: parseFloat(t.price),
          shares: t.shares ? parseInt(t.shares) : null
        }));
        targets.push(...additionalTargets);
        console.log('[TRADE FORM] Submitting takeProfitTargets:', targets);
        return targets;
      })(),
      manualTargetHitFirst: form.value.manualTargetHitFirst || null,
      // Options-specific fields (only send if option type)
      underlyingSymbol: form.value.instrumentType === 'option' ? form.value.underlyingSymbol : null,
      optionType: form.value.instrumentType === 'option' ? form.value.optionType : null,
      strikePrice: form.value.instrumentType === 'option' && form.value.strikePrice ? parseFloat(form.value.strikePrice) : null,
      expirationDate: form.value.instrumentType === 'option' ? form.value.expirationDate : null,
      contractSize: form.value.instrumentType === 'option' && form.value.contractSize ? parseInt(form.value.contractSize) : null,
      // Futures-specific fields (only send if future type)
      underlyingAsset: form.value.instrumentType === 'future' ? form.value.underlyingAsset : null,
      contractMonth: form.value.instrumentType === 'future' && form.value.contractMonth ? form.value.contractMonth : null,
      contractYear: form.value.instrumentType === 'future' && form.value.contractYear ? parseInt(form.value.contractYear) : null,
      tickSize: form.value.instrumentType === 'future' && form.value.tickSize ? parseFloat(form.value.tickSize) : null,
      pointValue: form.value.instrumentType === 'future' && form.value.pointValue ? parseFloat(form.value.pointValue) : null,
      // Executions array
      executions: processedExecutions
    }

    console.log('[TRADE FORM] form.value.contractMonth:', form.value.contractMonth)
    console.log('[TRADE FORM] Submitting trade data:', JSON.stringify(tradeData, null, 2))

    if (isEdit.value) {
      await tradesStore.updateTrade(route.params.id, tradeData)

      // Add new values to lists if not already present
      if (tradeData.strategy && !strategiesList.value.includes(tradeData.strategy)) {
        strategiesList.value.push(tradeData.strategy)
      }
      if (tradeData.setup && !setupsList.value.includes(tradeData.setup)) {
        setupsList.value.push(tradeData.setup)
      }
      if (tradeData.broker && !brokersList.value.includes(tradeData.broker)) {
        brokersList.value.push(tradeData.broker)
      }

      showSuccess('Success', 'Trade updated successfully')
      trackTradeAction('update', {
        side: tradeData.side,
        broker: tradeData.broker,
        strategy: tradeData.strategy,
        notes: !!tradeData.notes
      })
      // For edits, go back to the trade detail page (replace history so back button works logically)
      router.replace(`/trades/${route.params.id}`)
    } else {
      // Analyze for revenge trading before creating (non-blocking)
      if (hasProAccess.value) {
        analyzeForRevengeTrading(tradeData).catch(err => {
          console.warn('Revenge trading analysis failed, continuing with trade creation:', err)
        })
      }
      const newTrade = await tradesStore.createTrade(tradeData)

      // Add new values to lists if not already present
      if (tradeData.strategy && !strategiesList.value.includes(tradeData.strategy)) {
        strategiesList.value.push(tradeData.strategy)
      }
      if (tradeData.setup && !setupsList.value.includes(tradeData.setup)) {
        setupsList.value.push(tradeData.setup)
      }
      if (tradeData.broker && !brokersList.value.includes(tradeData.broker)) {
        brokersList.value.push(tradeData.broker)
      }

      showSuccess('Success', 'Trade created successfully')
      trackTradeAction('create', {
        side: tradeData.side,
        broker: tradeData.broker,
        strategy: tradeData.strategy,
        notes: !!tradeData.notes
      })
      // For new trades, go to trade detail page so user can add attachments
      router.push(`/trades/${newTrade.id}`)
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'An error occurred'
    showError('Error', error.value)
  } finally {
    loading.value = false
  }
}

function handleImageUploaded() {
  // Refresh trade data to show new images
  loadTrade()
  showSuccess('Images Uploaded', 'Trade images uploaded successfully')
}

function handleImageDeleted(imageId) {
  // Remove the deleted image from the current images array
  currentImages.value = currentImages.value.filter(img => img.id !== imageId)
}

async function handleChartAdded() {
  // Refresh trade data to show new charts
  await loadTrade()
  showSuccess('Chart Added', 'TradingView chart added successfully')
}

async function handleChartDeleted(chartId) {
  // Reload trade to update charts list
  await loadTrade()
}

// Watch for changes to isPublic checkbox
watch(() => form.value.isPublic, async (newValue, oldValue) => {
  // Only trigger if changing from false to true
  if (newValue && !oldValue) {
    // Fetch fresh user data to get current public profile status
    await authStore.fetchUser()

    // Check if user's profile is already public
    const userSettings = authStore.user?.settings || {}
    const isProfilePublic = userSettings.publicProfile || false

    if (!isProfilePublic) {
      // Profile is not public, show modal
      previousIsPublicValue.value = oldValue
      showPublicProfileModal.value = true
    }
  }
})

// Close modal and revert checkbox
function closePublicProfileModal() {
  showPublicProfileModal.value = false
  form.value.isPublic = previousIsPublicValue.value
}

// Enable public profile and close modal
async function enablePublicProfile() {
  try {
    // Update user settings to enable public profile
    await api.put('/settings', { publicProfile: true })

    // Refresh user data to get updated settings
    await authStore.fetchUser()

    showPublicProfileModal.value = false
    showSuccess('Success', 'Your profile is now public')
  } catch (error) {
    console.error('Failed to enable public profile:', error)
    showError('Error', 'Failed to enable public profile. Please try again.')
    // Revert the checkbox
    form.value.isPublic = previousIsPublicValue.value
    showPublicProfileModal.value = false
  }
}

// Check if user has access to behavioral analytics
async function checkProAccess() {
  try {
    const response = await api.get('/features/check/behavioral_analytics')
    hasProAccess.value = response.data.hasAccess
  } catch (error) {
    hasProAccess.value = false
  }
}

// Check if user should be blocked from trading
async function checkTradeBlocking() {
  try {
    const response = await api.get('/behavioral-analytics/trade-block-status')
    const { shouldBlock, reason, alerts, recommendedCoolingPeriod } = response.data.data
    
    if (shouldBlock) {
      tradeBlocked.value = true
      tradeBlockingInfo.value = {
        reason,
        alerts,
        recommendedCoolingPeriod
      }
      return { shouldBlock: true }
    }
    
    return { shouldBlock: false }
  } catch (error) {
    console.error('Error checking trade blocking:', error)
    return { shouldBlock: false }
  }
}

// Analyze trade for revenge trading patterns
async function analyzeForRevengeTrading(tradeData) {
  try {
    const response = await api.post('/behavioral-analytics/analyze-trade', {
      trade: tradeData
    })
    
    const analysis = response.data.data
    if (analysis && analysis.alerts && Array.isArray(analysis.alerts) && analysis.alerts.length > 0) {
      const alert = analysis.alerts[0]
      behavioralAlert.value = {
        message: alert.message,
        recommendation: alert.recommendation,
        coolingPeriod: analysis.recommendedCoolingPeriod
      }
    }
  } catch (error) {
    console.error('Error analyzing trade for revenge trading:', error)
  }
}

// Handle cooling period action
function takeCoolingPeriod() {
  showSuccess('Cooling Period', `Taking a ${behavioralAlert.value.coolingPeriod} minute break. Come back refreshed!`)
  router.push('/dashboard')
}

// Acknowledge behavioral alert and continue
function acknowledgeBehavioralAlert() {
  behavioralAlert.value = null
}

// Watch for changes in instrument type to auto-expand more options
watch(() => form.value.instrumentType, (newType) => {
  if (newType === 'option' || newType === 'future') {
    showMoreOptions.value = true
  }
})

// Watch for changes in entry time to trigger revenge trading analysis
watch(() => form.value.entryTime, async (newTime) => {
  if (!isEdit.value && hasProAccess.value && newTime) {
    // Clear previous alerts when entry time changes
    behavioralAlert.value = null

    // Only analyze if we have enough data to calculate patterns
    if (form.value.symbol && form.value.entryPrice && form.value.quantity && form.value.side) {
      const tradeData = {
        ...form.value,
        entryPrice: parseFloat(form.value.entryPrice),
        quantity: parseInt(form.value.quantity)
      }
      await analyzeForRevengeTrading(tradeData)
    }
  }
})

async function fetchLists() {
  try {
    // Fetch strategies list
    const strategiesResponse = await api.get('/trades/strategies')
    strategiesList.value = strategiesResponse.data.strategies || []

    // Fetch setups list
    const setupsResponse = await api.get('/trades/setups')
    setupsList.value = setupsResponse.data.setups || []

    // Fetch brokers list
    const brokersResponse = await api.get('/trades/brokers')
    brokersList.value = brokersResponse.data.brokers || []

    // Fetch accounts list
    const accountsResponse = await api.get('/trades/accounts')
    accountsList.value = accountsResponse.data.accounts || []
  } catch (error) {
    console.error('Error fetching lists:', error)
  }
}

async function fetchUserSettings() {
  try {
    const response = await api.get('/settings')
    userSettings.value = response.data

    // Set default broker if not editing and default exists
    if (!isEdit.value && userSettings.value.default_broker) {
      form.value.broker = userSettings.value.default_broker
    }
  } catch (error) {
    console.error('Error fetching user settings:', error)
  }
}

// Fetch all user tags for autocomplete suggestions
async function fetchTags() {
  try {
    const response = await api.get('/tags')
    const tags = response.data?.tags || []
    // Store only unique tag names, sorted alphabetically
    const names = Array.from(
      new Set(
        tags
          .map(tag => tag.name)
          .filter(name => typeof name === 'string' && name.trim().length > 0)
      )
    ).sort((a, b) => a.localeCompare(b))
    allTags.value = names
  } catch (error) {
    console.error('Error fetching tags for autocomplete:', error)
  }
}

// Computed: current list of tags already entered in input
const currentTags = computed(() => {
  if (!tagsInput.value) return []
  return tagsInput.value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
})

// Computed: the partial tag the user is currently typing
const currentTagQuery = computed(() => {
  if (!tagsInput.value) return ''
  const parts = tagsInput.value.split(',')
  return parts[parts.length - 1].trim()
})

// Computed: suggestions based on current query and existing tags
const tagSuggestions = computed(() => {
  const query = currentTagQuery.value.toLowerCase()
  if (!query) return []

  const alreadySelected = new Set(currentTags.value.map(t => t.toLowerCase()))

  // Only suggest tags that start with the current query and aren't already selected
  const matches = allTags.value.filter(name => {
    const lower = name.toLowerCase()
    return lower.startsWith(query) && !alreadySelected.has(lower)
  })

  // Reset active index when the suggestion list changes
  if (activeTagSuggestionIndex.value >= matches.length) {
    activeTagSuggestionIndex.value = 0
  }

  return matches.slice(0, 10)
})

const showTagSuggestions = computed(() => {
  return tagsInputFocused.value && tagSuggestions.value.length > 0
})

function handleTagsFocus() {
  tagsInputFocused.value = true
}

function handleTagsBlur() {
  // Delay hiding so a click on a suggestion can register
  setTimeout(() => {
    tagsInputFocused.value = false
  }, 150)
}

function selectTagSuggestion(tag) {
  const parts = tagsInput.value.split(',')
  // Replace the current partial with the selected tag
  if (parts.length > 0) {
    parts[parts.length - 1] = ` ${tag}` // keep preceding comma/space style
  } else {
    parts[0] = tag
  }

  // Normalize spacing: join with comma+space
  const normalized = parts
    .map((part, index) => {
      const trimmed = part.trim()
      return index === 0 ? trimmed : trimmed
    })
    .filter(Boolean)
    .join(', ')

  tagsInput.value = normalized + ', '
  // Keep focus on the input so user can continue typing
  nextTick(() => {
    const el = document.getElementById('tags')
    if (el) {
      el.focus()
    }
  })
}

function moveTagSuggestion(direction) {
  if (!showTagSuggestions.value) return
  const total = tagSuggestions.value.length
  if (total === 0) return

  const nextIndex = (activeTagSuggestionIndex.value + direction + total) % total
  activeTagSuggestionIndex.value = nextIndex
}

function applyActiveTagSuggestion(event) {
  if (!showTagSuggestions.value) {
    // No suggestions visible, let the form handle Enter normally
    return
  }
  event.preventDefault()
  const tag = tagSuggestions.value[activeTagSuggestionIndex.value]
  if (tag) {
    selectTagSuggestion(tag)
  }
}

function handleBrokerSelect(event) {
  if (event.target.value === '__custom__') {
    form.value.broker = ''
    showBrokerInput.value = true
    // Focus the input after a brief delay to allow DOM update
    setTimeout(() => {
      document.getElementById('broker')?.focus()
    }, 100)
  }
}

function handleBrokerInputEnter() {
  const newBroker = form.value.broker.trim()
  if (newBroker) {
    // Add to the list if it's not already there
    if (!brokersList.value.includes(newBroker)) {
      brokersList.value.push(newBroker)
      showSuccess('Added', `Broker "${newBroker}" added`)
    }
    showBrokerInput.value = false
  }
}

function handleBrokerInputBlur() {
  const newBroker = form.value.broker.trim()
  if (newBroker) {
    // Add to the list if it's not already there
    if (!brokersList.value.includes(newBroker)) {
      brokersList.value.push(newBroker)
    }
  }
  showBrokerInput.value = false
}

function handleAccountSelect(event) {
  if (event.target.value === '__custom__') {
    form.value.account_identifier = ''
    showAccountInput.value = true
    // Focus the input after a brief delay to allow DOM update
    setTimeout(() => {
      document.getElementById('account_identifier')?.focus()
    }, 100)
  }
}

function handleAccountInputEnter() {
  const newAccount = form.value.account_identifier.trim()
  if (newAccount) {
    // Add to the list if it's not already there
    if (!accountsList.value.includes(newAccount)) {
      accountsList.value.push(newAccount)
      showSuccess('Added', `Account "${newAccount}" added`)
    }
    showAccountInput.value = false
  }
}

function handleAccountInputBlur() {
  const newAccount = form.value.account_identifier.trim()
  if (newAccount) {
    // Add to the list if it's not already there
    if (!accountsList.value.includes(newAccount)) {
      accountsList.value.push(newAccount)
    }
  }
  showAccountInput.value = false
}

function handleStrategySelect(event) {
  if (event.target.value === '__custom__') {
    form.value.strategy = ''
    showStrategyInput.value = true
    setTimeout(() => {
      document.getElementById('strategy')?.focus()
    }, 100)
  }
}

function handleStrategyInputEnter() {
  const newStrategy = form.value.strategy.trim()
  if (newStrategy) {
    // Add to the list if it's not already there
    if (!strategiesList.value.includes(newStrategy)) {
      strategiesList.value.push(newStrategy)
      showSuccess('Added', `Strategy "${newStrategy}" added`)
    }
    showStrategyInput.value = false
  }
}

function handleStrategyInputBlur() {
  const newStrategy = form.value.strategy.trim()
  if (newStrategy) {
    // Add to the list if it's not already there
    if (!strategiesList.value.includes(newStrategy)) {
      strategiesList.value.push(newStrategy)
    }
  }
  showStrategyInput.value = false
}

function handleSetupSelect(event) {
  if (event.target.value === '__custom__') {
    form.value.setup = ''
    showSetupInput.value = true
    setTimeout(() => {
      document.getElementById('setup')?.focus()
    }, 100)
  }
}

function handleSetupInputEnter() {
  const newSetup = form.value.setup.trim()
  if (newSetup) {
    // Add to the list if it's not already there
    if (!setupsList.value.includes(newSetup)) {
      setupsList.value.push(newSetup)
      showSuccess('Added', `Setup "${newSetup}" added`)
    }
    showSetupInput.value = false
  }
}

function handleSetupInputBlur() {
  const newSetup = form.value.setup.trim()
  if (newSetup) {
    // Add to the list if it's not already there
    if (!setupsList.value.includes(newSetup)) {
      setupsList.value.push(newSetup)
    }
  }
  showSetupInput.value = false
}

// Take Profit Targets management for main form (non-grouped trades)
function addTakeProfitTarget() {
  if (!form.value.takeProfitTargets) {
    form.value.takeProfitTargets = []
  }
  form.value.takeProfitTargets.push({
    price: null,
    shares: null
  })
}

function removeTakeProfitTarget(targetIndex) {
  form.value.takeProfitTargets.splice(targetIndex, 1)
}

// Take Profit Targets management for executions
function addExecutionTakeProfitTarget(executionIndex) {
  if (!form.value.executions[executionIndex].takeProfitTargets) {
    form.value.executions[executionIndex].takeProfitTargets = []
  }
  form.value.executions[executionIndex].takeProfitTargets.push({
    price: null,
    shares: null
  })
}

function removeExecutionTakeProfitTarget(executionIndex, targetIndex) {
  form.value.executions[executionIndex].takeProfitTargets.splice(targetIndex, 1)
}

function addExecution() {
  form.value.executions.push({
    action: '',
    quantity: '',
    price: '',
    datetime: getCurrentTimeLocal(),
    commission: 0,
    fees: 0,
    stopLoss: null,
    takeProfit: null,
    takeProfitQty: null,
    takeProfitTargets: []
  })
}

function addGroupedExecution() {
  form.value.executions.push({
    side: form.value.side || '',
    quantity: '',
    entryPrice: '',
    exitPrice: null,
    entryTime: getCurrentTimeLocal(),
    exitTime: null,
    commission: 0,
    fees: 0,
    stopLoss: null,
    takeProfit: null,
    takeProfitQty: null,
    takeProfitTargets: []
  })
}

function removeExecution(index) {
  form.value.executions.splice(index, 1)
}

// Instrument Template Functions
async function fetchInstrumentTemplates() {
  try {
    const [futuresRes, optionsRes] = await Promise.all([
      api.get('/instrument-templates', { params: { instrument_type: 'future' } }),
      api.get('/instrument-templates', { params: { instrument_type: 'option' } })
    ])
    console.log('[Templates] Futures response:', futuresRes.data)
    console.log('[Templates] Options response:', optionsRes.data)
    futuresTemplates.value = futuresRes.data.templates || []
    optionsTemplates.value = optionsRes.data.templates || []
    console.log('[Templates] Loaded:', { futures: futuresTemplates.value.length, options: optionsTemplates.value.length })
  } catch (err) {
    console.error('[Templates] Failed to fetch instrument templates:', err)
  }
}

function applyFuturesTemplate() {
  if (!selectedFuturesTemplate.value) return
  const template = futuresTemplates.value.find(t => t.id === selectedFuturesTemplate.value)
  if (template) {
    form.value.underlyingAsset = template.underlying_asset || ''
    form.value.tickSize = template.tick_size || null
    form.value.pointValue = template.point_value || null
    form.value.contractMonth = template.contract_month || ''
    form.value.contractYear = template.contract_year || null
    if (template.symbol) {
      form.value.symbol = template.symbol
    }
  }
  selectedFuturesTemplate.value = ''
}

function applyOptionsTemplate() {
  if (!selectedOptionsTemplate.value) return
  const template = optionsTemplates.value.find(t => t.id === selectedOptionsTemplate.value)
  console.log('[Templates] Applying options template:', template)
  if (template) {
    form.value.underlyingSymbol = template.underlying_symbol || ''
    form.value.optionType = template.option_type || ''
    form.value.contractSize = template.contract_size || 100
    console.log('[Templates] Set values:', {
      underlyingSymbol: form.value.underlyingSymbol,
      optionType: form.value.optionType,
      contractSize: form.value.contractSize
    })
    if (template.symbol) {
      form.value.symbol = template.symbol
    }
  }
  selectedOptionsTemplate.value = ''
}

async function saveFuturesTemplate() {
  if (!newFuturesTemplateName.value.trim()) return
  savingTemplate.value = true
  try {
    const response = await api.post('/instrument-templates', {
      name: newFuturesTemplateName.value.trim(),
      instrument_type: 'future',
      symbol: form.value.symbol || null,
      underlying_asset: form.value.underlyingAsset || null,
      tick_size: form.value.tickSize || null,
      point_value: form.value.pointValue || null,
      contract_month: form.value.contractMonth || null,
      contract_year: form.value.contractYear || null
    })
    futuresTemplates.value.push(response.data.template)
    showSaveFuturesTemplateModal.value = false
    newFuturesTemplateName.value = ''
    showSuccess('Template Saved', 'Futures template saved successfully')
  } catch (err) {
    showError('Save Failed', err.response?.data?.message || 'Failed to save template')
  } finally {
    savingTemplate.value = false
  }
}

async function saveOptionsTemplate() {
  if (!newOptionsTemplateName.value.trim()) return
  savingTemplate.value = true
  try {
    const response = await api.post('/instrument-templates', {
      name: newOptionsTemplateName.value.trim(),
      instrument_type: 'option',
      symbol: form.value.symbol || null,
      underlying_symbol: form.value.underlyingSymbol || null,
      option_type: form.value.optionType || null,
      contract_size: form.value.contractSize || 100
    })
    optionsTemplates.value.push(response.data.template)
    showSaveOptionsTemplateModal.value = false
    newOptionsTemplateName.value = ''
    showSuccess('Template Saved', 'Options template saved successfully')
  } catch (err) {
    showError('Save Failed', err.response?.data?.message || 'Failed to save template')
  } finally {
    savingTemplate.value = false
  }
}

async function deleteTemplate(id, type) {
  deletingTemplateId.value = id
  try {
    await api.delete(`/instrument-templates/${id}`)
    if (type === 'future') {
      futuresTemplates.value = futuresTemplates.value.filter(t => t.id !== id)
    } else {
      optionsTemplates.value = optionsTemplates.value.filter(t => t.id !== id)
    }
    showSuccess('Template Deleted', 'Template deleted successfully')
  } catch (err) {
    showError('Delete Failed', err.response?.data?.message || 'Failed to delete template')
  } finally {
    deletingTemplateId.value = null
  }
}

onMounted(async () => {
  await checkProAccess()
  await fetchLists()
  await fetchUserSettings()
  await fetchTags()
  await fetchInstrumentTemplates()

  if (isEdit.value) {
    loadTrade()
  } else {
    // Set default entry time in user's timezone
    form.value.entryTime = getCurrentTimeLocal()

    // Check for trade blocking on new trades
    if (hasProAccess.value) {
      await checkTradeBlocking()
    }
  }
})
</script>