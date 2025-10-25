<template>
  <div class="w-full max-w-[65%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
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
              <input
                id="symbol"
                v-model="form.symbol"
                type="text"
                required
                class="input uppercase"
                placeholder="AAPL"
              />
            </div>

            <div>
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
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 mt-6">
            <div>
              <label for="stopLoss" class="label">Stop Loss</label>
              <input
                id="stopLoss"
                v-model="form.stopLoss"
                type="number"
                step="0.000001"
                min="0"
                class="input"
                placeholder="0.000000"
              />
            </div>

            <div>
              <label for="takeProfit" class="label">Take Profit</label>
              <input
                id="takeProfit"
                v-model="form.takeProfit"
                type="number"
                step="0.000001"
                min="0"
                class="input"
                placeholder="0.000000"
              />
            </div>
          </div>
        </div>

        <!-- Executions Section -->
        <div class="border-b border-gray-200 dark:border-gray-700 pb-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-medium text-gray-900 dark:text-white">Executions</h2>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Add each individual fill/execution for this trade
              </p>
            </div>
            <button
              type="button"
              @click="addExecution"
              class="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm font-medium"
            >
              + Add Execution
            </button>
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
                      step="0.0001"
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
                      step="0.000001"
                      min="0"
                      required
                      class="input"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label :for="`exec-exit-price-${index}`" class="label">Exit Price</label>
                    <input
                      :id="`exec-exit-price-${index}`"
                      v-model="execution.exitPrice"
                      type="number"
                      step="0.000001"
                      min="0"
                      class="input"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <!-- Row 3: Entry Time and Exit Time -->
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label :for="`exec-entry-time-${index}`" class="label">Entry Time *</label>
                    <input
                      :id="`exec-entry-time-${index}`"
                      v-model="execution.entryTime"
                      type="datetime-local"
                      required
                      class="input"
                    />
                  </div>

                  <div>
                    <label :for="`exec-exit-time-${index}`" class="label">Exit Time</label>
                    <input
                      :id="`exec-exit-time-${index}`"
                      v-model="execution.exitTime"
                      type="datetime-local"
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
                      step="0.01"
                      min="0"
                      class="input"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label :for="`exec-fees-${index}`" class="label">Fees</label>
                    <input
                      :id="`exec-fees-${index}`"
                      v-model="execution.fees"
                      type="number"
                      step="0.01"
                      min="0"
                      class="input"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <!-- Individual fill format -->
              <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label :for="`exec-datetime-${index}`" class="label">Date/Time *</label>
                  <input
                    :id="`exec-datetime-${index}`"
                    v-model="execution.datetime"
                    type="datetime-local"
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
                    step="0.0001"
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
                    step="0.000001"
                    min="0"
                    required
                    class="input"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label :for="`exec-commission-${index}`" class="label">Commission</label>
                  <input
                    :id="`exec-commission-${index}`"
                    v-model="execution.commission"
                    type="number"
                    step="0.01"
                    min="0"
                    class="input"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label :for="`exec-fees-${index}`" class="label">Fees</label>
                  <input
                    :id="`exec-fees-${index}`"
                    v-model="execution.fees"
                    type="number"
                    step="0.01"
                    min="0"
                    class="input"
                    placeholder="0.00"
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
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">

          <div>
            <label for="mae" class="label">MAE (Max Adverse Excursion)</label>
            <input
              id="mae"
              v-model="form.mae"
              type="number"
              step="0.000001"
              class="input"
              placeholder="0.000000"
              title="Maximum loss during trade"
            />
          </div>

          <div>
            <label for="mfe" class="label">MFE (Max Favorable Excursion)</label>
            <input
              id="mfe"
              v-model="form.mfe"
              type="number"
              step="0.000001"
              class="input"
              placeholder="0.000000"
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

          <!-- Empty placeholder to align grid -->
          <div class="hidden sm:block"></div>

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
      
      <div v-if="showMoreOptions" class="space-y-6">
        <!-- Options-specific fields -->
        <div v-if="form.instrumentType === 'option'" class="grid grid-cols-1 gap-6 sm:grid-cols-2 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
          <div class="sm:col-span-2">
            <h3 class="text-md font-medium text-gray-900 dark:text-white mb-4">Option Details</h3>
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
              step="0.01"
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
          <div class="sm:col-span-2">
            <h3 class="text-md font-medium text-gray-900 dark:text-white mb-4">Futures Details</h3>
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
              step="0.000001"
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
              step="0.01"
              min="0"
              class="input"
              placeholder="50.00"
            />
          </div>
        </div>

        <div class="relative">
          <label for="strategy" class="label">Strategy</label>
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
        <div class="relative">
          <label for="setup" class="label">Setup</label>
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
  
        <div>
          <label for="tags" class="label">Tags (comma separated)</label>
          <input
            id="tags"
            v-model="tagsInput"
            type="text"
            class="input"
            placeholder="momentum, earnings, breakout"
          />
        </div>
  
        <div>
          <label for="notes" class="label">Notes</label>
          <textarea
            id="notes"
            v-model="form.notes"
            rows="4"
            class="input"
            placeholder="Add your trade notes, observations, and learnings..."
            @keydown="handleNotesKeydown"
          ></textarea>
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

        <!-- Image Upload Section -->
        <div v-if="isEdit && route.params.id">
          <ImageUpload 
            :trade-id="route.params.id" 
            @uploaded="handleImageUploaded"
          />
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
      <button type="button" @click="showMoreOptions = !showMoreOptions" class="btn-secondary">
        {{ showMoreOptions ? 'Less Options' : 'More Options' }}
      </button>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTradesStore } from '@/stores/trades'
