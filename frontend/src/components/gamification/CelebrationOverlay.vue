<template>
  <transition name="fade">
    <div v-if="visible" :class="['fixed inset-0 z-[9999] flex items-center justify-center bg-black/60', { 'reduce-motion': reducedMotion }]" @click.self="handleDismissAll">
      <!-- Achievement(s) modal -->
      <div
        v-if="currentItem?.type === 'achievement_group'"
        :key="`group-${itemKey}`"
        class="modal-pop relative w-full max-w-md mx-4 overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
      >
        <div
          class="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-white"
          :class="layoutMode === 'hero' ? `header-${heroRarity}` : 'bg-gradient-to-r from-primary-600 to-primary-500'"
        >
          {{ layoutMode === 'hero'
            ? heroHeaderLabel
            : `${currentItem.achievements.length} achievements unlocked` }}
        </div>

        <div class="px-6 py-6 space-y-5">
          <!-- Single achievement: hero layout -->
          <div v-if="layoutMode === 'hero'" class="text-center space-y-3">
            <div :class="['badge-stage relative mx-auto h-40 w-40', `stage-${heroRarity}`]">
              <!-- Rotating sunburst behind the badge -->
              <div class="sunburst pointer-events-none absolute inset-[-30%]" :class="{ 'sunburst-fast': heroRarity === 'legendary' || heroRarity === 'epic' }"></div>
              <!-- Twinkling sparkles around the badge -->
              <svg
                v-for="(s, i) in SPARKLES"
                :key="`sparkle-${i}`"
                class="sparkle pointer-events-none absolute"
                :style="{ left: s.x, top: s.y, width: `${s.size}px`, height: `${s.size}px`, animationDelay: `${s.delay}ms` }"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path :d="SPARKLE_PATH"/>
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="badge-drop">
                  <div class="badge-float">
                    <div ref="heroBadge" :class="['badge-3d flex h-24 w-24 items-center justify-center rounded-full', `badge-${heroRarity}`]">
                      <svg class="relative z-10 h-12 w-12 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
                        <path :d="iconPathFor(sortedAchievements[0].points)"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div class="pop-in text-2xl font-extrabold text-gray-900 dark:text-white" style="animation-delay: 480ms">{{ sortedAchievements[0].name }}</div>
              <div class="rise-in mt-1 text-sm text-gray-600 dark:text-gray-400" style="animation-delay: 620ms">{{ sortedAchievements[0].description }}</div>
              <div v-if="hasUnlockPct(sortedAchievements[0])" class="rise-in mt-2 text-xs font-medium text-gray-500 dark:text-gray-400" style="animation-delay: 720ms">
                Earned by <span :class="['font-semibold', `rarity-text-${rarityFromUnlockPct(sortedAchievements[0].unlock_percentage)}`]">{{ formatUnlockPct(sortedAchievements[0].unlock_percentage) }}</span> of traders
              </div>
            </div>
          </div>

          <!-- 2–5 achievements: full cards with descriptions -->
          <div v-else-if="layoutMode === 'cards'" class="space-y-2">
            <div
              v-for="(ach, idx) in sortedAchievements"
              :key="ach.id || idx"
              class="cascade-in flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40"
              :style="{ animationDelay: `${idx * 110}ms` }"
            >
              <div
                :ref="el => { if (el) cardIcons[idx] = el }"
                :class="['icon-pop flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full', `rarity-icon-${rarityFor(ach.points)}`]"
                :style="{ animationDelay: `${idx * 110 + 260}ms` }"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path :d="iconPathFor(ach.points)"/>
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-gray-900 dark:text-white">{{ ach.name }}</div>
                <div class="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{{ ach.description }}</div>
                <div v-if="hasUnlockPct(ach)" class="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  <span :class="`rarity-text-${rarityFromUnlockPct(ach.unlock_percentage)}`">{{ formatUnlockPct(ach.unlock_percentage) }}</span> of traders
                </div>
              </div>
              <div class="icon-pop flex-shrink-0 font-mono text-xs font-bold text-yellow-600 dark:text-yellow-400" :style="{ animationDelay: `${idx * 110 + 340}ms` }">+{{ ach.points }}</div>
            </div>
          </div>

          <!-- 6+ achievements: compact 2-column grid, count is the focal point -->
          <div v-else>
            <div class="text-center">
              <div class="pop-in font-mono text-5xl font-extrabold text-primary-600 dark:text-primary-400 leading-none">{{ currentItem.achievements.length }}</div>
              <div class="mt-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">unlocked at once</div>
            </div>
            <div class="mt-4 grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
              <div
                v-for="(ach, idx) in sortedAchievements"
                :key="ach.id || idx"
                class="cascade-in flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800/40"
                :style="{ animationDelay: `${idx * 85}ms` }"
              >
                <div :class="['flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full', `rarity-icon-${rarityFor(ach.points)}`]">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path :d="iconPathFor(ach.points)"/>
                  </svg>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-xs font-medium text-gray-900 dark:text-white" :title="ach.name">{{ ach.name }}</div>
                  <div v-if="hasUnlockPct(ach)" :class="['text-[10px] font-medium', `rarity-text-${rarityFromUnlockPct(ach.unlock_percentage)}`]">{{ formatUnlockPct(ach.unlock_percentage) }}</div>
                </div>
                <div class="flex-shrink-0 font-mono text-[11px] font-bold text-yellow-600 dark:text-yellow-400">+{{ ach.points }}</div>
              </div>
            </div>
          </div>

          <!-- XP total + level progress bar -->
          <div class="border-t border-gray-200 pt-4 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {{ levelData ? `Level ${displayedLevel}` : (currentItem.achievements.length === 1 ? 'Earned' : 'Total earned') }}
              </div>
              <div
                :key="`xp-${xpPopKey}`"
                :class="['xp-chip font-mono text-lg font-bold text-yellow-600 dark:text-yellow-400 tabular-nums', { 'xp-pop': xpPopKey > 0 }]"
              >+{{ displayedXP }} XP</div>
            </div>
            <div class="relative mt-2 h-4 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                class="xp-fill relative h-full rounded-full bg-gradient-to-r from-yellow-400 via-primary-500 to-primary-600"
                :style="{ width: xpBarPercent + '%' }"
              ></div>
              <!-- Flash overlay re-mounts via :key whenever a level boundary is crossed -->
              <div
                v-if="levelData"
                :key="`flash-${levelFlashKey}`"
                class="level-flash pointer-events-none absolute inset-0 rounded-full"
              ></div>
            </div>
            <div v-if="levelData && levelData.newLevel > levelData.oldLevel && displayedLevel > levelData.oldLevel" class="pop-in mt-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
              {{ levelData.newLevel - levelData.oldLevel === 1 ? 'Level up!' : `${levelData.newLevel - levelData.oldLevel}× level up!` }}
            </div>
          </div>

          <div class="space-y-2">
            <button
              @click="handleContinue"
              :disabled="isAnimating"
              class="btn-chunky w-full"
            >
              {{ continueLabel }}
            </button>
            <button
              v-if="totalRemaining > 0"
              @click="handleDismissAll"
              class="w-full text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Dismiss all
            </button>
          </div>
        </div>
      </div>

      <!-- Level-up modal -->
      <div
        v-else-if="currentItem?.type === 'level_up'"
        :key="`level-${itemKey}`"
        class="modal-pop relative w-full max-w-md mx-4 overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
      >
        <div class="px-8 pt-8 pb-8 text-center space-y-5">
          <div class="badge-stage stage-level relative mx-auto h-44 w-44">
            <div class="sunburst sunburst-fast pointer-events-none absolute inset-[-30%]"></div>
            <svg
              v-for="(s, i) in SPARKLES"
              :key="`lvl-sparkle-${i}`"
              class="sparkle pointer-events-none absolute"
              :style="{ left: s.x, top: s.y, width: `${s.size}px`, height: `${s.size}px`, animationDelay: `${s.delay}ms` }"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path :d="SPARKLE_PATH"/>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="badge-drop">
                <div class="badge-float relative">
                  <div class="absolute inset-0 animate-pulse-ring rounded-full bg-yellow-400/30"></div>
                  <div ref="levelBadge" class="badge-3d badge-level relative flex h-28 w-28 items-center justify-center rounded-full">
                    <span
                      :key="`lvl-num-${shownLevel}`"
                      :class="['relative z-10 text-5xl font-extrabold text-white drop-shadow', shownLevel === currentItem.payload.newLevel ? 'level-num-in' : '']"
                    >{{ shownLevel }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div class="pop-in text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white" style="animation-delay: 900ms">Level Up!</div>
            <div class="rise-in mt-2 text-sm text-gray-500 dark:text-gray-400" style="animation-delay: 1050ms">
              Level {{ currentItem.payload.oldLevel }}
              <span class="mx-1.5 text-gray-300 dark:text-gray-600">→</span>
              <span class="font-bold text-primary-600 dark:text-primary-400">Level {{ currentItem.payload.newLevel }}</span>
            </div>
          </div>
          <button
            @click="handleContinue"
            :disabled="isAnimating"
            class="btn-chunky w-full"
          >
            {{ continueLabel }}
          </button>
        </div>
      </div>

      <!-- Animation canvas -->
      <canvas ref="animationCanvas" class="pointer-events-none fixed inset-0" />
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import {
  usePriceAlertNotifications,
  advanceCelebrationCursor,
} from '@/composables/usePriceAlertNotifications'
import api from '@/services/api'
import {
  primeCelebrationAudio,
  playAchievementChime,
  playPop,
  playLevelUpFanfare,
} from '@/composables/useCelebrationSound'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  queue: {
    type: Array,
    required: true
  }
})

