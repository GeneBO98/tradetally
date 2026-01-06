<template>
  <div
    v-if="yearWrappedStore.showBanner && yearWrappedStore.bannerYear"
    class="relative overflow-hidden bg-primary-600 dark:bg-primary-700 rounded-lg p-4 mb-6 shadow-lg border border-primary-500 dark:border-primary-600"
  >
    <!-- Shimmer effect overlay -->
    <div class="absolute inset-0 shimmer-effect"></div>

    <div class="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="flex-shrink-0">
          <!-- Star icon with pulse -->
          <svg class="w-10 h-10 text-primary-200 animate-pulse-subtle" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-bold text-white">
            Your {{ yearWrappedStore.bannerYear }} Trading Wrapped is Ready!
          </h3>
          <p class="text-sm text-primary-100">
            See your trading journey in a whole new way
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 w-full sm:w-auto">
        <button
          @click="handleViewWrapped"
          class="flex-1 sm:flex-none px-4 py-2 bg-white text-primary-700 font-semibold rounded-lg hover:bg-primary-50 transition-colors text-center shadow-md hover:shadow-lg"
        >
          View Wrapped
        </button>
        <button
          @click="handleDismiss"
          class="p-2 text-primary-200 hover:text-white transition-colors"
          title="Dismiss"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useYearWrappedStore } from '@/stores/yearWrapped'

const yearWrappedStore = useYearWrappedStore()

async function handleViewWrapped() {
  // Fetch the data first, then open modal
  await yearWrappedStore.fetchYearWrapped(yearWrappedStore.bannerYear)
  yearWrappedStore.openModal()
}

function handleDismiss() {
  // Session-based dismiss - just hide the banner for this session
  yearWrappedStore.dismissBannerForSession()
}
</script>

<style scoped>
/* Shimmer sweep effect */
.shimmer-effect {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.08) 20%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0.08) 80%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 3s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Subtle pulse for the star icon */
.animate-pulse-subtle {
  animation: pulse-subtle 2s ease-in-out infinite;
}

@keyframes pulse-subtle {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.05);
  }
}
</style>
