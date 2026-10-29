<template>
  <div class="content-wrapper py-8">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="heading-page">AI Chat</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Ask about your performance, open positions, a stock you hold, or anything else in your journal. Each message uses your latest trades, positions, and journal entries.
        </p>
      </div>
      <CreditBadge v-if="isProUser" />
    </div>

    <ProUpgradePrompt
      v-if="showProLock"
      variant="card"
      description="Chat with AI about your trades, open positions, and the stocks you hold, using your whole journal as context, with TradeTally Pro."
    />

    <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <!-- Conversation list -->
      <aside class="card lg:col-span-4 xl:col-span-3">
        <div class="card-body space-y-4">
          <button
            @click="startNewChat"
            class="btn-primary inline-flex w-full items-center justify-center gap-2"
            :disabled="aiStore.generating"
          >
            <PlusIcon class="h-4 w-4" />
            New chat
          </button>

          <div class="flex rounded-md border border-gray-200 p-0.5 text-xs dark:border-gray-700">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              @click="setFilter(option.value)"
              class="flex-1 rounded px-2 py-1 font-medium transition-colors"
              :class="sessionFilter === option.value
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
            >
              {{ option.label }}
            </button>
          </div>

          <div v-if="initialLoading" class="flex justify-center py-8">
            <div class="h-6 w-6 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>

          <p v-else-if="!aiStore.recentSessions.length" class="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No conversations yet.
          </p>

          <ul v-else class="-mx-2 max-h-[60vh] space-y-1 overflow-y-auto">
            <li v-for="session in aiStore.recentSessions" :key="session.id">
              <div
                class="group flex items-start gap-2 rounded-md px-2 py-2 transition-colors"
                :class="aiStore.currentSession?.id === session.id
                  ? 'bg-primary-50 dark:bg-primary-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
              >
                <button class="min-w-0 flex-1 text-left" @click="openSession(session.id)">
                  <p class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ session.title }}</p>
                  <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {{ sessionTypeLabel(session.session_type) }} · {{ formatSessionDate(session.updated_at || session.created_at) }}
                  </p>
                </button>
                <button
                  @click="confirmDelete(session)"
                  class="shrink-0 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:text-red-400"
                  :disabled="deletingSessionId === session.id"
                  title="Delete conversation"
                >
                  <TrashIcon class="h-4 w-4" />
                </button>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <!-- Conversation -->
      <section class="card flex min-h-[60vh] flex-col lg:col-span-8 xl:col-span-9">
        <div v-if="aiStore.currentSession" class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-6 py-3 dark:border-gray-700">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ currentTitle }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ sessionTypeLabel(currentType) }}<template v-if="modelLabel"> · {{ modelLabel }}</template>
            </p>
          </div>
          <router-link
            v-if="currentType === 'single_trade' && aiStore.currentSession.trade_summary?.trade_id"
            :to="`/trades/${aiStore.currentSession.trade_summary.trade_id}`"
            class="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            View trade
          </router-link>
        </div>

        <div ref="messagesContainer" class="flex-1 space-y-4 overflow-y-auto px-6 py-5 max-h-[65vh]">
          <div v-if="aiStore.loading" class="flex justify-center py-12">
            <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>

          <!-- Empty state -->
          <div v-else-if="!aiStore.messages.length" class="mx-auto max-w-xl py-10">
            <h2 class="heading-card text-center">What do you want to talk about?</h2>
            <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
              Mention a ticker like NOW or $NOW to pull in your history on it, plus the latest quote, earnings, and news when market data is available.
            </p>
            <div class="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                v-for="suggestion in suggestions"
                :key="suggestion"
                @click="sendMessage(suggestion)"
                class="rounded-lg border border-gray-200 px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
                :disabled="aiStore.generating || !aiStore.canStartChat"
              >
                {{ suggestion }}
              </button>
            </div>
          </div>

          <template v-else>
            <p v-if="isResumed" class="text-center text-xs text-gray-500 dark:text-gray-400">
              Started {{ formatSessionDate(aiStore.currentSession.created_at) }}. New messages use your current data.
            </p>
            <template v-for="(message, index) in aiStore.messages" :key="message.id || index">
              <div v-if="message.role === 'user'" class="flex justify-end">
                <div class="max-w-[85%] rounded-lg bg-primary-600 px-4 py-2 text-white">
                  <p class="whitespace-pre-wrap text-sm">{{ message.content }}</p>
                </div>
              </div>
              <div v-else-if="message.role === 'assistant'" class="flex justify-start">
                <div class="max-w-[95%]">
                  <div class="rounded-lg bg-gray-100 px-4 py-3 dark:bg-gray-700">
                    <AIReportRenderer :content="message.content" />
                  </div>
                  <!-- Which trades the question was interpreted to be about -->
                  <p v-if="message.trade_query" class="mt-1 px-1 text-xs text-gray-500 dark:text-gray-400">
                    Looked at {{ message.trade_query.trade_count }} {{ message.trade_query.trade_count === 1 ? 'trade' : 'trades' }}<template v-if="message.trade_query.description">: {{ message.trade_query.description }}</template>
                  </p>
                </div>
              </div>
            </template>
          </template>

          <div v-if="aiStore.generating" class="flex justify-start">
            <div class="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
              Reviewing your journal...
            </div>
          </div>
        </div>

        <!-- Composer -->
        <div class="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <!-- Memory note proposed by the assistant; stored only when confirmed -->
          <div
            v-if="aiStore.pendingMemoryNote"
            class="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 dark:border-primary-800 dark:bg-primary-900/20"
          >
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-primary-700 dark:text-primary-300">Remember this for future conversations?</p>
              <p class="text-sm text-gray-800 dark:text-gray-100">"{{ aiStore.pendingMemoryNote }}"</p>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="btn-primary px-3 py-1.5 text-sm"
                :disabled="aiStore.savingMemoryNote"
                @click="saveMemoryNote"
              >
                {{ aiStore.savingMemoryNote ? 'Saving...' : 'Save' }}
              </button>
              <button
                type="button"
                class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                :disabled="aiStore.savingMemoryNote"
                @click="aiStore.dismissMemoryNote()"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div v-if="aiStore.error" class="mb-3 rounded-md bg-red-50 p-3 dark:bg-red-900/20">
            <p class="text-sm text-red-800 dark:text-red-200">{{ aiStore.error }}</p>
            <button @click="aiStore.clearError" class="mt-1 text-xs text-red-600 underline dark:text-red-400">Dismiss</button>
          </div>

          <p v-if="aiStore.currentSession && !aiStore.canAskFollowup" class="mb-3 text-sm text-gray-600 dark:text-gray-400">
            This conversation reached its message limit. Start a new chat to keep going.
          </p>

          <form @submit.prevent="sendMessage()" class="flex items-end gap-2">
            <textarea
              v-model="draft"
              rows="2"
              class="input flex-1 resize-none"
              :placeholder="aiStore.currentSession ? 'Ask a follow-up...' : 'Ask about your trading, a position, or a stock...'"
              :disabled="composerDisabled"
              maxlength="4000"
              @keydown.enter.exact.prevent="sendMessage()"
            ></textarea>
            <button
              type="submit"
              class="btn-primary inline-flex items-center gap-1"
              :disabled="!draft.trim() || composerDisabled || !hasCreditsForNext"
            >
              <PaperAirplaneIcon class="h-4 w-4" />
              <span class="hidden sm:inline">Send</span>
              <span v-if="!aiStore.credits.unlimited" class="hidden text-xs opacity-75 sm:inline">({{ nextMessageCost }})</span>
            </button>
          </form>
          <div class="mt-2 flex flex-wrap justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Enter to send, Shift+Enter for a new line. AI responses are not financial advice.</span>
            <span v-if="aiStore.currentSession">{{ aiStore.followupsRemaining }} messages left in this conversation</span>
          </div>
          <p v-if="!hasCreditsForNext && !aiStore.credits.unlimited" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Not enough AI credits for another message. Credits reset at the start of each month.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PaperAirplaneIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { useAIStore } from '@/stores/ai'