const {
  pendingCelebrationNotifications,
  celebrationLevelContext,
} = usePriceAlertNotifications()
const authStore = useAuthStore()

const visible = ref(false)
const currentItem = ref(null)
const animationCanvas = ref(null)
const isAnimating = ref(false)
const remainingCount = ref(0)

let animationRafId = null
let particles = []
let beam = null           // { start, duration } while the level-up light beam is active
let canvasCtx = null
let canvasW = 0
let canvasH = 0
let scheduledTimers = []  // every choreography timeout, so Continue/Dismiss can cancel them

const itemKey = ref(0)              // re-keys the modal so entrance animations replay per item
const heroBadge = ref(null)
const levelBadge = ref(null)
const cardIcons = []                // icon elements in the 2-5 card layout (mini burst origins)
const xpPopKey = ref(0)             // bumped when the XP count lands, replays the chip pop
const shownLevel = ref(0)           // level number on the level-up badge (swaps old -> new)
const reducedMotion = ref(false)

// 4-point twinkle star used for the sparkles around a badge
const SPARKLE_PATH = 'M12 0C12.6 6.4 17.6 11.4 24 12 17.6 12.6 12.6 17.6 12 24 11.4 17.6 6.4 12.6 0 12 6.4 11.4 11.4 6.4 12 0Z'
// Positions are relative to the badge stage; delays start after the badge lands
const SPARKLES = [
  { x: '6%',  y: '14%', size: 18, delay: 450 },
  { x: '80%', y: '6%',  size: 14, delay: 620 },
  { x: '88%', y: '62%', size: 20, delay: 520 },
  { x: '2%',  y: '70%', size: 12, delay: 760 },
  { x: '50%', y: '-4%', size: 11, delay: 880 },
  { x: '60%', y: '92%', size: 13, delay: 980 }
]

const totalAchievementPoints = computed(() => {
  if (currentItem.value?.type !== 'achievement_group') return 0
  return currentItem.value.achievements.reduce((sum, a) => sum + (a.points || 0), 0)
})

// Animated XP counter — eases from 0 to the total when the modal opens
const displayedXP = ref(0)
let xpRafId = null

// Level progress visualization (fed by xp_update events captured from the queue)
// `levelData` shape: { oldXP, newXP, oldLevel, newLevel, currentLevelMinXPBefore, nextLevelMinXPBefore }
const levelData = ref(null)
const displayedXPCurrent = ref(0)   // animated XP value within the level system
const displayedLevel = ref(0)
const levelFlashKey = ref(0)         // bumped when a level-up boundary is crossed (drives flash)

