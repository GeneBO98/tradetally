<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Notification Preferences</h3>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Choose what types of notifications you want to receive
          </p>
        </div>
        <MdiIcon :icon="bellIcon" :size="24" class="text-gray-400" />
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-8">
        <MdiIcon :icon="alertIcon" :size="48" class="mx-auto text-red-500 mb-4" />
        <p class="text-red-600 dark:text-red-400 mb-4">{{ error }}</p>
        <button
          @click="fetchPreferences"
          class="btn-primary"
        >
          Try Again
        </button>
      </div>

      <!-- Preferences Form -->
      <div v-else class="space-y-10">
        <!-- Trading Notifications -->
        <section>
          <div class="bg-gray-100 dark:bg-gray-800/60 px-4 py-2.5 rounded-md mb-2">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
              Trading Notifications
            </h4>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-gray-800 pl-4">
            <div class="flex items-center justify-between py-4 px-2 -mx-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div class="flex-1 pr-6">
                <label class="text-sm font-medium text-gray-900 dark:text-gray-100 block">
                  News on Open Positions
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  Get notified when news breaks for stocks you currently have open positions in
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  v-model="preferences.notify_news_open_positions"
                  @change="updatePreference('notify_news_open_positions')"
                  class="sr-only peer"
                  :disabled="updating"
                />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div class="flex items-center justify-between py-4 px-2 -mx-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div class="flex-1 pr-6">
                <label class="text-sm font-medium text-gray-900 dark:text-gray-100 block">
                  Earnings Announcements
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  Receive notifications about upcoming earnings announcements for your watchlist
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  v-model="preferences.notify_earnings_announcements"
                  @change="updatePreference('notify_earnings_announcements')"
                  class="sr-only peer"
                  :disabled="updating"
                />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>

            <div class="flex items-center justify-between py-4 px-2 -mx-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div class="flex-1 pr-6">
                <label class="text-sm font-medium text-gray-900 dark:text-gray-100 block">
                  Trade Reminders
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  Receive behavioral analytics alerts for patterns like revenge trading and overconfidence warnings
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  v-model="preferences.notify_trade_reminders"
                  @change="updatePreference('notify_trade_reminders')"
                  class="sr-only peer"
                  :disabled="updating"
                />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>
        </section>

        <!-- Alert Notifications -->
        <section>
          <div class="bg-gray-100 dark:bg-gray-800/60 px-4 py-2.5 rounded-md mb-2">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
              Alert Notifications
            </h4>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-gray-800 pl-4">
            <div class="flex items-center justify-between py-4 px-2 -mx-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div class="flex-1 pr-6">
                <label class="text-sm font-medium text-gray-900 dark:text-gray-100 block">
                  Price Alerts
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  Receive notifications when your price alerts and watchlist triggers are activated
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  v-model="preferences.notify_price_alerts"
                  @change="updatePreference('notify_price_alerts')"
                  class="sr-only peer"
                  :disabled="updating"
                />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>
        </section>

        <!-- Email Preferences -->
        <section>
          <div class="bg-gray-100 dark:bg-gray-800/60 px-4 py-2.5 rounded-md mb-2">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
              Email Preferences
            </h4>
          </div>
          <div class="divide-y divide-gray-100 dark:divide-gray-800 pl-4">
            <div class="flex items-center justify-between py-4 px-2 -mx-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div class="flex-1 pr-6">
                <label class="text-sm font-medium text-gray-900 dark:text-gray-100 block">
                  Marketing Emails
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  Receive weekly trading summaries, product tips, trial reminders, review requests, and re-engagement emails
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  v-model="preferences.marketing_consent"
                  @change="updatePreference('marketing_consent')"
                  class="sr-only peer"
                  :disabled="updating"
                />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>
        </section>


        <!-- Update Status -->
        <div v-if="updateStatus" class="mt-4">
          <div 
            class="p-3 rounded-md text-sm"
            :class="{
              'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400': updateStatus.type === 'success',
              'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400': updateStatus.type === 'error'
            }"
          >
            <div class="flex items-center">
              <MdiIcon 
                :icon="updateStatus.type === 'success' ? checkIcon : alertIcon" 
                :size="16" 
                class="mr-2" 
              />
              {{ updateStatus.message }}
            </div>
          </div>
        </div>

        <!-- Additional Info -->
        <div class="mt-6 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
          <div class="flex items-start">
            <MdiIcon :icon="infoIcon" :size="16" class="mr-2 text-primary-500 mt-0.5" />
            <div class="text-sm text-primary-800 dark:text-primary-300">
              <p class="font-medium mb-1">About Notifications</p>
              <p class="text-xs">
                Notification preferences control in-app and push notifications. Email preferences control marketing messages.
                Critical security and account emails may still be sent regardless of these settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import MdiIcon from '@/components/MdiIcon.vue'
import { mdiBell, mdiAlert, mdiCheck, mdiInformation } from '@mdi/js'
import api from '@/services/api'

// Icons
const bellIcon = mdiBell
const alertIcon = mdiAlert
const checkIcon = mdiCheck
const infoIcon = mdiInformation

// Data
const preferences = ref({
  notify_news_open_positions: true,
  notify_earnings_announcements: true,
  notify_price_alerts: true,
  notify_trade_reminders: true,
  marketing_consent: false
})

const loading = ref(false)
const updating = ref(false)
const error = ref(null)
const updateStatus = ref(null)

// Methods
async function fetchPreferences() {
  loading.value = true
  error.value = null

  try {
    const response = await api.get('/notification-preferences')
    preferences.value = response.data
  } catch (err) {
    console.error('Failed to fetch notification preferences:', err)
    error.value = err.response?.data?.error || 'Failed to load notification preferences'
  } finally {
    loading.value = false
  }
}

async function updatePreference(preferenceKey) {
  updating.value = true
  updateStatus.value = null

  // Clear any existing status after 3 seconds
  const clearStatus = () => {
    setTimeout(() => {
      updateStatus.value = null
    }, 3000)
  }

  try {
    const updateData = {
      [preferenceKey]: preferences.value[preferenceKey]
    }

    const response = await api.put('/notification-preferences', updateData)
    
    // Update local preferences with server response
    preferences.value = response.data.preferences

    updateStatus.value = {
      type: 'success',
      message: 'Notification preference updated successfully'
    }

    clearStatus()
  } catch (err) {
    console.error('Failed to update notification preference:', err)
    
    // Revert the change in UI
    preferences.value[preferenceKey] = !preferences.value[preferenceKey]
    
    updateStatus.value = {
      type: 'error',
      message: err.response?.data?.error || 'Failed to update notification preference'
    }

    clearStatus()
  } finally {
    updating.value = false
  }
}

onMounted(() => {
  fetchPreferences()
})
</script>
