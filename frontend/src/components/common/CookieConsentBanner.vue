<template>
  <Transition
    enter-active-class="transition ease-out duration-300"
    enter-from-class="translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-full opacity-0"
  >
    <div
      v-if="showBanner"
      class="fixed bottom-0 inset-x-0 z-50 p-4"
    >
      <div class="max-w-4xl mx-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p class="text-sm text-gray-700 dark:text-gray-300 flex-1">
          We use cookies for analytics and session recordings to improve your experience.
          <router-link to="/privacy" class="text-primary-600 dark:text-primary-400 hover:underline ml-1">
            Privacy Policy
          </router-link>
        </p>
        <div class="flex items-center gap-3 shrink-0">
          <button
            @click="decline"
            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
          >
            Decline
          </button>
          <button
            @click="accept"
            class="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRegistrationMode } from '@/composables/useRegistrationMode'
import { useAnalytics } from '@/composables/useAnalytics'

const { isBillingEnabled } = useRegistrationMode()
const analytics = useAnalytics()

const showBanner = ref(false)

onMounted(() => {
  const consent = localStorage.getItem('cookie_consent')
  if (isBillingEnabled.value && !consent) {
    showBanner.value = true
  }
})

function accept() {
  localStorage.setItem('cookie_consent', 'accepted')
  analytics.optIn()
  showBanner.value = false
}

function decline() {
  localStorage.setItem('cookie_consent', 'declined')
  analytics.optOut()
  showBanner.value = false
}
</script>