// XP bar fill within the CURRENT level's range
const xpBarPercent = computed(() => {
  if (levelData.value) {
    const range = levelData.value.xpPerLevel || 100
    const within = displayedXPCurrent.value % range
    return Math.min(100, (within / range) * 100)
  }
  // Fallback: simple total-based bar when we have no level data
  const total = totalAchievementPoints.value
  if (!total) return 0
  return Math.min(100, (displayedXP.value / total) * 100)
})

function animateXPCount(target, duration = 800) {
  if (xpRafId) cancelAnimationFrame(xpRafId)
  displayedXP.value = 0
  const start = performance.now()
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - t, 3)
    displayedXP.value = Math.round(target * eased)
    if (t < 1) {
      xpRafId = requestAnimationFrame(tick)
    } else {
      xpRafId = null
      displayedXP.value = target
    }
  }
  xpRafId = requestAnimationFrame(tick)
}

function animateLevelProgress(data, duration = 1500) {
  if (xpRafId) cancelAnimationFrame(xpRafId)
  const { oldXP, newXP, oldLevel, currentLevelMinXPBefore, nextLevelMinXPBefore } = data
  // Approximate per-level XP requirement using the BEFORE level's range
  // (good enough for visualization without backend sending every threshold)
  const xpPerLevel = Math.max(1, nextLevelMinXPBefore - currentLevelMinXPBefore)
  data.xpPerLevel = xpPerLevel

  displayedXP.value = 0
  displayedXPCurrent.value = oldXP
  displayedLevel.value = oldLevel
  levelFlashKey.value = 0

  const totalDelta = newXP - oldXP
  // Threshold values to cross during animation (each level boundary between old & new)
  // Compute next thresholds at each integer level above oldLevel
  const thresholds = []
  let nextThreshold = nextLevelMinXPBefore
  let levelAtThreshold = oldLevel + 1
  while (nextThreshold <= newXP) {
    thresholds.push({ xp: nextThreshold, level: levelAtThreshold })
    nextThreshold += xpPerLevel
    levelAtThreshold += 1
  }
  let crossedCount = 0

  const start = performance.now()
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - t, 3)
    const currentXP = oldXP + totalDelta * eased
    displayedXPCurrent.value = currentXP
    displayedXP.value = Math.round(totalDelta * eased) // for the +N XP counter

    // Detect crossings
    while (crossedCount < thresholds.length && currentXP >= thresholds[crossedCount].xp) {
      displayedLevel.value = thresholds[crossedCount].level
      levelFlashKey.value++
      crossedCount++
    }

    if (t < 1) {
      xpRafId = requestAnimationFrame(tick)
    } else {
      xpRafId = null
      displayedXPCurrent.value = newXP
      displayedXP.value = totalDelta
    }
  }
  xpRafId = requestAnimationFrame(tick)
}

const layoutMode = computed(() => {
  if (currentItem.value?.type !== 'achievement_group') return null
  const n = currentItem.value.achievements.length
  if (n === 1) return 'hero'
  if (n <= 5) return 'cards'
  return 'compact'
})

// Sort achievements rarest (highest points) first so the user sees the biggest wins up top.
const sortedAchievements = computed(() => {
  if (currentItem.value?.type !== 'achievement_group') return []
  return [...currentItem.value.achievements].sort((a, b) => (b.points || 0) - (a.points || 0))
})

function rarityFor(points) {
  if (points >= 76) return 'legendary'
  if (points >= 51) return 'epic'
  if (points >= 31) return 'rare'
  if (points >= 16) return 'uncommon'
  return 'common'
}

// One distinctive SVG path per rarity tier so the shape itself signals rank.
const RARITY_ICONS = {
  common:    'M12 2c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.4 14L6 11.4l1.4-1.4 3.2 3.2 6.6-6.6L18.6 8l-8 8z',
  uncommon:  'M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z',
  rare:      'M12 2L4 9l8 13 8-13-8-7z',
  epic:      'M13 2L3 14h7v8l10-12h-7V2z',
  legendary: 'M3 8l3 9h12l3-9-5 4-4-7-4 7-5-4z'
}

function iconPathFor(points) {
  return RARITY_ICONS[rarityFor(points)]
}

function hasUnlockPct(ach) {
  return ach && typeof ach.unlock_percentage === 'number'
}

// Format the percentage compactly: <0.1 → "<0.1%", small → 1 decimal, else integer
function formatUnlockPct(pct) {
  if (typeof pct !== 'number' || isNaN(pct)) return ''
  if (pct === 0) return '0%'
  if (pct < 0.1) return '<0.1%'
  if (pct < 10) return `${pct.toFixed(1)}%`
  return `${Math.round(pct)}%`
}

// Color the unlock-% label by ACTUAL frequency, not by point value.
// A +30 XP achievement that only 0.5% of traders have IS legendary in rarity.
function rarityFromUnlockPct(pct) {
  if (typeof pct !== 'number' || isNaN(pct)) return 'common'
  if (pct <= 2) return 'legendary'
  if (pct <= 10) return 'epic'
  if (pct <= 30) return 'rare'
  if (pct <= 60) return 'uncommon'
  return 'common'
}

const RARITY_LABELS = {
  legendary: 'Legendary unlock',
  epic: 'Epic unlock',
  rare: 'Rare unlock',
  uncommon: 'Uncommon unlock',
  common: 'Achievement unlocked'
}

const heroRarity = computed(() => {
  if (layoutMode.value !== 'hero') return null
  return rarityFor(sortedAchievements.value[0]?.points || 0)
})

const heroHeaderLabel = computed(() => {
  if (sortedAchievements.value[0]?.kind === 'challenge') return 'Challenge complete'
  return RARITY_LABELS[heroRarity.value] || 'Achievement unlocked'
})

const totalRemaining = computed(
  () => remainingCount.value + pendingCelebrationNotifications.value.length
)

const continueLabel = computed(() => {
  if (isAnimating.value) return 'Please wait...'
  return totalRemaining.value > 0
    ? `Continue Viewing (${totalRemaining.value} more)`
    : 'Done'
})

