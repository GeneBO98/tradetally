import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RetirementCashflowPanel from '@/components/investments/RetirementCashflowPanel.vue'

const formatCurrency = value => `$${Math.round(Number(value) || 0).toLocaleString()}`

const affordability = {
  available: true,
  cashflow: {
    months_requested: 12,
    months_covered: 6,
    transaction_count: 212,
    unclassified_count: 3,
    classification_sources: { rule: 180, ai: 25, user: 4 },
    income_detected: true,
    monthly: {
      income: 6000,
      spending: 3900,
      debt_payments: 400,
      savings: 500,
      left_over: 1200,
      capacity: 1700
    }
  },
  suggestions: {
    monthly_contribution_current_saving: 500,
    monthly_contribution_capacity: 1700
  },
  classification: { ai_reason: null }
}

const transactions = [
  { id: 't1', amount: 2400, direction: 'out', transaction_date: '2026-10-01', description: 'RENT', merchant_name: null, account_name: 'Checking', cashflow_category: 'essential', cashflow_source: 'rule' },
  { id: 't2', amount: -6000, direction: 'in', transaction_date: '2026-10-01', description: 'ACME PAYROLL', merchant_name: 'Acme', account_name: 'Checking', cashflow_category: null, cashflow_source: null },
  { id: 't3', amount: -6000, direction: 'in', transaction_date: '2026-09-01', description: 'ACME PAYROLL', merchant_name: 'Acme', account_name: 'Checking', cashflow_category: null, cashflow_source: null },
  { id: 't4', amount: -5000, direction: 'in', transaction_date: '2026-08-01', description: 'acme payroll', merchant_name: 'Acme', account_name: 'Checking', cashflow_category: 'income', cashflow_source: 'user' }
]

function mountPanel(props = {}) {
  return mount(RetirementCashflowPanel, {
    props: { affordability, formatCurrency, categories: ['income', 'essential', 'discretionary'], ...props },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } }
  })
}

describe('RetirementCashflowPanel', () => {
  it('prompts to link a bank account when no data is available', () => {
    const wrapper = mountPanel({ affordability: { available: false, reason: 'no_bank_connection' } })
    expect(wrapper.get('[data-testid="cashflow-empty"]').text()).toContain('Link a bank account')
    expect(wrapper.find('[data-testid="cashflow-summary"]').exists()).toBe(false)
  })

  it('shows monthly averages, the basis line, and emits prefill values', async () => {
    const wrapper = mountPanel()
    const text = wrapper.get('[data-testid="cashflow-summary"]').text()
    expect(text).toContain('Monthly averages over 6 months · 212 transactions')
    expect(text).toContain('Take-home income$6,000')
    expect(text).toContain('Could save$1,700')
    expect(text).toContain('180 categorized by rules, 25 by the AI classifier, 4 by you. 3 left uncategorized and excluded.')

    await wrapper.get('[data-testid="use-current-saving"]').trigger('click')
    await wrapper.get('[data-testid="use-capacity"]').trigger('click')
    expect(wrapper.emitted('apply')).toEqual([
      [{ field: 'monthly_contribution', value: 500 }],
      [{ field: 'monthly_contribution', value: 1700 }]
    ])
  })

  it('loads the review list on open and emits category changes', async () => {
    const wrapper = mountPanel({ transactions })
    await wrapper.get('[data-testid="review-toggle"]').trigger('click')
    expect(wrapper.emitted('open-review')).toHaveLength(1)

    // Three payroll rows collapse into one group, led by the largest total.
    const groups = wrapper.findAll('li')
    expect(groups).toHaveLength(2)
    const payroll = wrapper.get('[data-testid="group-t2"]')
    expect(payroll.text()).toContain('Acme')
    expect(payroll.text()).toContain('+$5,667 avg')
    expect(payroll.text()).toContain('3 × · Aug 2026 to Oct 2026 · Checking · you')
    expect(payroll.find('p').attributes('title')).toBe('Acme')

    const select = wrapper.get('[data-testid="category-t2"]')
    expect(select.element.value).toBe('income')
    await select.setValue('essential')
    expect(wrapper.emitted('categorize')).toEqual([[{ id: 't2', category: 'essential' }]])
    expect(wrapper.get('[data-testid="group-t1"]').text()).toContain('−$2,400')
    expect(wrapper.text()).toContain('Changing a category applies to every transaction with the same description.')
  })

  it('explains missing income and hides the prefill buttons when no income was found', () => {
    const wrapper = mountPanel({
      affordability: {
        ...affordability,
        cashflow: { ...affordability.cashflow, income_detected: false, monthly: { ...affordability.cashflow.monthly, income: 0, capacity: 0 } }
      }
    })
    expect(wrapper.get('[data-testid="no-income-notice"]').text()).toContain('No income found in your linked accounts.')
    expect(wrapper.find('[data-testid="use-capacity"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="use-current-saving"]').exists()).toBe(false)
  })

  it('tells the user to configure AI when the classifier is unavailable', () => {
    const wrapper = mountPanel({
      affordability: { ...affordability, classification: { ai_reason: 'no_ai_provider' } }
    })
    expect(wrapper.text()).toContain('Configure an AI provider to categorize the rest automatically.')
  })
})
