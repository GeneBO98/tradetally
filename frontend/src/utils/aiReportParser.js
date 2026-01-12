import { marked } from 'marked'

/**
 * Parse markdown content and split into sections by H1 headers
 * @param {string} markdown - Raw markdown string from AI
 * @returns {Array<{title: string, content: string, icon: string}>}
 */
export function parseMarkdownToSections(markdown) {
  if (!markdown) return []

  // Normalize line endings
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')

  // Split by H1 headers (# Header)
  const h1Pattern = /^#\s+(.+)$/gm
  const sections = []

  // Find all H1 headers and their positions
  const matches = []
  let match
  while ((match = h1Pattern.exec(normalizedMarkdown)) !== null) {
    matches.push({
      title: match[1].trim(),
      start: match.index,
      headerEnd: match.index + match[0].length
    })
  }

  // If no H1 headers found, treat entire content as single section
  if (matches.length === 0) {
    return [{
      title: 'Analysis',
      content: normalizedMarkdown,
      icon: 'DocumentTextIcon'
    }]
  }

  // Extract content between headers
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const nextStart = matches[i + 1]?.start || normalizedMarkdown.length
    const content = normalizedMarkdown.slice(current.headerEnd, nextStart).trim()

    sections.push({
      title: current.title,
      content: content,
      icon: getSectionIcon(current.title)
    })
  }

  return sections
}

/**
 * Map section titles to appropriate Heroicon names
 * @param {string} title - Section title
 * @returns {string} - Heroicon component name
 */
export function getSectionIcon(title) {
  const titleLower = title.toLowerCase()

  if (titleLower.includes('performance') || titleLower.includes('assessment')) {
    return 'ChartBarIcon'
  }
  if (titleLower.includes('strength')) {
    return 'SparklesIcon'
  }
  if (titleLower.includes('weakness') || titleLower.includes('improvement')) {
    return 'ExclamationTriangleIcon'
  }
  if (titleLower.includes('risk')) {
    return 'ShieldCheckIcon'
  }
  if (titleLower.includes('strategy') || titleLower.includes('optimization')) {
    return 'LightBulbIcon'
  }
  if (titleLower.includes('sector') || titleLower.includes('diversification')) {
    return 'BuildingOfficeIcon'
  }
  if (titleLower.includes('broker')) {
    return 'BanknotesIcon'
  }
  if (titleLower.includes('entry') || titleLower.includes('exit')) {
    return 'ArrowsRightLeftIcon'
  }
  if (titleLower.includes('next') || titleLower.includes('step') || titleLower.includes('action')) {
    return 'ArrowRightCircleIcon'
  }
  if (titleLower.includes('summary') || titleLower.includes('overview')) {
    return 'ClipboardDocumentListIcon'
  }

  return 'DocumentTextIcon'
}

/**
 * Parse section content (H2, H3, lists, paragraphs) to styled HTML
 * @param {string} content - Markdown content within a section
 * @returns {string} - Styled HTML
 */
export function parseSectionContent(content) {
  if (!content) return ''

  // Configure marked for cleaner output
  marked.setOptions({
    breaks: true,
    gfm: true
  })

  let html = marked.parse(content)

  // Add custom classes for styling
  // Convert H2 to styled subsection headers
  html = html
    .replace(/<h2>/g, '<h3 class="ai-subsection-header">')
    .replace(/<\/h2>/g, '</h3>')
    // Convert H3 to smaller headers
    .replace(/<h3>/g, '<h4 class="ai-sub-subsection-header">')
    .replace(/<\/h3>/g, '</h4>')
    // Style paragraphs
    .replace(/<p>/g, '<p class="ai-paragraph">')
    // Style lists
    .replace(/<ul>/g, '<ul class="ai-list ai-list-unordered">')
    .replace(/<ol>/g, '<ol class="ai-list ai-list-ordered">')
    .replace(/<li>/g, '<li class="ai-list-item">')
    // Style emphasis
    .replace(/<strong>/g, '<strong class="ai-emphasis">')

  return html
}
