import { onBeforeUnmount, watchEffect } from 'vue'

let nextId = 0

function injectScript(id, jsonLd) {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(jsonLd)
  return el
}

function removeScript(id) {
  const el = document.getElementById(id)
  if (el) el.parentNode.removeChild(el)
}

/**
 * Injects one or more <script type="application/ld+json"> blocks into <head>
 * and removes them on unmount.
 *
 * @param {Object|Function} blocks - { howTo, faq, ... } - any keys with a JSON-LD value.
 *   May be a getter function. Pass null/undefined for a key to skip it.
 */
export function useStructuredData(blocks) {
  const instanceId = `tt-jsonld-${++nextId}`
  const injectedIds = new Set()

  watchEffect(() => {
    const data = typeof blocks === 'function' ? blocks() : blocks
    if (!data) return

    const currentIds = new Set()
    for (const [key, jsonLd] of Object.entries(data)) {
      if (!jsonLd) continue
      const id = `${instanceId}-${key}`
      injectScript(id, jsonLd)
      currentIds.add(id)
    }

    for (const oldId of injectedIds) {
      if (!currentIds.has(oldId)) removeScript(oldId)
    }

    injectedIds.clear()
    currentIds.forEach(id => injectedIds.add(id))
  })

  onBeforeUnmount(() => {
    for (const id of injectedIds) removeScript(id)
    injectedIds.clear()
  })
}

/**
 * Helper to build a FAQPage JSON-LD block from an array of {question, answer} pairs.
 */
export function buildFAQSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer
      }
    }))
  }
}

/**
 * Helper to build a HowTo JSON-LD block.
 * @param {Object} options - { name, description, steps: [{ name, text }] }
 */
export function buildHowToSchema({ name, description, steps }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text
    }))
  }
}

/**
 * Helper to build a SoftwareApplication JSON-LD block for a calculator tool.
 */
export function buildCalculatorSchema({ name, description, url }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    url,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    }
  }
}
