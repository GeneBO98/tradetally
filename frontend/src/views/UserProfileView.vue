<template>
  <div class="max-w-[65%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="error" class="text-center py-12">
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">{{ error }}</h3>
      <div class="mt-6">
        <router-link to="/public" class="btn-primary">
          Back to Public Trades
        </router-link>
      </div>
    </div>

    <div v-else class="space-y-8">
      <!-- Profile Header -->
      <div class="card">
        <div class="card-body">
          <div class="flex items-center space-x-6">
            <div class="flex-shrink-0">
              <img
                v-if="profile.avatarUrl"
                :src="profile.avatarUrl"
                :alt="profile.username"
                class="h-20 w-20 rounded-full"
              />
              <div
                v-else
                class="h-20 w-20 rounded-full bg-primary-600 flex items-center justify-center"
              >
                <span class="text-2xl font-medium text-white">
                  {{ profile.username.charAt(0).toUpperCase() }}
                </span>
              </div>
            </div>
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ profile.fullName || profile.username }}
              </h1>
              <p class="text-gray-500 dark:text-gray-400">@{{ profile.username }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Member since {{ formatDate(profile.createdAt) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Public Trades -->
      <div class="card">
        <div class="card-body">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-6">Public Trades</h2>
          
          <div v-if="tradesLoading" class="flex justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>

          <div v-else-if="trades.length === 0" class="text-center py-8">
            <DocumentTextIcon class="mx-auto h-12 w-12 text-gray-400" />
            <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No public trades</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This user hasn't shared any trades publicly yet.
            </p>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="trade in trades"
              :key="trade.id"
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center space-x-3">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                      {{ trade.symbol }}
                    </h3>
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      :class="[
                        trade.side === 'long' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      ]">
                      {{ trade.side }}
                    </span>
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      :class="[
                        trade.exit_price 
                          ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                      ]">
                      {{ trade.exit_price ? 'Closed' : 'Open' }}
                    </span>
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {{ formatDate(trade.trade_date) }}
                  </p>
                </div>
                
                <div class="text-right">
                  <div class="text-lg font-semibold" :class="[
                    trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  ]">
                    {{ trade.pnl ? `$${formatNumber(trade.pnl)}` : 'Open' }}
                  </div>
                  <div v-if="trade.pnl_percent" class="text-sm text-gray-500 dark:text-gray-400">
                    {{ trade.pnl_percent > 0 ? '+' : '' }}{{ formatNumber(trade.pnl_percent) }}%
                  </div>
                </div>
              </div>

              <div class="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Entry:</span>
                  <span class="ml-1 font-medium text-gray-900 dark:text-white">
                    ${{ formatNumber(trade.entry_price) }}
                  </span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Exit:</span>
                  <span class="ml-1 font-medium text-gray-900 dark:text-white">
                    {{ trade.exit_price ? `$${formatNumber(trade.exit_price)}` : 'Open' }}
                  </span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Qty:</span>
                  <span class="ml-1 font-medium text-gray-900 dark:text-white">
                    {{ formatNumber(trade.quantity, 0) }}
                  </span>
                </div>
              </div>

              <div v-if="trade.tags && trade.tags.length > 0" class="mt-3">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="tag in trade.tags"
                    :key="tag"
                    class="px-2 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 text-xs rounded-full"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>

              <div v-if="trade.notes" class="mt-3">
                <p class="text-sm text-gray-700 dark:text-gray-300">
                  {{ trade.notes }}
                </p>
              </div>

              <div class="mt-3 flex justify-end">
                <router-link
                  :to="`/trades/${trade.id}`"
                  class="text-primary-600 hover:text-primary-500 text-sm font-medium"
                >
                  View Details
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { format } from 'date-fns'
import { DocumentTextIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const route = useRoute()
const loading = ref(true)
const tradesLoading = ref(false)
const error = ref(null)
const profile = ref(null)
const trades = ref([])

function formatNumber(num, decimals = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num || 0)
}

function formatDate(date) {
  return format(new Date(date), 'MMM dd, yyyy')
}

async function fetchProfile() {
  try {
    const response = await api.get(`/users/${route.params.username}`)
    profile.value = response.data.user
  } catch (err) {
    if (err.response?.status === 404) {
      error.value = 'User not found'
    } else if (err.response?.status === 403) {
      error.value = 'This profile is private'
    } else {
      error.value = 'Failed to load profile'
    }
  }
}

async function fetchTrades() {
  tradesLoading.value = true
  
  try {
    const response = await api.get(`/users/${route.params.username}/trades`)
    trades.value = response.data.trades
  } catch (err) {
    console.error('Failed to fetch user trades:', err)
  } finally {
    tradesLoading.value = false
  }
}

async function loadData() {
  loading.value = true
  
  await fetchProfile()
  
  if (profile.value) {
    await fetchTrades()
  }
  
  loading.value = false
}

onMounted(() => {
  loadData()
})
</script>