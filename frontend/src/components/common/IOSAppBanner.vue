<template>
  <Transition
    enter-active-class="transition ease-out duration-300"
    enter-from-class="translate-y-3 opacity-0 sm:translate-y-0 sm:translate-x-3"
    enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="translate-y-0 opacity-100 sm:translate-x-0"
    leave-to-class="translate-y-3 opacity-0 sm:translate-y-0 sm:translate-x-3"
  >
    <div
      v-if="showBanner"
      class="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:right-5 sm:bottom-5"
      role="status"
      aria-live="polite"
    >
      <div class="max-w-md rounded-lg border border-gray-200 bg-white p-3 shadow-xl shadow-gray-900/10 ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/30">
        <div class="flex items-start gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-gray-900 shadow-sm dark:bg-white">
            <img
              src="/apple-touch-icon.png"
              alt=""
              class="h-9 w-9 rounded-lg"
            />
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold leading-5 text-gray-950 dark:text-white">
              TradeTally for iPhone
            </p>
            <p class="mt-0.5 text-xs leading-5 text-gray-600 dark:text-gray-300">
              Track trades, review setups, and check your journal from the iOS app.
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <a
                :href="APP_STORE_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              >
                View on App Store
                <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <button
                type="button"
                @click="dismiss"
                class="min-h-9 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                Not now
              </button>
            </div>
          </div>

          <button
            type="button"
            @click="dismiss"
            class="-mr-1 -mt-1 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            aria-label="Dismiss iOS app notice"
          >
            <XMarkIcon class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ArrowTopRightOnSquareIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const APP_STORE_URL = 'https://apps.apple.com/us/app/tradetally/id6748022992'
const DISMISS_KEY = 'ios_app_banner_dismissed_at'
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000
const SHOW_DELAY_MS = 1600

const dismissed = ref(false)
const canShowOnPlatform = ref(false)
const readyToShow = ref(false)

function shouldSuppressForNativeSmartBanner() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  if (!isIOS) return false

  // In production iOS Safari shows the native Smart App Banner via <meta apple-itunes-app>.
  // In dev that native banner does not fire reliably, so keep the custom banner testable.
  if (import.meta.env.DEV) return false
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return isSafari
}

function wasRecentlyDismissed() {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY))
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < SNOOZE_MS
  } catch (e) {
    return false
  }
}

const showBanner = computed(() => {
  if (dismissed.value) return false
  if (!canShowOnPlatform.value) return false
  return readyToShow.value
})

function dismiss() {
  dismissed.value = true
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch (e) {
    // ignore storage failures
  }
}

onMounted(() => {
  if (wasRecentlyDismissed()) {
    dismissed.value = true
    return
  }

  canShowOnPlatform.value = !shouldSuppressForNativeSmartBanner()
  window.setTimeout(() => {
    readyToShow.value = true
  }, SHOW_DELAY_MS)
})
</script>
