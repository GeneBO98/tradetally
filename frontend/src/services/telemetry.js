const TELEMETRY_ENDPOINT = '/api/client-telemetry/errors'
const MAX_DETAIL_KEYS = 20

function compactDetails(details = {}) {
  if (!details || typeof details !== 'object') return {}

  return Object.fromEntries(
    Object.entries(details)
      .filter(([key]) => !['password', 'token', 'authorization', 'cookie'].includes(key.toLowerCase()))
      .slice(0, MAX_DETAIL_KEYS)
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value])
  )
}

function buildPayload(context, error, details = {}) {
  const response = error?.response
  return {
    context,
    message: error?.message || response?.data?.error || response?.data?.message || 'Unknown client error',
    stack: error?.stack || null,
    route: window.location?.pathname || null,
    component: details.component || null,
    statusCode: response?.status || details.statusCode || null,
    requestId: response?.headers?.['x-request-id'] || details.requestId || null,
    details: compactDetails({
      ...details,
      url: error?.config?.url,
      method: error?.config?.method,
      statusText: response?.statusText
    })
  }
}

export function reportUiError(context, error, details = {}) {
  try {
    const payload = buildPayload(context, error, details)
    const body = JSON.stringify(payload)
    const token = localStorage.getItem('token')

    if (navigator.sendBeacon && !token) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon(TELEMETRY_ENDPOINT, blob)
      return
    }

    fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body,
      keepalive: true
    }).catch(() => {})
  } catch {
    // Telemetry must never create a secondary user-visible failure.
  }
}

export function reportApiError(error) {
  const url = error?.config?.url || ''
  if (url.includes('/client-telemetry/errors')) return
  if (!error?.response || error.response.status < 400) return

  reportUiError('api.failure', error, {
    component: 'axios',
    url,
    method: error.config?.method,
    statusCode: error.response.status
  })
}

export function installGlobalErrorTelemetry(app, router) {
  app.config.errorHandler = (error, instance, info) => {
    reportUiError('vue.error', error, {
      component: instance?.type?.name || instance?.type?.__name || null,
      info
    })
    console.error(error)
  }

  window.addEventListener('unhandledrejection', (event) => {
    reportUiError('promise.unhandled_rejection', event.reason || new Error('Unhandled promise rejection'))
  })

  router.onError((error) => {
    reportUiError('router.error', error)
  })
}
