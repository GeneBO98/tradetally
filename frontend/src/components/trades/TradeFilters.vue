<template>
  <div class="space-y-4">
    <!-- Basic filters always visible -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label for="symbol" class="label">Symbol</label>
        <input
          id="symbol"
          v-model="filters.symbol"
          type="text"
          class="input"
          placeholder="e.g., AAPL"
          @keydown.enter="applyFilters"
        />
      </div>

      <div>
        <label class="label">Time Period</label>
        <select v-model="selectedPeriod" @change="applyPeriodPreset" class="input">
          <option value="custom">Custom Range</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="ytd">Year to Date</option>
          <option value="1y">Last Year</option>
          <option value="all">All Time</option>
        </select>
      </div>

      <div v-if="selectedPeriod === 'custom'">
        <label for="startDate" class="label">Start Date</label>
        <input
          id="startDate"
          v-model="filters.startDate"
          type="date"
          class="input"
          @keydown.enter="applyFilters"
        />
      </div>

      <div v-if="selectedPeriod === 'custom'">
        <label for="endDate" class="label">End Date</label>
        <input
          id="endDate"
          v-model="filters.endDate"
          type="date"
          class="input"
          @keydown.enter="applyFilters"
        />
      </div>

      <div>
        <label class="label">Strategy</label>
        <div class="relative" data-dropdown="strategy">
          <button
            @click.stop="showStrategyDropdown = !showStrategyDropdown"
            class="input w-full text-left flex items-center justify-between"
            type="button"
          >
            <span class="truncate">
              {{ getSelectedStrategyText() }}
            </span>
            <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>

          <div v-if="showStrategyDropdown" class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
            <div class="p-1">
              <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                <input
                  type="checkbox"
                  :checked="!filters.strategies || filters.strategies.length === 0"
                  @change="toggleAllStrategies"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                />
                <span class="ml-3 text-sm text-gray-900 dark:text-white">All Strategies</span>
              </label>
            </div>
            <div class="border-t border-gray-200 dark:border-gray-600">
              <div v-for="strategy in strategyOptions" :key="strategy.value" class="p-1">
                <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    :value="strategy.value"
                    v-model="filters.strategies"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                  />
                  <span class="ml-3 text-sm text-gray-900 dark:text-white">{{ strategy.label }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Second Row of Basic Filters -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label class="label">Trade Status</label>
        <select v-model="filters.status" class="input">
          <option value="">All Trades</option>
          <option value="open">Open Only</option>
          <option value="closed">Closed Only</option>
        </select>
      </div>

      <div>
        <label class="label">Position Type</label>
        <select v-model="filters.side" class="input">
          <option value="">All</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
      </div>

      <div>
        <label class="label">Instrument Type</label>
        <div class="relative" data-dropdown="instrumentType">
          <button
            @click.stop="showInstrumentTypeDropdown = !showInstrumentTypeDropdown"
            class="input w-full text-left flex items-center justify-between"
            type="button"
          >
            <span class="truncate">
              {{ getSelectedInstrumentTypeText() }}
            </span>
            <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>

          <div v-if="showInstrumentTypeDropdown" class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
            <div class="p-1">
              <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                <input
                  type="checkbox"
                  :checked="!filters.instrumentTypes || filters.instrumentTypes.length === 0"
                  @change="toggleAllInstrumentTypes"
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                />
                <span class="ml-3 text-sm text-gray-900 dark:text-white">All Types</span>
              </label>
            </div>
            <div class="border-t border-gray-200 dark:border-gray-600">
              <div v-for="type in instrumentTypeOptions" :key="type.value" class="p-1">
                <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    :value="type.value"
                    v-model="filters.instrumentTypes"
                    class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                  />
                  <span class="ml-3 text-sm text-gray-900 dark:text-white">{{ type.label }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label class="label">Tags</label>
        <TagManagement v-model="filters.tags" />
      </div>
    </div>

    <!-- Advanced filters toggle -->
    <div class="pt-2">
      <button
        type="button"
        @click.stop.prevent="showAdvanced = !showAdvanced"
        class="flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ChevronRightIcon 
          :class="[showAdvanced ? 'rotate-90' : '', 'h-4 w-4 mr-1 transition-transform']"
        />
        Advanced Filters
        <span v-if="activeAdvancedCount > 0" class="ml-2 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs px-2 py-0.5 rounded-full">
          {{ activeAdvancedCount }}
        </span>
      </button>
    </div>

    <!-- Advanced filters (collapsible) -->
    <div v-if="showAdvanced" class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-6">
      <!-- Range Filters and Timing & Options - Side by Side -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Range Filters Group -->
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Range Filters</h4>
          <div class="space-y-4">
            <!-- Price Range -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Entry Price</label>
              <div class="flex items-center gap-1.5">
                <input
                  v-model.number="filters.minPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  class="input text-sm flex-1"
                  placeholder="Min"
                  @keydown.enter="applyFilters"
                />
                <span class="text-xs text-gray-400">-</span>
                <input
                  v-model.number="filters.maxPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  class="input text-sm flex-1"
                  placeholder="Max"
                  @keydown.enter="applyFilters"
                />
              </div>
            </div>

            <!-- Quantity Range -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Share Quantity</label>
              <div class="flex items-center gap-1.5">
                <input
                  v-model.number="filters.minQuantity"
                  type="number"
                  min="0"
                  class="input text-sm flex-1"
                  placeholder="Min"
                  @keydown.enter="applyFilters"
                />
                <span class="text-xs text-gray-400">-</span>
                <input
                  v-model.number="filters.maxQuantity"
                  type="number"
                  min="0"
                  class="input text-sm flex-1"
                  placeholder="Max"
                  @keydown.enter="applyFilters"
                />
              </div>
            </div>

            <!-- P&L Range -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">P&L ($)</label>
              <div class="flex items-center gap-1.5">
                <input
                  v-model.number="filters.minPnl"
                  type="number"
                  step="0.01"
                  class="input text-sm flex-1"
                  placeholder="Min"
                  @keydown.enter="applyFilters"
                />
                <span class="text-xs text-gray-400">-</span>
                <input
                  v-model.number="filters.maxPnl"
                  type="number"
                  step="0.01"
                  class="input text-sm flex-1"
                  placeholder="Max"
                  @keydown.enter="applyFilters"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Timing & Options Group -->
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
          <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Timing & Options</h4>
          <div class="space-y-4">
            <!-- Hold Time -->
            <div>
              <label class="label">Hold Time</label>
              <select v-model="filters.holdTime" class="input">
                <option value="">All</option>
                <option value="< 1 min">< 1 minute</option>
                <option value="1-5 min">1-5 minutes</option>
                <option value="5-15 min">5-15 minutes</option>
                <option value="15-30 min">15-30 minutes</option>
                <option value="30-60 min">30-60 minutes</option>
                <option value="1-2 hours">1-2 hours</option>
                <option value="2-4 hours">2-4 hours</option>
                <option value="4-24 hours">4-24 hours</option>
                <option value="1-7 days">1-7 days</option>
                <option value="1-4 weeks">1-4 weeks</option>
                <option value="1+ months">1+ months</option>
              </select>
            </div>

            <!-- Day of Week -->
            <div>
              <label class="label">Day of Week</label>
              <div class="relative" data-dropdown="dayOfWeek">
                <button
                  @click.stop="showDayOfWeekDropdown = !showDayOfWeekDropdown"
                  class="input w-full text-left flex items-center justify-between"
                  type="button"
                >
                  <span class="truncate">
                    {{ getSelectedDayOfWeekText() }}
                  </span>
                  <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </button>

                <div v-if="showDayOfWeekDropdown" class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                  <div class="p-1">
                    <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        :checked="!filters.daysOfWeek || filters.daysOfWeek.length === 0"
                        @change="toggleAllDaysOfWeek"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                      />
                      <span class="ml-3 text-sm text-gray-900 dark:text-white">All Days</span>
                    </label>
                  </div>
                  <div class="border-t border-gray-200 dark:border-gray-600">
                    <div v-for="day in dayOfWeekOptions" :key="day.value" class="p-1">
                      <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          :value="day.value"
                          v-model="filters.daysOfWeek"
                          class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                        />
                        <span class="ml-3 text-sm text-gray-900 dark:text-white">{{ day.label }}</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Option Type Filter (only shown when Options selected in main filters) -->
            <div v-if="filters.instrumentTypes.includes('option')">
              <label class="label">Option Type</label>
              <div class="relative" data-dropdown="optionType">
                <button
                  @click.stop="showOptionTypeDropdown = !showOptionTypeDropdown"
                  class="input w-full text-left flex items-center justify-between"
                  type="button"
                >
                  <span class="truncate">
                    {{ getSelectedOptionTypeText() }}
                  </span>
                  <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </button>

                <div v-if="showOptionTypeDropdown" class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                  <div class="p-1">
                    <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        :checked="!filters.optionTypes || filters.optionTypes.length === 0"
                        @change="toggleAllOptionTypes"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                      />
                      <span class="ml-3 text-sm text-gray-900 dark:text-white">All Option Types</span>
                    </label>
                  </div>
                  <div class="border-t border-gray-200 dark:border-gray-600">
                    <div v-for="type in optionTypeOptions" :key="type.value" class="p-1">
                      <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          :value="type.value"
                          v-model="filters.optionTypes"
                          class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                        />
                        <span class="ml-3 text-sm text-gray-900 dark:text-white">{{ type.label }}</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Trade Characteristics Group -->
      <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Trade Characteristics</h4>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <!-- Sector -->
          <div>
            <label class="label">Sector</label>
            <div class="relative" data-dropdown="sector">
              <button
                @click.stop="showSectorDropdown = !showSectorDropdown"
                class="input w-full text-left flex items-center justify-between"
                type="button"
                :disabled="loadingSectors"
              >
                <span class="truncate">
                  {{ getSelectedSectorText() }}
                </span>
                <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>

              <div v-if="showSectorDropdown && !loadingSectors" class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                <div class="p-1">
                  <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      :checked="!filters.sectors || filters.sectors.length === 0"
                      @change="toggleAllSectors"
                      class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                    />
                    <span class="ml-3 text-sm text-gray-900 dark:text-white">All Sectors</span>
                  </label>
                </div>
                <div class="border-t border-gray-200 dark:border-gray-600">
                  <div v-for="sector in availableSectors" :key="sector" class="p-1">
                    <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        :value="sector"
                        v-model="filters.sectors"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                      />
                      <span class="ml-3 text-sm text-gray-900 dark:text-white">{{ sector }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- News -->
          <div>
            <label for="hasNews" class="label">News</label>
            <select
              id="hasNews"
              v-model="filters.hasNews"
              class="input"
            >
              <option value="">All Trades</option>
              <option value="true">With News</option>
              <option value="false">No News</option>
            </select>
          </div>

          <!-- Broker -->
          <div>
            <label class="label">Broker</label>
            <div class="relative" data-dropdown="broker">
              <button
                @click.stop="showBrokerDropdown = !showBrokerDropdown"
                class="input w-full text-left flex items-center justify-between"
                type="button"
                :disabled="loadingBrokers"
              >
                <span class="truncate">
                  {{ getSelectedBrokerText() }}
                </span>
                <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>

              <div v-if="showBrokerDropdown && !loadingBrokers" class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                <div class="p-1">
                  <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      :checked="!filters.brokers || filters.brokers.length === 0"
                      @change="toggleAllBrokers"
                      class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                    />
                    <span class="ml-3 text-sm text-gray-900 dark:text-white">All Brokers</span>
                  </label>
                </div>
                <div class="border-t border-gray-200 dark:border-gray-600">
                  <div v-for="broker in availableBrokers" :key="broker" class="p-1">
                    <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        :value="broker"
                        v-model="filters.brokers"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                      />
                      <span class="ml-3 text-sm text-gray-900 dark:text-white">{{ broker }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- P&L Type -->
          <div>
            <label class="label">P&L Type</label>
            <select v-model="filters.pnlType" class="input">
              <option value="">All</option>
              <option value="profit">Profit Only</option>
              <option value="loss">Loss Only</option>
            </select>
          </div>

          <!-- Quality Grade -->
          <div>
            <label class="label">Quality Grade</label>
            <div class="relative" data-dropdown="qualityGrade">
              <button
                @click.stop="showQualityGradeDropdown = !showQualityGradeDropdown"
                class="input w-full text-left flex items-center justify-between"
                type="button"
              >
                <span class="truncate">
                  {{ getSelectedQualityGradeText() }}
                </span>
                <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>

              <div v-if="showQualityGradeDropdown" class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                <div class="p-1">
                  <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      :checked="!filters.qualityGrades || filters.qualityGrades.length === 0"
                      @change="toggleAllQualityGrades"
                      class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                    />
                    <span class="ml-3 text-sm text-gray-900 dark:text-white">All Grades</span>
                  </label>
                </div>
                <div class="border-t border-gray-200 dark:border-gray-600">
                  <div v-for="grade in qualityGradeOptions" :key="grade.value" class="p-1">
                    <label class="flex items-center w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        :value="grade.value"
                        v-model="filters.qualityGrades"
                        class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded flex-shrink-0"
                      />
                      <span class="ml-3 text-sm text-gray-900 dark:text-white">{{ grade.label }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-between items-center">
      <div v-if="activeFiltersCount > 0" class="text-sm text-gray-600 dark:text-gray-400">
        {{ activeFiltersCount }} filter{{ activeFiltersCount !== 1 ? 's' : '' }} active
      </div>
      <div v-else></div>
      <div class="flex space-x-3">
        <button @click="resetFilters" class="btn-secondary">
          Reset
        </button>
        <button @click="applyFilters" class="btn-primary">
          Apply Filters
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRightIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'
import TagManagement from './TagManagement.vue'
import { useTradesStore } from '@/stores/trades'
import { formatLocalDate } from '@/utils/date'
import { useGlobalAccountFilter } from '@/composables/useGlobalAccountFilter'

const emit = defineEmits(['filter'])
const route = useRoute()
const tradesStore = useTradesStore()
const { selectedAccount, isFiltered: globalAccountFilterActive } = useGlobalAccountFilter()

const showAdvanced = ref(false)

// Load saved period from localStorage on initialization
const savedPeriodInit = localStorage.getItem('tradeFiltersPeriod')
const selectedPeriod = ref(savedPeriodInit || 'all')
console.log('[TradeFilters] Initialized selectedPeriod from localStorage:', selectedPeriod.value)

// Apply a period preset (7d, 30d, etc.)
function applyPeriodPreset() {
  const now = new Date()
  // Use formatLocalDate to avoid timezone issues (e.g., 8PM CST showing as next day)
  const today = formatLocalDate(now)

  switch (selectedPeriod.value) {
    case '7d': {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      filters.value.startDate = formatLocalDate(start)
      filters.value.endDate = today
      break
    }
    case '30d': {
      const start = new Date(now)
      start.setDate(start.getDate() - 30)
      filters.value.startDate = formatLocalDate(start)
      filters.value.endDate = today
      break
    }
    case '90d': {
      const start = new Date(now)
      start.setDate(start.getDate() - 90)
      filters.value.startDate = formatLocalDate(start)
      filters.value.endDate = today
      break
    }
    case 'ytd': {
      const start = new Date(now.getFullYear(), 0, 1)
      filters.value.startDate = formatLocalDate(start)
      filters.value.endDate = today
      break
    }
    case '1y': {
      const start = new Date(now)
      start.setFullYear(start.getFullYear() - 1)
      filters.value.startDate = formatLocalDate(start)
      filters.value.endDate = today
      break
    }
    case 'all':
      filters.value.startDate = ''
      filters.value.endDate = ''
      break
    case 'custom':
      // Keep existing dates - they're already loaded from localStorage in loadInitialFilters()
      break
  }

  // Save selected period to localStorage
  try {
    localStorage.setItem('tradeFiltersPeriod', selectedPeriod.value)
  } catch (e) {
    // localStorage save failed
  }
}

const availableSectors = ref([])
const loadingSectors = ref(false)
const availableBrokers = ref([])
const loadingBrokers = ref(false)

// Dropdown visibility
const showStrategyDropdown = ref(false)
const showSectorDropdown = ref(false)
const showDayOfWeekDropdown = ref(false)
const showBrokerDropdown = ref(false)
const showInstrumentTypeDropdown = ref(false)
const showOptionTypeDropdown = ref(false)
const showQualityGradeDropdown = ref(false)

// Day of week options (weekdays only - markets are closed weekends)
const dayOfWeekOptions = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' }
]

// Instrument type options
const instrumentTypeOptions = [
  { value: 'stock', label: 'Stocks' },
  { value: 'option', label: 'Options' },
  { value: 'future', label: 'Futures' },
  { value: 'crypto', label: 'Crypto' }
]

// Option type options
const optionTypeOptions = [
  { value: 'call', label: 'Calls' },
  { value: 'put', label: 'Puts' }
]

// Quality grade options
const qualityGradeOptions = [
  { value: 'A', label: 'A - Excellent' },
  { value: 'B', label: 'B - Good' },
  { value: 'C', label: 'C - Average' },
  { value: 'D', label: 'D - Below Average' },
  { value: 'F', label: 'F - Poor' }
]

// Strategy options
const strategyOptions = [
  { value: 'scalper', label: 'Scalper' },
  { value: 'momentum', label: 'Momentum' },
  { value: 'mean_reversion', label: 'Mean Reversion' },
  { value: 'swing', label: 'Swing' },
  { value: 'day_trading', label: 'Day Trading' },
  { value: 'position', label: 'Position Trading' },
  { value: 'breakout', label: 'Breakout' },
  { value: 'reversal', label: 'Reversal' },
  { value: 'trend_following', label: 'Trend Following' },
  { value: 'contrarian', label: 'Contrarian' },
  { value: 'news_momentum', label: 'News Momentum' },
  { value: 'news_swing', label: 'News Swing' },
  { value: 'news_uncertainty', label: 'News Uncertainty' }
]

// Initialize filters with defaults, then load from localStorage
const defaultFilters = {
  // Basic filters
  symbol: '',
  startDate: '',
  endDate: '',
  strategy: '', // Keep for backward compatibility
  strategies: [], // New multi-select array
  sector: '', // Keep for backward compatibility
  sectors: [], // New multi-select array
  tags: [], // New multi-select array for tags
  hasNews: '',
  // Advanced filters
  side: '',
  minPrice: null,
  maxPrice: null,
  minQuantity: null,
  maxQuantity: null,
  status: '',
  minPnl: null,
  maxPnl: null,
  pnlType: '',
  holdTime: '',
  broker: '', // Keep for backward compatibility
  brokers: [], // New multi-select array
  daysOfWeek: [], // New multi-select array for days
  instrumentTypes: [], // New multi-select array for instrument types
  optionTypes: [], // New multi-select array for option types (call/put)
  qualityGrades: [] // New multi-select array for quality grades
}

// Load saved filters from localStorage on initialization
function loadInitialFilters() {
  try {
    const savedFilters = localStorage.getItem('tradeFilters')
    const savedPeriod = localStorage.getItem('tradeFiltersPeriod')
    console.log('[TradeFilters] Loading initial filters:', { savedFilters, savedPeriod })

    if (savedFilters) {
      const parsed = JSON.parse(savedFilters)
      console.log('[TradeFilters] Parsed filters:', parsed)
      console.log('[TradeFilters] startDate:', parsed.startDate, 'endDate:', parsed.endDate)

      // Convert comma-separated strings back to arrays
      if (parsed.strategies && typeof parsed.strategies === 'string') {
        parsed.strategies = parsed.strategies.split(',').filter(Boolean)
      }
      if (parsed.sectors && typeof parsed.sectors === 'string') {
        parsed.sectors = parsed.sectors.split(',').filter(Boolean)
      }
      if (parsed.tags && typeof parsed.tags === 'string') {
        parsed.tags = parsed.tags.split(',').filter(Boolean)
      }
      if (parsed.brokers && typeof parsed.brokers === 'string') {
        parsed.brokers = parsed.brokers.split(',').filter(Boolean)
      }
      if (parsed.daysOfWeek && typeof parsed.daysOfWeek === 'string') {
        parsed.daysOfWeek = parsed.daysOfWeek.split(',').filter(Boolean).map(Number)
      }
      if (parsed.instrumentTypes && typeof parsed.instrumentTypes === 'string') {
        parsed.instrumentTypes = parsed.instrumentTypes.split(',').filter(Boolean)
      }
      if (parsed.optionTypes && typeof parsed.optionTypes === 'string') {
        parsed.optionTypes = parsed.optionTypes.split(',').filter(Boolean)
      }
      if (parsed.qualityGrades && typeof parsed.qualityGrades === 'string') {
        parsed.qualityGrades = parsed.qualityGrades.split(',').filter(Boolean)
      }
      const result = { ...defaultFilters, ...parsed }
      console.log('[TradeFilters] Final loaded filters - startDate:', result.startDate, 'endDate:', result.endDate, 'savedPeriod:', savedPeriod)
      console.log('[TradeFilters] Full result object:', JSON.stringify(result, null, 2))
      return result
    }
  } catch (e) {
    console.warn('Failed to load saved filters:', e)
  }
  return { ...defaultFilters }
}

const filters = ref(loadInitialFilters())

// Helper methods for multi-select dropdowns
function getSelectedStrategyText() {
  if (!filters.value.strategies || filters.value.strategies.length === 0) return 'All Strategies'
  if (filters.value.strategies.length === 1) {
    const strategy = strategyOptions.find(s => s.value === filters.value.strategies[0])
    return strategy ? strategy.label : 'All Strategies'
  }
  return `${filters.value.strategies.length} strategies selected`
}

function getSelectedSectorText() {
  if (!filters.value.sectors || filters.value.sectors.length === 0) return loadingSectors.value ? 'Loading sectors...' : 'All Sectors'
  if (filters.value.sectors.length === 1) return filters.value.sectors[0]
  return `${filters.value.sectors.length} sectors selected`
}

function toggleAllStrategies(event) {
  if (event.target.checked) {
    filters.value.strategies = []
  }
}

function toggleAllSectors(event) {
  if (event.target.checked) {
    filters.value.sectors = []
  }
}

function getSelectedBrokerText() {
  if (!filters.value.brokers || filters.value.brokers.length === 0) return loadingBrokers.value ? 'Loading brokers...' : 'All Brokers'
  if (filters.value.brokers.length === 1) return filters.value.brokers[0]
  return `${filters.value.brokers.length} brokers selected`
}

function toggleAllBrokers(event) {
  if (event.target.checked) {
    filters.value.brokers = []
  }
}

function getSelectedDayOfWeekText() {
  if (!filters.value.daysOfWeek || filters.value.daysOfWeek.length === 0) return 'All Days'
  if (filters.value.daysOfWeek.length === 1) {
    const day = dayOfWeekOptions.find(d => d.value === filters.value.daysOfWeek[0])
    return day ? day.label : 'All Days'
  }
  return `${filters.value.daysOfWeek.length} days selected`
}

function toggleAllDaysOfWeek(event) {
  if (event.target.checked) {
    filters.value.daysOfWeek = []
  }
}

function getSelectedInstrumentTypeText() {
  if (!filters.value.instrumentTypes || filters.value.instrumentTypes.length === 0) return 'All Types'
  if (filters.value.instrumentTypes.length === 1) {
    const type = instrumentTypeOptions.find(t => t.value === filters.value.instrumentTypes[0])
    return type ? type.label : 'All Types'
  }
  return `${filters.value.instrumentTypes.length} types selected`
}

function toggleAllInstrumentTypes(event) {
  if (event.target.checked) {
    filters.value.instrumentTypes = []
    // Also clear option types when clearing instrument types
    filters.value.optionTypes = []
  }
}

function getSelectedOptionTypeText() {
  if (!filters.value.optionTypes || filters.value.optionTypes.length === 0) return 'All Option Types'
  if (filters.value.optionTypes.length === 1) {
    const type = optionTypeOptions.find(t => t.value === filters.value.optionTypes[0])
    return type ? type.label : 'All Option Types'
  }
  return `${filters.value.optionTypes.length} types selected`
}

function toggleAllOptionTypes(event) {
  if (event.target.checked) {
    filters.value.optionTypes = []
  }
}

function getSelectedQualityGradeText() {
  if (!filters.value.qualityGrades || filters.value.qualityGrades.length === 0) return 'All Grades'
  if (filters.value.qualityGrades.length === 1) return `Grade ${filters.value.qualityGrades[0]}`
  return `${filters.value.qualityGrades.length} grades selected`
}

function toggleAllQualityGrades(event) {
  if (event.target.checked) {
    filters.value.qualityGrades = []
  }
}

// Count active filters
const activeFiltersCount = computed(() => {
  let count = 0
  if (filters.value.symbol) count++
  if (filters.value.startDate) count++
  if (filters.value.endDate) count++
  if (filters.value.strategies && filters.value.strategies.length > 0) count++
  if (filters.value.side) count++
  if (filters.value.status) count++
  if (filters.value.instrumentTypes && filters.value.instrumentTypes.length > 0) count++
  if (filters.value.tags && filters.value.tags.length > 0) count++
  if (filters.value.sectors && filters.value.sectors.length > 0) count++
  if (filters.value.hasNews) count++
  if (filters.value.minPrice !== null) count++
  if (filters.value.maxPrice !== null) count++
  if (filters.value.minQuantity !== null) count++
  if (filters.value.maxQuantity !== null) count++
  if (filters.value.minPnl !== null) count++
  if (filters.value.maxPnl !== null) count++
  if (filters.value.pnlType) count++
  if (filters.value.holdTime) count++
  if (filters.value.brokers && filters.value.brokers.length > 0) count++
  if (filters.value.daysOfWeek && filters.value.daysOfWeek.length > 0) count++
  if (filters.value.optionTypes && filters.value.optionTypes.length > 0) count++
  if (filters.value.qualityGrades && filters.value.qualityGrades.length > 0) count++
  return count
})

// Count active advanced filters only
const activeAdvancedCount = computed(() => {
  let count = 0
  if (filters.value.sectors && filters.value.sectors.length > 0) count++
  if (filters.value.hasNews) count++
  if (filters.value.minPrice !== null) count++
  if (filters.value.maxPrice !== null) count++
  if (filters.value.minQuantity !== null) count++
  if (filters.value.maxQuantity !== null) count++
  if (filters.value.brokers && filters.value.brokers.length > 0) count++
  if (filters.value.minPnl !== null) count++
  if (filters.value.maxPnl !== null) count++
  if (filters.value.pnlType) count++
  if (filters.value.holdTime) count++
  if (filters.value.daysOfWeek && filters.value.daysOfWeek.length > 0) count++
  if (filters.value.optionTypes && filters.value.optionTypes.length > 0) count++
  if (filters.value.qualityGrades && filters.value.qualityGrades.length > 0) count++
  return count
})

function applyFilters() {
  console.log('[TradeFilters] applyFilters called')
  console.log('[TradeFilters] Current filters.value:', JSON.stringify(filters.value))
  console.log('[TradeFilters] Current selectedPeriod:', selectedPeriod.value)

  // Clean up the filters before sending
  const cleanFilters = {}

  // Basic filters
  if (filters.value.symbol) cleanFilters.symbol = filters.value.symbol
  if (filters.value.startDate) cleanFilters.startDate = filters.value.startDate
  if (filters.value.endDate) cleanFilters.endDate = filters.value.endDate
  
  // Handle multi-select strategies - convert to comma-separated or use first one for backward compatibility
  if (filters.value.strategies.length > 0) {
    cleanFilters.strategies = filters.value.strategies.join(',')
  }
  
  // Handle multi-select sectors - convert to comma-separated or use first one for backward compatibility
  if (filters.value.sectors.length > 0) {
    cleanFilters.sectors = filters.value.sectors.join(',')
  }

  // Handle multi-select tags - convert to comma-separated
  if (filters.value.tags && filters.value.tags.length > 0) {
    cleanFilters.tags = filters.value.tags.join(',')
  }

  if (filters.value.hasNews) cleanFilters.hasNews = filters.value.hasNews

// Advanced filters
  if (filters.value.side) cleanFilters.side = filters.value.side
  if (filters.value.minPrice !== null && filters.value.minPrice !== '') cleanFilters.minPrice = filters.value.minPrice
  if (filters.value.maxPrice !== null && filters.value.maxPrice !== '') cleanFilters.maxPrice = filters.value.maxPrice
  if (filters.value.minQuantity !== null && filters.value.minQuantity !== '') cleanFilters.minQuantity = filters.value.minQuantity
  if (filters.value.maxQuantity !== null && filters.value.maxQuantity !== '') cleanFilters.maxQuantity = filters.value.maxQuantity
  if (filters.value.status) cleanFilters.status = filters.value.status
  if (filters.value.minPnl !== null && filters.value.minPnl !== '') cleanFilters.minPnl = filters.value.minPnl
  if (filters.value.maxPnl !== null && filters.value.maxPnl !== '') cleanFilters.maxPnl = filters.value.maxPnl
  if (filters.value.pnlType) cleanFilters.pnlType = filters.value.pnlType
  if (filters.value.holdTime) cleanFilters.holdTime = filters.value.holdTime
  
  // Handle multi-select brokers - convert to comma-separated
  if (filters.value.brokers.length > 0) {
    cleanFilters.brokers = filters.value.brokers.join(',')
  }

  // Use global account filter (from navbar GlobalAccountSelector)
  if (selectedAccount.value) {
    cleanFilters.accounts = selectedAccount.value
  }

  // Handle multi-select days of week - convert to comma-separated
  if (filters.value.daysOfWeek.length > 0) {
    cleanFilters.daysOfWeek = filters.value.daysOfWeek.join(',')
  }

  // Handle multi-select instrument types - convert to comma-separated
  if (filters.value.instrumentTypes.length > 0) {
    cleanFilters.instrumentTypes = filters.value.instrumentTypes.join(',')
  }

  // Handle multi-select option types - convert to comma-separated
  if (filters.value.optionTypes.length > 0) {
    cleanFilters.optionTypes = filters.value.optionTypes.join(',')
  }

  // Handle multi-select quality grades - convert to comma-separated
  if (filters.value.qualityGrades.length > 0) {
    cleanFilters.qualityGrades = filters.value.qualityGrades.join(',')
  }

  // Save only non-empty filters to localStorage for persistence
  try {
    // Create a clean object with only non-empty values to save
    const filtersToSave = {}
    Object.keys(filters.value).forEach(key => {
      const value = filters.value[key]
      // Only save non-empty values
      if (value !== '' && value !== null && value !== undefined) {
        // For arrays, only save if not empty
        if (Array.isArray(value)) {
          if (value.length > 0) {
            filtersToSave[key] = value
          }
        } else {
          filtersToSave[key] = value
        }
      }
    })

    console.log('[TradeFilters] Saving to localStorage - startDate:', filtersToSave.startDate, 'endDate:', filtersToSave.endDate)
    console.log('[TradeFilters] Full filtersToSave:', JSON.stringify(filtersToSave))
    console.log('[TradeFilters] Current filters.value.startDate:', filters.value.startDate, 'endDate:', filters.value.endDate)
    localStorage.setItem('tradeFilters', JSON.stringify(filtersToSave))
  } catch (e) {
    console.error('[TradeFilters] localStorage save failed:', e)
  }

  console.log('[TradeFilters] Emitting cleanFilters:', cleanFilters)
  emit('filter', cleanFilters)
}

function resetFilters() {
  // Reset to defaults
  filters.value = { ...defaultFilters }

  // Reset period selector
  selectedPeriod.value = 'all'

  // Clear localStorage
  try {
    localStorage.removeItem('tradeFilters')
    localStorage.removeItem('tradeFiltersPeriod')
  } catch (e) {
    // localStorage clear failed
  }

  // Emit empty filters to trigger reset
  // Note: The trades store will automatically preserve the global account filter
  emit('filter', {})
}

async function fetchAvailableSectors() {
  try {
    loadingSectors.value = true
    const response = await api.get('/analytics/sectors/available')
    availableSectors.value = response.data.sectors || []
  } catch (error) {
    console.warn('Failed to fetch available sectors:', error)
    availableSectors.value = []
  } finally {
    loadingSectors.value = false
  }
}

async function fetchAvailableBrokers() {
  try {
    loadingBrokers.value = true
    const response = await api.get('/analytics/brokers/available')
    availableBrokers.value = response.data.brokers || []
  } catch (error) {
    console.warn('Failed to fetch available brokers:', error)
    availableBrokers.value = []
  } finally {
    loadingBrokers.value = false
  }
}

// Convert minHoldTime/maxHoldTime to holdTime range option
const convertHoldTimeRange = (minMinutes, maxMinutes) => {
  // Handle specific strategy ranges first (more inclusive approach)
  if (maxMinutes <= 15) return '5-15 min' // Scalper: trades under 15 minutes
  if (maxMinutes <= 240) return '2-4 hours' // Momentum: up to 4 hours (more inclusive)
  if (maxMinutes <= 480) return '4-24 hours' // Mean reversion: up to 8 hours (more inclusive) 
  if (minMinutes >= 1440) return '1-7 days' // Swing: over 1 day
  
  // Fallback to exact mapping for edge cases
  if (maxMinutes < 1) return '< 1 min'
  if (maxMinutes <= 5) return '1-5 min'
  if (maxMinutes <= 30) return '15-30 min'
  if (maxMinutes <= 60) return '30-60 min'
  if (maxMinutes <= 120) return '1-2 hours'
  if (maxMinutes <= 1440) return '4-24 hours'
  if (maxMinutes <= 10080) return '1-7 days'
  if (maxMinutes <= 40320) return '1-4 weeks'
  
  return '1+ months' // Default for very long trades
}

// Close dropdowns when clicking outside
function handleClickOutside(event) {
  // Use refs instead of querySelector for better performance and reliability
  const target = event.target
  
  // Check if click is outside strategy dropdown
  if (showStrategyDropdown.value) {
    const strategyDropdown = target.closest('[data-dropdown="strategy"]')
    if (!strategyDropdown) {
      showStrategyDropdown.value = false
    }
  }
  
  // Check if click is outside sector dropdown  
  if (showSectorDropdown.value) {
    const sectorDropdown = target.closest('[data-dropdown="sector"]')
    if (!sectorDropdown) {
      showSectorDropdown.value = false
    }
  }
  
  // Check if click is outside day of week dropdown
  if (showDayOfWeekDropdown.value) {
    const dayOfWeekDropdown = target.closest('[data-dropdown="dayOfWeek"]')
    if (!dayOfWeekDropdown) {
      showDayOfWeekDropdown.value = false
    }
  }
  
  // Check if click is outside broker dropdown
  if (showBrokerDropdown.value) {
    const brokerDropdown = target.closest('[data-dropdown="broker"]')
    if (!brokerDropdown) {
      showBrokerDropdown.value = false
    }
  }

  // Check if click is outside instrument type dropdown
  if (showInstrumentTypeDropdown.value) {
    const instrumentTypeDropdown = target.closest('[data-dropdown="instrumentType"]')
    if (!instrumentTypeDropdown) {
      showInstrumentTypeDropdown.value = false
    }
  }

  // Check if click is outside option type dropdown
  if (showOptionTypeDropdown.value) {
    const optionTypeDropdown = target.closest('[data-dropdown="optionType"]')
    if (!optionTypeDropdown) {
      showOptionTypeDropdown.value = false
    }
  }

  // Check if click is outside quality grade dropdown
  if (showQualityGradeDropdown.value) {
    const qualityGradeDropdown = target.closest('[data-dropdown="qualityGrade"]')
    if (!qualityGradeDropdown) {
      showQualityGradeDropdown.value = false
    }
  }
}

// Watch for global account filter changes and re-apply filters
watch(selectedAccount, () => {
  console.log('[TradeFilters] Global account filter changed to:', selectedAccount.value || 'All Accounts')
  applyFilters()
})

onMounted(() => {
  // Add click outside listener after a small delay to avoid conflicts
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside)
  }, 100)

  // Fetch available sectors and brokers for dropdowns
  fetchAvailableSectors()
  fetchAvailableBrokers()

  // Debug: Check what we have after initialization
  console.log('[TradeFilters] onMounted - selectedPeriod:', selectedPeriod.value)
  console.log('[TradeFilters] onMounted - filters.value.startDate:', filters.value.startDate)
  console.log('[TradeFilters] onMounted - filters.value.endDate:', filters.value.endDate)
  console.log('[TradeFilters] onMounted - full filters.value:', JSON.stringify(filters.value))
  
  // CRITICAL FIX: If period is 'custom' but dates are missing, restore them from localStorage
  if (selectedPeriod.value === 'custom' && (!filters.value.startDate || !filters.value.endDate)) {
    console.log('[TradeFilters] Period is custom but dates missing - attempting to restore')
    try {
      const savedFilters = localStorage.getItem('tradeFilters')
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters)
        if (parsed.startDate) {
          filters.value.startDate = parsed.startDate
          console.log('[TradeFilters] Restored startDate from localStorage:', parsed.startDate)
        }
        if (parsed.endDate) {
          filters.value.endDate = parsed.endDate
          console.log('[TradeFilters] Restored endDate from localStorage:', parsed.endDate)
        }
      }
    } catch (e) {
      console.error('[TradeFilters] Failed to restore dates on mount:', e)
    }
  }

  // Filters and period are already loaded from localStorage during initialization
  // Now we just need to handle query params and store overrides
  let shouldApply = false

  // Check if we have saved filters or custom dates (already loaded at init)
  const hasFilters = Object.keys(filters.value).some(key => {
    const value = filters.value[key]
    if (Array.isArray(value)) return value.length > 0
    return value !== '' && value !== null && value !== undefined
  })
  if (hasFilters) {
    shouldApply = true
  }

  // Override with store filters if they exist
  if (tradesStore.filters) {
    const storeFilters = { ...tradesStore.filters }
    // Convert comma-separated strings back to arrays for multi-select fields
    if (storeFilters.strategies && typeof storeFilters.strategies === 'string') {
      storeFilters.strategies = storeFilters.strategies.split(',').filter(Boolean)
    }
    if (storeFilters.sectors && typeof storeFilters.sectors === 'string') {
      storeFilters.sectors = storeFilters.sectors.split(',').filter(Boolean)
    }
    if (storeFilters.tags && typeof storeFilters.tags === 'string') {
      storeFilters.tags = storeFilters.tags.split(',').filter(Boolean)
    }
    if (storeFilters.brokers && typeof storeFilters.brokers === 'string') {
      storeFilters.brokers = storeFilters.brokers.split(',').filter(Boolean)
    }
    if (storeFilters.daysOfWeek && typeof storeFilters.daysOfWeek === 'string') {
      storeFilters.daysOfWeek = storeFilters.daysOfWeek.split(',').filter(Boolean)
    }
    if (storeFilters.instrumentTypes && typeof storeFilters.instrumentTypes === 'string') {
      storeFilters.instrumentTypes = storeFilters.instrumentTypes.split(',').filter(Boolean)
    }
    if (storeFilters.optionTypes && typeof storeFilters.optionTypes === 'string') {
      storeFilters.optionTypes = storeFilters.optionTypes.split(',').filter(Boolean)
    }
    if (storeFilters.qualityGrades && typeof storeFilters.qualityGrades === 'string') {
      storeFilters.qualityGrades = storeFilters.qualityGrades.split(',').filter(Boolean)
    }

    // IMPORTANT: Preserve dates if period is custom - don't let store filters overwrite them
    const savedStartDate = filters.value.startDate
    const savedEndDate = filters.value.endDate
    filters.value = { ...filters.value, ...storeFilters }
    // Restore dates if period is custom
    if (selectedPeriod.value === 'custom') {
      if (savedStartDate) filters.value.startDate = savedStartDate
      if (savedEndDate) filters.value.endDate = savedEndDate
    }
  }

  // Then set only the filters from query parameters
  if (route.query.symbol) {
    filters.value.symbol = route.query.symbol
    shouldApply = true
  }
  
  if (route.query.sector) {
    filters.value.sector = route.query.sector
    shouldApply = true
  }
  
  if (route.query.status) {
    filters.value.status = route.query.status
    shouldApply = true
  }
  
  // Only override dates from query params if they exist AND period is custom
  // Otherwise, preserve loaded dates when period is custom
  if (route.query.startDate) {
    filters.value.startDate = route.query.startDate
    shouldApply = true
  } else if (selectedPeriod.value === 'custom' && filters.value.startDate) {
    // Preserve loaded startDate when period is custom and no query param
    console.log('[TradeFilters] Preserving loaded startDate:', filters.value.startDate)
  }
  
  if (route.query.endDate) {
    filters.value.endDate = route.query.endDate
    shouldApply = true
  } else if (selectedPeriod.value === 'custom' && filters.value.endDate) {
    // Preserve loaded endDate when period is custom and no query param
    console.log('[TradeFilters] Preserving loaded endDate:', filters.value.endDate)
  }
  
  if (route.query.pnlType) {
    filters.value.pnlType = route.query.pnlType
    shouldApply = true
  }
  
  if (route.query.minPrice) {
    filters.value.minPrice = parseFloat(route.query.minPrice)
    shouldApply = true
  }
  
  if (route.query.maxPrice) {
    filters.value.maxPrice = parseFloat(route.query.maxPrice)
    shouldApply = true
  }
  
  if (route.query.minQuantity) {
    filters.value.minQuantity = parseInt(route.query.minQuantity)
    shouldApply = true
  }
  
  if (route.query.maxQuantity) {
    filters.value.maxQuantity = parseInt(route.query.maxQuantity)
    shouldApply = true
  }
  
  if (route.query.holdTime) {
    filters.value.holdTime = route.query.holdTime
    shouldApply = true
  }
  
  if (route.query.broker) {
    filters.value.broker = route.query.broker
    // Also populate the brokers array for consistency
    filters.value.brokers = [route.query.broker]
    shouldApply = true
  }
  
  // Handle multi-select brokers from query parameters
  if (route.query.brokers) {
    filters.value.brokers = route.query.brokers.split(',')
    shouldApply = true
  }
  
  // Handle strategy from query parameters 
  if (route.query.strategy) {
    filters.value.strategy = route.query.strategy
    // Also populate the strategies array for consistency
    filters.value.strategies = [route.query.strategy]
    shouldApply = true
  }
  
  // Handle multi-select strategies from query parameters
  if (route.query.strategies) {
    filters.value.strategies = route.query.strategies.split(',')
    shouldApply = true
  }
  
  // Handle multi-select sectors from query parameters
  if (route.query.sectors) {
    filters.value.sectors = route.query.sectors.split(',')
    shouldApply = true
  }
  
  // Convert minHoldTime/maxHoldTime to holdTime range
  if (route.query.minHoldTime || route.query.maxHoldTime) {
    const minTime = parseInt(route.query.minHoldTime) || 0
    const maxTime = parseInt(route.query.maxHoldTime) || Infinity
    const holdTimeRange = convertHoldTimeRange(minTime, maxTime)
    
    if (holdTimeRange) {
      filters.value.holdTime = holdTimeRange
      shouldApply = true
    }
  }
  
  // Handle multi-select days of week from query parameters
  if (route.query.daysOfWeek) {
    filters.value.daysOfWeek = route.query.daysOfWeek.split(',').map(d => parseInt(d))
    shouldApply = true
  }

  // Handle instrument types from query parameters
  if (route.query.instrumentTypes) {
    filters.value.instrumentTypes = route.query.instrumentTypes.split(',')
    shouldApply = true
  }

  // Handle option types from query parameters
  if (route.query.optionTypes) {
    filters.value.optionTypes = route.query.optionTypes.split(',')
    shouldApply = true
  }

  // Handle quality grades from query parameters
  if (route.query.qualityGrades) {
    filters.value.qualityGrades = route.query.qualityGrades.split(',')
    shouldApply = true
  }

  // Auto-expand advanced filters if any advanced filter is set
  if (route.query.minPrice || route.query.maxPrice || route.query.minQuantity || route.query.maxQuantity || route.query.holdTime || route.query.broker || route.query.minHoldTime || route.query.maxHoldTime || route.query.daysOfWeek || route.query.instrumentTypes || route.query.optionTypes || route.query.qualityGrades) {
    showAdvanced.value = true
  }
  
  // Auto-apply the filter when coming from dashboard/other pages
  if (shouldApply) {
    applyFilters()
  }
})


onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>