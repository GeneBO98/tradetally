<template>
  <transition name="fade">
    <div v-if="visible" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" @click.self="handleDismissAll">
      <!-- Achievement(s) modal -->
      <div
        v-if="currentItem?.type === 'achievement_group'"
        class="relative w-full max-w-md mx-4 overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
      >
        <div
          class="px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white"
          :class="layoutMode === 'hero' ? `header-${heroRarity}` : 'bg-gradient-to-r from-primary-600 to-primary-500'"
        >
          {{ layoutMode === 'hero'
            ? heroHeaderLabel
            : `${currentItem.achievements.length} achievements unlocked` }}
        </div>

        <div class="px-6 py-6 space-y-5">
          <!-- Single achievement: hero layout -->
          <div v-if="layoutMode === 'hero'" class="text-center space-y-3">
            <div :class="['mx-auto flex h-16 w-16 items-center justify-center rounded-full ring-4', `rarity-icon-${heroRarity}`]">
              <svg class="h-9 w-9" viewBox="0 0 24 24" fill="currentColor">
                <path :d="iconPathFor(sortedAchievements[0].points)"/>
              </svg>
            </div>
            <div>
              <div class="text-xl font-bold text-gray-900 dark:text-white">{{ sortedAchievements[0].name }}</div>
              <div class="mt-1 text-sm text-gray-600 dark:text-gray-400">{{ sortedAchievements[0].description }}</div>
              <div v-if="hasUnlockPct(sortedAchievements[0])" class="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
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
              <div :class="['flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full', `rarity-icon-${rarityFor(ach.points)}`]">
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
              <div class="flex-shrink-0 font-mono text-xs font-bold text-yellow-600 dark:text-yellow-400">+{{ ach.points }}</div>
            </div>
          </div>

          <!-- 6+ achievements: compact 2-column grid, count is the focal point -->
          <div v-else>
            <div class="text-center">
              <div class="font-mono text-5xl font-extrabold text-primary-600 dark:text-primary-400 leading-none">{{ currentItem.achievements.length }}</div>
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
              <div class="font-mono text-lg font-bold text-yellow-600 dark:text-yellow-400 tabular-nums">+{{ displayedXP }} XP</div>
            </div>
            <div class="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                class="h-full rounded-full bg-gradient-to-r from-yellow-400 via-primary-500 to-primary-600 shadow-[0_0_8px_rgba(240,129,42,0.55)]"
                :style="{ width: xpBarPercent + '%' }"
              ></div>
              <!-- Flash overlay re-mounts via :key whenever a level boundary is crossed -->
              <div
                v-if="levelData"
                :key="`flash-${levelFlashKey}`"
                class="level-flash pointer-events-none absolute inset-0 rounded-full"
              ></div>
            </div>
            <div v-if="levelData && levelData.newLevel > levelData.oldLevel" class="mt-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
              {{ levelData.newLevel - levelData.oldLevel === 1 ? 'Level up!' : `${levelData.newLevel - levelData.oldLevel}× level up!` }}
            </div>
          </div>

          <div class="space-y-2">
            <button
              @click="handleContinue"
              :disabled="isAnimating"
              class="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
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
        class="relative w-full max-w-md mx-4 overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
      >
        <div class="px-8 pt-10 pb-8 text-center space-y-5">
          <div class="relative mx-auto h-24 w-24 level-badge-pop">
            <div class="absolute inset-0 animate-pulse-ring rounded-full bg-yellow-400/20"></div>
            <div class="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 via-primary-500 to-primary-600 text-3xl font-extrabold text-white shadow-lg ring-4 ring-yellow-300/40 dark:ring-yellow-500/30">
              {{ currentItem.payload.newLevel }}
            </div>
          </div>
          <div>
            <div class="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">Level Up!</div>
            <div class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Level {{ currentItem.payload.oldLevel }}
              <span class="mx-1.5 text-gray-300 dark:text-gray-600">→</span>
              <span class="font-bold text-primary-600 dark:text-primary-400">Level {{ currentItem.payload.newLevel }}</span>
            </div>
          </div>
          <button
            @click="handleContinue"
            :disabled="isAnimating"
            class="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
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

const heroHeaderLabel = computed(() => RARITY_LABELS[heroRarity.value] || 'Achievement unlocked')

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
  if (!authStore.token) return
  const list = Array.isArray(items)
    ? items
    : items
      ? [{ id: items, type: 'achievement_earned' }]
      : []
  if (list.length === 0) return
  try {
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify({ notifications: list })
    })
  } catch (err) {
    console.error('[CELEBRATION] Failed to mark notifications as read:', err)
  }
}

