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
      baseline: { starting_balance: 200000 },
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
        total_future_contributions: 300000,
        projected_investment_growth: 700000,
        timeline: [{ year: 0, age: 40, balance: 200000 }]
      }]
    },
    hasSavedPlan: false,
    affordability: null,
    affordabilityTransactions: [],
    affordabilityCategories: [],
    affordabilityLoading: false,
    loading: false,
    calculating: false,
    saving: false,
    error: null,
    clearError: vi.fn(),
    load: vi.fn().mockResolvedValue({ draft_plan: draftPlan }),
    calculate: vi.fn().mockResolvedValue({}),
    save: vi.fn().mockResolvedValue({}),
    reset: vi.fn().mockResolvedValue(true),
    setRetirementSavingsAccount: vi.fn().mockResolvedValue({}),
    fetchAffordabilityTransactions: vi.fn().mockResolvedValue([]),
    setCashflowCategory: vi.fn().mockResolvedValue({}),
    refreshAffordability: vi.fn().mockResolvedValue({})
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
    expect(wrapper.get('[data-testid="goal-bar"]').text()).toContain('$1,200,000 projected at 65')
    expect(wrapper.get('[data-testid="goal-bar"]').text()).toContain('$3,140,000 needed')
    expect(wrapper.text()).toContain('$1,500 a month is needed, $500 more than now.')
    expect(wrapper.text()).toContain('Age 68.5')
    expect(wrapper.text()).toContain('4 years after your planned retirement at 65.')
    expect(wrapper.text()).toContain('Short of the $60,000 a year you want')
    expect(wrapper.text()).not.toContain('Shortfall projected')
    expect(wrapper.text()).not.toContain('Plan status')
    expect(wrapper.text()).toContain('Accounts included in the projection')
    expect(wrapper.text()).toContain('Plaid-synced holdings')
    expect(wrapper.text()).toContain('Open long positions')
    expect(wrapper.text()).toContain('Accounts that exist in Settings but contain none of those records are not included')
    expect(wrapper.text()).toContain('How the portfolio goal is calculated')
    expect(wrapper.text()).toContain('How the scenarios are built')
    expect(wrapper.text()).toContain('Uses your return and future inflation estimates')
    expect(wrapper.text()).toContain('Uses matching portfolio returns and historical inflation')
    expect(wrapper.text()).toContain('Historical scenarios do not replay')
    expect(wrapper.findAllComponents({ name: 'PercentField' })[0].props('help'))
      .toContain('Used only by the Custom assumption')
    expect(wrapper.findAllComponents({ name: 'PercentField' })[1].props('label'))
      .toBe('Custom future inflation')
    expect(wrapper.findAllComponents({ name: 'PercentField' })[1].props('help'))
      .toContain('Historical scenarios use U.S. CPI-U inflation')
    expect(wrapper.text()).toContain('No historical period currently meets')
    expect(mocks.retirementStore.load).toHaveBeenCalledWith({})
  })

  it('leads with a plain-language status sentence and the starter banner', async () => {
    const wrapper = shallowMount(RetirementPlannerView)
    await flushPromises()

    expect(wrapper.get('[data-testid="starter-banner"]').text())
      .toContain('These are starting assumptions, not your plan yet.')
    expect(wrapper.find('[data-testid="status-sentence"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composition-row"]').text())
      .toContain('$200,000 today, $300,000 added, $700,000 from growth')
    expect(wrapper.get('[data-testid="tracked-portfolio"]').text()).toContain('$200,000')
    expect(wrapper.text()).toContain('Starting balance')
    expect(wrapper.get('[data-testid="projection-sync-status"]').text())
      .toBe('Projection matches your inputs.')
    expect(wrapper.text()).toContain('Only the Custom assumption is available.')
    expect(wrapper.find('table').exists()).toBe(false)

    const stepHeadings = wrapper.findAll('form h2').map(node => node.text())
    expect(stepHeadings).toEqual([
      'When',
      'What you have',
      'What you add',
      'What you want',
      'Other retirement income',
      'Assumptions'
    ])
  })

  it('hides the starter banner once a plan is saved', async () => {
    mocks.retirementStore.hasSavedPlan = true
    const wrapper = shallowMount(RetirementPlannerView)
    await flushPromises()
    expect(wrapper.find('[data-testid="starter-banner"]').exists()).toBe(false)
  })

  it('flags the projection as out of date and recalculates after a pause', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = shallowMount(RetirementPlannerView)
      await flushPromises()
      mocks.retirementStore.calculate.mockClear()

      const ageInput = wrapper.findAll('input[type="number"]')[1]
      await ageInput.setValue(60)

      expect(wrapper.get('[data-testid="projection-sync-status"]').text())
        .toContain('Inputs changed')
      expect(wrapper.get('[data-testid="plan-status"]').text())
        .toContain('Updating to match your inputs')
      expect(mocks.retirementStore.calculate).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(700)
      await flushPromises()

      expect(mocks.retirementStore.calculate).toHaveBeenCalledTimes(1)
      expect(mocks.retirementStore.calculate).toHaveBeenCalledWith(
        expect.objectContaining({ target_retirement_age: 60 }),
        {}
      )
      expect(wrapper.get('[data-testid="projection-sync-status"]').text())
        .toBe('Projection matches your inputs.')
      expect(wrapper.get('[data-testid="plan-status"]').text())
        .not.toContain('Updating to match your inputs')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not auto-recalculate while inputs are invalid', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = shallowMount(RetirementPlannerView)
      await flushPromises()
      mocks.retirementStore.calculate.mockClear()

      const ageInput = wrapper.findAll('input[type="number"]')[1]
      await ageInput.setValue(30)
      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()

      expect(mocks.retirementStore.calculate).not.toHaveBeenCalled()
      expect(wrapper.get('[data-testid="projection-sync-status"]').text())
        .toContain('Fix the highlighted inputs')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the affordability verdict, linked savings and spending suggestions when Plaid data exists', async () => {
    mocks.retirementStore.affordability = {
      available: true,
      cashflow: { months_requested: 12, months_covered: 6, transaction_count: 120, unclassified_count: 0, classification_sources: { rule: 100, ai: 20, user: 0 }, monthly: { income: 6000, spending: 3900, debt_payments: 400, savings: 500, left_over: 1200, capacity: 1700 } },
      debt: { total_balance: 8000, monthly_minimum_payments: 250, count: 1, overdue_count: 0, items: [{ id: 'l1', account_name: 'Visa', liability_type: 'credit', apr_percent: 21.5, current_balance: 8000, is_overdue: false }] },
      savings_accounts: [
        { id: 'sav', account_name: 'Savings', mask: '1234', account_subtype: 'savings', current_balance: 12000, include_in_retirement_savings: true },
        { id: 'chk', account_name: 'Checking', mask: '9999', account_subtype: 'checking', current_balance: 3000, include_in_retirement_savings: false }
      ],
      suggestions: { monthly_contribution_current_saving: 500, monthly_contribution_capacity: 1700, current_annual_cost_of_living: 51600, desired_annual_retirement_spending: 37440, retirement_spending_ratio_percent: 80, additional_retirement_savings: 12000 },
      classification: { rules: 100, ai: 20, unclassified: 0, ai_reason: null, ai_enabled: true },
      viability: { custom: { status: 'stretch', capacity: 1700, required: 2200, increase_needed: 1200, shortfall_per_month: 500, spending_cut_percent: 50, suggested_retirement_age: 69 } }
    }
    const wrapper = shallowMount(RetirementPlannerView)
    await flushPromises()

    const verdict = wrapper.get('[data-testid="viability"]').text()
    expect(verdict).toContain('What you can afford')
    expect(verdict).toContain('This plan needs more than your cash flow leaves over.')
    expect(verdict).toContain('$2,200 a month, $500 more than the $1,700 you could save')
    expect(verdict).toContain('cut discretionary spending by about 50% or retire closer to age 69')

    const savings = wrapper.get('[data-testid="linked-savings"]')
    expect(savings.text()).toContain('Savings ••••1234')
    expect(savings.text()).not.toContain('Checking')
    expect(savings.text()).toContain('$12,000')
    expect(savings.text()).toContain('Ticked balances are added to your starting balance.')
    expect(wrapper.get('[data-testid="linked-debts"]').text()).toContain('Debts: $8,000 across 1 account')
    expect(wrapper.get('[data-testid="spending-suggestion"]').text()).toContain('Use 80% of spending without debt')

    mocks.retirementStore.calculate.mockClear()
    await savings.get('input[type="checkbox"]').setValue(false)
    await flushPromises()
    expect(mocks.retirementStore.setRetirementSavingsAccount).toHaveBeenCalledWith('sav', false)
    expect(mocks.retirementStore.calculate).toHaveBeenCalledTimes(1)
  })

  it('offers to link a bank account when no affordability data exists', async () => {
    mocks.retirementStore.affordability = { available: false, reason: 'no_bank_connection' }
    const wrapper = shallowMount(RetirementPlannerView)
    await flushPromises()
    expect(wrapper.find('[data-testid="viability"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="linked-savings"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'RetirementCashflowPanel' }).props('affordability'))
      .toEqual({ available: false, reason: 'no_bank_connection' })
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
