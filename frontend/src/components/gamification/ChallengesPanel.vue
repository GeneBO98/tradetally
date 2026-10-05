<template>
  <div>
    <div v-if="initialLoading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>

    <div v-else class="relative space-y-10">
      <div v-if="loading" class="absolute top-0 right-0 z-10">
        <div class="flex items-center space-x-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
          <span class="text-xs text-gray-600 dark:text-gray-400">Updating...</span>
        </div>
      </div>

      <section v-for="group in groups" :key="group.period">
        <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{{ group.eyebrow }}</div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ group.title }}</h2>
          </div>
          <div v-if="group.challenges.length" class="text-sm text-gray-500 dark:text-gray-400">
            {{ timeLeftLabel(group.challenges[0].end_date) }}
          </div>
        </div>

        <div v-if="group.challenges.length === 0" class="card card-body text-sm text-gray-500 dark:text-gray-400">
          No challenges running right now. Check back soon.
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4">
          <div
            v-for="challenge in group.challenges"
            :key="challenge.id"
            :class="[
              'card flex flex-col p-5 border',
              challenge.user_status === 'completed'
                ? 'border-green-200 dark:border-green-800'
                : challenge.user_status === 'active'
                  ? 'border-primary-200 dark:border-primary-800'
                  : 'border-transparent'
            ]"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div :class="['flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full', iconClass(challenge)]">
                  <MdiIcon :icon="iconFor(challenge)" :size="22" />
                </div>
                <div class="min-w-0">
                  <h3 class="truncate font-semibold text-gray-900 dark:text-white">{{ challenge.name }}</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400">{{ challenge.description }}</p>
                </div>
              </div>
              <span class="flex-shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-bold text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
                +{{ challenge.reward_points }} XP
              </span>
            </div>

            <!-- Progress (joined) -->
            <div v-if="challenge.user_status" class="mt-5">
              <div class="flex items-center justify-between text-sm">
                <span class="font-medium text-gray-700 dark:text-gray-300">
                  {{ progressValue(challenge) }} / {{ targetValue(challenge) }} {{ unitLabel(challenge) }}
                </span>
                <span
                  v-if="challenge.user_status === 'completed'"
                  class="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400"
                >
                  <MdiIcon :icon="mdiCheckCircle" :size="14" />
                  Completed
                </span>
              </div>
              <div class="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  :class="[
                    'h-full rounded-full transition-all duration-700',
                    challenge.user_status === 'completed' ? 'bg-green-500' : 'bg-primary-500'
                  ]"
                  :style="{ width: progressPercent(challenge) + '%' }"
                ></div>
              </div>
              <p v-if="challenge.criteria?.type === 'revenge_free_days' && challenge.user_status === 'active'" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Days count once revenge trade detection has checked them. Any detected revenge trade resets this week.
              </p>
            </div>

            <div class="mt-auto pt-5 flex items-center justify-between gap-3">
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ participantLabel(challenge) }}
              </span>

              <span
                v-if="challenge.locked"
                class="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                <MdiIcon :icon="mdiLock" :size="14" />
                Pro feature
              </span>
              <button
                v-else-if="!challenge.user_status"
                @click="join(challenge)"
                :disabled="joiningId === challenge.id"
                class="btn-primary disabled:opacity-60"
              >
                {{ joiningId === challenge.id ? 'Joining...' : 'Join' }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- History -->
      <section v-if="history.length">
        <div class="mb-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">History</div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Past challenges</h2>
        </div>
        <div class="card overflow-hidden">
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            <li v-for="item in history" :key="item.id" class="flex items-center justify-between gap-4 px-5 py-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ item.name }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">{{ formatPeriod(item) }}</div>
              </div>
              <div class="flex items-center gap-4 flex-shrink-0">
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  {{ progressValue(item) }} / {{ targetValue(item) }}
                </span>
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    item.status === 'completed'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  ]"
                >
                  {{ item.status === 'completed' ? `+${item.reward_points} XP` : 'Missed' }}
                </span>
              </div>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'