import { useNotification } from '@/composables/useNotification'
import { useAnalytics } from '@/composables/useAnalytics'
import ImageUpload from '@/components/trades/ImageUpload.vue'
import TradeImages from '@/components/trades/TradeImages.vue'
import api from '@/services/api'

const showMoreOptions = ref(false)
const route = useRoute()
const router = useRouter()
const tradesStore = useTradesStore()
const { showSuccess, showError } = useNotification()
const { trackTradeAction } = useAnalytics()

const loading = ref(false)
const error = ref(null)
const behavioralAlert = ref(null)
const tradeBlocked = ref(false)
const tradeBlockingInfo = ref(null)
const hasProAccess = ref(false)

const isEdit = computed(() => !!route.params.id)

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
  strategy: '',
  setup: '',
  notes: '',
  isPublic: false,
  confidence: 5,
  // Risk management fields
  stopLoss: null,
  takeProfit: null,
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
const currentImages = ref([])
const strategiesList = ref([])
const setupsList = ref([])
const brokersList = ref([])
const userSettings = ref(null)
const showBrokerInput = ref(false)
const showStrategyInput = ref(false)
const showSetupInput = ref(false)

function formatDateTimeLocal(date) {
  if (!date) return ''

  // Parse datetime string manually to avoid timezone issues
  const dateStr = date.toString()

  // If it's an ISO datetime string, parse components directly
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (isoMatch) {
    const [, year, month, day, hour, minute] = isoMatch
    return `${year}-${month}-${day}T${hour}:${minute}`
  }

  // Fallback to Date object
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
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
    const trade = await tradesStore.fetchTrade(route.params.id)
    
    form.value = {
      symbol: trade.symbol,
      entryTime: formatDateTimeLocal(trade.entry_time),
      exitTime: trade.exit_time ? formatDateTimeLocal(trade.exit_time) : '',
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price || '',
      quantity: trade.quantity,
      side: trade.side,
      instrumentType: trade.instrument_type || 'stock',
      entryCommission: trade.entry_commission || trade.commission || 0,
      exitCommission: trade.exit_commission || 0,
      fees: trade.fees || 0,
      mae: trade.mae || null,
      mfe: trade.mfe || null,
      stopLoss: trade.stopLoss || null,
      takeProfit: trade.takeProfit || null,
      broker: trade.broker || '',
      strategy: trade.strategy || '',
      setup: trade.setup || '',
      notes: trade.notes || '',
      isPublic: trade.is_public || false,
      confidence: trade.confidence || 5,
      // Options-specific fields
      underlyingSymbol: trade.underlying_symbol || '',
      optionType: trade.option_type || '',
      strikePrice: trade.strike_price || null,
      expirationDate: trade.expiration_date ? formatDateOnly(trade.expiration_date) : '',
      contractSize: trade.contract_size || 100,
      // Futures-specific fields
      underlyingAsset: trade.underlying_asset || '',
      contractMonth: convertMonthNumberToAbbreviation(trade.contract_month || trade.contractMonth) || '',
      contractYear: trade.contract_year || trade.contractYear || null,
      tickSize: trade.tick_size || trade.tickSize || null,
      pointValue: trade.point_value || trade.pointValue || null,
      // Executions
      executions: (() => {
        console.log('[TRADE FORM] Raw trade.executions:', JSON.stringify(trade.executions, null, 2))
        if (trade.executions && Array.isArray(trade.executions) && trade.executions.length > 0) {
          // Use existing executions
          const mapped = trade.executions.map(exec => {
            console.log('[TRADE FORM] Processing execution:', exec)
            // Handle both 'action' and 'side' fields, normalize to 'buy' or 'sell'
            let action = exec.action || exec.side || ''
            // Normalize action to 'buy' or 'sell'
            if (action === 'long') action = 'buy'
            if (action === 'short') action = 'sell'

            const result = {
              action: action,
              quantity: exec.quantity || '',
              price: exec.price || exec.entryPrice || '',
              datetime: (exec.datetime || exec.entryTime) ? formatDateTimeLocal(exec.datetime || exec.entryTime) : '',
              commission: exec.commission || 0,
              fees: exec.fees || 0
            }
            console.log('[TRADE FORM] Mapped execution:', result)
            return result
          })
          console.log('[TRADE FORM] All mapped executions:', mapped)
          return mapped
        } else {
          // No executions array - create a synthetic grouped execution from trade entry/exit data
          // Use the grouped format (entryPrice/exitPrice) for easier editing
          return [{
            side: trade.side,
            quantity: trade.quantity || '',
            entryPrice: trade.entry_price || '',
            exitPrice: trade.exit_price || null,
            entryTime: trade.entry_time ? formatDateTimeLocal(trade.entry_time) : '',
            exitTime: trade.exit_time ? formatDateTimeLocal(trade.exit_time) : null,
            commission: trade.commission || 0,
            fees: trade.fees || 0,
            pnl: trade.pnl || 0
          }]
        }
      })()
    }

    tagsInput.value = trade.tags ? trade.tags.join(', ') : ''
    currentImages.value = trade.attachments || []
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
    let calculatedCommission = (parseFloat(form.value.entryCommission) || 0) + (parseFloat(form.value.exitCommission) || 0)
    let calculatedFees = parseFloat(form.value.fees) || 0

    const processedExecutions = form.value.executions && form.value.executions.length > 0
      ? form.value.executions.map(exec => {
          // Check if this is a grouped execution (has entryPrice/exitPrice) or individual fill
          if (exec.entryPrice !== undefined || exec.exitPrice !== undefined) {
            // Grouped format - keep entry/exit fields
            return {
              side: exec.side,
              quantity: parseFloat(exec.quantity),
              entryPrice: parseFloat(exec.entryPrice),
              exitPrice: exec.exitPrice ? parseFloat(exec.exitPrice) : null,
              entryTime: exec.entryTime,
              exitTime: exec.exitTime || null,
              commission: parseFloat(exec.commission) || 0,
              fees: parseFloat(exec.fees) || 0,
              pnl: exec.pnl || 0
            }
          } else {
            // Individual fill format - keep action/price/datetime
            return {
              action: exec.action,
              quantity: parseFloat(exec.quantity),
              price: parseFloat(exec.price),
              datetime: exec.datetime,
              commission: parseFloat(exec.commission) || 0,
              fees: parseFloat(exec.fees) || 0
            }
          }
        })
      : undefined

    // If we have executions, calculate summary values from them
    if (processedExecutions && processedExecutions.length > 0) {
      // Check if we have grouped executions (with entryPrice/exitPrice) or individual fills
      const hasGroupedExecutions = processedExecutions.some(e => e.entryPrice !== undefined || e.exitPrice !== undefined)

      if (hasGroupedExecutions) {
        // Handle grouped executions (round-trip sub-trades)
        // Total quantity is sum of ALL execution quantities
        calculatedQuantity = processedExecutions.reduce((sum, exec) => sum + exec.quantity, 0)

        // Total commission and fees from all executions
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
        // Total quantity is sum of ALL execution quantities (not net position)
        calculatedQuantity = processedExecutions.reduce((sum, exec) => sum + exec.quantity, 0)

        // Total commission and fees from all executions
        calculatedCommission = processedExecutions.reduce((sum, exec) => sum + (exec.commission || 0), 0)
        calculatedFees = processedExecutions.reduce((sum, exec) => sum + (exec.fees || 0), 0)

        // Entry time is earliest execution
        const sortedByTime = [...processedExecutions].sort((a, b) =>
          new Date(a.datetime) - new Date(b.datetime)
        )
        calculatedEntryTime = sortedByTime[0].datetime

        // Exit time is latest execution (if there are sell executions)
        const hasSellExecution = processedExecutions.some(e => e.action === 'sell')
        if (hasSellExecution) {
          calculatedExitTime = sortedByTime[sortedByTime.length - 1].datetime
        }

        // Entry price is weighted average of buy executions
        const buyExecutions = processedExecutions.filter(e => e.action === 'buy')
        if (buyExecutions.length > 0) {
          const totalBuyValue = buyExecutions.reduce((sum, exec) => sum + (exec.price * exec.quantity), 0)
          const totalBuyQty = buyExecutions.reduce((sum, exec) => sum + exec.quantity, 0)
          calculatedEntryPrice = totalBuyValue / totalBuyQty
        }

        // Exit price is weighted average of sell executions
        const sellExecutions = processedExecutions.filter(e => e.action === 'sell')
        if (sellExecutions.length > 0) {
          const totalSellValue = sellExecutions.reduce((sum, exec) => sum + (exec.price * exec.quantity), 0)
          const totalSellQty = sellExecutions.reduce((sum, exec) => sum + exec.quantity, 0)
          calculatedExitPrice = totalSellValue / totalSellQty
        }
      }
    }

    const tradeData = {
      symbol: form.value.symbol,
      side: form.value.side,
      instrumentType: form.value.instrumentType,
      entryTime: calculatedEntryTime,
      exitTime: calculatedExitTime || null,
      entryPrice: calculatedEntryPrice,
      exitPrice: calculatedExitPrice,
      quantity: calculatedQuantity,
      commission: calculatedCommission,
      fees: calculatedFees,
      mae: form.value.mae ? parseFloat(form.value.mae) : null,
      mfe: form.value.mfe ? parseFloat(form.value.mfe) : null,
      confidence: parseInt(form.value.confidence) || 5,
      broker: form.value.broker || '',
      strategy: form.value.strategy || '',
      setup: form.value.setup || '',
      notes: form.value.notes || '',
      isPublic: form.value.isPublic || false,
      tags: tagsInput.value ? tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean) : [],
      // Risk management fields
      stopLoss: form.value.stopLoss && form.value.stopLoss !== '' ? parseFloat(form.value.stopLoss) : null,
      takeProfit: form.value.takeProfit && form.value.takeProfit !== '' ? parseFloat(form.value.takeProfit) : null,
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
      // For edits, go back to the trade detail page
      router.push(`/trades/${route.params.id}`)
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
      // For new trades, go to trades list
      router.push('/trades')
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
  // Save the broker and switch back to select
  if (form.value.broker.trim()) {
    showBrokerInput.value = false
  }
}

