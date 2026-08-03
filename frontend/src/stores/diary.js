import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'
import { getLocalToday } from '@/utils/date'

const JOURNAL_ANALYSIS_RECOVERY_TIMEOUT_MS = 10 * 60 * 1000
const JOURNAL_ANALYSIS_RECOVERY_POLL_MS = 3000

function createAnalysisRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `journal_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRecoverableAnalysisError(err) {
  const status = err.response?.status
  return !err.response || [408, 499, 502, 503, 504, 520, 521, 522, 523, 524].includes(status) ||
    ['ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT'].includes(err.code)
}

export const useDiaryStore = defineStore('diary', () => {
  // State
  const entries = ref([])
  const todaysEntries = ref([])
  const todaysEntry = ref(null)
  const currentEntry = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const stats = ref({})
  const tags = ref([])

  // Pagination state
  const pagination = ref({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  })

  // Filters state
  const filters = ref({
    entryType: 'diary',
    startDate: null,
    endDate: null,
    marketBias: null,
    tags: [],
    search: null
  })

  // Getters
  const hasEntries = computed(() => entries.value.length > 0)
  const hasTodaysEntry = computed(() => todaysEntries.value.length > 0)
  const totalEntries = computed(() => pagination.value.total)

  // Actions
  const setLoading = (isLoading) => {
    loading.value = isLoading
  }

  const setError = (errorMessage) => {
    error.value = errorMessage
  }

  const clearError = () => {
    error.value = null
  }

  // Fetch diary entries with filters and pagination
  const fetchEntries = async (params = {}) => {
    try {
      setLoading(true)
      clearError()

      const queryParams = {
        page: params.page || pagination.value.page,
        limit: params.limit || pagination.value.limit,
        ...filters.value,
        ...params
      }

      // Clean up null/undefined values
      Object.keys(queryParams).forEach(key => {
        if (queryParams[key] === null || queryParams[key] === undefined || queryParams[key] === '') {
          delete queryParams[key]
        }
      })

      const response = await api.get('/diary', { params: queryParams })

      entries.value = response.data.entries || []
      pagination.value = response.data.pagination || pagination.value

      return response.data
    } catch (err) {
      console.error('Error fetching diary entries:', err)
      setError(err.response?.data?.error || 'Failed to fetch diary entries')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Fetch today's entry for dashboard
  const fetchTodaysEntry = async () => {
    try {
      const response = await api.get('/diary/today')
      const fetchedEntries = response.data.entries || (response.data.entry ? [response.data.entry] : [])
      todaysEntries.value = fetchedEntries
      todaysEntry.value = fetchedEntries[0] || null
      return todaysEntry.value
    } catch (err) {
      console.error('Error fetching today\'s entry:', err)
      // Don't throw error for today's entry as it's optional
      return null
    }
  }

  // Fetch specific entry by ID
  const fetchEntry = async (id) => {
    try {
      setLoading(true)
      clearError()

      const response = await api.get(`/diary/${id}`)
      currentEntry.value = response.data.entry

      return response.data.entry
    } catch (err) {
      console.error('Error fetching diary entry:', err)
      setError(err.response?.data?.error || 'Failed to fetch diary entry')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Fetch entry by date
  const fetchEntryByDate = async (date, entryType = 'diary') => {
    try {
      const response = await api.get(`/diary/date/${date}`, {
        params: { entryType }
      })
      return response.data.entry
    } catch (err) {
      console.error('Error fetching diary entry by date:', err)
      throw err
    }
  }

  // Create a new independent diary entry
  const saveEntry = async (entryData) => {
    try {
      setLoading(true)
      clearError()

      const response = await api.post('/diary', entryData)
      const savedEntry = response.data.entry

      // Update local state
      const existingIndex = entries.value.findIndex(e => e.id === savedEntry.id)
      if (existingIndex !== -1) {
        entries.value[existingIndex] = savedEntry
      } else {
        entries.value.unshift(savedEntry)
      }

      // Update today's entry if it's today's date
      const today = getLocalToday()
      const entryDate = savedEntry.entry_date ? savedEntry.entry_date.split('T')[0] : null
      if (entryDate === today && savedEntry.entry_type === 'diary') {
        todaysEntries.value = [savedEntry, ...todaysEntries.value.filter(entry => entry.id !== savedEntry.id)]
        todaysEntry.value = savedEntry
      }

      currentEntry.value = savedEntry
      return savedEntry
    } catch (err) {
      console.error('Error saving diary entry:', err)
      setError(err.response?.data?.error || 'Failed to save diary entry')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Update existing entry
  const updateEntry = async (id, updates) => {
    try {
      setLoading(true)
      clearError()

      const response = await api.put(`/diary/${id}`, updates)
      const updatedEntry = response.data.entry

      // Update local state
      const entryIndex = entries.value.findIndex(e => e.id === id)
      if (entryIndex !== -1) {
        entries.value[entryIndex] = updatedEntry
      }

      // Update today's entry if applicable
      const today = getLocalToday()
      const entryDate = updatedEntry.entry_date ? updatedEntry.entry_date.split('T')[0] : null
      if (entryDate === today && updatedEntry.entry_type === 'diary') {
        const todayIndex = todaysEntries.value.findIndex(entry => entry.id === id)
        if (todayIndex === -1) {
          todaysEntries.value.unshift(updatedEntry)
        } else {
          todaysEntries.value[todayIndex] = updatedEntry
        }
        if (todaysEntry.value?.id === id || !todaysEntry.value) {
          todaysEntry.value = updatedEntry
        }
      } else if (todaysEntries.value.some(entry => entry.id === id)) {
        todaysEntries.value = todaysEntries.value.filter(entry => entry.id !== id)
        todaysEntry.value = todaysEntries.value[0] || null
      }

      currentEntry.value = updatedEntry
      return updatedEntry
    } catch (err) {
      console.error('Error updating diary entry:', err)
      setError(err.response?.data?.error || 'Failed to update diary entry')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Delete diary entry
  const deleteEntry = async (id) => {
    try {
      setLoading(true)
      clearError()

      await api.delete(`/diary/${id}`)

      // Remove from local state
      entries.value = entries.value.filter(e => e.id !== id)

      // Remove only the deleted entry; another entry from today may remain.
      if (todaysEntries.value.some(entry => entry.id === id)) {
        todaysEntries.value = todaysEntries.value.filter(entry => entry.id !== id)
        todaysEntry.value = todaysEntries.value[0] || null
      }

      // Clear current entry if it was deleted
      if (currentEntry.value?.id === id) {
        currentEntry.value = null
      }

      return true
    } catch (err) {
      console.error('Error deleting diary entry:', err)
      setError(err.response?.data?.error || 'Failed to delete diary entry')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Upload attachment to diary entry (legacy single file)
  const uploadAttachment = async (entryId, file) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post(`/diary/${entryId}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      // Update entry with new attachment
      const attachment = response.data.attachment
      const entryIndex = entries.value.findIndex(e => e.id === entryId)
      if (entryIndex !== -1) {
        if (!entries.value[entryIndex].attachments) {
          entries.value[entryIndex].attachments = []
        }
        entries.value[entryIndex].attachments.push(attachment)
      }

      return attachment
    } catch (err) {
      console.error('Error uploading attachment:', err)
      setError(err.response?.data?.error || 'Failed to upload attachment')
      throw err
    }
  }

  // Upload multiple images to diary entry (with compression)
  const uploadImages = async (entryId, files) => {
    try {
      const formData = new FormData()
      files.forEach(file => {
        formData.append('images', file)
      })

      const response = await api.post(`/diary/${entryId}/images`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      // Update entry with new attachments
      const uploadedImages = response.data.images?.filter(img => !img.error) || []
      const entryIndex = entries.value.findIndex(e => e.id === entryId)
      if (entryIndex !== -1) {
        if (!entries.value[entryIndex].attachments) {
          entries.value[entryIndex].attachments = []
        }
        entries.value[entryIndex].attachments.push(...uploadedImages)
      }

      // Update current entry if applicable
      if (currentEntry.value?.id === entryId) {
        if (!currentEntry.value.attachments) {
          currentEntry.value.attachments = []
        }
        currentEntry.value.attachments.push(...uploadedImages)
      }

      return response.data
    } catch (err) {
      console.error('Error uploading images:', err)
      setError(err.response?.data?.error || 'Failed to upload images')
      throw err
    }
  }

  // Delete image from diary entry
  const deleteImage = async (entryId, attachmentId) => {
    try {
      await api.delete(`/diary/${entryId}/images/${attachmentId}`)

      // Remove attachment from entries
      entries.value.forEach(entry => {
        if (entry.attachments) {
          entry.attachments = entry.attachments.filter(att => att.id !== attachmentId)
        }
      })

      // Update current entry if applicable
      if (currentEntry.value?.attachments) {
        currentEntry.value.attachments = currentEntry.value.attachments.filter(att => att.id !== attachmentId)
      }

      return true
    } catch (err) {
      console.error('Error deleting image:', err)
      setError(err.response?.data?.error || 'Failed to delete image')
      throw err
    }
  }

  // Delete attachment
  const deleteAttachment = async (attachmentId) => {
    try {
      await api.delete(`/diary/attachments/${attachmentId}`)

      // Remove attachment from entries
      entries.value.forEach(entry => {
        if (entry.attachments) {
          entry.attachments = entry.attachments.filter(att => att.id !== attachmentId)
        }
      })

      return true
    } catch (err) {
      console.error('Error deleting attachment:', err)
      setError(err.response?.data?.error || 'Failed to delete attachment')
      throw err
    }
  }

  // Fetch user's diary tags
  const fetchTags = async () => {
    try {
      const response = await api.get('/diary/tags')
      tags.value = response.data.tags || []
      return tags.value
    } catch (err) {
      console.error('Error fetching diary tags:', err)
      return []
    }
  }

  // Fetch diary statistics
  const fetchStats = async (filters = {}) => {
    try {
      const response = await api.get('/diary/stats', { params: filters })
      stats.value = response.data.stats || {}
      return stats.value
    } catch (err) {
      console.error('Error fetching diary statistics:', err)
      return {}
    }
  }

  // Search diary entries
  const searchEntries = async (searchQuery, searchFilters = {}) => {
    try {
      setLoading(true)
      clearError()

      const queryParams = {
        q: searchQuery,
        page: 1,
        limit: 20,
        ...searchFilters
      }

      const response = await api.get('/diary/search', { params: queryParams })

      entries.value = response.data.entries || []
      pagination.value = response.data.pagination || pagination.value

      return response.data
    } catch (err) {
      console.error('Error searching diary entries:', err)
      setError(err.response?.data?.error || 'Failed to search diary entries')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Update filters
  const updateFilters = (newFilters) => {
    filters.value = { ...filters.value, ...newFilters }
  }

  // Reset filters
  const resetFilters = () => {
    filters.value = {
      entryType: 'diary',
      startDate: null,
      endDate: null,
      marketBias: null,
      tags: [],
      search: null
    }
  }

  // Clear all state
  const clearState = () => {
    entries.value = []
    todaysEntries.value = []
    todaysEntry.value = null
    currentEntry.value = null
    loading.value = false
    error.value = null
    stats.value = {}
    tags.value = []
    pagination.value = {
      page: 1,
      limit: 20,
      total: 0,
      pages: 0
    }
    resetFilters()
  }

  // AI Analysis
  const analyzeEntries = async (startDate, endDate) => {
    const request_id = createAnalysisRequestId()
    const recoveryDeadline = Date.now() + JOURNAL_ANALYSIS_RECOVERY_TIMEOUT_MS

    try {
      setLoading(true)
      clearError()

      const response = await api.get('/diary/analyze', {
        params: { startDate, endDate, request_id }
      })
      return response.data
    } catch (err) {
      if (isRecoverableAnalysisError(err)) {
        console.warn('[DIARY] Journal analysis connection ended before completion; waiting for the saved result', {
          request_id,
          status: err.response?.status,
          code: err.code
        })

        try {
          return await recoverAnalysis(request_id, recoveryDeadline)
        } catch (recoveryError) {
          setError(recoveryError.message)
          throw recoveryError
        }
      }

      console.error('Error analyzing diary entries:', err)
      setError(err.response?.data?.error || 'Failed to analyze diary entries')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const recoverAnalysis = async (request_id, deadline) => {
    while (Date.now() < deadline) {
      try {
        const response = await api.get(`/diary/analyze/${encodeURIComponent(request_id)}`)
        const result = response.data

        if (result.status === 'completed') {
          return result
        }

        if (result.status === 'failed') {
          const analysisError = new Error(result.error || 'Failed to analyze diary entries')
          analysisError.isJournalAnalysisFailure = true
          throw analysisError
        }
      } catch (err) {
        if (err.isJournalAnalysisFailure) {
          throw err
        }
        if (err.response?.status === 401 || err.response?.status === 403) {
          throw err
        }
        if (err.response?.status !== 404 && !isRecoverableAnalysisError(err)) {
          throw err
        }
        console.warn('[DIARY] Waiting for journal analysis recovery:', err.message)
      }

      await delay(Math.min(JOURNAL_ANALYSIS_RECOVERY_POLL_MS, Math.max(0, deadline - Date.now())))
    }

    throw new Error('The journal analysis did not finish within 10 minutes. Please try again with a shorter date range or a faster AI model.')
  }

  return {
    // State
    entries,
    todaysEntries,
    todaysEntry,
    currentEntry,
    loading,
    error,
    stats,
    tags,
    pagination,
    filters,

    // Getters
    hasEntries,
    hasTodaysEntry,
    totalEntries,

    // Actions
    setLoading,
    setError,
    clearError,
    fetchEntries,
    fetchTodaysEntry,
    fetchEntry,
    fetchEntryByDate,
    saveEntry,
    updateEntry,
    deleteEntry,
    uploadAttachment,
    uploadImages,
    deleteAttachment,
    deleteImage,
    fetchTags,
    fetchStats,
    searchEntries,
    updateFilters,
    resetFilters,
    clearState,
    analyzeEntries
  }
})
