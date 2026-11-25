import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { reactive, defineComponent, h } from 'vue'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('@/services/api', () => ({ default: api }))

const authState = reactive({
  user: null,
  onboardingStep: 0,
  proOnboardingStep: 0
})
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

const track = vi.fn()
vi.mock('@/composables/useAnalytics', () => ({ useAnalytics: () => ({ track }) }))

vi.mock('@/constants/featureTours', async (importOriginal) => {
  const actual = await importOriginal()
  const tours = [{
    id: 'test-tour',
    releasedAt: '2026-01-01',
    title: 'New in TradeTally',
    summary: 'Two new things.',
    steps: [
      { id: 'one', route: { name: 'dashboard' }, target: 'thing-one', title: 'Thing one', body: 'Body one' },
      { id: 'two', route: { name: 'metrics' }, target: 'missing-thing', title: 'Thing two', body: 'Body two', fallbackBody: 'Fallback two' }
    ]
  }]
  return { ...actual, FEATURE_TOURS: tours, findFeatureTour: id => tours.find(t => t.id === id) || null }
})

import FeatureTourHost from './FeatureTourHost.vue'

const Dashboard = defineComponent({ render: () => h('div', { 'data-tour': 'thing-one', style: 'width:100px;height:40px' }, 'one') })
const Metrics = defineComponent({ render: () => h('div', 'metrics page') })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Metrics },
      { path: '/dashboard', name: 'dashboard', component: Dashboard },
      { path: '/metrics', name: 'metrics', component: Metrics }
    ]
  })
}

async function mountHost(router, path) {
  const App = defineComponent({ render: () => h('div', [h(FeatureTourHost), h(RouterView)]) })
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  await router.isReady()
  await router.push(path)
  await flushPromises()
  return wrapper
}

describe('FeatureTourHost', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    api.post.mockResolvedValue({ data: { success: true } })
    authState.user = { id: 'u1', email: 'trader@example.com', tier: 'free', feature_tours: {} }
    authState.onboardingStep = 0
    authState.proOnboardingStep = 0
    // jsdom has no layout: report a size for elements that have inline sizes.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const sized = this.getAttribute && this.getAttribute('data-tour') === 'thing-one'
      return { top: 100, left: 100, width: sized ? 100 : 0, height: sized ? 40 : 0, right: 200, bottom: 140, x: 100, y: 100 }
    })
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('does not render a prompt until tour state is known', async () => {
    authState.user = { id: 'u1', email: 'trader@example.com', feature_tours: null }
    const router = makeRouter()
    const wrapper = await mountHost(router, '/dashboard')
    expect(document.querySelector('[data-testid="feature-tour-prompt"]')).toBeNull()
    wrapper.unmount()
  })

  it('walks the steps, falls back when a feature cannot be found, and saves completion', async () => {
    const router = makeRouter()
    const wrapper = await mountHost(router, '/dashboard')

    const prompt = document.querySelector('[data-testid="feature-tour-prompt"]')
    expect(prompt.textContent).toContain('New in TradeTally')
    expect(prompt.textContent).toContain('Show me (2 stops)')
    ;[...prompt.querySelectorAll('button')].find(b => b.textContent.includes('Show me')).click()
    await flushPromises()

    // Step 1 is anchored on the dashboard element
    let step = document.querySelector('[data-testid="feature-tour-step"]')
    expect(step.textContent).toContain('Thing one')
    expect(step.textContent).toContain('Body one')
    expect(document.querySelector('[data-testid="feature-tour-spotlight"]')).not.toBeNull()

    vi.useFakeTimers()
    ;[...step.querySelectorAll('button')].find(b => b.textContent.trim() === 'Next').click()
    await vi.advanceTimersByTimeAsync(6000)
    vi.useRealTimers()
    await flushPromises()

    // Step 2 navigates to metrics, never finds its target, shows the fallback
    expect(router.currentRoute.value.name).toBe('metrics')
    step = document.querySelector('[data-testid="feature-tour-step"]')
    expect(step.textContent).toContain('Thing two')
    expect(step.textContent).toContain('Fallback two')
    expect(document.querySelector('[data-testid="feature-tour-spotlight"]')).toBeNull()

    ;[...step.querySelectorAll('button')].find(b => b.textContent.trim() === 'Done').click()
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/users/feature-tours/test-tour', { status: 'completed', lastStep: 1 })
    expect(document.querySelector('[data-testid="feature-tour-step"]')).toBeNull()
    expect(document.querySelector('[data-testid="feature-tour-prompt"]')).toBeNull()
    expect(track).toHaveBeenCalledWith('feature_tour_completed', { tour_id: 'test-tour' })
    wrapper.unmount()
  })

  it('Escape dismisses an active tour and the prompt does not return', async () => {
    const router = makeRouter()
    const wrapper = await mountHost(router, '/dashboard')
    ;[...document.querySelectorAll('[data-testid="feature-tour-prompt"] button')].find(b => b.textContent.includes('Show me')).click()
    await flushPromises()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/users/feature-tours/test-tour', { status: 'dismissed', lastStep: 0 })
    expect(document.querySelector('[data-testid="feature-tour-step"]')).toBeNull()
    expect(document.querySelector('[data-testid="feature-tour-prompt"]')).toBeNull()
    wrapper.unmount()
  })

  it('Dismiss on the prompt saves without starting the tour', async () => {
    const router = makeRouter()
    const wrapper = await mountHost(router, '/dashboard')
    ;[...document.querySelectorAll('[data-testid="feature-tour-prompt"] button')].find(b => b.textContent.trim() === 'Dismiss').click()
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/users/feature-tours/test-tour', { status: 'dismissed', lastStep: null })
    expect(document.querySelector('[data-testid="feature-tour-prompt"]')).toBeNull()
    expect(document.querySelector('[data-testid="feature-tour-step"]')).toBeNull()
    wrapper.unmount()
  })

  it('?tour= replays a finished tour', async () => {
    api.delete.mockResolvedValue({ data: { success: true } })
    authState.user = { id: 'u1', email: 'trader@example.com', feature_tours: { 'test-tour': { status: 'completed' } } }
    const router = makeRouter()
    const wrapper = await mountHost(router, '/dashboard?tour=test-tour')
    await flushPromises()
    expect(api.delete).toHaveBeenCalledWith('/users/feature-tours/test-tour')
    expect(router.currentRoute.value.query.tour).toBeUndefined()
    expect(document.querySelector('[data-testid="feature-tour-step"]').textContent).toContain('Thing one')
    wrapper.unmount()
  })
})