function handleBrokerInputBlur() {
  // If the input is empty, switch back to select
  if (!form.value.broker.trim()) {
    showBrokerInput.value = false
  }
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
  // Save the strategy and switch back to select
  if (form.value.strategy.trim()) {
    showStrategyInput.value = false
  }
}

function handleStrategyInputBlur() {
  // If the input is empty, switch back to select
  if (!form.value.strategy.trim()) {
    showStrategyInput.value = false
  }
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
  // Save the setup and switch back to select
  if (form.value.setup.trim()) {
    showSetupInput.value = false
  }
}

function handleSetupInputBlur() {
  // If the input is empty, switch back to select
  if (!form.value.setup.trim()) {
    showSetupInput.value = false
  }
}

function addExecution() {
  const now = new Date()
  form.value.executions.push({
    action: '',
    quantity: '',
    price: '',
    datetime: formatDateTimeLocal(now),
    commission: 0,
    fees: 0
  })
}

function removeExecution(index) {
  form.value.executions.splice(index, 1)
}

onMounted(async () => {
  await checkProAccess()
  await fetchLists()
  await fetchUserSettings()

  if (isEdit.value) {
    loadTrade()
  } else {
    // Set default entry time
    const now = new Date()
    form.value.entryTime = formatDateTimeLocal(now)

    // Check for trade blocking on new trades
    if (hasProAccess.value) {
      await checkTradeBlocking()
    }
  }
})
</script>