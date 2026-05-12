import { computed } from 'vue'
import { useGrowthBook } from '@/composables/useGrowthBook'
import { PRO_MONTHLY_PRICE, PRO_MONTHLY_PRICE_B, PRO_YEARLY_PRICE } from '@/config/pricing'

const CONTROL_MONTHLY_PRICE_CENTS = PRO_MONTHLY_PRICE * 100
const HIGHER_MONTHLY_PRICE_CENTS = PRO_MONTHLY_PRICE_B * 100
const YEARLY_PRICE_CENTS = PRO_YEARLY_PRICE * 100

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
    const variant = normalizeVariant(getFeatureValue('pricing_plan_variant', 'control'))
    if (variant === 'b' || variant === 'higher_price') return variant
    return 'control'
  })

  const monthlyPriceCents = computed(() => (
    selectedMonthlyVariant.value === 'b' || selectedMonthlyVariant.value === 'higher_price'
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