// Mark notifications as read in the backend (fire-and-forget — bell badge
// will refresh on its next poll). Accepts either a single id (defaults to
// the achievement_earned type) or an array of {id, type} objects.
async function markNotificationsRead(items) {
  if (!authStore.isAuthenticated) return
  const list = Array.isArray(items)
    ? items
    : items
      ? [{ id: items, type: 'achievement_earned' }]
      : []
  if (list.length === 0) return
  try {
    await api.post('/notifications/mark-read', { notifications: list })
  } catch (err) {
    console.error('[CELEBRATION] Failed to mark notifications as read:', err)
  }
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function schedule(fn, ms) {
  const id = setTimeout(() => {
    scheduledTimers = scheduledTimers.filter(t => t !== id)
    fn()
  }, ms)
  scheduledTimers.push(id)
}

function stopAnimation() {
  scheduledTimers.forEach(clearTimeout)
  scheduledTimers = []
  if (animationRafId) {
    cancelAnimationFrame(animationRafId)
    animationRafId = null
  }
  if (xpRafId) {
    cancelAnimationFrame(xpRafId)
    xpRafId = null
  }
  if (canvasCtx) canvasCtx.clearRect(0, 0, canvasW, canvasH)
  particles = []
  beam = null
}

function setupCanvas() {
  const canvas = animationCanvas.value
  if (!canvas) return false
  const dpr = window.devicePixelRatio || 1
  canvasW = window.innerWidth
  canvasH = window.innerHeight
  canvas.width = canvasW * dpr
  canvas.height = canvasH * dpr
  canvas.style.width = `${canvasW}px`
  canvas.style.height = `${canvasH}px`
  canvasCtx = canvas.getContext('2d')
  canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return true
}

function ensureLoop() {
  if (!canvasCtx || animationRafId) return
  animationRafId = requestAnimationFrame(tick)
}

// Color palettes scale with the celebration tier
const PALETTES = {
  small: ['#F0812A', '#FAB05B', '#FFD700', '#FCD098'],
  medium: ['#F0812A', '#FFD700', '#FFB36B', '#FFFFFF', '#FAB05B', '#F78F2F'],
  large: ['#F0812A', '#FFD700', '#FF6B6B', '#6BFFB8', '#9D7AFF', '#FFFFFF', '#FAB05B'],
  mega: ['#F0812A', '#FFD700', '#FF6B6B', '#6BFFB8', '#9D7AFF', '#FFFFFF', '#FAB05B', '#FF85DA', '#5AC8FA']
}

// Burst colors follow the badge's rarity so the pop matches what landed
const RARITY_BURST = {
  common:    ['#94a3b8', '#cbd5e1', '#FFD700', '#FFFFFF'],
  uncommon:  ['#22c55e', '#86efac', '#FFD700', '#FFFFFF'],
  rare:      ['#06b6d4', '#67e8f9', '#FFD700', '#FFFFFF'],
  epic:      ['#8b5cf6', '#c4b5fd', '#FF85DA', '#FFD700', '#FFFFFF'],
  legendary: ['#F0812A', '#FFD700', '#FFC83D', '#FAB05B', '#FFFFFF']
}

const RARITY_BURST_POWER = { common: 0.8, uncommon: 0.9, rare: 1, epic: 1.15, legendary: 1.35 }

function tierFor(totalPoints, count) {
  if (totalPoints >= 200 || count >= 10) return 'mega'
  if (totalPoints >= 75 || count >= 3) return 'large'
  if (totalPoints >= 25 || count >= 2) return 'medium'
  return 'small'
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function spawnConfetti(cannons, particlesPerCannon, palette, sizeBoost = 1) {
  cannons.forEach(cannon => {
    for (let i = 0; i < particlesPerCannon; i++) {
      const angle = cannon.angle + (Math.random() - 0.5) * cannon.spread
      const speed = (10 + Math.random() * 8) * cannon.power
      const shapeRoll = Math.random()
      const shape = shapeRoll < 0.55 ? 'rect' : shapeRoll < 0.85 ? 'square' : 'ribbon'
      const baseSize = (9 + Math.random() * 7) * sizeBoost
      particles.push({
        kind: 'confetti',
        x: cannon.x,
        y: cannon.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.22,
        drag: 0.992,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.35,
        color: pick(palette),
        width: shape === 'ribbon' ? baseSize * 0.45 : baseSize,
        height: shape === 'ribbon' ? baseSize * 2.6 : baseSize,
        life: 1,
        decay: 0.0035 + Math.random() * 0.004
      })
    }
  })
}

// Radial pop of stars, sparks and a shockwave ring from a point (badge landing)
function spawnBurst(x, y, { palette, count = 40, power = 1, rings = 1 }) {
  for (let r = 0; r < rings; r++) {
    particles.push({
      kind: 'ring',
      x, y,
      radius: 18,
      vr: (7 + r * 2.5) * power,
      color: r === 0 ? '#FFFFFF' : pick(palette),
      lineWidth: 5 - r,
      life: 1,
      decay: 0.03 + r * 0.006
    })
  }
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
    const speed = (4 + Math.random() * 9) * power
    const roll = Math.random()
    const kind = roll < 0.45 ? 'star' : roll < 0.8 ? 'spark' : 'confetti'
    const size = kind === 'star' ? 6 + Math.random() * 7 : kind === 'spark' ? 2 + Math.random() * 3 : 6 + Math.random() * 5
    particles.push({
      kind,
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      gravity: kind === 'confetti' ? 0.18 : 0.09,
      drag: kind === 'confetti' ? 0.975 : 0.93,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      color: pick(palette),
      size,
      width: size,
      height: size * 0.6,
      life: 1,
      decay: 0.012 + Math.random() * 0.012
    })
  }
  ensureLoop()
}

function burstFromElement(el, palette, options = {}) {
  if (!el || !canvasCtx) return
  const rect = el.getBoundingClientRect()
  spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, { palette, ...options })
}

