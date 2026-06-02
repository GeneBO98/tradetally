import { ref, watch, onBeforeUnmount } from 'vue'
import api from '@/services/api'

/**
 * Loads authenticated image URLs into blob URLs via axios so the request
 * carries the Authorization header. Required because <img src="/api/..."> only
 * forwards cookies, which can be missing when self-hosting over HTTP (the
 * Secure cookie attribute makes the browser drop them).
 *
 * Accepts items of any shape. The optional `extract` callback maps each item
 * to { id, url }. If `url` points outside the API (e.g. a public CDN), it is
 * passed through unchanged. Only same-origin /api/ URLs are fetched as blobs.
 */
export function useAuthedImage(getItems, extract) {
  const resolvedUrls = ref({})
  const errored = ref({})
  const inflight = new Map()

  const apiPrefix = (api.defaults.baseURL || '/api').replace(/\/$/, '')

  function defaultExtract(item) {
    if (!item || !item.id) return null
    if (item.url) return { id: item.id, url: item.url }
    if (item.file_url) return { id: item.id, url: item.file_url }
    return null
  }

  const extractFn = typeof extract === 'function' ? extract : defaultExtract

  function isApiUrl(url) {
    return url.startsWith(apiPrefix + '/') || url.startsWith('/api/')
  }

  function pathForAxios(url) {
    if (url.startsWith(apiPrefix + '/')) return url.slice(apiPrefix.length)
    if (url.startsWith('/api/')) return url.slice(4)
    return url
  }

  function revoke(id) {
    const url = resolvedUrls.value[id]
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
    delete resolvedUrls.value[id]
    delete errored.value[id]
  }

  function revokeAll() {
    Object.keys(resolvedUrls.value).forEach(revoke)
  }

  async function load(item) {
    const info = extractFn(item)
    if (!info || !info.id || !info.url) return
    const { id, url } = info
    if (resolvedUrls.value[id] || inflight.has(id)) return

    if (!isApiUrl(url)) {
      resolvedUrls.value[id] = url
      return
    }

    const request = api.get(pathForAxios(url), { responseType: 'blob' })
    inflight.set(id, request)

    try {
      const response = await request
      resolvedUrls.value[id] = URL.createObjectURL(response.data)
    } catch (err) {
      console.error('[useAuthedImage] Failed to load image', url, err)
      errored.value[id] = true
    } finally {
      inflight.delete(id)
    }
  }

  watch(
    getItems,
    (newItems) => {
      const list = Array.isArray(newItems) ? newItems : []
      const keepIds = new Set(
        list
          .map((item) => {
            const info = extractFn(item)
            return info ? info.id : null
          })
          .filter(Boolean)
      )
      Object.keys(resolvedUrls.value).forEach((id) => {
        if (!keepIds.has(id)) revoke(id)
      })
      list.forEach((item) => load(item))
    },
    { immediate: true, deep: true }
  )

  onBeforeUnmount(revokeAll)

  function urlFor(item) {
    const info = extractFn(item)
    if (!info || !info.id) return ''
    return resolvedUrls.value[info.id] || ''
  }

  function hasError(item) {
    const info = extractFn(item)
    if (!info || !info.id) return false
    return !!errored.value[info.id]
  }

  return { urlFor, hasError }
}