function stopAnimation() {
  if (animationRafId) {
    cancelAnimationFrame(animationRafId)
    animationRafId = null
  }
  const canvas = animationCanvas.value
  if (canvas) {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  particles = []
}

// Color palettes scale with the celebration tier
const PALETTES = {
  small: ['#F0812A', '#FAB05B', '#FFD700', '#FCD098'],
  medium: ['#F0812A', '#FFD700', '#FFB36B', '#FFFFFF', '#FAB05B', '#F78F2F'],
  large: ['#F0812A', '#FFD700', '#FF6B6B', '#6BFFB8', '#9D7AFF', '#FFFFFF', '#FAB05B'],
  mega: ['#F0812A', '#FFD700', '#FF6B6B', '#6BFFB8', '#9D7AFF', '#FFFFFF', '#FAB05B', '#FF85DA', '#5AC8FA']
}

function tierFor(totalPoints, count) {
  if (totalPoints >= 200 || count >= 10) return 'mega'
  if (totalPoints >= 75 || count >= 3) return 'large'
  if (totalPoints >= 25 || count >= 2) return 'medium'
  return 'small'
}

function spawnParticles(cannons, particlesPerCannon, palette, sizeBoost = 1) {
  cannons.forEach(cannon => {
    for (let i = 0; i < particlesPerCannon; i++) {
      const angle = cannon.angle + (Math.random() - 0.5) * cannon.spread
      const speed = (10 + Math.random() * 8) * cannon.power
      const shapeRoll = Math.random()
      const shape = shapeRoll < 0.55 ? 'rect' : shapeRoll < 0.85 ? 'square' : 'ribbon'
      const baseSize = (9 + Math.random() * 7) * sizeBoost
      particles.push({
        x: cannon.x,
        y: cannon.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.22,
        drag: 0.992,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.35,
        color: palette[Math.floor(Math.random() * palette.length)],
        shape,
        width: shape === 'ribbon' ? baseSize * 0.45 : baseSize,
        height: shape === 'ribbon' ? baseSize * 2.6 : baseSize,
        life: 1,
        decay: 0.0035 + Math.random() * 0.004
      })
    }
  })
}

function startCannonBurst(totalPoints, count) {
  stopAnimation()

  const canvas = animationCanvas.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.scale(dpr, dpr)

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

  particles = []
  spawnParticles(cannons, particlesPerCannon, palette, tier === 'mega' ? 1.15 : 1)

  // Mega tier: schedule a second wave 600ms later — keeps the moment going
  if (tier === 'mega') {
    setTimeout(() => {
      spawnParticles(cannons, Math.floor(particlesPerCannon * 0.7), palette, 1.05)
      // Restart the loop if it stopped between waves (unlikely but safe)
      if (!animationRafId) animationRafId = requestAnimationFrame(tick)
    }, 600)
  }

  const tick = () => {
    ctx.clearRect(0, 0, w, h)
    let alive = 0
    for (const p of particles) {
      p.vy += p.gravity
      p.vx *= p.drag
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.rotationSpeed
      p.life -= p.decay

      if (p.y < h + 60 && p.life > 0 && p.x > -60 && p.x < w + 60) {
        alive++
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life))
        ctx.fillStyle = p.color
        // Slight foreshortening on rotation Y to fake 3D paper flutter
        const sx = Math.cos(p.rotation * 1.5) * 0.4 + 0.6
        ctx.scale(sx, 1)
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height)
        ctx.restore()
      }
    }

    if (alive > 0) {
      animationRafId = requestAnimationFrame(tick)
    } else {
      stopAnimation()
    }
  }

  animationRafId = requestAnimationFrame(tick)
}