import { useProAccess } from '@/composables/useProAccess'
import { useNotification } from '@/composables/useNotification'
import AIReportRenderer from '@/components/ai/AIReportRenderer.vue'
import CreditBadge from '@/components/ai/CreditBadge.vue'
import ProUpgradePrompt from '@/components/ProUpgradePrompt.vue'

const aiStore = useAIStore()
const route = useRoute()
const router = useRouter()
const { isProUser, showProLock } = useProAccess()
const { showError, showSuccess, showDangerConfirmation } = useNotification()

const initialLoading = ref(true)
const draft = ref('')
const messagesContainer = ref(null)
const sessionFilter = ref('')
const deletingSessionId = ref(null)

const filterOptions = [
  { value: '', label: 'All' },
  { value: 'chat', label: 'Chats' },
  { value: 'single_trade', label: 'Trades' },
  { value: 'performance', label: 'Performance' }
]

const suggestions = [
  'How are my open positions looking right now?',
  'What is my biggest weakness over the last 30 days?',
  'Which symbols and strategies make me the most money?',
  'Summarize what my journal entries say about my discipline.'
]

const currentType = computed(() => {
  const analysisType = aiStore.currentSession?.trade_summary?.analysis_type
  if (analysisType === 'chat' || analysisType === 'single_trade') return analysisType
  return 'performance'
})

