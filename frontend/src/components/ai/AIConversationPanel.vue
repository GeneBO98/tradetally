<template>
  <div class="ai-conversation-panel">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
          <SparklesIcon class="h-5 w-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h3 class="heading-card">AI Trading Assistant</h3>
          <p v-if="!aiStore.hasActiveSession" class="text-xs text-gray-500 dark:text-gray-400">
            Get personalized analysis of your trading performance
          </p>
        </div>
      </div>

      <!-- Credit Badge -->
      <div class="flex items-center gap-2">
        <CreditBadge />
        <button
          v-if="aiStore.hasActiveSession"
          @click="handleNewSession"
          class="btn-secondary text-sm"
          :disabled="aiStore.generating"
        >
          New Analysis
        </button>
      </div>
    </div>

    <!-- No Session State - Start Button -->
    <div v-if="!aiStore.hasActiveSession && !aiStore.loading" class="text-center py-8">
      <div class="max-w-md mx-auto">
        <SparklesIcon class="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
        <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Get AI-Powered Insights
        </h4>
        <p class="text-gray-600 dark:text-gray-400 mb-4 text-sm">
          Start a conversation with our AI assistant to analyze your trading patterns,
          identify strengths and weaknesses, and get personalized recommendations.
        </p>

        <div v-if="!aiStore.canStartSession" class="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <p class="text-amber-800 dark:text-amber-200 text-sm">
            <template v-if="aiStore.credits.unlimited === false && aiStore.credits.remaining <= 0">
              You've used all your AI credits for this month. Credits reset at the start of each month.
            </template>
            <template v-else>
              AI conversations require a Pro subscription.
            </template>
          </p>
        </div>

        <button
          @click="startNewSession"
          :disabled="!aiStore.canStartSession || aiStore.generating"
          class="btn-primary inline-flex items-center gap-2"
        >
          <SparklesIcon class="h-4 w-4" />
          <span v-if="aiStore.generating">Starting Analysis...</span>
          <span v-else>Start AI Analysis</span>
          <span v-if="!aiStore.credits.unlimited" class="text-xs opacity-75">
            ({{ aiStore.creditCosts.new_session }} credits)
          </span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-else-if="aiStore.loading && !aiStore.hasActiveSession" class="text-center py-12">
      <div class="animate-spin h-8 w-8 mx-auto mb-4 border-4 border-primary-600 border-t-transparent rounded-full"></div>
      <p class="text-gray-600 dark:text-gray-400">Analyzing your trading data...</p>
      <p class="text-gray-500 dark:text-gray-500 text-xs mt-2">This may take a moment</p>
    </div>

    <!-- Conversation View -->
    <div v-else-if="aiStore.hasActiveSession" class="flex flex-col h-full">
      <!-- Messages Container -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto space-y-4 mb-4 max-h-[60vh] pr-2">
        <template v-for="(message, index) in aiStore.messages" :key="index">
          <!-- User Message -->
          <div v-if="message.role === 'user'" class="flex justify-end">
            <div class="max-w-[85%] bg-primary-600 text-white rounded-lg px-4 py-2">
              <p class="text-sm whitespace-pre-wrap">{{ message.content }}</p>
            </div>
          </div>

          <!-- Assistant Message -->
          <div v-else-if="message.role === 'assistant'" class="flex justify-start">
            <div class="max-w-[95%] bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-3">
              <AIReportRenderer :content="message.content" />
            </div>
          </div>
        </template>

        <!-- Generating Indicator -->
        <div v-if="aiStore.generating" class="flex justify-start">
          <div class="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-3">
            <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <div class="animate-pulse flex gap-1">
                <div class="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
              </div>
              <span class="text-sm">Thinking...</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Follow-up Counter -->
      <div v-if="aiStore.currentSession" class="text-center mb-2">
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ aiStore.followupsRemaining }} of {{ aiStore.currentSession.max_followups }} follow-up questions remaining
        </span>
      </div>

      <!-- Follow-up Input -->
      <div v-if="aiStore.canAskFollowup" class="border-t border-gray-200 dark:border-gray-700 pt-4">
        <form @submit.prevent="sendFollowup" class="flex gap-2">
          <input
            v-model="followupMessage"
            type="text"
            placeholder="Ask a follow-up question..."
            class="flex-1 input"
            :disabled="aiStore.generating || !aiStore.canSendFollowup"
          />
          <button
            type="submit"
            :disabled="!followupMessage.trim() || aiStore.generating || !aiStore.canSendFollowup"
            class="btn-primary inline-flex items-center gap-1"
          >
            <PaperAirplaneIcon class="h-4 w-4" />
            <span class="hidden sm:inline">Send</span>
            <span v-if="!aiStore.credits.unlimited" class="text-xs opacity-75 hidden sm:inline">
              ({{ aiStore.creditCosts.followup }})
            </span>
          </button>
        </form>

        <p v-if="!aiStore.canSendFollowup && !aiStore.credits.unlimited" class="text-xs text-amber-600 dark:text-amber-400 mt-2">
          Not enough credits for a follow-up question
        </p>
      </div>

      <!-- Session Ended Notice -->
      <div v-else-if="aiStore.currentSession && aiStore.currentSession.followup_count >= aiStore.currentSession.max_followups"
           class="border-t border-gray-200 dark:border-gray-700 pt-4 text-center">
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          You've used all follow-up questions for this session.
        </p>
        <button
          @click="handleNewSession"
          :disabled="!aiStore.canStartSession"
          class="btn-primary text-sm inline-flex items-center gap-2"
        >
          <SparklesIcon class="h-4 w-4" />
          Start New Analysis
          <span v-if="!aiStore.credits.unlimited" class="text-xs opacity-75">
            ({{ aiStore.creditCosts.new_session }} credits)
          </span>
        </button>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="aiStore.error" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
      <p class="text-red-800 dark:text-red-200 text-sm">{{ aiStore.error }}</p>
      <button @click="aiStore.clearError" class="text-red-600 dark:text-red-400 text-xs underline mt-1">
        Dismiss
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useTradesStore } from '@/stores/trades'
import { SparklesIcon, PaperAirplaneIcon } from '@heroicons/vue/24/outline'
import AIReportRenderer from './AIReportRenderer.vue'
import CreditBadge from './CreditBadge.vue'

