import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useDiaryTemplateStore = defineStore('diaryTemplate', () => {
  // State
  const templates = ref([])
  const currentTemplate = ref(null)
  const defaultTemplate = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // Pagination state
  const pagination = ref({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0
  })

  // Getters
  const hasTemplates = computed(() => templates.value.length > 0)
  const totalTemplates = computed(() => pagination.value.total)

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

  // Fetch all templates
  const fetchTemplates = async (params = {}) => {
    try {
      setLoading(true)
      clearError()

      const queryParams = {
        page: params.page || pagination.value.page,
        limit: params.limit || pagination.value.limit,
        ...params
      }

      // Clean up null/undefined values
      Object.keys(queryParams).forEach(key => {
        if (queryParams[key] === null || queryParams[key] === undefined || queryParams[key] === '') {
          delete queryParams[key]
        }
      })

      const response = await api.get('/diary-templates', { params: queryParams })

      templates.value = response.data.templates || []
      pagination.value = response.data.pagination || pagination.value

      return response.data
    } catch (err) {
      console.error('Error fetching templates:', err)
      setError(err.response?.data?.error || 'Failed to fetch templates')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Fetch specific template by ID
  const fetchTemplate = async (id) => {
    try {
      setLoading(true)
      clearError()

      const response = await api.get(`/diary-templates/${id}`)
      currentTemplate.value = response.data.template

      return response.data.template
    } catch (err) {
      console.error('Error fetching template:', err)
      setError(err.response?.data?.error || 'Failed to fetch template')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Get default template
  const fetchDefaultTemplate = async (entryType = 'diary') => {
    try {
      const response = await api.get('/diary-templates/default', {
        params: { entryType }
      })
      defaultTemplate.value = response.data.template
      return response.data.template
    } catch (err) {
      console.error('Error fetching default template:', err)
      // Don't throw error for default template as it's optional
      return null
    }
  }

  // Create new template
  const createTemplate = async (templateData) => {
    try {
      setLoading(true)
      clearError()

      const response = await api.post('/diary-templates', templateData)
      const newTemplate = response.data.template

      // Add to local state
      templates.value.unshift(newTemplate)
      pagination.value.total += 1

      return newTemplate
    } catch (err) {
      console.error('Error creating template:', err)
      setError(err.response?.data?.error || 'Failed to create template')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Update template
  const updateTemplate = async (id, updates) => {
    try {
      setLoading(true)
      clearError()

      const response = await api.put(`/diary-templates/${id}`, updates)
      const updatedTemplate = response.data.template

      // Update local state
      const templateIndex = templates.value.findIndex(t => t.id === id)
      if (templateIndex !== -1) {
        templates.value[templateIndex] = updatedTemplate
      }

      currentTemplate.value = updatedTemplate
      return updatedTemplate
    } catch (err) {
      console.error('Error updating template:', err)
      setError(err.response?.data?.error || 'Failed to update template')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Delete template
  const deleteTemplate = async (id) => {
    try {
      setLoading(true)
      clearError()

      await api.delete(`/diary-templates/${id}`)

      // Remove from local state
      templates.value = templates.value.filter(t => t.id !== id)
      pagination.value.total = Math.max(0, pagination.value.total - 1)

      // Clear current template if it was deleted
      if (currentTemplate.value?.id === id) {
        currentTemplate.value = null
      }

      return true
    } catch (err) {
      console.error('Error deleting template:', err)
      setError(err.response?.data?.error || 'Failed to delete template')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Apply template (increment use count)
  const applyTemplate = async (id) => {
    try {
      const response = await api.post(`/diary-templates/${id}/apply`)
      const updatedTemplate = response.data.template

      // Update local state use count
      const templateIndex = templates.value.findIndex(t => t.id === id)
      if (templateIndex !== -1) {
        templates.value[templateIndex].use_count = updatedTemplate.use_count
      }

      return updatedTemplate
    } catch (err) {
      console.error('Error applying template:', err)
      // Don't throw error, just log it
      return null
    }
  }

  // Duplicate template
  const duplicateTemplate = async (id, newName) => {
    try {
      setLoading(true)
      clearError()

      const response = await api.post(`/diary-templates/${id}/duplicate`, {
        name: newName
      })
      const newTemplate = response.data.template

      // Add to local state
      templates.value.unshift(newTemplate)
      pagination.value.total += 1

      return newTemplate
    } catch (err) {
      console.error('Error duplicating template:', err)
      setError(err.response?.data?.error || 'Failed to duplicate template')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Clear all state
  const clearState = () => {
    templates.value = []
    currentTemplate.value = null
    defaultTemplate.value = null
    loading.value = false
    error.value = null
    pagination.value = {
      page: 1,
      limit: 50,
      total: 0,
      pages: 0
    }
  }

  return {
    // State
    templates,
    currentTemplate,
    defaultTemplate,
    loading,
    error,
    pagination,

    // Getters
    hasTemplates,
    totalTemplates,

    // Actions
    setLoading,
    setError,
    clearError,
    fetchTemplates,
    fetchTemplate,
    fetchDefaultTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
    duplicateTemplate,
    clearState
  }
})
