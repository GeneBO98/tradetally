<template>
  <div class="min-h-screen bg-gray-100 dark:bg-gray-900">
    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="animate-spin rounded-full h-16 w-16 border-4 border-primary-200 border-t-primary-600"></div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex flex-col items-center justify-center min-h-screen p-8 text-center">
      <div class="text-6xl mb-4 text-gray-400">[!]</div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Unable to load Year Wrapped</h2>
      <p class="text-gray-600 dark:text-gray-400 mb-6">{{ error }}</p>
      <button @click="router.push('/dashboard')" class="btn-primary">
        Return to Dashboard
      </button>
    </div>

    <!-- No data state -->
    <div v-else-if="!yearWrappedStore.wrappedData || yearWrappedStore.wrappedData.totalTrades === 0" class="flex flex-col items-center justify-center min-h-screen p-8 text-center">
      <div class="text-6xl mb-4 text-gray-400">[~]</div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">No trading data for {{ year }}</h2>
      <p class="text-gray-600 dark:text-gray-400 mb-6">Import some trades to see your Year Wrapped!</p>
      <button @click="router.push('/trades/import')" class="btn-primary">
        Import Trades
      </button>
    </div>

    <!-- Year Wrapped Modal (auto-opens) -->
    <YearWrappedModal v-if="yearWrappedStore.wrappedData && yearWrappedStore.wrappedData.totalTrades > 0" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useYearWrappedStore } from '@/stores/yearWrapped'
import YearWrappedModal from '@/components/yearWrapped/YearWrappedModal.vue'

const route = useRoute()
const router = useRouter()
const yearWrappedStore = useYearWrappedStore()

const loading = ref(true)
const error = ref(null)
const year = ref(new Date().getFullYear())

onMounted(async () => {
  // Get year from route params or use current year
  year.value = route.params.year ? parseInt(route.params.year) : new Date().getFullYear()

  // Validate year
  if (isNaN(year.value) || year.value < 2000 || year.value > new Date().getFullYear()) {
    error.value = 'Invalid year specified'
    loading.value = false
    return
  }

  try {
    await yearWrappedStore.fetchYearWrapped(year.value)
    loading.value = false

    // Auto-open the modal if there's data
    if (yearWrappedStore.wrappedData && yearWrappedStore.wrappedData.totalTrades > 0) {
      yearWrappedStore.openModal()
    }
  } catch (err) {
    error.value = err.message || 'Failed to load Year Wrapped data'
    loading.value = false
  }
})

// Watch for modal close and redirect to dashboard
watch(() => yearWrappedStore.isModalOpen, (isOpen) => {
  if (!isOpen && yearWrappedStore.wrappedData) {
    router.push('/dashboard')
  }
})
</script>
