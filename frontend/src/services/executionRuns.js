import api from '@/services/api'

export async function listExecutionRuns(params = {}) {
  const response = await api.get('/execution-runs', { params })
  return response.data.runs || []
}

export async function createExecutionRun(payload) {
  const response = await api.post('/execution-runs', payload)
  return response.data.run
}

export async function updateExecutionRun(id, payload) {
  const response = await api.patch(`/execution-runs/${id}`, payload)
  return response.data.run
}

export async function appendExecutionRunEvent(id, eventType, payload = {}) {
  const response = await api.post(`/execution-runs/${id}/events`, { eventType, payload })
  return response.data.event
}

export async function listExecutionRunEvents(id) {
  const response = await api.get(`/execution-runs/${id}/events`)
  return response.data.events || []
}

export async function compareExecutionRuns(params = {}) {
  const response = await api.get('/execution-runs/compare', { params })
  return response.data.comparison || { runs: [], metrics: [] }
}

export async function getExecutionRunReport(id, params = {}) {
  const response = await api.get(`/execution-runs/${id}/report`, { params })
  return response.data.report
}

export async function downloadExecutionRunReport(id, format = 'json', params = {}) {
  const response = await api.get(`/execution-runs/${id}/report`, {
    params: { ...params, format },
    responseType: format === 'json' ? 'json' : 'blob'
  })
  return response.data
}

export async function shareExecutionRun(id, payload = {}) {
  const response = await api.post(`/execution-runs/${id}/share`, payload)
  return {
    run: response.data.run,
    shareUrl: response.data.shareUrl
  }
}

export async function unshareExecutionRun(id, payload = {}) {
  const response = await api.delete(`/execution-runs/${id}/share`, { data: payload })
  return response.data.run
}

export async function listExecutionRunShareAudits(id, params = {}) {
  const response = await api.get(`/execution-runs/${id}/share/audits`, { params })
  return response.data.audits || []
}

export async function listExecutionRunShareAccounts(id) {
  const response = await api.get(`/execution-runs/${id}/share/accounts`)
  return response.data || { runAccountIds: [], accounts: [], unresolvedAccountIds: [] }
}

export async function getSharedExecutionRun(token) {
  const response = await api.get(`/execution-runs/shared/${token}`)
  return response.data.report
}
