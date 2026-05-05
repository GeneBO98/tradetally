import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/services/api'

export const useWebMentionsStore = defineStore('webMentions', () => {
  const rules = ref([])
  const mentions = ref([])
  const sources = ref([])
  const presets = ref([])
  const preview = ref(null)
  const loading = ref(false)
  const error = ref(null)

  function unwrap(response) {
    return response.data?.data ?? response.data
  }

  async function fetchRules() {
    loading.value = true
    error.value = null
    try {
      const response = await api.get('/web-mentions/rules')
      rules.value = unwrap(response)
      return rules.value
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch Web Mention rules'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createRule(payload) {
    const response = await api.post('/web-mentions/rules', payload)
    const rule = unwrap(response)
    rules.value.unshift(rule)
    return rule
  }

  async function updateRule(id, payload) {
    const response = await api.put(`/web-mentions/rules/${id}`, payload)
    const rule = unwrap(response)
    const index = rules.value.findIndex(item => item.id === id)
    if (index !== -1) rules.value[index] = rule
    return rule
  }

  async function deleteRule(id) {
    await api.delete(`/web-mentions/rules/${id}`)
    rules.value = rules.value.filter(item => item.id !== id)
  }

  async function testRule(id) {
    const response = await api.post(`/web-mentions/rules/${id}/test`)
    preview.value = unwrap(response)
    return preview.value
  }

  async function fetchMentions(params = {}) {
    const response = await api.get('/web-mentions/mentions', { params })
    mentions.value = unwrap(response)
    return mentions.value
  }

  async function fetchSources() {
    const response = await api.get('/web-mentions/sources')
    sources.value = unwrap(response)
    return sources.value
  }

  async function fetchPresets() {
    const response = await api.get('/web-mentions/presets')
    presets.value = unwrap(response)
    return presets.value
  }

  return {
    rules,
    mentions,
    sources,
    presets,
    preview,
    loading,
    error,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    testRule,
    fetchMentions,
    fetchSources,
    fetchPresets
  }
})
