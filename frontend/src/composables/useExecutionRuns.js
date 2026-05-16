import { computed, ref } from 'vue'
import {
  appendExecutionRunEvent,
  createExecutionRun,
  listExecutionRuns,
  updateExecutionRun
} from '@/services/executionRuns'

const ACTIVE_STATUSES = new Set(['created', 'running', 'paused'])
const STORAGE_KEY = 'tradetally_execution_run_context'

function readStoredContext() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeStoredContext(context) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(context))
  } catch {
    // Storage persistence should never block execution-run lifecycle changes.
  }
}

export function useExecutionRuns(defaultMode = 'live') {
  const storedContext = ref(readStoredContext())
  const mode = ref(storedContext.value.mode || defaultMode)
  const runs = ref([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref(null)
  const traceId = ref(null)

  const activeRun = computed(() => runs.value.find(run => ACTIVE_STATUSES.has(run.status)) || null)
  const latestRun = computed(() => runs.value[0] || null)

  function persistRunContext(runId = activeRun.value?.id || null) {
    storedContext.value = {
      mode: mode.value,
      activeRunId: runId,
      updatedAt: new Date().toISOString()
    }
    writeStoredContext(storedContext.value)
  }

  async function loadRuns(nextMode = mode.value) {
    loading.value = true
    error.value = null
    traceId.value = null
    mode.value = nextMode

    try {
      runs.value = await listExecutionRuns({ mode: nextMode, limit: 20 })
      const persistedRun = runs.value.find(run => run.id === storedContext.value.activeRunId)
      persistRunContext(ACTIVE_STATUSES.has(persistedRun?.status) ? persistedRun.id : activeRun.value?.id || null)
      return runs.value
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to load execution runs'
      traceId.value = err.response?.headers?.['x-request-id'] || err.response?.data?.requestId || null
      throw err
    } finally {
      loading.value = false
    }
  }

  async function startRun(payload = {}) {
    saving.value = true
    error.value = null
    traceId.value = null

    try {
      const run = await createExecutionRun({
        mode: mode.value,
        status: 'running',
        startedAt: new Date().toISOString(),
        ...payload
      })
      runs.value = [run, ...runs.value.filter(existing => existing.id !== run.id)]
      persistRunContext(run.id)
      return run
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to start execution run'
      traceId.value = err.response?.headers?.['x-request-id'] || err.response?.data?.requestId || null
      throw err
    } finally {
      saving.value = false
    }
  }

  async function finishRun(status, payload = {}) {
    if (!activeRun.value) return null

    saving.value = true
    error.value = null
    traceId.value = null

    try {
      const run = await updateExecutionRun(activeRun.value.id, {
        status,
        endedAt: new Date().toISOString(),
        ...payload
      })
      runs.value = runs.value.map(existing => existing.id === run.id ? run : existing)
      persistRunContext(ACTIVE_STATUSES.has(run.status) ? run.id : null)
      return run
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to update execution run'
      traceId.value = err.response?.headers?.['x-request-id'] || err.response?.data?.requestId || null
      throw err
    } finally {
      saving.value = false
    }
  }

  async function recordRunEvent(eventType, payload = {}) {
    if (!activeRun.value) return null
    try {
      return await appendExecutionRunEvent(activeRun.value.id, eventType, payload)
    } catch {
      return null
    }
  }

  return {
    mode,
    runs,
    loading,
    saving,
    error,
    traceId,
    storedContext,
    activeRun,
    latestRun,
    loadRuns,
    startRun,
    finishRun,
    recordRunEvent
  }
}
