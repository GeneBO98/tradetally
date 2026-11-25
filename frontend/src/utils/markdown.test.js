import { describe, it, expect } from 'vitest'
import { parseMarkdown, truncateHtml } from './markdown'

const textOf = html => new DOMParser().parseFromString(html, 'text/html').body.textContent || ''

describe('truncateHtml', () => {
  it('does not turn escaped markup back into live HTML when truncating', () => {
    const html = parseMarkdown('`<img src=x onerror=alert(1)>` ' + 'a'.repeat(300))
    const result = truncateHtml(html, 50)

    expect(result).not.toContain('<img')
    expect(result).toContain('&lt;img')
    expect(textOf(result).endsWith('...')).toBe(true)
  })

  it('keeps line breaks and list structure when truncating long content', () => {
    const content = [
      'Before trading: intent and conditions',
      '- What is my intent for today?',
      '- What market conditions, levels, catalysts, and setups matter?',
      '',
      'Midday: what changed',
      '- What changed in the market or my thesis?',
      '- Am I following the plan, and what needs to adapt?',
      '',
      'After close: what you actually did',
      '- What did I actually do?',
      '- Which actions matched the plan, and what will I carry forward?'
    ].join('\n')
    const result = truncateHtml(parseMarkdown(content), 150)

    expect(result).toContain('<ul')
    expect(result).toContain('<li')
    expect(result).toContain('What is my intent for today?')
    expect(result).not.toContain('After close')
    expect(textOf(result).replace(/\s+/g, ' ').trim().length).toBeLessThanOrEqual(153)
    expect(textOf(result).trim().endsWith('...')).toBe(true)
  })

  it('returns short HTML unchanged', () => {
    const html = parseMarkdown('**bold**')
    expect(truncateHtml(html, 500)).toBe(html)
  })
})
