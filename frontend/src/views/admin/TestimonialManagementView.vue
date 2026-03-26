<template>
  <div class="content-wrapper py-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 class="heading-page">Testimonial Management</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {{ testimonials.length }} total &middot; {{ approvedCount }} approved &middot; {{ pendingCount }} pending
        </p>
      </div>
      <div class="flex gap-2">
        <select v-model="filterStatus" class="input text-sm">
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error && !testimonials.length" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
      <p class="text-sm text-red-800 dark:text-red-400">{{ error }}</p>
    </div>

    <template v-else>
      <!-- Refresh indicator -->
      <div v-if="loading" class="flex justify-end mb-2">
        <div class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
          <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="filteredTestimonials.length === 0" class="card p-8 text-center">
        <p class="text-gray-500 dark:text-gray-400">No testimonials {{ filterStatus !== 'all' ? 'matching filter' : 'yet' }}.</p>
      </div>

      <!-- Testimonial cards -->
      <div v-else class="space-y-4">
        <div
          v-for="t in filteredTestimonials"
          :key="t.id"
          class="card p-5"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <!-- Header: user info + rating -->
              <div class="flex items-center gap-3 mb-2">
                <div>
                  <span class="font-medium text-gray-900 dark:text-white">{{ t.display_name || t.username }}</span>
                  <span class="text-sm text-gray-500 dark:text-gray-400 ml-2">{{ t.email }}</span>
                </div>
                <span
                  :class="t.approved
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'"
                  class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                >
                  {{ t.approved ? 'Approved' : 'Pending' }}
                </span>
              </div>

              <!-- Stars -->
              <div class="flex gap-0.5 mb-2">
                <StarIcon
                  v-for="star in 5"
                  :key="star"
                  class="h-4 w-4"
                  :class="star <= t.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'"
                />
              </div>

              <!-- Body -->
              <p class="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-line">{{ t.body }}</p>

              <!-- Meta -->
              <p class="mt-2 text-xs text-gray-400">
                Submitted {{ formatDate(t.created_at) }}
                <span v-if="t.approved_at"> &middot; Approved {{ formatDate(t.approved_at) }}</span>
              </p>
            </div>

            <!-- Actions -->
            <div class="flex flex-col gap-2 flex-shrink-0">
              <button
                v-if="!t.approved"
                @click="approve(t)"
                :disabled="t._loading"
                class="btn-primary text-xs px-3 py-1.5"
              >
                Approve
              </button>
              <button
                v-if="t.approved"
                @click="reject(t)"
                :disabled="t._loading"
                class="btn-secondary text-xs px-3 py-1.5"
              >
                Reject
              </button>
              <button
                @click="remove(t)"
                :disabled="t._loading"
                class="text-xs px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { StarIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const testimonials = ref([])
const loading = ref(true)
const initialLoading = ref(true)
const error = ref('')
const filterStatus = ref('all')

const approvedCount = computed(() => testimonials.value.filter(t => t.approved).length)
const pendingCount = computed(() => testimonials.value.filter(t => !t.approved).length)

const filteredTestimonials = computed(() => {
  if (filterStatus.value === 'approved') return testimonials.value.filter(t => t.approved)
  if (filterStatus.value === 'pending') return testimonials.value.filter(t => !t.approved)
  return testimonials.value
})

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function fetchTestimonials() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get('/testimonials/admin')
    testimonials.value = data
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load testimonials'
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

async function approve(t) {
  t._loading = true
  try {
    await api.patch(`/testimonials/admin/${t.id}/approve`)
    t.approved = true
    t.approved_at = new Date().toISOString()
  } catch (err) {
    console.error('[TESTIMONIALS] Approve failed:', err)
  } finally {
    t._loading = false
  }
}

async function reject(t) {
  t._loading = true
  try {
    await api.patch(`/testimonials/admin/${t.id}/reject`)
    t.approved = false
    t.approved_at = null
  } catch (err) {
    console.error('[TESTIMONIALS] Reject failed:', err)
  } finally {
    t._loading = false
  }
}

async function remove(t) {
  if (!confirm('Delete this testimonial permanently?')) return
  t._loading = true
  try {
    await api.delete(`/testimonials/admin/${t.id}`)
    testimonials.value = testimonials.value.filter(item => item.id !== t.id)
  } catch (err) {
    console.error('[TESTIMONIALS] Delete failed:', err)
  } finally {
    t._loading = false
  }
}

onMounted(fetchTestimonials)
</script>