function startLevelUpAnimation() {
  stopAnimation()

  const canvas = animationCanvas.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.scale(dpr, dpr)

  const cx = w / 2
  const cy = h / 2
  const startTime = performance.now()
  const duration = 2600
  const beamWidth = 280

  const tick = (now) => {
    const elapsed = now - startTime
    const t = elapsed / duration

    if (t >= 1) {
      ctx.clearRect(0, 0, w, h)
      stopAnimation()
      return
    }

    ctx.clearRect(0, 0, w, h)

    // Vertical golden light sweep — rises from bottom, fades as it goes
    const sweepFade = Math.max(0, 1 - t * 0.9)
    const beamGradient = ctx.createLinearGradient(0, 0, 0, h)
    beamGradient.addColorStop(0, `rgba(255, 215, 0, 0)`)
    beamGradient.addColorStop(0.55, `rgba(240, 129, 42, ${0.18 * sweepFade})`)
    beamGradient.addColorStop(0.85, `rgba(255, 215, 0, ${0.32 * sweepFade})`)
    beamGradient.addColorStop(1, `rgba(255, 235, 130, ${0.45 * sweepFade})`)
    ctx.fillStyle = beamGradient
    ctx.fillRect(cx - beamWidth / 2, 0, beamWidth, h)

    // Soft outer beam (wider, lower opacity) for halo
    const haloGradient = ctx.createLinearGradient(0, 0, 0, h)
    haloGradient.addColorStop(0, `rgba(255, 215, 0, 0)`)
    haloGradient.addColorStop(1, `rgba(240, 129, 42, ${0.15 * sweepFade})`)
    ctx.fillStyle = haloGradient
    ctx.fillRect(cx - beamWidth, 0, beamWidth * 2, h)

    // Three pulse rings, staggered
    for (let i = 0; i < 3; i++) {
      const ringDelay = i * 0.22
      const ringT = (t - ringDelay) / 0.7
      if (ringT < 0 || ringT > 1) continue
      const easedT = 1 - Math.pow(1 - ringT, 2) // ease-out
      const ringRadius = easedT * Math.min(w, h) * 0.55
      const ringAlpha = (1 - ringT) * 0.6

      ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2)
      ctx.stroke()

      ctx.strokeStyle = `rgba(240, 129, 42, ${ringAlpha * 0.5})`
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.arc(cx, cy, ringRadius * 0.94, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Rising sparkles within the beam
    const sparkleCount = 36
    for (let i = 0; i < sparkleCount; i++) {
      const sparkleT = ((t * 1.6) + (i * 31 % sparkleCount) / sparkleCount) % 1
      const lateral = Math.sin(i * 1.7 + t * 4) * (beamWidth * 0.42)
      const sx = cx + lateral
      const sy = h - sparkleT * h
      const sparkleAlpha = (1 - sparkleT) * sweepFade * 0.85
      const r = 1.4 + Math.sin(i + t * 8) * 1.6
      ctx.fillStyle = `rgba(255, 240, 180, ${sparkleAlpha})`
      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(0.5, r), 0, Math.PI * 2)
      ctx.fill()
    }

    animationRafId = requestAnimationFrame(tick)
  }

  animationRafId = requestAnimationFrame(tick)
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

  visible.value = true
  nextTick(() => {
    if (currentItem.value?.type === 'achievement_group') {
      const count = currentItem.value.achievements.length
      const totalPoints = currentItem.value.achievements.reduce((sum, a) => sum + (a.points || 0), 0)
      // For multi-achievement modals, let the cards cascade in first (in silence) before
      // firing the cannons — otherwise the cannon motion drowns out the card cascade.
      // Delay scales with count so 15 cards have time to land.
      let cannonDelay = 0
      if (count >= 6) cannonDelay = 850
      else if (count >= 3) cannonDelay = 500
      else if (count >= 2) cannonDelay = 250
      setTimeout(() => {
        if (currentItem.value?.type === 'achievement_group') {
          startCannonBurst(totalPoints, count)
        }
      }, cannonDelay)
      // XP animation runs AFTER cards have finished cascading in — otherwise the
      // user's eye is still on the cards and they miss the bar filling.
      // Estimate cascade end: stagger × (count - 1) + per-card duration (~550ms).
      const cascadeStagger = count >= 6 ? 85 : 110
      const cascadeEnd = (count - 1) * cascadeStagger + 550
      const xpStart = Math.max(cascadeEnd + 150, cannonDelay + 200)
      // For level-up scenarios, slow the bar so each level transition is perceivable.
      // ~1400ms per level transition crossed.
      let xpDuration = 1800
      if (levelData.value) {
        const levelsGained = Math.max(1, levelData.value.newLevel - levelData.value.oldLevel)
        xpDuration = 1800 + levelsGained * 1400
      } else {
        xpDuration = count >= 6 ? 1100 : count >= 3 ? 850 : 650
      }
      setTimeout(() => {
        if (levelData.value) {
          animateLevelProgress(levelData.value, xpDuration)
        } else {
          animateXPCount(totalPoints, xpDuration)
        }
      }, xpStart)
    }
    // Level-up uses modal-only effects (badge pulse + entrance bounce); no canvas burst.
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
  if (props.queue.length > 0 && !visible.value) {
    showNextItem()
  }
})

onBeforeUnmount(() => {
  stopAnimation()
  if (xpRafId) cancelAnimationFrame(xpRafId)
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.btn-primary {
  @apply bg-primary-600 text-white px-4 py-2.5 rounded-md font-medium hover:bg-primary-700 transition-colors;
}

@keyframes pulseRing {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.6); opacity: 0; }
}

.animate-pulse-ring {
  animation: pulseRing 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

@keyframes levelBadgePop {
  0%   { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.level-badge-pop {
  animation: levelBadgePop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
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

/* Hero ring uses a softer tinted halo to match the icon */
.rarity-icon-common.ring-4    { box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.15); }
.rarity-icon-uncommon.ring-4  { box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.18); }
.rarity-icon-rare.ring-4      { box-shadow: 0 0 0 4px rgba(103, 232, 249, 0.18); }
.rarity-icon-epic.ring-4      { box-shadow: 0 0 0 4px rgba(196, 181, 253, 0.2); }
.rarity-icon-legendary.ring-4 { box-shadow: 0 0 0 4px rgba(250, 176, 91, 0.22); }

/* Hero header gradients — tier color fading to brand */
.header-common      { background-image: linear-gradient(to right, rgb(100 116 139), rgb(148 163 184)); }
.header-uncommon    { background-image: linear-gradient(to right, rgb(22 163 74),   rgb(74 222 128)); }
.header-rare        { background-image: linear-gradient(to right, rgb(8 145 178),   rgb(34 211 238)); }
.header-epic        { background-image: linear-gradient(to right, rgb(124 58 237),  rgb(167 139 250)); }
.header-legendary   { background-image: linear-gradient(to right, rgb(189 79 19),   rgb(240 129 42)); }
</style>
