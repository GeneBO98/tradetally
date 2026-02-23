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
      class="bg-amber-500 text-white"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center space-x-2">
            <ExclamationTriangleIcon class="h-5 w-5 flex-shrink-0" />
            <span class="text-sm font-medium">
              Please verify your email address. Check your inbox or
              <button
                @click="handleResend"
                :disabled="resendLoading || resendCooldown > 0"
                class="underline hover:no-underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span v-if="resendLoading">sending...</span>
                <span v-else-if="resendCooldown > 0">resend in {{ resendCooldown }}s</span>
                <span v-else>resend verification email</span>
              </button>
            </span>
          </div>
          <button
            v-if="canDismiss"
            @click="dismiss"
            class="text-sm text-white/80 hover:text-white"
            aria-label="Dismiss verification reminder"
          >
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const authStore = useAuthStore()
const { showSuccess, showError } = useNotification()

const dismissed = ref(false)
const resendLoading = ref(false)
const resendCooldown = ref(0)

const GRACE_PERIOD_DAYS = 7
const DISMISS_KEY = 'emailVerificationBannerDismissed'

const isUnverified = computed(() => {
  return authStore.isAuthenticated && authStore.user && authStore.user.is_verified === false
})

const gracePeriodExpired = computed(() => {
  if (!authStore.user?.created_at) return false
  const createdAt = new Date(authStore.user.created_at)
  const now = new Date()
  const diffMs = now - createdAt
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays >= GRACE_PERIOD_DAYS
})

const canDismiss = computed(() => {
  return !gracePeriodExpired.value
})

const showBanner = computed(() => {
  if (!isUnverified.value) return false
  if (gracePeriodExpired.value) return true
  return !dismissed.value
})

function dismiss() {
  dismissed.value = true
  localStorage.setItem(DISMISS_KEY, Date.now().toString())
}

async function handleResend() {
  if (!authStore.user?.email) return

  resendLoading.value = true
  try {
    const response = await api.post('/auth/resend-verification', {
      email: authStore.user.email
    })
    showSuccess('Success', response.data.message || 'Verification email sent successfully!')

    resendCooldown.value = 60
    const interval = setInterval(() => {
      resendCooldown.value--
      if (resendCooldown.value <= 0) {
        clearInterval(interval)
      }
    }, 1000)
  } catch (err) {
    showError('Error', err.response?.data?.error || 'Failed to resend verification email')
  } finally {
    resendLoading.value = false
  }
}

onMounted(() => {
  const dismissedAt = localStorage.getItem(DISMISS_KEY)
  if (dismissedAt) {
    const dismissedTime = parseInt(dismissedAt, 10)
    const hoursSinceDismiss = (Date.now() - dismissedTime) / (1000 * 60 * 60)
    // Re-show after 24 hours during grace period
    if (hoursSinceDismiss < 24) {
      dismissed.value = true
    } else {
      localStorage.removeItem(DISMISS_KEY)
    }
  }
})
</script>
