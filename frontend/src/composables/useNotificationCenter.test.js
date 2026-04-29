import { describe, expect, it, vi } from 'vitest'
import { useNotificationCenter } from './useNotificationCenter'

describe('useNotificationCenter', () => {
  it('increments, decrements, and clears unread state', () => {
    const center = useNotificationCenter()

    center.clearUnreadState()
    center.addUnreadNotifications(3)
    expect(center.unreadCount.value).toBe(3)

    center.decrementUnreadCount(2)
    expect(center.unreadCount.value).toBe(1)

    center.clearUnreadState()
    expect(center.unreadCount.value).toBe(0)
    expect(center.recentUnreadNotifications.value).toEqual([])
  })

  it('dedupes recent unread notifications', () => {
    const center = useNotificationCenter()
    center.clearUnreadState()

    center.addUnreadNotifications(0, [
      { type: 'price_alert', id: 1, title: 'First' },
      { type: 'price_alert', id: 1, title: 'Duplicate' },
      { type: 'achievement', id: 2, title: 'Second' }
    ])

    expect(center.recentUnreadNotifications.value).toHaveLength(2)
    expect(center.recentUnreadNotifications.value.map(item => item.title)).toEqual(['First', 'Second'])
  })

  it('respects the optimistic unread floor while it is fresh', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T12:00:00Z'))

    const center = useNotificationCenter()
    center.clearUnreadState()
    center.addUnreadNotifications(5)

    expect(center.reconcileUnreadCount(2)).toBe(5)

    vi.advanceTimersByTime(31000)
    expect(center.reconcileUnreadCount(2)).toBe(2)
  })
})