const currentTitle = computed(() => {
  const session = aiStore.currentSession
  if (!session) return ''
  const summary = session.trade_summary || {}
  if (summary.title) return summary.title
  if (currentType.value === 'single_trade') return `${summary.symbol || 'Trade'} trade analysis`
  return 'Performance analysis'
})

const modelLabel = computed(() => {
  const metadata = aiStore.currentSession?.ai_metadata
  if (!metadata) return ''
  return [metadata.provider, metadata.model].filter(Boolean).join(' / ')
})

const isResumed = computed(() => {
  const createdAt = aiStore.currentSession?.created_at
  return !!createdAt && Date.now() - new Date(createdAt).getTime() > 24 * 60 * 60 * 1000
})

const nextMessageCost = computed(() => {
  return aiStore.currentSession
    ? aiStore.followupCost
    : (aiStore.creditCosts.chat_message ?? aiStore.creditCosts.followup)
})

const hasCreditsForNext = computed(() => {
  return aiStore.currentSession ? aiStore.canSendFollowup : aiStore.canStartChat
})

const composerDisabled = computed(() => {
  return aiStore.generating || aiStore.loading || (!!aiStore.currentSession && !aiStore.canAskFollowup)
})

const SESSION_TYPE_LABELS = {
  chat: 'Chat',
  single_trade: 'Trade analysis',
  performance: 'Performance analysis'
}

function sessionTypeLabel(type) {
  return SESSION_TYPE_LABELS[type] || 'Chat'
}

function formatSessionDate(value) {
  if (!value) return ''
  const date = new Date(value)
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

async function loadSessions() {
  try {
    await aiStore.fetchRecentSessions(50, sessionFilter.value || null)
  } catch (error) {
    console.error('[AI-CHAT] Failed to load conversations:', error)
  } finally {
    initialLoading.value = false
  }
}

function setFilter(value) {
  if (sessionFilter.value === value) return
  sessionFilter.value = value
  loadSessions()
}

async function openSession(sessionId) {
  if (aiStore.generating || aiStore.currentSession?.id === sessionId) return
  aiStore.clearError()
  try {
    await aiStore.loadSession(sessionId)
    router.replace({ query: { ...route.query, session: sessionId } })
    scrollToBottom()
  } catch (error) {
    showError('Error', 'Could not load that conversation')
    router.replace({ query: { ...route.query, session: undefined } })
  }
}

function startNewChat() {
  aiStore.reset()
  draft.value = ''
  router.replace({ query: { ...route.query, session: undefined } })
}

async function sendMessage(text) {
  const message = (text ?? draft.value).trim()
  if (!message || composerDisabled.value || !hasCreditsForNext.value) return

  draft.value = ''
  try {
    if (aiStore.currentSession) {
      await aiStore.sendFollowup(message)
    } else {
      const result = await aiStore.createChatSession(message)
      const sessionId = result.session_id || aiStore.currentSession?.id
      if (sessionId) router.replace({ query: { ...route.query, session: sessionId } })
    }
    loadSessions()
  } catch (error) {
    console.error('[AI-CHAT] Failed to send message:', error)
    draft.value = message
  }
}

async function saveMemoryNote() {
  try {
    const result = await aiStore.saveMemoryNote()
    showSuccess('Saved', result?.added === false
      ? 'That note was already in your AI memory.'
      : 'The AI will carry this into every future conversation. Manage notes in Profile > Trading Profile.')
  } catch (error) {
    showError('Error', error.response?.data?.error || error.response?.data?.message || 'Failed to save the note')
  }
}

function confirmDelete(session) {
  showDangerConfirmation(
    'Delete conversation',
    `This permanently deletes "${session.title}" and all of its messages. It does not refund AI credits.`,
    async () => {
      deletingSessionId.value = session.id
      try {
        const wasOpen = aiStore.currentSession?.id === session.id
        await aiStore.deleteSession(session.id)
        if (wasOpen) router.replace({ query: { ...route.query, session: undefined } })
      } catch (error) {
        showError('Error', error.response?.data?.message || 'Failed to delete conversation')
      } finally {
        deletingSessionId.value = null
      }
    },
    { confirmText: 'Delete' }
  )
}

watch(() => aiStore.messages.length, scrollToBottom)

let initialized = false

// Pro access can resolve after mount while the user profile loads.
async function initialize() {
  if (initialized || !isProUser.value) return
  initialized = true

  aiStore.reset()
  try {
    await aiStore.fetchCredits()
  } catch (error) {
    console.error('[AI-CHAT] Failed to load credits:', error)
  }
  await loadSessions()

  if (typeof route.query.session === 'string') {
    await openSession(route.query.session)
  }
}

watch(isProUser, initialize)

onMounted(initialize)

onBeforeUnmount(() => {
  if (!aiStore.generating) aiStore.reset()
})
</script>
