<template>
  <div id="app">
    <NavBar v-if="!isAuthRoute" />
    <main class="min-h-screen">
      <router-view />
    </main>
    
    <!-- Footer -->
    <footer v-if="!isAuthRoute" class="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex items-center justify-center">
          <div class="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
            <a 
              href="mailto:support@tradetally.io"
              class="inline-flex items-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Contact Support
            </a>
            <span>•</span>
            <span>Open Source</span>
            <span>•</span>
            <a 
              href="https://github.com/GeneBO98/tradetally" 
              target="_blank" 
              rel="noopener noreferrer"
              class="inline-flex items-center hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clip-rule="evenodd" />
              </svg>
              View on GitHub
            </a>
            <span>•</span>
            <router-link 
              to="/privacy"
              class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Privacy Policy
            </router-link>
          </div>
        </div>
      </div>
    </footer>
    
    <Notification />
    <ModalAlert />
    <!-- Gamification celebration overlay -->
    <CelebrationOverlay :queue="celebrationQueue" />
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePriceAlertNotifications } from '@/composables/usePriceAlertNotifications'
import NavBar from '@/components/layout/NavBar.vue'
import Notification from '@/components/common/Notification.vue'
import ModalAlert from '@/components/common/ModalAlert.vue'
import CelebrationOverlay from '@/components/gamification/CelebrationOverlay.vue'
import api from '@/services/api'

const route = useRoute()
const authStore = useAuthStore()

// Initialize price alert notifications globally
const { isConnected, connect, disconnect, celebrationQueue } = usePriceAlertNotifications()

const isAuthRoute = computed(() => {
  return ['login', 'register'].includes(route.name)
})

// Watch for authentication changes and user tier changes
let lastConnectionState = false
watch(() => [authStore.user?.tier, authStore.token, authStore.user?.billingEnabled], ([tier, token, billingEnabled]) => {
  const shouldConnect = token && (tier === 'pro' || billingEnabled === false)
  
  // Only connect/disconnect if the state actually changed
  if (shouldConnect !== lastConnectionState) {
    lastConnectionState = shouldConnect
    
    if (shouldConnect) {
      console.log('Connecting to notification stream (user is Pro or billing disabled)')
      connect()
    } else {
      console.log('Disconnecting from notification stream (user not Pro or not authenticated)')
      disconnect()
    }
  }
}, { immediate: true })

onMounted(async () => {
  await authStore.checkAuth()
  // Fallback celebration: surface any unseen achievements/level-ups for non-SSE users
  try {
    if (!authStore.token) return
    const [earnedRes, dashRes] = await Promise.all([
      api.get('/gamification/achievements/earned'),
      api.get('/gamification/dashboard')
    ])
    const earned = earnedRes.data?.data?.achievements || earnedRes.data?.achievements || []
    const stats = dashRes.data?.data?.stats || {}
    const levelProgress = stats.level_progress || {}

    const storageIds = localStorage.getItem('tt_celebrated_achievements')
    const seenIds = storageIds ? JSON.parse(storageIds) : []
    const unseen = earned.filter(a => a.id && !seenIds.includes(a.id)).slice(0, 5)
    if (unseen.length > 0) {
      unseen.forEach(a => celebrationQueue.value.push({ type: 'achievement', payload: { achievement: a } }))
      const newSeen = [...new Set([...seenIds, ...unseen.map(a => a.id)])]
      localStorage.setItem('tt_celebrated_achievements', JSON.stringify(newSeen))
    }

    const lastLevel = parseInt(localStorage.getItem('tt_seen_level') || '0')
    const lastXP = parseInt(localStorage.getItem('tt_seen_xp') || '0')
    const currentLevel = stats.level || 1
    const currentXP = stats.experience_points || 0
    if (currentLevel > lastLevel) {
      celebrationQueue.value.push({ type: 'level_up', payload: { oldLevel: lastLevel || currentLevel - 1, newLevel: currentLevel } })
    }
    if (currentXP > lastXP && levelProgress.current_level_min_xp !== undefined) {
      celebrationQueue.value.push({
        type: 'xp_update',
        payload: {
          oldXP: lastXP,
          newXP: currentXP,
          deltaXP: Math.max(0, currentXP - lastXP),
          oldLevel: lastLevel || currentLevel,
          newLevel: currentLevel,
          currentLevelMinXPBefore: levelProgress.current_level_min_xp,
          nextLevelMinXPBefore: levelProgress.next_level_min_xp,
          currentLevelMinXPAfter: levelProgress.current_level_min_xp,
          nextLevelMinXPAfter: levelProgress.next_level_min_xp
        }
      })
    }
    localStorage.setItem('tt_seen_level', String(currentLevel))
    localStorage.setItem('tt_seen_xp', String(currentXP))
  } catch (e) {
    // ignore fallback errors
  }
})
</script>