<template>
  <div class="content-wrapper py-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Referral Management</h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        Manage creator referral codes and track conversions
      </p>
    </div>

    <!-- Analytics Summary -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <p class="text-sm text-gray-500 dark:text-gray-400">Active Codes</p>
        <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ analytics?.totals?.active_codes || 0 }}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <p class="text-sm text-gray-500 dark:text-gray-400">Total Visits</p>
        <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ analytics?.totals?.visits || 0 }}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <p class="text-sm text-gray-500 dark:text-gray-400">Signups</p>
        <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ analytics?.totals?.signups || 0 }}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <p class="text-sm text-gray-500 dark:text-gray-400">Subscriptions</p>
        <p class="text-2xl font-bold text-primary-600 dark:text-primary-400 font-bold">{{ analytics?.totals?.subscriptions || 0 }}</p>
      </div>
    </div>

    <!-- Create New Code Button -->
    <div class="mb-6 flex justify-between items-center">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Referral Codes</h2>
      <button
        @click="showCreateModal = true"
        class="btn-primary"
      >
        Create New Code
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <!-- Referral Codes Table -->
    <div v-else class="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creator</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Discount</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Visits</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Signups</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Subs</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          <tr v-for="code in referralCodes" :key="code.id">
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900 dark:text-white">{{ code.creator_name }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">{{ code.contact_email || 'No email' }}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-mono text-gray-900 dark:text-white">{{ code.code }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">/r/{{ code.slug }}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
              {{ code.discount_percent }}%
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
              {{ code.visit_count || 0 }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
              {{ code.signup_count || 0 }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
              {{ code.subscription_count || 0 }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span
                :class="code.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'"
                class="px-2 py-1 text-xs font-medium rounded-full"
              >
                {{ code.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <button
                @click="copyLink(code)"
                class="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 mr-3"
                title="Copy link"
              >
                Copy Link
              </button>
              <button
                @click="viewDetails(code)"
                class="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300 mr-3"
                title="View details"
              >
                Details
              </button>
              <button
                v-if="code.is_active"
                @click="deactivateCode(code)"
                class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                title="Deactivate"
              >
                Deactivate
              </button>
            </td>
          </tr>
          <tr v-if="referralCodes.length === 0">
            <td colspan="8" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
              No referral codes yet. Create your first one above.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Referral Code</h3>

        <form @submit.prevent="createCode" class="space-y-4">
          <div>
            <label class="label">Creator Name *</label>
            <input
              v-model="newCode.creator_name"
              type="text"
              class="input"
              placeholder="e.g., John Smith"
              required
            />
          </div>

          <div>
            <label class="label">Promo Code</label>
            <input
              v-model="newCode.code"
              type="text"
              class="input font-mono uppercase"
              placeholder="Auto-generated if empty"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave blank to auto-generate</p>
          </div>

          <div>
            <label class="label">URL Slug</label>
            <div class="flex items-center">
              <span class="text-gray-500 dark:text-gray-400 mr-1">/r/</span>
              <input
                v-model="newCode.slug"
                type="text"
                class="input flex-1 lowercase"
                placeholder="Auto-generated if empty"
              />
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave blank to auto-generate from name</p>
          </div>

          <div>
            <label class="label">Discount Percent *</label>
            <input
              v-model.number="newCode.discount_percent"
              type="number"
              min="1"
              max="100"
              class="input"
              placeholder="e.g., 20"
              required
            />
          </div>

          <div>
            <label class="label">Contact Email</label>
            <input
              v-model="newCode.contact_email"
              type="email"
              class="input"
              placeholder="creator@example.com"
            />
          </div>

          <div>
            <label class="label">Notes</label>
            <textarea
              v-model="newCode.notes"
              class="input"
              rows="2"
              placeholder="Internal notes..."
            ></textarea>
          </div>

          <div v-if="createError" class="text-red-600 dark:text-red-400 text-sm">
            {{ createError }}
          </div>

          <div class="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              @click="showCreateModal = false"
              class="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="creating"
              class="btn-primary"
            >
              {{ creating ? 'Creating...' : 'Create Code' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Details Modal -->
    <div v-if="showDetailsModal && selectedCode" class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ selectedCode.creator_name }}</h3>
          <button @click="showDetailsModal = false" class="text-gray-400 hover:text-gray-500">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Promo Code</p>
            <p class="font-mono font-bold text-gray-900 dark:text-white">{{ selectedCode.code }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Referral Link</p>
            <p class="font-mono text-primary-600 dark:text-primary-400">tradetally.io/r/{{ selectedCode.slug }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Discount</p>
            <p class="font-bold text-gray-900 dark:text-white">{{ selectedCode.discount_percent }}% off</p>
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">Status</p>
            <span
              :class="selectedCode.is_active ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
              class="font-medium"
            >
              {{ selectedCode.is_active ? 'Active' : 'Inactive' }}
            </span>
          </div>
        </div>

        <div v-if="codeAnalytics" class="mb-6">
          <h4 class="font-medium text-gray-900 dark:text-white mb-3">Performance</h4>
          <div class="grid grid-cols-3 gap-4">
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p class="text-sm text-gray-500 dark:text-gray-400">Visits</p>
              <p class="text-xl font-bold text-gray-900 dark:text-white">{{ codeAnalytics.totals?.visits || 0 }}</p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p class="text-sm text-gray-500 dark:text-gray-400">Signups</p>
              <p class="text-xl font-bold text-gray-900 dark:text-white">{{ codeAnalytics.totals?.signups || 0 }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ codeAnalytics.totals?.visit_to_signup_rate || 0 }}% conversion</p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p class="text-sm text-gray-500 dark:text-gray-400">Subscriptions</p>
              <p class="text-xl font-bold text-primary-600 dark:text-primary-400">{{ codeAnalytics.totals?.subscriptions || 0 }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ codeAnalytics.totals?.signup_to_subscription_rate || 0 }}% of signups</p>
            </div>
          </div>
        </div>

        <div v-if="selectedCode.notes" class="mb-6">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">Notes</h4>
          <p class="text-gray-600 dark:text-gray-400 text-sm">{{ selectedCode.notes }}</p>
        </div>

        <div class="flex justify-end">
          <button @click="showDetailsModal = false" class="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useNotification } from '@/composables/useNotification'

const { showSuccess, showError } = useNotification()

const loading = ref(true)
const referralCodes = ref([])
const analytics = ref(null)

const showCreateModal = ref(false)
const showDetailsModal = ref(false)
const selectedCode = ref(null)
const codeAnalytics = ref(null)

const creating = ref(false)
const createError = ref(null)

const newCode = ref({
  creator_name: '',
  code: '',
  slug: '',
  discount_percent: 20,
  contact_email: '',
  notes: ''
})

async function fetchData() {
  loading.value = true
  try {
    const [codesRes, analyticsRes] = await Promise.all([
      api.get('/referral/admin'),
      api.get('/referral/admin/analytics')
    ])
    referralCodes.value = codesRes.data.referral_codes || []
    analytics.value = analyticsRes.data.analytics || {}
  } catch (error) {
    console.error('Error fetching referral data:', error)
    showError('Error', 'Failed to load referral data')
  } finally {
    loading.value = false
  }
}

async function createCode() {
  creating.value = true
  createError.value = null

  try {
    const payload = {
      creator_name: newCode.value.creator_name,
      discount_percent: newCode.value.discount_percent
    }

    if (newCode.value.code) payload.code = newCode.value.code.toUpperCase()
    if (newCode.value.slug) payload.slug = newCode.value.slug.toLowerCase()
    if (newCode.value.contact_email) payload.contact_email = newCode.value.contact_email
    if (newCode.value.notes) payload.notes = newCode.value.notes

    await api.post('/referral/admin', payload)
    showSuccess('Success', 'Referral code created successfully')
    showCreateModal.value = false
    resetNewCode()
    await fetchData()
  } catch (error) {
    console.error('Error creating referral code:', error)
    createError.value = error.response?.data?.error || 'Failed to create referral code'
  } finally {
    creating.value = false
  }
}

async function viewDetails(code) {
  selectedCode.value = code
  showDetailsModal.value = true

  try {
    const response = await api.get(`/referral/admin/${code.id}`)
    codeAnalytics.value = response.data.analytics
  } catch (error) {
    console.error('Error fetching code details:', error)
  }
}

async function deactivateCode(code) {
  if (!confirm(`Are you sure you want to deactivate the code "${code.code}"?`)) {
    return
  }

  try {
    await api.delete(`/referral/admin/${code.id}`)
    showSuccess('Success', 'Referral code deactivated')
    await fetchData()
  } catch (error) {
    console.error('Error deactivating code:', error)
    showError('Error', 'Failed to deactivate referral code')
  }
}

function copyLink(code) {
  const url = `https://tradetally.io/r/${code.slug}`
  navigator.clipboard.writeText(url)
  showSuccess('Copied', 'Referral link copied to clipboard')
}

function resetNewCode() {
  newCode.value = {
    creator_name: '',
    code: '',
    slug: '',
    discount_percent: 20,
    contact_email: '',
    notes: ''
  }
}

onMounted(() => {
  fetchData()
})
</script>
