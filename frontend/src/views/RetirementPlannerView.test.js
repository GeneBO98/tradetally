import { flushPromises, shallowMount } from '@vue/test-utils'
import { computed, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  selectedAccount: null,
  retirementStore: null,
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showDangerConfirmation: vi.fn(),
  fetchAccounts: vi.fn()
}))

vi.mock('@/stores/retirement', () => ({
  useRetirementStore: () => mocks.retirementStore
}))

vi.mock('@/composables/useGlobalAccountFilter', () => ({
  useGlobalAccountFilter: () => ({
    selectedAccount: mocks.selectedAccount,
    selectedAccountLabel: computed(() => mocks.selectedAccount.value || 'All Accounts'),
    isFiltered: computed(() => Boolean(mocks.selectedAccount.value)),
    fetchAccounts: mocks.fetchAccounts
  })
}))

vi.mock('@/composables/useCurrencyFormatter', () => ({
  useCurrencyFormatter: () => ({
    currencyCode: computed(() => 'USD'),
    currencySymbol: computed(() => '$'),
    formatCurrency: value => `$${Math.round(Number(value) || 0).toLocaleString()}`
  })
}))

vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
    showDangerConfirmation: mocks.showDangerConfirmation
  })
}))

import RetirementPlannerView from '@/views/RetirementPlannerView.vue'

const draftPlan = {
  current_age: 40,
  target_retirement_age: 65,
  current_annual_cost_of_living: 60000,
  desired_annual_retirement_spending: 60000,
  target_portfolio_balance: null,
  monthly_contribution: 1000,
  annual_contribution_increase_percent: 0,
  additional_retirement_savings: 0,
  other_annual_retirement_income: 0,
  other_income_start_age: 65,
  custom_return_rate_percent: 7,
  inflation_rate_percent: 3,
  withdrawal_rate_percent: 4
}

function createStore() {
  return reactive({
    plan: null,
    draftPlan,
    portfolio: {
      tracked_portfolio_value: 200000,
      position_count: 4,
      available_accounts: [{
        account_identifier: 'ira-1',
        account_name: 'Retirement IRA',
        broker: 'Fidelity',
        sources: ['manual_holdings', 'plaid_holdings'],
        source_record_count: 3
      }, {
        account_identifier: 'taxable-1',
        account_name: 'Taxable Brokerage',
        broker: 'Schwab',
        sources: ['open_long_positions'],
        source_record_count: 1
      }]
    },
    historicalScenarios: [],
    historicalInflation: {
      source: 'historical_us_cpi_u',
      series_id: 'CUUR0000SA0',
      unavailable: false,
      message: null
    },
    projection: {
      years_to_retirement: 25,
      goal: {
        desired_annual_retirement_spending_today: 60000,
        other_annual_retirement_income_today: 0,
        annual_spending_gap_today: 60000,
        bridge_reserve_today: 0,
        spending_target_today: 1500000,
        explicit_target_today: null,
        effective_target_today: 1500000,
        effective_target_at_retirement: 3140000
      },
      scenarios: [{
        key: 'custom',
        label: 'Custom assumption',
        source: 'custom',
        annual_return_percent: 7,
        inflation_rate_percent: 3,
        inflation_source: 'user_assumption',
        portfolio_goal_at_retirement: 3140000,
        projected_balance_at_retirement: 1200000,
        projected_balance_in_today_dollars: 600000,
        surplus_shortfall_at_retirement: -300000,
        is_on_track: false,
        required_monthly_contribution: 1500,
        monthly_contribution_change: 500,
        estimated_goal_age: 68.5,
        supported_annual_spending_today: 48000,
        timeline: [{ year: 0, age: 40, balance: 200000 }]
      }]
    },
    hasSavedPlan: false,
    loading: false,
    calculating: false,
    saving: false,
    error: null,
    clearError: vi.fn(),
    load: vi.fn().mockResolvedValue({ draft_plan: draftPlan }),
    calculate: vi.fn().mockResolvedValue({}),
    save: vi.fn().mockResolvedValue({}),
    reset: vi.fn().mockResolvedValue(true)
  })
}