function startCannonBurst(totalPoints, count) {
  if (!canvasCtx) return
  const w = canvasW
  const h = canvasH
  const tier = tierFor(totalPoints, count)
  const palette = PALETTES[tier]
  const particlesPerCannon = tier === 'mega' ? 80 : tier === 'large' ? 70 : tier === 'medium' ? 45 : 28

  // Two ground cannons baseline; large/mega add side + extra angled cannons
  const cannons = [
    { x: 0, y: h, angle: -Math.PI / 3, spread: Math.PI / 7, power: 1 },
    { x: w, y: h, angle: -2 * Math.PI / 3, spread: Math.PI / 7, power: 1 }
  ]
  if (tier === 'large' || tier === 'mega') {
    cannons.push(
      { x: 0, y: h * 0.55, angle: -Math.PI / 5, spread: Math.PI / 9, power: 0.8 },
      { x: w, y: h * 0.55, angle: -4 * Math.PI / 5, spread: Math.PI / 9, power: 0.8 }
    )
  }
  if (tier === 'mega') {
    cannons.push(
      { x: w * 0.25, y: h, angle: -Math.PI / 2.4, spread: Math.PI / 9, power: 1.05 },
      { x: w * 0.75, y: h, angle: -Math.PI + Math.PI / 2.4, spread: Math.PI / 9, power: 1.05 }
    )
  }

  spawnConfetti(cannons, particlesPerCannon, palette, tier === 'mega' ? 1.15 : 1)
  ensureLoop()

  // Mega tier: a second wave 600ms later keeps the moment going
  if (tier === 'mega') {
    schedule(() => {
      spawnConfetti(cannons, Math.floor(particlesPerCannon * 0.7), palette, 1.05)
      ensureLoop()
    }, 600)
  }
}

function startLevelUpBeam(duration = 2600) {
  if (!canvasCtx) return
  beam = { start: performance.now(), duration }
  ensureLoop()
}

function drawStar(ctx, radius, points = 5, inset = 0.45) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? radius : radius * inset
    const a = (i * Math.PI) / points - Math.PI / 2
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
}

function drawBeam(ctx, t) {
  const w = canvasW
  const h = canvasH
  const cx = w / 2
  const cy = h / 2
  const beamWidth = 280

  // Vertical golden light sweep, fading as it goes
  const sweepFade = Math.max(0, 1 - t * 0.9)
  const beamGradient = ctx.createLinearGradient(0, 0, 0, h)
  beamGradient.addColorStop(0, 'rgba(255, 215, 0, 0)')
  beamGradient.addColorStop(0.55, `rgba(240, 129, 42, ${0.18 * sweepFade})`)
  beamGradient.addColorStop(0.85, `rgba(255, 215, 0, ${0.32 * sweepFade})`)
  beamGradient.addColorStop(1, `rgba(255, 235, 130, ${0.45 * sweepFade})`)
  ctx.fillStyle = beamGradient
  ctx.fillRect(cx - beamWidth / 2, 0, beamWidth, h)

  // Three pulse rings, staggered
  for (let i = 0; i < 3; i++) {
    const ringT = (t - i * 0.22) / 0.7
    if (ringT < 0 || ringT > 1) continue
    const easedT = 1 - Math.pow(1 - ringT, 2)
    const ringRadius = easedT * Math.min(w, h) * 0.55
    const ringAlpha = (1 - ringT) * 0.6
    ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Rising sparkles within the beam
  const sparkleCount = 36
  for (let i = 0; i < sparkleCount; i++) {
    const sparkleT = ((t * 1.6) + (i * 31 % sparkleCount) / sparkleCount) % 1
    const sx = cx + Math.sin(i * 1.7 + t * 4) * (beamWidth * 0.42)
    const sy = h - sparkleT * h
    const r = 1.4 + Math.sin(i + t * 8) * 1.6
    ctx.fillStyle = `rgba(255, 240, 180, ${(1 - sparkleT) * sweepFade * 0.85})`
    ctx.beginPath()
    ctx.arc(sx, sy, Math.max(0.5, r), 0, Math.PI * 2)
    ctx.fill()
  }
}

function tick(now) {
  const ctx = canvasCtx
  if (!ctx) return
  ctx.clearRect(0, 0, canvasW, canvasH)

  let beamAlive = false
  if (beam) {
    const t = (now - beam.start) / beam.duration
    if (t < 1) {
      drawBeam(ctx, t)
      beamAlive = true
    } else {
      beam = null
    }
  }

  const alive = []
  for (const p of particles) {
    p.life -= p.decay
    if (p.life <= 0) continue

    if (p.kind === 'ring') {
      p.radius += p.vr
      p.vr *= 0.94
      ctx.globalAlpha = p.life * 0.8
      ctx.strokeStyle = p.color
      ctx.lineWidth = p.lineWidth * p.life + 0.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.stroke()
      alive.push(p)
      continue
    }

    p.vy += p.gravity
    p.vx *= p.drag
    p.vy *= p.kind === 'confetti' ? 1 : p.drag
    p.x += p.vx
    p.y += p.vy
    p.rotation += p.rotationSpeed
    if (p.y > canvasH + 60 || p.x < -60 || p.x > canvasW + 60) continue

    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4))
    ctx.fillStyle = p.color
    if (p.kind === 'star') {
      // Stars shrink as they fade and twinkle via a scale wobble
      const twinkle = 0.75 + Math.sin(now / 60 + p.size) * 0.25
      drawStar(ctx, p.size * (0.4 + p.life * 0.6) * twinkle)
    } else if (p.kind === 'spark') {
      ctx.beginPath()
      ctx.arc(0, 0, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2)
      ctx.fill()
    } else {
      // Slight foreshortening on rotation fakes 3D paper flutter
      ctx.scale(Math.cos(p.rotation * 1.5) * 0.4 + 0.6, 1)
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height)
    }
    ctx.restore()
    alive.push(p)
  }
  ctx.globalAlpha = 1
  particles = alive

  if (particles.length > 0 || beamAlive) {
    animationRafId = requestAnimationFrame(tick)
  } else {
    animationRafId = null
    ctx.clearRect(0, 0, canvasW, canvasH)
  }
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function showNextItem() {
  // If already showing something, don't interrupt
  if (visible.value) return

  // Capture (don't skip) any xp_update items at the front — they contain the level
  // progress data used by the inline XP bar. The latest one wins.
  let pendingLevelData = null
  while (props.queue.length > 0 && props.queue[0]?.type === 'xp_update') {
    pendingLevelData = props.queue.shift().payload
  }
  levelData.value = pendingLevelData

  if (props.queue.length === 0) {
    visible.value = false
    currentItem.value = null
    remainingCount.value = 0
    return
  }

  const next = props.queue[0]

  if (next.type === 'achievement') {
    // Drain ALL consecutive achievements into one grouped modal
    const achievements = []
    while (props.queue.length > 0 && props.queue[0]?.type === 'achievement') {
      achievements.push(props.queue.shift().payload.achievement)
    }
    currentItem.value = { type: 'achievement_group', achievements }
  } else {
    currentItem.value = props.queue.shift()
  }

  // Recompute remaining (excluding xp_update placeholders still ahead)
  remainingCount.value = props.queue.filter(i => i.type !== 'xp_update').length

  itemKey.value++
  cardIcons.length = 0
  xpPopKey.value = 0
  if (currentItem.value.type === 'level_up') {
    shownLevel.value = currentItem.value.payload.oldLevel
  }
  if (levelData.value) {
    displayedLevel.value = levelData.value.oldLevel
    displayedXPCurrent.value = levelData.value.oldXP
  }
  displayedXP.value = 0

  reducedMotion.value = prefersReducedMotion()
  visible.value = true
  nextTick(() => {
    stopAnimation()
    if (reducedMotion.value) canvasCtx = null
    else setupCanvas()

    if (currentItem.value?.type === 'achievement_group') {
      const count = currentItem.value.achievements.length
      const totalPoints = currentItem.value.achievements.reduce((sum, a) => sum + (a.points || 0), 0)
      const mode = layoutMode.value
      let xpStart

      if (mode === 'hero') {
        // Badge drops in and squashes on impact at ~400ms: pop the burst and
        // fire the cannons on that exact frame so it reads as one hit.
        const rarity = heroRarity.value
        schedule(() => {
          const power = RARITY_BURST_POWER[rarity]
          burstFromElement(heroBadge.value, RARITY_BURST[rarity], {
            count: Math.round(36 * power),
            power,
            rings: rarity === 'legendary' || rarity === 'epic' ? 2 : 1
          })
          startCannonBurst(totalPoints, count)
          playAchievementChime(rarity)
        }, 400)
        // Legendary gets an encore burst once the sparkles are up
        if (rarity === 'legendary') {
          schedule(() => {
            burstFromElement(heroBadge.value, RARITY_BURST.legendary, { count: 28, power: 0.9 })
          }, 1100)
        }
        xpStart = 950
      } else {
        // Multi-achievement modals: let the cards cascade in first, each icon
        // popping with a mini burst as it lands, then fire the cannons.
        let cannonDelay = 0
        if (count >= 6) cannonDelay = 850
        else if (count >= 3) cannonDelay = 500
        else if (count >= 2) cannonDelay = 250

        if (mode === 'cards') {
          sortedAchievements.value.forEach((ach, idx) => {
            schedule(() => {
              burstFromElement(cardIcons[idx], RARITY_BURST[rarityFor(ach.points)], {
                count: 14,
                power: 0.45
              })
              playPop(idx)
            }, idx * 110 + 440)
          })
        }
        schedule(() => {
          startCannonBurst(totalPoints, count)
          playAchievementChime(rarityFor(sortedAchievements.value[0]?.points || 0))
        }, cannonDelay)

        // XP animation runs AFTER cards have finished cascading in, otherwise the
        // user's eye is still on the cards and they miss the bar filling.
        const cascadeStagger = count >= 6 ? 85 : 110
        const cascadeEnd = (count - 1) * cascadeStagger + 550
        xpStart = Math.max(cascadeEnd + 150, cannonDelay + 200)
      }

      // For level-up scenarios, slow the bar so each level transition is perceivable.
      let xpDuration
      if (levelData.value) {
        const levelsGained = Math.max(1, levelData.value.newLevel - levelData.value.oldLevel)
        xpDuration = 1800 + levelsGained * 1400
      } else {
        xpDuration = count >= 6 ? 1100 : count >= 3 ? 850 : 650
      }
      schedule(() => {
        if (levelData.value) {
          animateLevelProgress(levelData.value, xpDuration)
        } else {
          animateXPCount(totalPoints, xpDuration)
        }
      }, xpStart)
      // Chip bounces once the count lands
      schedule(() => { xpPopKey.value++ }, xpStart + xpDuration)
    } else if (currentItem.value?.type === 'level_up') {
      const newLevel = currentItem.value.payload.newLevel
      // Small thud when the badge lands, then the big moment when the number flips
      schedule(() => {
        burstFromElement(levelBadge.value, RARITY_BURST.legendary, { count: 16, power: 0.6 })
      }, 400)
      schedule(() => {
        shownLevel.value = newLevel
        burstFromElement(levelBadge.value, RARITY_BURST.legendary, { count: 50, power: 1.4, rings: 2 })
        startLevelUpBeam()
        startCannonBurst(100, 3)
        playLevelUpFanfare()
      }, 850)
    }
  })
}