const aiStore = useAIStore()
const tradesStore = useTradesStore()

const followupMessage = ref('')
const messagesContainer = ref(null)

// Scroll to bottom when new messages arrive
watch(() => aiStore.messages.length, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})

// Fetch credits on mount
onMounted(async () => {
  try {
    await aiStore.fetchCredits()
  } catch (error) {
    console.error('[AI_PANEL] Error fetching credits:', error)
  }
})

async function startNewSession() {
  try {
    // Use current filters from trades store
    const filters = { ...tradesStore.filters }

    // Remove empty values
    Object.keys(filters).forEach(key => {
      if (filters[key] === '' || filters[key] === null ||
          (Array.isArray(filters[key]) && filters[key].length === 0)) {
        delete filters[key]
      }
    })

    await aiStore.createSession(filters)

    // Scroll to bottom after initial analysis
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  } catch (error) {
    console.error('[AI_PANEL] Error starting session:', error)
  }
}

async function sendFollowup() {
  if (!followupMessage.value.trim()) return

  const message = followupMessage.value.trim()
  followupMessage.value = ''

  try {
    await aiStore.sendFollowup(message)
  } catch (error) {
    console.error('[AI_PANEL] Error sending follow-up:', error)
    // Restore the message so user can try again
    followupMessage.value = message
  }
}

async function handleNewSession() {
  aiStore.reset()
  await nextTick()
  await startNewSession()
}
</script>

<style scoped>
.ai-conversation-panel {
  @apply p-4;
}

/* Smooth bounce animation for typing indicator */
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.animate-bounce {
  animation: bounce 0.6s infinite;
}

/* Custom scrollbar for messages */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  @apply bg-gray-100 dark:bg-gray-800 rounded;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  @apply bg-gray-300 dark:bg-gray-600 rounded;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400 dark:bg-gray-500;
}
</style>
