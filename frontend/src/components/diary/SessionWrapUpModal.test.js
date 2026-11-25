import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SessionWrapUpModal from './SessionWrapUpModal.vue'

const apiGet = vi.fn()
const apiPost = vi.fn()
const apiPut = vi.fn()
const feedbackPost = vi.fn().mockResolvedValue({})
vi.mock('@/services/api', () => ({
  default: {
    get: (...args) => apiGet(...args),
    post: (...args) => args[0].endsWith('/feedback') ? feedbackPost(...args) : apiPost(...args),
    put: (...args) => apiPut(...args)
  }
}))

const showSuccess = vi.fn()
const showError = vi.fn()
vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ showSuccess, showError })
}))

describe('SessionWrapUpModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses a factual timing tag and requires acceptance before saving an AI mindset suggestion', async () => {
    apiGet.mockResolvedValueOnce({ data: { date: '2026-04-10', tradeCount: 1,
      wins: 0, losses: 1, netPnl: -20, winRate: 0, symbols: [], linkedTradeIds: [],
      postLossReentries: 1, existingEntry: null } })
    const requestId = '12345678-1234-4123-8123-123456789abc'
    apiPost.mockResolvedValueOnce({ data: { requestId, decisions: [{ tag: 'revenge-trade', suggested: true,
      evidence: 'I entered just to win it back.' }] } })
    const wrapper = mount(SessionWrapUpModal, { props: { modelValue: true }, global: { stubs: {
      BaseModal: { template: '<div><slot /><slot name="footer" /></div>' }, RouterLink: true
    } } })
    await flushPromises()
    const revenge = () => wrapper.findAll('button').find(b => b.text().trim() === 'Revenge trade')
    expect(revenge().attributes('aria-pressed')).toBe('false')
    const timing = wrapper.findAll('button').find(b => b.text().trim() === 'Quick re-entry after loss')
    expect(timing.attributes('aria-pressed')).toBe('true')
    await wrapper.get('#wrapup-lesson').setValue('I entered just to win it back.')
    await wrapper.findAll('button').find(b => b.text() === 'Suggest tags').trigger('click')
    await flushPromises()
    expect(feedbackPost).toHaveBeenCalledWith(`/diary/tag-suggestions/${requestId}/feedback`, expect.objectContaining({
      action: 'shown', tags: ['revenge-trade']
    }))
    expect(revenge().attributes('aria-pressed')).toBe('false')
    await wrapper.findAll('button').find(b => b.text() === 'Add Revenge trade').trigger('click')
    expect(revenge().attributes('aria-pressed')).toBe('true')
    expect(feedbackPost).toHaveBeenCalledWith(`/diary/tag-suggestions/${requestId}/feedback`, expect.objectContaining({
      action: 'accepted', tag: 'revenge-trade'
    }))
    apiPost.mockResolvedValueOnce({ data: { entry: { id: 'new-entry' } } })
    await wrapper.findAll('button').find(b => b.text().includes('Save wrap-up')).trigger('click')
    await flushPromises()
    expect(apiPost).toHaveBeenLastCalledWith('/diary', expect.objectContaining({
      tags: ['quick-reentry-after-loss', 'revenge-trade']
    }))
    expect(feedbackPost).toHaveBeenCalledWith(`/diary/tag-suggestions/${requestId}/feedback`, expect.objectContaining({
      action: 'saved', entryId: 'new-entry'
    }))
  })

  it('discards a late AI response after the notes change', async () => {
    apiGet.mockResolvedValueOnce({ data: { date: '2026-04-10', tradeCount: 0, symbols: [],
      postLossReentries: 0, existingEntry: null } })
    let finish
    apiPost.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const wrapper = mount(SessionWrapUpModal, { props: { modelValue: true }, global: { stubs: {
      BaseModal: { template: '<div><slot /><slot name="footer" /></div>' }, RouterLink: true
    } } })
    await flushPromises()
    await wrapper.get('#wrapup-lesson').setValue('I chased because of fear of missing out.')
    await wrapper.findAll('button').find(b => b.text() === 'Suggest tags').trigger('click')
    await wrapper.get('#wrapup-lesson').setValue('I did not trade today.')
    finish({ data: { decisions: [{ tag: 'fomo', suggested: true, evidence: 'I chased' }] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Add FOMO')
  })

  it('loads session summary and saves a new journal wrap-up entry with linked trades', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        date: '2026-04-10',
        tradeCount: 3,
        wins: 2,
        losses: 1,
        netPnl: 275.5,
        winRate: 66.7,
        bestTrade: { id: 't1', symbol: 'NVDA', pnl: 350 },
        worstTrade: { id: 't2', symbol: 'TSLA', pnl: -120 },
        symbols: ['NVDA', 'TSLA'],
        linkedTradeIds: ['t1', 't2'],
        postLossReentries: 0,
        existingEntry: null
      }
    })
    apiPost.mockResolvedValueOnce({ data: { entry: { id: 'diary-1' } } })

    const wrapper = mount(SessionWrapUpModal, {
      props: { modelValue: true },
      global: {
        stubs: {
          BaseModal: { template: '<div><slot /><slot name="footer" /></div>' },
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })
    await flushPromises()

    const now = new Date()
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(apiGet).toHaveBeenCalledWith('/diary/session-summary', { params: { date: localToday } })
    expect(wrapper.text()).toContain('+$275.50')
    expect(wrapper.text()).toContain('2W – 1L')
    expect(wrapper.text()).toContain('NVDA')

    // Pick discipline, a tag, and enter a takeaway
    const yesBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Yes')
    await yesBtn.trigger('click')
    const disciplinedBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Disciplined')
    await disciplinedBtn.trigger('click')
    await wrapper.find('#wrapup-lesson').setValue('Respect the morning high before adding.')

    const saveBtn = wrapper.findAll('button').find(b => b.text().includes('Save wrap-up'))
    await saveBtn.trigger('click')
    await flushPromises()

    expect(apiPost).toHaveBeenCalledWith('/diary', expect.objectContaining({
      entryDate: '2026-04-10',
      entryType: 'diary',
      tags: ['disciplined'],
      linkedTrades: ['t1', 't2'],
      followedPlan: true,
      lessonsLearned: 'Respect the morning high before adding.'
    }))
    expect(showSuccess).toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('updates an existing diary entry by merging the snapshot, watchlist, and trade links without erasing manual content', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        date: '2026-04-10',
        tradeCount: 1,
        wins: 0,
        losses: 1,
        netPnl: -90,
        winRate: 0,
        bestTrade: null,
        worstTrade: { id: 't9', symbol: 'AMD', pnl: -90 },
        symbols: ['AMD'],
        linkedTradeIds: ['t9'],
        postLossReentries: 1,
        existingEntry: {
          id: 'existing-99',
          title: 'Existing note',
          content: 'Original body',
          market_bias: 'bearish',
          followed_plan: false,
          lessons_learned: 'Stop chasing.',
          tags: ['fomo'],
          watchlist: ['SPY'],
          linked_trades: ['t1']
        }
      }
    })
    apiPut.mockResolvedValueOnce({ data: { entry: { id: 'existing-99' } } })

    const wrapper = mount(SessionWrapUpModal, {
      props: { modelValue: true },
      global: {
        stubs: {
          BaseModal: { template: '<div><slot /><slot name="footer" /></div>' },
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain("Updating today's journal entry")
    expect(wrapper.text()).toContain('1 quick post-loss re-entry')

    const updateBtn = wrapper.findAll('button').find(b => b.text().includes('Update journal'))
    await updateBtn.trigger('click')
    await flushPromises()

    expect(apiPut).toHaveBeenCalledWith('/diary/existing-99', expect.objectContaining({
      marketBias: 'bearish',
      followedPlan: false,
      lessonsLearned: 'Stop chasing.',
      tags: ['fomo']
    }))
    // The user's own text and selections are kept; the stats block and today's
    // trades are added to them.
    const putPayload = apiPut.mock.calls[0][1]
    expect(putPayload).not.toHaveProperty('title')
    expect(putPayload.content.startsWith('Original body\n\nSession wrap-up: -$90.00 across 1 trade')).toBe(true)
    expect(putPayload.watchlist).toEqual(['SPY', 'AMD'])
    expect(putPayload.linkedTrades).toEqual(['t1', 't9'])
  })

  it('distinguishes failed session-summary load from an empty day and offers Retry with Save disabled', async () => {
    apiGet.mockRejectedValueOnce(new Error('500 Server Error'))

    const wrapper = mount(SessionWrapUpModal, {
      props: { modelValue: true },
      global: {
        stubs: {
          BaseModal: { template: '<div><slot /><slot name="footer" /></div>' },
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain("Could not load today's trade summary")
    expect(wrapper.text()).not.toContain('No closed trades logged')
    const saveBtn = wrapper.findAll('button').find(b => b.text().includes('Save wrap-up'))
    expect(saveBtn.attributes('disabled')).toBeDefined()
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('round-trips Mostly discipline choice using partially-followed-plan tag and strips sample tag defensively', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        date: '2026-04-10',
        tradeCount: 2,
        wins: 1,
        losses: 1,
        netPnl: 50,
        winRate: 50,
        bestTrade: null,
        worstTrade: null,
        symbols: ['AAPL'],
        linkedTradeIds: ['t1'],
        postLossReentries: 0,
        existingEntry: {
          id: 'existing-mostly',
          title: 'Mixed day',
          content: 'Followed rules mostly',
          market_bias: 'neutral',
          followed_plan: null,
          lessons_learned: 'Wait for confirmation',
          tags: ['partially-followed-plan', 'sample']
        }
      }
    })
    apiPut.mockResolvedValueOnce({ data: { entry: { id: 'existing-mostly' } } })

    const wrapper = mount(SessionWrapUpModal, {
      props: { modelValue: true },
      global: {
        stubs: {
          BaseModal: { template: '<div><slot /><slot name="footer" /></div>' },
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })
    await flushPromises()

    const updateBtn = wrapper.findAll('button').find(b => b.text().includes('Update journal'))
    await updateBtn.trigger('click')
    await flushPromises()

    const payload = apiPut.mock.calls[0][1]
    expect(payload.followedPlan).toBeNull()
    expect(payload.tags).toContain('partially-followed-plan')
    expect(payload.tags).not.toContain('sample')
  })

  it('replaces the previous stats block when a wrap-up is re-opened after more trades', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        date: '2026-04-10',
        tradeCount: 2,
        wins: 1,
        losses: 1,
        netPnl: 10,
        winRate: 50,
        bestTrade: { id: 't2', symbol: 'NVDA', pnl: 100 },
        worstTrade: { id: 't1', symbol: 'AMD', pnl: -90 },
        symbols: ['AMD', 'NVDA'],
        linkedTradeIds: ['t1', 't2'],
        postLossReentries: 0,
        existingEntry: {
          id: 'wrap-1',
          title: 'Session Wrap-Up · Apr 10',
          content: 'Morning plan.\nSession wrap-up: -$90.00 across 1 trade (0W-1L, 0% win rate). Worst trade: AMD (-$90.00). Felt rushed today.\n\nMy own note.',
          market_bias: null,
          followed_plan: null,
          lessons_learned: null,
          tags: [],
          watchlist: ['AMD'],
          linked_trades: ['t1']
        }
      }
    })
    apiPut.mockResolvedValueOnce({ data: { entry: { id: 'wrap-1' } } })

    const wrapper = mount(SessionWrapUpModal, {
      props: { modelValue: true },
      global: {
        stubs: {
          BaseModal: { template: '<div><slot /><slot name="footer" /></div>' },
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('Update journal')).trigger('click')
    await flushPromises()

    const putPayload = apiPut.mock.calls[0][1]
    expect(putPayload.content).toBe(
      'Morning plan.\nSession wrap-up: +$10.00 across 2 trades (1W-1L, 50% win rate).\nBest trade: NVDA (+$100.00).\nWorst trade: AMD (-$90.00). Felt rushed today.\n\nMy own note.'
    )
    expect(putPayload.linkedTrades).toEqual(['t1', 't2'])
  })
})
