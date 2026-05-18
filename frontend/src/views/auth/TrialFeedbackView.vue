<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-2xl">
      <div class="flex items-center justify-center gap-2 sm:gap-3">
        <img src="/favicon.svg?v=2" alt="TradeTally Logo" class="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
        <span class="text-xl sm:text-2xl md:text-3xl font-bold text-primary-600 dark:text-primary-400 whitespace-nowrap" style="font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 0.05em;">TRADETALLY</span>
      </div>
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
        Quick Feedback
      </h2>
      <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
        One click is enough. Extra detail is optional.
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
      <div class="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <div v-if="loading" class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading your survey...</p>
        </div>

        <div v-else-if="error" class="text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
            <XMarkIcon class="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Invalid Link</h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {{ error }}
          </p>
          <div class="mt-6">
            <router-link to="/login" class="btn-primary w-full">
              Go to Login
            </router-link>
          </div>
        </div>

        <div v-else>
          <div class="text-center">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 dark:bg-primary-900/20">
              <ChatBubbleLeftRightIcon class="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              {{ hasActiveSubscription ? 'What almost stopped you from subscribing?' : 'What stopped you from subscribing?' }}
            </h3>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {{ hasActiveSubscription
                ? 'Looks like you already upgraded. This helps us understand what nearly blocked the decision.'
                : 'Choose the closest reason. You do not need to type anything unless you want to add context.' }}
            </p>
          </div>

          <div
            v-if="statusMessage"
            class="mt-6 rounded-lg border px-4 py-3 text-sm"
            :class="statusTone === 'success'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200'
              : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200'"
          >
            {{ statusMessage }}
          </div>

          <div class="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              v-for="option in options"
              :key="option.value"
              type="button"
              class="rounded-lg border px-4 py-3 text-left transition"
              :class="selectedReason === option.value
                ? 'border-primary-500 bg-primary-50 text-primary-900 dark:border-primary-400 dark:bg-primary-900/20 dark:text-primary-100'
                : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50/50 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:border-primary-500 dark:hover:bg-gray-900'"
              @click="selectedReason = option.value"
            >
              <div class="flex items-start gap-3">
                <span
                  class="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 rounded-full border"
                  :class="selectedReason === option.value
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-gray-300 dark:border-gray-600'"
                >
                  <span
                    v-if="selectedReason === option.value"
                    class="m-auto h-1.5 w-1.5 rounded-full bg-white"
                  ></span>
                </span>
                <span class="text-sm font-medium">{{ option.label }}</span>
              </div>
            </button>
          </div>

          <div class="mt-6">
            <label for="trial-feedback-text" class="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Anything else you want to share? Optional
            </label>
            <textarea
              id="trial-feedback-text"
              v-model="feedbackText"
              rows="5"
              maxlength="2000"
              class="input w-full"
              placeholder="What felt missing, confusing, or not worth paying for?"
            ></textarea>
          </div>

          <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              class="btn-primary"
              :disabled="saving || autoSaving || !selectedReason"
              @click="saveFeedback()"
            >
              <span v-if="saving">Saving...</span>
              <span v-else>{{ hasSavedSelection ? 'Update Feedback' : 'Save Feedback' }}</span>
            </button>
            <router-link to="/login" class="btn-secondary text-center">
              Done
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const saving = ref(false)
const autoSaving = ref(false)
const error = ref(null)
const options = ref([])
const selectedReason = ref('')
const feedbackText = ref('')
const token = ref('')
const hasActiveSubscription = ref(false)
const hasSavedSelection = ref(false)
const statusMessage = ref('')
const statusTone = ref('success')

async function saveFeedback(reasonOverride = null, isAutoSave = false) {
  const reasonToSave = reasonOverride || selectedReason.value
  if (!token.value || !reasonToSave) return

  if (isAutoSave) {
    autoSaving.value = true
  } else {
    saving.value = true
  }

  try {
    const response = await api.post('/trial-feedback', {
      token: token.value,
      primaryReason: reasonToSave,
      feedbackText: feedbackText.value || null
    })

    selectedReason.value = response.data.data.feedback?.primaryReason || reasonToSave
    feedbackText.value = response.data.data.feedback?.feedbackText || feedbackText.value
    hasSavedSelection.value = true
    statusTone.value = 'success'
    statusMessage.value = isAutoSave
      ? 'Thanks. Your answer was recorded. Add extra detail below if you want.'
      : 'Thanks. Your feedback has been saved.'

    if (isAutoSave && route.query.reason) {
      await router.replace({
        query: { token: token.value }
      })
    }
  } catch (err) {
    statusTone.value = 'info'
    statusMessage.value = err.response?.data?.message || err.response?.data?.error || 'Failed to save feedback.'
  } finally {
    autoSaving.value = false
    saving.value = false
  }
}

async function loadSurvey() {
  token.value = typeof route.query.token === 'string' ? route.query.token : ''
  const clickedReason = typeof route.query.reason === 'string' ? route.query.reason : ''

  if (!token.value) {
    error.value = 'Missing survey token. Please use the link from your email.'
    loading.value = false
    return
  }

  try {
    const response = await api.get('/trial-feedback', {
      params: { token: token.value }
    })

    const data = response.data.data
    options.value = data.options || []
    hasActiveSubscription.value = !!data.hasActiveSubscription

    if (data.feedback?.primaryReason) {
      selectedReason.value = data.feedback.primaryReason
      feedbackText.value = data.feedback.feedbackText || ''
      hasSavedSelection.value = true
    }

    const clickedReasonIsValid = options.value.some((option) => option.value === clickedReason)
    if (clickedReasonIsValid && clickedReason !== selectedReason.value) {
      selectedReason.value = clickedReason
      await saveFeedback(clickedReason, true)
    } else if (clickedReasonIsValid && clickedReason === selectedReason.value) {
      statusTone.value = 'success'
      statusMessage.value = 'Your answer is already recorded. Add extra detail below if you want.'

      await router.replace({
        query: { token: token.value }
      })
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'This feedback link is invalid or has expired.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadSurvey()
})
</script>
