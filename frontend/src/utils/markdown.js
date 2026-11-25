import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Parse markdown text to HTML with custom styling
 * @param {string} text - The markdown text to parse
 * @returns {string} - Parsed HTML string
 */
export function parseMarkdown(text) {
  if (!text) return ''
  
  try {
    // Use marked parsing with GitHub flavored markdown support
    let result = marked.parse(text, {
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    })
    
    // Clean up and add custom classes for better styling
    result = result
      .replace(/<p><\/p>/g, '') // Remove empty paragraphs
      .replace(/<p>/g, '<p class="mb-2">') // Add margin to paragraphs
      .replace(/<ul>/g, '<ul class="list-disc ml-4 mb-2">') // Style unordered lists
      .replace(/<ol>/g, '<ol class="list-decimal ml-4 mb-2">') // Style ordered lists
      .replace(/<li>/g, '<li class="mb-1">') // Add spacing to list items
      .replace(/<strong>/g, '<strong class="font-semibold">') // Ensure bold is visible
      .replace(/<em>/g, '<em class="italic">') // Ensure italic is visible
      .replace(/<h1>/g, '<h1 class="text-lg font-bold mb-2">') // Style h1
      .replace(/<h2>/g, '<h2 class="text-base font-semibold mb-1">') // Style h2
      .replace(/<h3>/g, '<h3 class="text-sm font-medium mb-1">') // Style h3
      .replace(/<blockquote>/g, '<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-3 italic text-gray-700 dark:text-gray-300 mb-2">') // Style blockquotes
    
    return DOMPurify.sanitize(result)

  } catch (error) {
    console.error('Error parsing markdown:', error)
    // Fallback: return text with basic HTML escaping and line breaks
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }
}

/**
 * Truncate HTML content to a maximum length while preserving HTML structure
 * @param {string} html - The HTML content to truncate
 * @param {number} maxLength - Maximum character length for the text content
 * @returns {string} - Truncated HTML
 */
export function truncateHtml(html, maxLength) {
  if (!html || html.length <= maxLength) return html

  // Use DOMParser instead of innerHTML to avoid unsafe DOM manipulation
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const text = doc.body.textContent || ''

  if (text.length <= maxLength) return html

  // Walk text nodes until the character budget runs out, cut that node, and
  // drop everything after it. This keeps paragraphs, line breaks and lists
  // intact instead of flattening the preview into a single line. Text nodes
  // are re-escaped when serialized, so escaped markup stays inert, and the
  // result is sanitized again because callers render it with v-html.
  let remaining = maxLength
  let cutNode = null
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    const value = node.nodeValue || ''
    if (value.length >= remaining) {
      node.nodeValue = value.slice(0, remaining).trimEnd() + '...'
      cutNode = node
      break
    }
    remaining -= value.length
  }

  let current = cutNode
  while (current && current !== doc.body) {
    while (current.nextSibling) {
      current.parentNode.removeChild(current.nextSibling)
    }
    current = current.parentNode
  }

  return DOMPurify.sanitize(doc.body.innerHTML)
}