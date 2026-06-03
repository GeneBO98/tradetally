import { onBeforeUnmount, watchEffect } from 'vue'

const SITE_NAME = 'TradeTally'
const DEFAULT_OG_IMAGE = 'https://tradetally.io/social-preview.png'

function ensureMeta(selector, attrName, attrValue) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attrName, attrValue)
    el.dataset.toolMeta = '1'
    document.head.appendChild(el)
  }
  return el
}

function ensureLink(rel) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    el.dataset.toolMeta = '1'
    document.head.appendChild(el)
  }
  return el
}

/**
 * Sets per-page document title, meta description, canonical URL, and OG/Twitter tags.
 * Restores the site defaults on unmount so other (non-tool) pages aren't affected.
 *
 * @param {Object|Function} options - { title, description, canonical, ogImage }
 *   May be passed as a getter function for reactive sources.
 */
export function useToolMeta(options) {
  const previousTitle = document.title
  const previousDescription = document.head.querySelector('meta[name="description"]')?.getAttribute('content') || ''
  const previousCanonical = document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
  const previousOgTitle = document.head.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''
  const previousOgDescription = document.head.querySelector('meta[property="og:description"]')?.getAttribute('content') || ''
  const previousOgUrl = document.head.querySelector('meta[property="og:url"]')?.getAttribute('content') || ''
  const previousOgImage = document.head.querySelector('meta[property="og:image"]')?.getAttribute('content') || DEFAULT_OG_IMAGE
  const previousTwitterTitle = document.head.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || ''
  const previousTwitterDescription = document.head.querySelector('meta[name="twitter:description"]')?.getAttribute('content') || ''
  const previousTwitterImage = document.head.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || DEFAULT_OG_IMAGE

  watchEffect(() => {
    const opts = typeof options === 'function' ? options() : options
    if (!opts) return

    const { title, description, canonical, ogImage } = opts
    const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME
    const image = ogImage || DEFAULT_OG_IMAGE

    document.title = fullTitle

    if (description) {
      ensureMeta('meta[name="description"]', 'name', 'description').setAttribute('content', description)
    }

    if (canonical) {
      ensureLink('canonical').setAttribute('href', canonical)
    }

    ensureMeta('meta[property="og:title"]', 'property', 'og:title').setAttribute('content', fullTitle)
    if (description) {
      ensureMeta('meta[property="og:description"]', 'property', 'og:description').setAttribute('content', description)
    }
    if (canonical) {
      ensureMeta('meta[property="og:url"]', 'property', 'og:url').setAttribute('content', canonical)
    }
    ensureMeta('meta[property="og:image"]', 'property', 'og:image').setAttribute('content', image)

    ensureMeta('meta[name="twitter:title"]', 'name', 'twitter:title').setAttribute('content', fullTitle)
    if (description) {
      ensureMeta('meta[name="twitter:description"]', 'name', 'twitter:description').setAttribute('content', description)
    }
    ensureMeta('meta[name="twitter:image"]', 'name', 'twitter:image').setAttribute('content', image)
  })

  onBeforeUnmount(() => {
    document.title = previousTitle
    const descEl = document.head.querySelector('meta[name="description"]')
    if (descEl && previousDescription) descEl.setAttribute('content', previousDescription)
    const canEl = document.head.querySelector('link[rel="canonical"]')
    if (canEl && previousCanonical) canEl.setAttribute('href', previousCanonical)
    const ogTitleEl = document.head.querySelector('meta[property="og:title"]')
    if (ogTitleEl && previousOgTitle) ogTitleEl.setAttribute('content', previousOgTitle)
    const ogDescEl = document.head.querySelector('meta[property="og:description"]')
    if (ogDescEl && previousOgDescription) ogDescEl.setAttribute('content', previousOgDescription)
    const ogUrlEl = document.head.querySelector('meta[property="og:url"]')
    if (ogUrlEl && previousOgUrl) ogUrlEl.setAttribute('content', previousOgUrl)
    const ogImageEl = document.head.querySelector('meta[property="og:image"]')
    if (ogImageEl) ogImageEl.setAttribute('content', previousOgImage)
    const twTitleEl = document.head.querySelector('meta[name="twitter:title"]')
    if (twTitleEl && previousTwitterTitle) twTitleEl.setAttribute('content', previousTwitterTitle)
    const twDescEl = document.head.querySelector('meta[name="twitter:description"]')
    if (twDescEl && previousTwitterDescription) twDescEl.setAttribute('content', previousTwitterDescription)
    const twImageEl = document.head.querySelector('meta[name="twitter:image"]')
    if (twImageEl) twImageEl.setAttribute('content', previousTwitterImage)
  })
}
