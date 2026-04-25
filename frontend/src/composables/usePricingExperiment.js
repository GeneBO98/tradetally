import { computed } from 'vue'
import { useGrowthBook } from '@/composables/useGrowthBook'

const CONTROL_MONTHLY_PRICE_CENTS = 800
const HIGHER_MONTHLY_PRICE_CENTS = 1200
const YEARLY_PRICE_CENTS = 8000

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})

function formatCurrency(cents) {
  return currencyFormatter.format(cents / 100)
}

function normalizeVariant(rawVariant) {
  if (typeof rawVariant === 'string' && rawVariant.trim()) {
    return rawVariant.trim()
  }

  if (typeof rawVariant?.variant === 'string' && rawVariant.variant.trim()) {
    return rawVariant.variant.trim()
  }

  return 'control'
}

export function usePricingExperiment() {
  const { getFeatureValue } = useGrowthBook()

  const selectedMonthlyVariant = computed(() => {
    const variant = normalizeVariant(getFeatureValue('pricing_monthly_offer', 'control'))
    return variant === 'higher_price' ? 'higher_price' : 'control'
  })

  const monthlyPriceCents = computed(() => (
    selectedMonthlyVariant.value === 'higher_price'
      ? HIGHER_MONTHLY_PRICE_CENTS
      : CONTROL_MONTHLY_PRICE_CENTS
  ))

  const monthlyPriceLabel = computed(() => formatCurrency(monthlyPriceCents.value))
  const monthlyPricePerMonthLabel = computed(() => `${monthlyPriceLabel.value}/month`)
  const monthlyPricePerMoLabel = computed(() => `${monthlyPriceLabel.value}/mo`)
  const monthlyPriceRangeLabel = computed(() => `$0-${monthlyPriceLabel.value}/mo`)
  const freeOrMonthlyLabel = computed(() => `Free or ${monthlyPricePerMoLabel.value}`)
  const proMonthlyLabel = computed(() => `Pro (${monthlyPricePerMoLabel.value})`)
  const startingAtMonthlyLabel = computed(() => `Starting at ${monthlyPricePerMonthLabel.value}`)

  const yearlyPriceLabel = computed(() => formatCurrency(YEARLY_PRICE_CENTS))
  const yearlyPricePerYearLabel = computed(() => `${yearlyPriceLabel.value}/year`)
  const annualSavingsPercent = computed(() => {
    const yearlyValueOfMonthlyPlan = monthlyPriceCents.value * 12

    if (yearlyValueOfMonthlyPlan <= YEARLY_PRICE_CENTS) {
      return 0
    }

    return Math.round((1 - (YEARLY_PRICE_CENTS / yearlyValueOfMonthlyPlan)) * 100)
  })
  const annualDiscountLabel = computed(() => (
    annualSavingsPercent.value > 0 ? `${annualSavingsPercent.value}%` : 'Available'
  ))
  const annualPlanSummaryLabel = computed(() => (
    annualSavingsPercent.value > 0
      ? `${yearlyPricePerYearLabel.value} with ${annualSavingsPercent.value}% savings`
      : yearlyPricePerYearLabel.value
  ))

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