function handleDismissAll() {
  stopAnimation()
  props.queue.splice(0, props.queue.length)
  // Pending notifications stay unread — dismissing the modal shouldn't
  // silently consume them; the user can still find them in the bell.
  pendingCelebrationNotifications.value = []
  celebrationLevelContext.value = null
  visible.value = false
  currentItem.value = null
  isAnimating.value = false
  remainingCount.value = 0
}

async function handleContinue() {
  if (isAnimating.value) return
  isAnimating.value = true
  stopAnimation()
  visible.value = false
  currentItem.value = null
  await wait(200)

  // If the in-memory queue is exhausted but we have more unread achievement
  // notifications, pop the next one onto the queue and mark it as read.
  // advanceCelebrationCursor walks the captured level context forward by
  // this achievement's points so the bar continues from where the previous
  // modal left off — by the final modal it will have caught up to the
  // user's true current XP / level.
  if (props.queue.length === 0 && pendingCelebrationNotifications.value.length > 0) {
    const next = pendingCelebrationNotifications.value.shift()
    markNotificationsRead(next.notificationId)
    const xpUpdate = advanceCelebrationCursor(
      celebrationLevelContext.value,
      next.achievement.points
    )
    if (xpUpdate) {
      props.queue.push({ type: 'xp_update', payload: xpUpdate })
    }
    props.queue.push({
      type: 'achievement',
      payload: { achievement: next.achievement }
    })
  }

  // When we've fully exhausted both the queue and pending list, the user
  // has visually walked the bar up to their actual level — so mark any
  // unread level_up notifications as read too. Then drop the captured
  // level context so future SSE-driven celebrations aren't tinted by
  // stale data.
  if (
    props.queue.length === 0 &&
    pendingCelebrationNotifications.value.length === 0
  ) {
    const levelUpIds =
      celebrationLevelContext.value?.levelUpNotificationIds || []
    if (levelUpIds.length > 0) {
      markNotificationsRead(
        levelUpIds.map((id) => ({ id, type: 'level_up' }))
      )
    }
    celebrationLevelContext.value = null
  }

  isAnimating.value = false
  showNextItem()
}

