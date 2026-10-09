import { describe, it, expect } from 'vitest'
import { parseMarkdown, truncateHtml } from './markdown'

describe('truncateHtml', () => {
  it('does not turn escaped markup back into live HTML when truncating', () => {
    const html = parseMarkdown('`<img src=x onerror=alert(1)>` ' + 'a'.repeat(300))
    const result = truncateHtml(html, 50)

    expect(result).not.toContain('<img')
    expect(result).toContain('&lt;img')
    expect(result.endsWith('...')).toBe(true)
  })

  it('returns short HTML unchanged', () => {
    const html = parseMarkdown('**bold**')
    expect(truncateHtml(html, 500)).toBe(html)
  })
})
