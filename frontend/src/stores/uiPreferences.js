import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

// Keys whose values live inside the user_settings.ui_preferences JSONB blob.
// The same key is also used as the localStorage key so callers can keep
// referencing the existing storage keys without renaming.
export const SYNCED_KEYS = Object.freeze([
  'darkMode',
  'tradeListColumns',
  'tradeListFullWidth',
  'tradeFilters',
  'tradeFiltersPeriod',
  'tradetally_global_account',
  'dashboardTimeRange',
  'dashboardCustomStartDate',
  'dashboardCustomEndDate',
  'analyticsFilters',
  'behavioralAnalyticsFilters',
  'gamificationFilters',
  'gamificationTab',
  'marketsFilters',
  'marketsTab',
  'diaryFilters',
  'diaryView',
  'diarySearchQuery',
  'priceAlertsFilters',
  'monthlyPerformanceYear',
  'lastSelectedBroker',
  'passkey_prompt_dismissed'
])

const SYNCED_KEY_SET = new Set(SYNCED_KEYS)
const SYNC_DEBOUNCE_MS = 800

function readLocal(key) {
  const raw = localStorage.getItem(key)
  if (raw === null) return undefined
  // Try JSON; fall back to raw string for legacy plain values like '12345678'.
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function writeLocal(key, value) {
  if (value === undefined || value === null) {
    localStorage.removeItem(key)
    return
  }
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  localStorage.setItem(key, serialized)
}

export const useUiPreferencesStore = defineStore('uiPreferences', () => {
  const initialized = ref(false)
  const pending = ref({})
  let flushTimer = null
  let flushInFlight = null

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, SYNC_DEBOUNCE_MS)
  }

  async function flush() {
    if (!initialized.value) return
    if (Object.keys(pending.value).length === 0) return

    // Wait for any in-flight flush to settle so we send a coherent snapshot.
    if (flushInFlight) {
      try { await flushInFlight } catch (_) {}
    }

    const snapshot = pending.value
    pending.value = {}

    const payload = {}
    for (const key of SYNCED_KEYS) {
      const local = readLocal(key)
      if (local !== undefined) payload[key] = local
    }
    // Ensure deletions show up as explicit nulls in the payload.
    for (const key of Object.keys(snapshot)) {
      if (snapshot[key] === undefined && payload[key] === undefined) {
        payload[key] = null
      }
    }

    flushInFlight = api.put('/settings', { uiPreferences: payload })
      .catch(err => {
        console.warn('[UI PREFS] Failed to sync to server, will retry on next change:', err?.response?.status || err?.message)
        // Re-queue the snapshot so the next change picks it up.
        pending.value = { ...snapshot, ...pending.value }
      })
      .finally(() => {
        flushInFlight = null
      })

    await flushInFlight
  }

  async function init() {
    try {
      const response = await api.get('/settings')
      const remote = response.data?.settings?.uiPreferences || {}

      // Server wins: hydrate localStorage from server values.
      for (const key of SYNCED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(remote, key)) {
          const value = remote[key]
          if (value === null || value === undefined) {
            localStorage.removeItem(key)
          } else {
            writeLocal(key, value)
          }
        }
      }

      // Apply dark mode immediately so the DOM matches before NavBar mounts.
      applyDarkModeFromStorage()

      initialized.value = true
    } catch (err) {
      console.warn('[UI PREFS] Failed to load remote preferences, continuing with local values:', err?.response?.status || err?.message)
      // Still mark as initialized so subsequent writes attempt to sync.
      initialized.value = true
    }
  }

  function applyDarkModeFromStorage() {
    const isDark = localStorage.getItem('darkMode') === 'true'
    document.documentElement.classList.toggle('dark', isDark)
  }

  // Called by refactored sites whenever they persist a preference locally.
  // The local write still happens at the call site so reads stay synchronous.
  function notifyChanged(key, value) {
    if (!SYNCED_KEY_SET.has(key)) return
    pending.value = { ...pending.value, [key]: value }
    scheduleFlush()
  }

  function reset() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    pending.value = {}
    initialized.value = false
    for (const key of SYNCED_KEYS) {
      localStorage.removeItem(key)
    }
    document.documentElement.classList.remove('dark')
  }

  return {
    initialized,
    init,
    notifyChanged,
    flush,
    reset,
    applyDarkModeFromStorage
  }
})
