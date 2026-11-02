import { describe, expect, it } from 'vitest'
import { isYouTubeLink } from './chartLinks'

describe('YouTube chart links', () => {
  it.each([
    'https://www.youtube.com/watch?v=review123&list=unlisted&index=2&t=90s',
    'https://youtu.be/review123?si=share&t=30',
    'https://m.youtube.com/watch?v=review123',
    'https://www.youtube.com/shorts/review123',
    'https://www.youtube.com/live/review123',
    'https://www.youtube.com/playlist?list=unlisted'
  ])('recognizes %s', link => {
    expect(isYouTubeLink(link)).toBe(true)
  })

  it.each([
    'https://youtube.com.example.com/watch?v=review123',
    'https://notyoutube.com/watch?v=review123',
    'https://charts.example.com/youtube.com/watch?v=review123',
    'https://example.com/?url=https://youtu.be/review123',
    'https://www.tradingview.com/x/Abc123/',
    'https://placehold.co/2560x1440/png?text=test',
    'javascript://youtube.com/watch?v=review123',
    'not a URL', null
  ])('does not classify other links as videos: %s', link => {
    expect(isYouTubeLink(link)).toBe(false)
  })
})