watch(() => props.queue.length, (newLen) => {
  if (newLen > 0 && !visible.value && !isAnimating.value) {
    // Tiny settling delay so any remaining achievements that arrive in the same SSE batch
    // get grouped into a single modal instead of opening one and queuing the rest.
    setTimeout(() => {
      if (!visible.value && !isAnimating.value) showNextItem()
    }, 80)
  }
}, { immediate: true })

onMounted(() => {
  primeCelebrationAudio()
  if (props.queue.length > 0 && !visible.value) {
    showNextItem()
  }
})

onBeforeUnmount(() => {
  stopAnimation()
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Chunky "pressable" button: a solid bottom edge that collapses on press */
.btn-chunky {
  @apply rounded-xl bg-primary-500 px-4 py-3 text-base font-bold text-white;
  box-shadow: 0 4px 0 theme('colors.primary.700');
  transition: transform 0.08s ease, box-shadow 0.08s ease, background-color 0.15s ease, filter 0.15s ease;
}
.btn-chunky:hover:not(:disabled) { filter: brightness(1.06); }
.btn-chunky:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow: 0 0 0 theme('colors.primary.700');
}
.btn-chunky:disabled {
  @apply cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400;
  box-shadow: 0 4px 0 theme('colors.gray.400');
}
.dark .btn-chunky:disabled { box-shadow: 0 4px 0 theme('colors.gray.800'); }

/* Modal springs in instead of just fading */
@keyframes modalPop {
  0%   { transform: scale(0.6); opacity: 0; }
  55%  { transform: scale(1.04); opacity: 1; }
  75%  { transform: scale(0.98); }
  100% { transform: scale(1); }
}
.modal-pop { animation: modalPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both; }

/* Badge drops from above, squashes on impact, rebounds, settles */
@keyframes badgeDrop {
  0%   { transform: translateY(-170px) scale(0.5, 0.5); opacity: 0; }
  30%  { opacity: 1; }
  40%  { transform: translateY(0) scale(1.28, 0.74); }
  58%  { transform: translateY(-22px) scale(0.9, 1.12); }
  76%  { transform: translateY(0) scale(1.08, 0.94); }
  88%  { transform: translateY(-4px) scale(0.98, 1.02); }
  100% { transform: translateY(0) scale(1, 1); opacity: 1; }
}
.badge-drop {
  transform-origin: 50% 100%;
  animation: badgeDrop 0.7s cubic-bezier(0.22, 0.9, 0.36, 1) 120ms both;
}

/* Gentle idle bob + wiggle once the badge has settled */
@keyframes badgeFloat {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25%      { transform: translateY(-5px) rotate(-3deg); }
  75%      { transform: translateY(-2px) rotate(3deg); }
}
.badge-float { animation: badgeFloat 2.6s ease-in-out 1.3s infinite; }

/* Solid 3D badge: chunky darker bottom edge + inner top highlight */
.badge-3d {
  position: relative;
  overflow: hidden;
  box-shadow: 0 6px 0 var(--badge-edge), inset 0 -6px 0 rgba(0, 0, 0, 0.08), inset 0 4px 0 rgba(255, 255, 255, 0.35);
}
/* Shine sweep across the badge face */
.badge-3d::after {
  content: '';
  position: absolute;
  top: -20%;
  left: -60%;
  width: 40%;
  height: 140%;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0));
  transform: skewX(-20deg) translateX(0);
  animation: badgeShine 2.8s ease-in-out 0.9s infinite;
}
@keyframes badgeShine {
  0%   { transform: skewX(-20deg) translateX(0); }
  35%  { transform: skewX(-20deg) translateX(420%); }
  100% { transform: skewX(-20deg) translateX(420%); }
}

