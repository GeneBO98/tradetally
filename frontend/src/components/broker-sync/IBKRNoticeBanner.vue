<template>
  <transition
    enter-active-class="transition ease-out duration-300"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="!dismissed"
      class="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg"
    >
      <div class="flex items-start gap-3">
        <ExclamationTriangleIcon class="h-5 w-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Action Required: IBKR Flex Token &amp; Query Regeneration
          </p>
          <p class="mt-1 text-sm text-amber-700 dark:text-amber-400">
            Due to changes on Interactive Brokers' side, your existing Flex Token and Flex Query may no longer work.
            If your IBKR broker sync is failing, please log in to the
            <a
              href="https://www.interactivebrokers.com/en/trading/flex-queries.php"
              target="_blank"
              rel="noopener noreferrer"
              class="underline hover:no-underline font-medium"
            >IBKR Client Portal</a>,
            regenerate your Flex Token and Flex Query, then update your connection settings with the new credentials.
          </p>
        </div>
        <button
          @click="dismiss"
          class="text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-200 flex-shrink-0"
          aria-label="Dismiss notice"
        >
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const DISMISS_KEY = 'ibkrNoticeBannerDismissed_v1'

const dismissed = ref(false)

function dismiss() {
  dismissed.value = true
  localStorage.setItem(DISMISS_KEY, '1')
}

onMounted(() => {
  dismissed.value = !!localStorage.getItem(DISMISS_KEY)
})
</script>