describe('RetirementPlannerView', () => {
  beforeEach(() => {
    mocks.selectedAccount = ref(null)
    mocks.retirementStore = createStore()
    mocks.fetchAccounts.mockReset().mockResolvedValue([])
    mocks.showSuccess.mockReset()
    mocks.showError.mockReset()
    mocks.showDangerConfirmation.mockReset()
  })

  it('keeps the content mounted and presents an accessible shortfall status', async () => {
    const wrapper = shallowMount(RetirementPlannerView)
    await flushPromises()

    expect(wrapper.text()).toContain('Retirement Planner')
    expect(wrapper.text()).toContain('Needs adjustment')
    expect(wrapper.text()).toContain('Shortfall projected')
    expect(wrapper.text()).toContain('Portfolio goal (amount needed)')
    expect(wrapper.text()).toContain('Projected balance (amount you may have)')
    expect(wrapper.text()).toContain('Accounts included in the projection')
    expect(wrapper.text()).toContain('Plaid-synced holdings')
    expect(wrapper.text()).toContain('Open long positions')
    expect(wrapper.text()).toContain('Accounts that exist in Settings but contain none of those records are not included')
    expect(wrapper.text()).toContain('The portfolio goal is what the plan calculates you need')
    expect(wrapper.text()).toContain('Plan status compares those two amounts')
    expect(wrapper.text()).toContain('How the portfolio goal is calculated')
    expect(wrapper.text()).toContain('How the scenarios are built')
    expect(wrapper.text()).toContain('Uses your return and future inflation estimates')
    expect(wrapper.text()).toContain('Uses matching portfolio returns and historical inflation')
    expect(wrapper.text()).toContain('Historical scenarios do not replay')
    expect(wrapper.findAllComponents({ name: 'ResultMetric' })[0].props('detail'))
      .toContain('Estimated amount you may have')
    expect(wrapper.findAllComponents({ name: 'PercentField' })[0].props('help'))
      .toContain('Used only by the Custom assumption')
    expect(wrapper.findAllComponents({ name: 'PercentField' })[1].props('label'))
      .toBe('Custom future inflation')
    expect(wrapper.findAllComponents({ name: 'PercentField' })[1].props('help'))
      .toContain('Historical scenarios use U.S. CPI-U inflation')
    expect(wrapper.text()).toContain('No historical period currently meets')
    expect(mocks.retirementStore.load).toHaveBeenCalledWith({})
  })

  it('shows the scenario explanation from the compare-scenarios heading', async () => {
    const wrapper = shallowMount(RetirementPlannerView)
    await flushPromises()

    const trigger = wrapper.get('[data-testid="scenario-help-trigger"]')
    const helpCard = wrapper.get('[data-testid="scenario-help-card"]')

    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(helpCard.isVisible()).toBe(false)

    await trigger.trigger('mouseenter')

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[data-testid="scenario-help-card"]').attributes('style') || '')
      .not.toContain('display: none')
    expect(wrapper.get('[data-testid="scenario-help-card"]').text())
      .toContain('annualized historical inflation both repeat steadily')

    await wrapper.get('[data-testid="scenario-comparison"]').trigger('mouseleave')
    expect(wrapper.get('[data-testid="scenario-help-trigger"]').attributes('aria-expanded')).toBe('false')

    await wrapper.get('[data-testid="scenario-help-trigger"]').trigger('click')
    expect(wrapper.get('[data-testid="scenario-help-trigger"]').attributes('aria-expanded')).toBe('true')
  })

  it('recalculates a temporary preview when the global account filter changes', async () => {
    shallowMount(RetirementPlannerView)
    await flushPromises()

    mocks.selectedAccount.value = 'ira-1'
    await flushPromises()

    expect(mocks.retirementStore.calculate).toHaveBeenCalledWith(
      expect.objectContaining({ current_age: 40 }),
      { accounts: 'ira-1' }
    )
  })

  it('allows accounts to be hidden from a temporary projection preview', async () => {
    const wrapper = shallowMount(RetirementPlannerView)
    await flushPromises()

    expect(wrapper.get('[data-testid="account-picker"]').isVisible()).toBe(false)
    await wrapper.get('[data-testid="account-picker-trigger"]').trigger('click')
    expect(wrapper.get('[data-testid="account-picker-trigger"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[data-testid="account-picker"]').attributes('style') || '')
      .not.toContain('display: none')

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="account-picker-trigger"]').attributes('aria-expanded')).toBe('false')

    await wrapper.get('[data-testid="account-picker-trigger"]').trigger('click')
    await wrapper.get('[data-testid="retirement-account-taxable-1"]').setValue(false)
    await flushPromises()

    expect(mocks.retirementStore.calculate).toHaveBeenCalledWith(
      expect.objectContaining({ current_age: 40 }),
      { accounts: 'ira-1' }
    )
    expect(wrapper.text()).toContain('1 of 2 accounts')
    expect(wrapper.text()).toContain('Include all')
  })
})
