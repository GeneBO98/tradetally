import { ref, computed } from 'vue'
import api from '@/services/api'

// Single source of truth for Pro pricing: the live Stripe prices returned by
// the backend (/billing/pricing), which come from the price IDs configured in
// Admin -> billing settings. Fetched once and shared across every consumer so
// the marketing labels can never drift from the real checkout price.
//
// NOTE: the name is retained for import compatibility; the previous GrowthBook
// monthly A/B experiment has been removed.
const monthlyPriceCents = ref(null)
const yearlyPriceCents = ref(null)
let pricingPromise = null

function fetchPricing() {
  if (pricingPromise) return pricingPromise

  pricingPromise = api.get('/billing/pricing')
    .then(({ data }) => {
      const plans = Array.isArray(data?.data) ? data.data : []
      const monthly = plans.find(plan => plan.interval === 'month')
      const yearly = plans.find(plan => plan.interval === 'year')
      if (Number.isFinite(monthly?.price)) monthlyPriceCents.value = monthly.price
      if (Number.isFinite(yearly?.price)) yearlyPriceCents.value = yearly.price
    })
    .catch(() => {
      // Billing unavailable (e.g. self-hosted) — leave prices unset; labels
      // degrade gracefully to non-price copy.
    })

  return pricingPromise
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})

function formatCurrency(cents) {
  return currencyFormatter.format(cents / 100)
}

export function usePricingExperiment() {
  // Kick off the shared fetch (no-op after the first call).
  fetchPricing()

  const hasMonthly = computed(() => Number.isFinite(monthlyPriceCents.value))
  const hasYearly = computed(() => Number.isFinite(yearlyPriceCents.value))

  const monthlyPriceLabel = computed(() => (hasMonthly.value ? formatCurrency(monthlyPriceCents.value) : ''))
  const monthlyPricePerMonthLabel = computed(() => (hasMonthly.value ? `${monthlyPriceLabel.value}/month` : ''))
  const monthlyPricePerMoLabel = computed(() => (hasMonthly.value ? `${monthlyPriceLabel.value}/mo` : ''))
  const monthlyPriceRangeLabel = computed(() => (hasMonthly.value ? `$0-${monthlyPriceLabel.value}/mo` : ''))
  const freeOrMonthlyLabel = computed(() => (hasMonthly.value ? `Free or ${monthlyPricePerMoLabel.value}` : 'Free or Pro'))
  const proMonthlyLabel = computed(() => (hasMonthly.value ? `Pro (${monthlyPricePerMoLabel.value})` : 'Pro'))
  const startingAtMonthlyLabel = computed(() => (hasMonthly.value ? `Starting at ${monthlyPricePerMonthLabel.value}` : ''))

  const yearlyPriceLabel = computed(() => (hasYearly.value ? formatCurrency(yearlyPriceCents.value) : ''))
  const yearlyPricePerYearLabel = computed(() => (hasYearly.value ? `${yearlyPriceLabel.value}/year` : ''))

  const annualSavingsPercent = computed(() => {
    if (!hasMonthly.value || !hasYearly.value) return 0
    const fullYear = monthlyPriceCents.value * 12
    if (fullYear <= 0 || yearlyPriceCents.value >= fullYear) return 0
    return Math.round((1 - (yearlyPriceCents.value / fullYear)) * 100)
  })

  const annualDiscountLabel = computed(() => (
    annualSavingsPercent.value > 0 ? `${annualSavingsPercent.value}%` : 'Available'
  ))

  const annualPlanSummaryLabel = computed(() => {
    if (!hasYearly.value) return ''
    return annualSavingsPercent.value > 0
      ? `${yearlyPricePerYearLabel.value} with ${annualSavingsPercent.value}% savings`
      : yearlyPricePerYearLabel.value
  })

  // Retained for API compatibility; no experiment is active.
  const selectedMonthlyVariant = computed(() => 'control')

  return {
    selectedMonthlyVariant,
    monthlyPriceCents,
    monthlyPriceLabel,
    monthlyPricePerMonthLabel,
    monthlyPricePerMoLabel,
    monthlyPriceRangeLabel,
    freeOrMonthlyLabel,
    proMonthlyLabel,
    startingAtMonthlyLabel,
    yearlyPriceLabel,
    yearlyPricePerYearLabel,
    annualSavingsPercent,
    annualDiscountLabel,
    annualPlanSummaryLabel
  }
}
