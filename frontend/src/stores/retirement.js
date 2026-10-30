import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api from '@/services/api'

function getErrorMessage(error, fallback) {
  return error.response?.data?.error
    || error.response?.data?.message
    || error.message
    || fallback
}

export const useRetirementStore = defineStore('retirement', () => {
  const plan = ref(null)
  const draftPlan = ref(null)
  const portfolio = ref(null)
  const historicalScenarios = ref([])
  const historicalInflation = ref(null)
  const projection = ref(null)
  const hasSavedPlan = ref(false)
  const affordability = ref(null)
  const affordabilityTransactions = ref([])
  const affordabilityCategories = ref([])
  const affordabilityLoading = ref(false)
  const loading = ref(false)
  const calculating = ref(false)
  const saving = ref(false)
  const error = ref(null)
  let calculateRequestId = 0

  const customScenario = computed(() =>
    projection.value?.scenarios?.find(scenario => scenario.key === 'custom') || null
  )

  function applyResponse(data) {
    if (Object.prototype.hasOwnProperty.call(data, 'plan')) {
      plan.value = data.plan
    }
    draftPlan.value = data.draft_plan || data.plan || draftPlan.value
    portfolio.value = data.portfolio || null
    historicalScenarios.value = data.historical_scenarios || []
    historicalInflation.value = data.historical_inflation || null
    projection.value = data.projection || null
    if (Object.prototype.hasOwnProperty.call(data, 'affordability')) {
      affordability.value = data.affordability || null
    }
    if (Object.prototype.hasOwnProperty.call(data, 'has_saved_plan')) {
      hasSavedPlan.value = Boolean(data.has_saved_plan)
    }
    return data
  }

  async function load(params = {}) {
    loading.value = true
    error.value = null
    try {
      const response = await api.get('/investments/retirement', { params })
      return applyResponse(response.data)
    } catch (err) {
      error.value = getErrorMessage(err, 'Failed to load retirement plan')
      throw err
    } finally {
      loading.value = false
    }
  }

  async function calculate(payload, params = {}) {
    const requestId = ++calculateRequestId
    calculating.value = true
    error.value = null
    try {
      const response = await api.post('/investments/retirement/calculate', payload, { params })
      if (requestId !== calculateRequestId) return response.data
      draftPlan.value = payload
      return applyResponse(response.data)
    } catch (err) {
      if (requestId !== calculateRequestId) return null
      error.value = getErrorMessage(err, 'Failed to calculate retirement plan')
      throw err
    } finally {
      if (requestId === calculateRequestId) {
        calculating.value = false
      }
    }
  }

  async function save(payload) {
    saving.value = true
    error.value = null
    try {
      const response = await api.put('/investments/retirement', payload)
      hasSavedPlan.value = true
      return applyResponse(response.data)
    } catch (err) {
      error.value = getErrorMessage(err, 'Failed to save retirement plan')
      throw err
    } finally {
      saving.value = false
    }
  }

  async function reset() {
    saving.value = true
    error.value = null
    try {
      await api.delete('/investments/retirement')
      plan.value = null
      hasSavedPlan.value = false
      return true
    } catch (err) {
      error.value = getErrorMessage(err, 'Failed to reset retirement plan')
      throw err
    } finally {
      saving.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  async function setRetirementSavingsAccount(plaidAccountId, include) {
    const response = await api.put(
      `/investments/retirement/affordability/accounts/${plaidAccountId}`,
      { include_in_retirement_savings: include }
    )
    if (affordability.value?.savings_accounts) {
      affordability.value = {
        ...affordability.value,
        savings_accounts: affordability.value.savings_accounts.map(account => (
          account.id === plaidAccountId ? { ...account, include_in_retirement_savings: include } : account
        ))
      }
    }
    return response.data.account
  }

  async function fetchAffordabilityTransactions(params = {}) {
    affordabilityLoading.value = true
    try {
      const response = await api.get('/investments/retirement/affordability/transactions', { params: { limit: 200, ...params } })
      affordabilityTransactions.value = response.data.transactions || []
      affordabilityCategories.value = response.data.categories || []
      return affordabilityTransactions.value
    } finally {
      affordabilityLoading.value = false
    }
  }

  async function setCashflowCategory(transactionId, category) {
    const response = await api.put(
      `/investments/retirement/affordability/transactions/${transactionId}`,
      { category }
    )
    const updatedIds = new Set(response.data.updated_ids || [transactionId])
    affordabilityTransactions.value = affordabilityTransactions.value.map(transaction => (
      updatedIds.has(transaction.id)
        ? { ...transaction, cashflow_category: category, cashflow_source: 'user', cashflow_confidence: 100 }
        : transaction
    ))
    return response.data.transaction
  }

  async function refreshAffordability(months) {
    affordabilityLoading.value = true
    try {
      const response = await api.post('/investments/retirement/affordability/refresh', months ? { months } : {})
      // The refreshed summary carries no per-scenario viability; keep the
      // previous one until the next calculate call replaces it.
      affordability.value = {
        ...(response.data.affordability || {}),
        viability: affordability.value?.viability || {}
      }
      return affordability.value
    } finally {
      affordabilityLoading.value = false
    }
  }

  return {
    plan,
    draftPlan,
    portfolio,
    historicalScenarios,
    historicalInflation,
    projection,
    hasSavedPlan,
    loading,
    calculating,
    saving,
    error,
    customScenario,
    affordability,
    affordabilityTransactions,
    affordabilityCategories,
    affordabilityLoading,
    load,
    calculate,
    save,
    reset,
    clearError,
    setRetirementSavingsAccount,
    fetchAffordabilityTransactions,
    setCashflowCategory,
    refreshAffordability
  }
})
