<template>
  <transition
    enter-active-class="transition ease-out duration-300"
    enter-from-class="transform -translate-y-full opacity-0"
    enter-to-class="transform translate-y-0 opacity-100"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="transform translate-y-0 opacity-100"
    leave-to-class="transform -translate-y-full opacity-0"
  >
    <div
      v-if="showBanner"
      class="bg-gray-900 text-white border-b border-gray-800"
    >
      <div class="max-w-7xl mx-auto px-4 py-2.5">
        <div class="flex items-center gap-3">
          <button
            @click="dismiss"
            class="text-white/60 hover:text-white flex-shrink-0"
            aria-label="Dismiss app banner"
          >
            <XMarkIcon class="h-5 w-5" />
          </button>
          <img
            src="/apple-touch-icon.png"
            alt=""
            class="h-10 w-10 rounded-lg flex-shrink-0"
          />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold truncate">TradeTally</div>
            <div class="text-xs text-white/70 truncate">Get the iPhone app — free</div>
          </div>
          <a
            :href="APP_STORE_URL"
            class="flex-shrink-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide bg-primary-600 hover:bg-primary-700 rounded-full"
          >
            View
          </a>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import { useAuthStore } from '@/stores/auth'

const APP_STORE_URL = 'https://apps.apple.com/us/app/tradetally/id6748022992'
const DISMISS_KEY = 'ios_app_banner_dismissed'

const authStore = useAuthStore()
const dismissed = ref(false)
const isIOSNonSafari = ref(false)

function detectIOSNonSafari() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  if (!isIOS) return false
  // iOS Safari already shows the native Smart App Banner via <meta apple-itunes-app>.
  // Only show our custom banner for in-app webviews and third-party iOS browsers.
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return !isSafari
}

const showBanner = computed(() => {
  if (dismissed.value) return false
  if (!isIOSNonSafari.value) return false
  if (authStore.token) return false
  return true
})

function dismiss() {
  dismissed.value = true
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch (e) {
    // ignore storage failures
  }
}

onMounted(() => {
  try {
    if (localStorage.getItem(DISMISS_KEY) === '1') {
      dismissed.value = true
    }
  } catch (e) {
    // ignore storage failures
  }
  isIOSNonSafari.value = detectIOSNonSafari()
})
</script>