.badge-common    { --badge-edge: #64748b; background-image: linear-gradient(to bottom, #b8c2d0, #94a3b8); }
.badge-uncommon  { --badge-edge: #15803d; background-image: linear-gradient(to bottom, #5be38d, #22c55e); }
.badge-rare      { --badge-edge: #0e7490; background-image: linear-gradient(to bottom, #3ddcf0, #06b6d4); }
.badge-epic      { --badge-edge: #6d28d9; background-image: linear-gradient(to bottom, #b39dfc, #8b5cf6); }
.badge-legendary { --badge-edge: #bd4f13; background-image: linear-gradient(to bottom, #FFC83D, #F0812A); }
.badge-level     { --badge-edge: #bd4f13; background-image: linear-gradient(to bottom, #FFC83D, #F0812A); }

/* Sunburst rays behind the badge, tinted per rarity */
.stage-common    { --ray: rgba(148, 163, 184, 0.28); color: #94a3b8; }
.stage-uncommon  { --ray: rgba(34, 197, 94, 0.22);   color: #22c55e; }
.stage-rare      { --ray: rgba(6, 182, 212, 0.22);   color: #06b6d4; }
.stage-epic      { --ray: rgba(139, 92, 246, 0.24);  color: #a78bfa; }
.stage-legendary { --ray: rgba(240, 129, 42, 0.28);  color: #FFC83D; }
.stage-level     { --ray: rgba(240, 129, 42, 0.28);  color: #FFC83D; }

.sunburst {
  background: repeating-conic-gradient(var(--ray) 0deg 12deg, transparent 12deg 30deg);
  -webkit-mask-image: radial-gradient(circle, #000 18%, transparent 68%);
  mask-image: radial-gradient(circle, #000 18%, transparent 68%);
  border-radius: 9999px;
  opacity: 0;
  animation: raysIn 0.5s ease-out 380ms forwards, raysSpin 14s linear 380ms infinite;
}
.sunburst-fast { animation: raysIn 0.5s ease-out 380ms forwards, raysSpin 8s linear 380ms infinite; }
@keyframes raysIn {
  from { opacity: 0; scale: 0.4; }
  to   { opacity: 1; scale: 1; }
}
@keyframes raysSpin {
  from { rotate: 0deg; }
  to   { rotate: 360deg; }
}

/* Twinkling 4-point stars around the badge */
@keyframes sparkle {
  0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
  20%      { transform: scale(1.15) rotate(45deg); opacity: 1; }
  45%      { transform: scale(0.9) rotate(90deg); opacity: 1; }
  65%      { transform: scale(0) rotate(135deg); opacity: 0; }
}
.sparkle {
  transform: scale(0);
  animation: sparkle 1.8s ease-in-out infinite;
}

/* Text entrances */
@keyframes popIn {
  0%   { transform: scale(0.3); opacity: 0; }
  60%  { transform: scale(1.12); opacity: 1; }
  80%  { transform: scale(0.96); }
  100% { transform: scale(1); opacity: 1; }
}
.pop-in { animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }

@keyframes riseIn {
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
.rise-in { animation: riseIn 0.4s ease-out both; }

/* Card icons and point chips pop as each card lands */
@keyframes iconPop {
  0%   { transform: scale(0) rotate(-25deg); }
  55%  { transform: scale(1.3) rotate(8deg); }
  80%  { transform: scale(0.92) rotate(-3deg); }
  100% { transform: scale(1) rotate(0deg); }
}
.icon-pop { animation: iconPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both; }

/* XP chip bounce when the count lands */
@keyframes xpPop {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.35) rotate(-4deg); }
  65%  { transform: scale(0.94) rotate(2deg); }
  100% { transform: scale(1); }
}
.xp-chip { display: inline-block; transform-origin: 100% 50%; }
.xp-pop { animation: xpPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }

/* Progress bar highlight stripe (the glossy top line on a game progress bar) */
.xp-fill { box-shadow: 0 0 8px rgba(240, 129, 42, 0.5); }
.xp-fill::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 6px;
  right: 6px;
  height: 3px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.45);
}

/* Level number flips in when it changes to the new level */
@keyframes levelNumIn {
  0%   { transform: scale(0.2) rotate(-90deg); opacity: 0; }
  60%  { transform: scale(1.35) rotate(10deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
.level-num-in { display: inline-block; animation: levelNumIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }

@keyframes pulseRing {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.6); opacity: 0; }
}

.animate-pulse-ring {
  animation: pulseRing 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

@keyframes levelFlash {
  0%   { background: rgba(255, 255, 255, 0); box-shadow: none; }
  20%  { background: rgba(255, 255, 255, 0.85); box-shadow: 0 0 16px 4px rgba(255, 215, 0, 0.85); }
  100% { background: rgba(255, 255, 255, 0); box-shadow: none; }
}

.level-flash {
  animation: levelFlash 0.45s ease-out both;
}

@keyframes cascadeIn {
  0%   { opacity: 0; transform: translateY(60px) scale(0.5); }
  60%  { opacity: 1; transform: translateY(-6px) scale(1.08); }
  100% { opacity: 1; transform: translateY(0)    scale(1); }
}

.cascade-in {
  opacity: 0;
  animation: cascadeIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* Rarity tier styling — icon containers + hero headers */
.rarity-icon-common      { background-color: rgb(241 245 249); color: rgb(100 116 139); }
.rarity-icon-uncommon    { background-color: rgb(220 252 231); color: rgb(22 163 74); }
.rarity-icon-rare        { background-color: rgb(207 250 254); color: rgb(8 145 178); }
.rarity-icon-epic        { background-color: rgb(237 233 254); color: rgb(124 58 237); }
.rarity-icon-legendary   { background-color: rgb(254 240 200); color: rgb(228 106 22); }

.dark .rarity-icon-common    { background-color: rgba(100, 116, 139, 0.2); color: rgb(148 163 184); }
.dark .rarity-icon-uncommon  { background-color: rgba(22, 163, 74, 0.2);  color: rgb(74 222 128); }
.dark .rarity-icon-rare      { background-color: rgba(8, 145, 178, 0.2);  color: rgb(103 232 249); }
.dark .rarity-icon-epic      { background-color: rgba(124, 58, 237, 0.2); color: rgb(196 181 253); }
.dark .rarity-icon-legendary { background-color: rgba(228, 106, 22, 0.2); color: rgb(250 176 91); }

/* Tinted text for the unlock-% rarity label */
.rarity-text-common      { color: rgb(100 116 139); }
.rarity-text-uncommon    { color: rgb(22 163 74); }
.rarity-text-rare        { color: rgb(8 145 178); }
.rarity-text-epic        { color: rgb(124 58 237); }
.rarity-text-legendary   { color: rgb(228 106 22); }

.dark .rarity-text-common    { color: rgb(148 163 184); }
.dark .rarity-text-uncommon  { color: rgb(74 222 128); }
.dark .rarity-text-rare      { color: rgb(103 232 249); }
.dark .rarity-text-epic      { color: rgb(196 181 253); }
.dark .rarity-text-legendary { color: rgb(250 176 91); }

/* Hero header gradients — tier color fading to brand */
.header-common      { background-image: linear-gradient(to right, rgb(100 116 139), rgb(148 163 184)); }
.header-uncommon    { background-image: linear-gradient(to right, rgb(22 163 74),   rgb(74 222 128)); }
.header-rare        { background-image: linear-gradient(to right, rgb(8 145 178),   rgb(34 211 238)); }
.header-epic        { background-image: linear-gradient(to right, rgb(124 58 237),  rgb(167 139 250)); }
.header-legendary   { background-image: linear-gradient(to right, rgb(189 79 19),   rgb(240 129 42)); }

/* Applied when the OS asks for reduced motion (see prefersReducedMotion) */
.reduce-motion .modal-pop,
.reduce-motion .badge-drop,
.reduce-motion .badge-float,
.reduce-motion .sunburst,
.reduce-motion .pop-in,
.reduce-motion .rise-in,
.reduce-motion .icon-pop,
.reduce-motion .xp-pop,
.reduce-motion .cascade-in,
.reduce-motion .level-num-in,
.reduce-motion .animate-pulse-ring {
  animation: none !important;
  opacity: 1 !important;
}
.reduce-motion .badge-3d::after { animation: none !important; display: none; }
.reduce-motion .sparkle { display: none; }
</style>