import MdiIcon from '@/components/MdiIcon.vue'
import { useNotification } from '@/composables/useNotification'
import {
  mdiCalendarCheck,
  mdiShieldCheck,
  mdiNotebookEdit,
  mdiHeadHeart,
  mdiFlagCheckered,
  mdiCheckCircle,
  mdiLock
} from '@mdi/js'

const { showSuccess, showError } = useNotification()

const loading = ref(true)
const initialLoading = ref(true)
const active = ref([])
const mine = ref([])
const joiningId = ref(null)

const TYPE_META = {
  trading_days:          { icon: mdiCalendarCheck, unit: 'days' },
  trades_with_stop_loss: { icon: mdiShieldCheck,   unit: 'trades' },
  journaled_trades:      { icon: mdiNotebookEdit,  unit: 'trades' },
  revenge_free_days:     { icon: mdiHeadHeart,     unit: 'clean days' }
}

const groups = computed(() => [
  {
    period: 'week',
    eyebrow: 'Weekly',
    title: 'This week',
    challenges: active.value.filter(c => c.criteria?.period === 'week')
  },
  {
    period: 'month',
    eyebrow: 'Monthly',
    title: 'This month',
    // Admin-created one-offs (no period) show alongside the monthly set
    challenges: active.value.filter(c => c.criteria?.period !== 'week')
  }
])

const history = computed(() => mine.value.filter(c => c.status !== 'active'))

function iconFor(challenge) {
  return TYPE_META[challenge.criteria?.type]?.icon || mdiFlagCheckered
}

function unitLabel(challenge) {
  return TYPE_META[challenge.criteria?.type]?.unit || ''
}

function iconClass(challenge) {
  if (challenge.user_status === 'completed') return 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
  if (challenge.locked) return 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
  return 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400'
}

function progressValue(challenge) {
  return Number(challenge.user_progress ?? challenge.progress ?? 0)
}

function targetValue(challenge) {
  return Number(challenge.target_value) || 0
}

function progressPercent(challenge) {
  const target = targetValue(challenge)
  if (!target) return 0
  return Math.min(100, (progressValue(challenge) / target) * 100)
}

function participantLabel(challenge) {
  const n = Number(challenge.participant_count) || 0
  if (n === 0) return 'Be the first to join'
  const done = Number(challenge.completed_count) || 0
  const joined = `${n} trader${n === 1 ? '' : 's'} joined`
  return done > 0 ? `${joined}, ${done} finished` : joined
}

function timeLeftLabel(endDate) {
  const ms = new Date(endDate).getTime() - Date.now()
  if (ms <= 0) return 'Ended'
  const hours = Math.floor(ms / 3600000)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} left`
  const days = Math.ceil(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} left`
}

function formatPeriod(item) {
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  const start = new Date(item.start_date)
  // end_date is exclusive (start of next period)
  const end = new Date(new Date(item.end_date).getTime() - 1)
  return `${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}`
}

async function loadChallenges() {
  loading.value = true
  try {
    const [activeRes, mineRes] = await Promise.all([
      api.get('/gamification/challenges/active'),
      api.get('/gamification/challenges')
    ])
    active.value = activeRes.data?.data || []
    mine.value = mineRes.data?.data || []
  } catch (error) {
    console.error('[CHALLENGES] Failed to load challenges:', error)
    showError('Error', 'Failed to load challenges')
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

async function join(challenge) {
  joiningId.value = challenge.id
  try {
    await api.post(`/gamification/challenges/${challenge.id}/join`)
    showSuccess('Challenge joined', `${challenge.name} is on. Trades since the challenge started already count.`)
    await loadChallenges()
  } catch (error) {
    const message = error.response?.data?.message || 'Could not join this challenge'
    showError('Could not join', message)
  } finally {
    joiningId.value = null
  }
}

onMounted(loadChallenges)
</script>
