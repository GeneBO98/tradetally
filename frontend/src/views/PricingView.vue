<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
    <div class="content-wrapper">
      <!-- Header -->
      <div class="text-center">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white">
          Trading Journal Pricing: Free Plan + {{ formattedMonthlyPrice }}/mo Pro
        </h1>
        <p class="mt-4 text-xl text-gray-600 dark:text-gray-400">
          Compare TradeTally pricing for a free trading journal and Pro analytics built for serious traders.
        </p>
      </div>

      <!-- Success / Error Messages -->
      <div v-if="successMessage" class="mt-6 max-w-2xl mx-auto">
        <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4">
          <p class="text-sm font-medium text-green-800 dark:text-green-200">{{ successMessage }}</p>
        </div>
      </div>
      <div v-if="errorMessage" class="mt-6 max-w-2xl mx-auto">
        <div class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
          <p class="text-sm font-medium text-red-800 dark:text-red-200">{{ errorMessage }}</p>
        </div>
      </div>

      <!-- Billing Not Available -->
      <div v-if="!billingStatus.billing_available" class="mt-12">
        <div class="max-w-2xl mx-auto">
          <div class="card">
            <div class="card-body text-center">
              <div class="text-gray-500 dark:text-gray-400 mb-4">
                <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Self-Hosted Instance</h3>
              <p class="text-gray-600 dark:text-gray-400">
                This is a self-hosted instance of TradeTally. All features are available at no cost.
              </p>
              <router-link to="/dashboard" class="btn btn-primary mt-4">
                Go to Dashboard
              </router-link>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-else-if="loading" class="mt-12">
        <div class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="mt-4 text-gray-600 dark:text-gray-400">Loading pricing plans...</p>
        </div>
      </div>

      <!-- Pricing Plans -->
      <div v-else class="mt-12">
        <!-- Current Plan Info -->
        <div v-if="currentSubscription" class="mb-8 text-center">
          <div class="inline-flex items-center px-4 py-2 rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Currently on {{ currentSubscription.plan_name || 'Pro Plan' }}
          </div>
        </div>

        <div class="flex justify-center mb-8">
          <div class="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button @click="billingPeriod = 'monthly'" :class="billingPeriod === 'monthly' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'" class="px-5 py-2 rounded-md text-sm font-medium transition-all">Monthly</button>
            <button @click="billingPeriod = 'yearly'" :class="billingPeriod === 'yearly' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'" class="px-5 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2">
              Annually
              <span v-if="yearlySavingsPercent" class="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-0.5 rounded-full font-semibold">Save {{ yearlySavingsPercent }}%</span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <!-- Free Plan -->
          <div class="card relative flex flex-col">
            <div class="card-body flex flex-col flex-1">
              <div class="text-center">
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">Free</h3>
                <div class="mt-4">
                  <span class="text-4xl font-bold text-gray-900 dark:text-white">$0</span>
                  <span class="text-gray-600 dark:text-gray-400">/month</span>
                </div>
                <p class="mt-4 text-gray-600 dark:text-gray-400">
                  Perfect for getting started with basic trading analytics
                </p>
              </div>

              <ul class="mt-8 space-y-4 flex-1">
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Unlimited trade storage</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Basic P&L tracking</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Basic analytics</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">CSV import (100 per batch)</span>
                </li>
              </ul>

              <div class="mt-8">
                <button 
                  disabled
                  class="w-full btn btn-disabled bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                >
                  {{ !currentSubscription ? 'Current Plan' : 'Already on Pro' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Trial Plan -->
          <div class="card relative border-2 border-green-500 flex flex-col">
            <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <span class="bg-green-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                Try Free
              </span>
            </div>
            
            <div class="card-body flex flex-col flex-1">
              <div class="text-center">
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">14-Day Trial</h3>
                <div class="mt-4">
                  <span class="text-4xl font-bold text-gray-900 dark:text-white">Free</span>
                </div>
                <p class="mt-4 text-gray-600 dark:text-gray-400">
                  Try Pro features risk-free with no payment method required
                </p>
              </div>

              <ul class="mt-8 space-y-4 flex-1">
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">All Pro features</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">No payment method required</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Cancel anytime</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Upgrade to Pro anytime</span>
                </li>
              </ul>

              <div class="mt-8">
                <button 
                  v-if="!currentSubscription"
                  @click="startTrial()"
                  :disabled="subscribing || hasUsedTrial || (trialInfo && trialInfo.active)"
                  :class="getTrialButtonClass()"
                  class="w-full"
                >
                  <span v-if="subscribing" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></span>
                  {{ getTrialButtonText() }}
                </button>
                <button 
                  v-else
                  disabled
                  class="w-full btn btn-disabled bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                >
                  Already on Pro
                </button>
              </div>
            </div>
          </div>

          <!-- Pro Plan -->
          <div class="card relative border-2 border-primary-500 flex flex-col">
            <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <span class="bg-primary-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </span>
            </div>
            
            <div class="card-body flex flex-col flex-1">
              <div class="text-center">
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">Pro</h3>
                <div class="mt-4">
                  <span class="text-4xl font-bold text-gray-900 dark:text-white">${{ billingPeriod === 'yearly' ? yearlyMonthlyEquivalent : monthlyDisplayPrice }}</span>
                  <span class="text-gray-600 dark:text-gray-400">/month</span>
                  <div v-if="billingPeriod === 'yearly'" class="mt-1 text-sm text-gray-500 dark:text-gray-400">${{ yearlyDisplayPrice }} billed annually</div>
                  <div v-else-if="yearlySavingsPercent" class="mt-1 text-sm text-green-600 dark:text-green-400 font-medium">Save {{ yearlySavingsPercent }}% with annual billing</div>
                </div>
                <p class="mt-4 text-gray-600 dark:text-gray-400">
                  Advanced analytics and behavioral insights for serious traders
                </p>
              </div>

              <ul class="mt-8 space-y-4 flex-1">
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Everything in Free</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Unlimited batch imports</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Behavioral analytics</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Revenge trading detection</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Advanced risk metrics</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Priority support</span>
                </li>
              </ul>

              <div class="mt-8">
                <button 
                  v-if="!currentSubscription"
                  @click="subscribe()"
                  :disabled="subscribing || !selectedMonthlyOffer"
                  :class="getSubscribeButtonClass()"
                  class="w-full"
                >
                  <span v-if="subscribing" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></span>
                  {{ getSubscribeButtonText() }}
                </button>
                <button 
                  v-else
                  disabled
                  class="w-full btn btn-disabled bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                >
                  Current Plan
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- FAQ Section -->
        <div class="mt-16">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white text-center mb-8">
            Frequently Asked Questions
          </h2>
          
          <div class="max-w-3xl mx-auto space-y-6">
            <div class="card">
              <div class="card-body">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Can I change my plan anytime?
                </h3>
                <p class="text-gray-600 dark:text-gray-400">
                  Yes, you can upgrade or downgrade your plan at any time. Changes will be prorated automatically.
                </p>
              </div>
            </div>

            <div class="card">
              <div class="card-body">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  What happens if I cancel my subscription?
                </h3>
                <p class="text-gray-600 dark:text-gray-400">
                  You'll have access to Pro features until the end of your billing period, then your account will be downgraded to the Free plan.
                </p>
              </div>
            </div>

            <div class="card">
              <div class="card-body">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Is my trading data secure?
                </h3>
                <p class="text-gray-600 dark:text-gray-400">
                  Absolutely. We use industry-standard encryption and security practices to protect your data. We never share your trading information with third parties.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-12 bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm max-w-3xl mx-auto">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white text-center mb-3">
            Explore More TradeTally Pages
          </h2>
          <p class="text-gray-600 dark:text-gray-400 text-center mb-5">
            Review feature details, platform comparisons, and deployment docs before choosing a plan.
          </p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <router-link to="/features" class="btn-secondary text-center">Features</router-link>
            <router-link to="/compare" class="btn-secondary text-center">Compare</router-link>
            <router-link to="/faq" class="btn-secondary text-center">FAQ</router-link>
            <router-link to="/public" class="btn-secondary text-center">Public Trades</router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAnalytics } from '@/composables/useAnalytics'
import { useGrowthBook } from '@/composables/useGrowthBook'
import { growthbook } from '@/services/growthbook'
import { PRO_MONTHLY_PRICE, PRO_MONTHLY_PRICE_B, PRO_YEARLY_PRICE } from '@/config/pricing'
import api from '@/services/api'

export default {
  name: 'PricingView',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const authStore = useAuthStore()
    const analytics = useAnalytics()
    const { getFeatureValue } = useGrowthBook()
    const loading = ref(true)
    const subscribing = ref(false)
    const billingStatus = ref({
      billing_enabled: false,
      billing_available: false
    })
    const pricingPlans = ref([])
    const pricingExperiments = ref({})
    const currentSubscription = ref(null)
    const trialInfo = ref(null)
    const hasUsedTrial = ref(false)
    const redirectUrl = ref(route.query.redirect || null)
    const errorMessage = ref('')
    const successMessage = ref('')
    const billingPeriod = ref('monthly')

    const pricingVariant = computed(() =>
      growthbook?.getFeatureValue('pricing_plan_variant', 'control') || 'control'
    )
    const selectedMonthlyPlan = computed(() => {
      if (!pricingPlans.value.length) return null
      const variant = pricingVariant.value
      return (
        pricingPlans.value.find(p => p.interval === 'month' && p.variant === variant) ||
        pricingPlans.value.find(p => p.interval === 'month')
      )
    })
    const yearlyPlan = computed(() =>
      pricingPlans.value.find(p => p.interval === 'year') || null
    )
    const monthlyDisplayPrice = computed(() => {
      if (selectedMonthlyPlan.value) return Math.round(selectedMonthlyPlan.value.price / 100)
      return pricingVariant.value === 'b' ? PRO_MONTHLY_PRICE_B : PRO_MONTHLY_PRICE
    })
    const yearlyDisplayPrice = computed(() => {
      if (yearlyPlan.value) return Math.round(yearlyPlan.value.price / 100)
      return PRO_YEARLY_PRICE
    })
    const yearlyMonthlyEquivalent = computed(() =>
      (yearlyDisplayPrice.value / 12).toFixed(2).replace(/\.00$/, '')
    )
    const yearlySavingsPercent = computed(() => {
      const monthly = selectedMonthlyPlan.value?.price || monthlyDisplayPrice.value * 100
      const yearly = yearlyPlan.value?.price || yearlyDisplayPrice.value * 100
      const savings = Math.round((1 - yearly / (monthly * 12)) * 100)
      return savings > 0 ? savings : null
    })

    const moneyFormatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })

    const formatPrice = (priceInCents) => {
      if (!Number.isFinite(priceInCents)) {
        return '$0'
      }

      return moneyFormatter.format(priceInCents / 100)
    }

    const getSelectedMonthlyVariant = () => {
      const rawVariant = getFeatureValue('pricing_monthly_offer', 'control')

      if (typeof rawVariant === 'string' && rawVariant.trim()) {
        return rawVariant.trim()
      }

      if (typeof rawVariant?.variant === 'string' && rawVariant.variant.trim()) {
        return rawVariant.variant.trim()
      }

      return 'control'
    }

    const controlMonthlyOffer = computed(() => (
      pricingPlans.value.find(plan => plan.interval === 'month') || null
    ))

    const selectedMonthlyVariant = computed(() => {
      const experimentPlans = pricingExperiments.value?.pricing_monthly_offer || {}
      const requestedVariant = getSelectedMonthlyVariant()

      if (experimentPlans[requestedVariant]) {
        return requestedVariant
      }

      return 'control'
    })

    const selectedMonthlyOffer = computed(() => {
      const experimentPlans = pricingExperiments.value?.pricing_monthly_offer || {}
      return experimentPlans[selectedMonthlyVariant.value] || experimentPlans.control || controlMonthlyOffer.value
    })

    const formattedMonthlyPrice = computed(() => {
      if (!Number.isFinite(selectedMonthlyOffer.value?.price)) {
        return `$${pricingVariant.value === 'b' ? PRO_MONTHLY_PRICE_B : PRO_MONTHLY_PRICE}`
      }

      return formatPrice(selectedMonthlyOffer.value.price)
    })

    const updateSeoMetadata = () => {
      const priceLabel = formattedMonthlyPrice.value

      document.title = 'Choose Your Plan - Trading Journal Pricing | TradeTally'

      let metaDescription = document.querySelector('meta[name="description"]')
      if (!metaDescription) {
        metaDescription = document.createElement('meta')
        metaDescription.setAttribute('name', 'description')
        document.head.appendChild(metaDescription)
      }
      metaDescription.setAttribute('content', `TradeTally pricing: free plan with unlimited trades or Pro at ${priceLabel}/mo. Compare to TraderVue ($29-$79/mo) and TraderSync ($30-$80/mo). Open-source and self-hosted option available.`)

      let metaKeywords = document.querySelector('meta[name="keywords"]')
      if (!metaKeywords) {
        metaKeywords = document.createElement('meta')
        metaKeywords.setAttribute('name', 'keywords')
        document.head.appendChild(metaKeywords)
      }
      metaKeywords.setAttribute('content', 'free trading journal, trading journal pricing, TradeTally pricing, TraderVue alternative, TraderSync alternative, open source trading journal, self-hosted trading journal, day trading journal cost')

      let canonical = document.querySelector('link[rel="canonical"]')
      if (!canonical) {
        canonical = document.createElement('link')
        canonical.setAttribute('rel', 'canonical')
        document.head.appendChild(canonical)
      }
      canonical.setAttribute('href', 'https://tradetally.io/pricing')
    }

    const loadBillingStatus = async () => {
      try {
        const response = await api.get('/billing/status')
        billingStatus.value = response.data.data
      } catch (error) {
        console.error('Error loading billing status:', error)
      }
    }

    const loadPricingPlans = async () => {
      if (!billingStatus.value.billing_available) {
        loading.value = false
        return
      }

      try {
        const response = await api.get('/billing/pricing')
        pricingPlans.value = response.data.data
        pricingExperiments.value = response.data.experiments || {}
      } catch (error) {
        console.error('Error loading pricing plans:', error)
        if (error.response?.data?.error === 'billing_unavailable') {
          billingStatus.value.billing_available = false
        }
      }
    }

    const loadCurrentSubscription = async () => {
      if (!billingStatus.value.billing_available) {
        return
      }

      try {
        const response = await api.get('/billing/subscription')
        currentSubscription.value = response.data.data.subscription
        trialInfo.value = response.data.data.trial
        hasUsedTrial.value = response.data.data.has_used_trial
      } catch (error) {
        console.error('Error loading current subscription:', error)
      } finally {
        loading.value = false
      }
    }

    const subscribe = async () => {
      // Check if user is authenticated
      if (!authStore.token || !authStore.isAuthenticated) {
        router.push('/login?redirect=' + encodeURIComponent('/pricing'))
        return
      }

      subscribing.value = true
      try {
        const isYearly = billingPeriod.value === 'yearly'
        const chosenPlan = isYearly ? yearlyPlan.value : selectedMonthlyPlan.value
        const priceId = isYearly ? yearlyPlan.value?.id : selectedMonthlyPlan.value?.id

        if (!priceId) {
          // Fall back to legacy experiment offer if new plan objects not available
          const monthlyOffer = selectedMonthlyOffer.value
          const fallbackPriceId = monthlyOffer?.id
          if (!fallbackPriceId) {
            throw new Error('Price ID not found. Please contact support.')
          }

          analytics.track('pricing_checkout_started', {
            feature_key: 'pricing_monthly_offer',
            variant: selectedMonthlyVariant.value,
            price_cents: monthlyOffer.price,
            currency: monthlyOffer.currency || 'USD',
            interval: monthlyOffer.interval || 'month'
          })

          const payload = {
            priceId: fallbackPriceId,
            pricingExperiment: {
              key: 'pricing_monthly_offer',
              variant: selectedMonthlyVariant.value,
              displayedPriceCents: monthlyOffer.price,
              currency: monthlyOffer.currency || 'USD'
            }
          }
          if (redirectUrl.value) {
            payload.redirectUrl = redirectUrl.value
          }
          if (window.promotekit_referral) {
            payload.referral = window.promotekit_referral
          }
          const response = await api.post('/billing/checkout', payload)
          window.location.href = response.data.data.checkout_url
          return
        }

        analytics.track('pricing_checkout_started', {
          feature_key: 'pricing_plan_variant',
          variant: isYearly ? 'yearly' : pricingVariant.value,
          price_cents: chosenPlan?.price,
          currency: chosenPlan?.currency || 'USD',
          interval: isYearly ? 'year' : 'month'
        })

        const payload = {
          priceId,
          pricingExperiment: {
            key: 'pricing_plan_variant',
            variant: isYearly ? 'yearly' : pricingVariant.value,
            displayedPriceCents: chosenPlan?.price,
            currency: chosenPlan?.currency || 'USD'
          }
        }
        if (redirectUrl.value) {
          payload.redirectUrl = redirectUrl.value
        }
        // Include PromoteKit referral for affiliate tracking if available
        if (window.promotekit_referral) {
          payload.referral = window.promotekit_referral
        }

        const response = await api.post('/billing/checkout', payload)

        // Redirect to Stripe checkout
        window.location.href = response.data.data.checkout_url
      } catch (error) {
        console.error('Error creating checkout session:', error)
        
        errorMessage.value = 'Failed to start checkout process. Please try again.'

        if (error.response?.status === 401) {
          router.push('/login?redirect=' + encodeURIComponent('/pricing'))
          return
        } else if (error.response?.data?.error) {
          errorMessage.value = error.response.data.error
        }

        setTimeout(() => { errorMessage.value = '' }, 8000)
      } finally {
        subscribing.value = false
      }
    }

    const startTrial = async () => {
      try {
        subscribing.value = true
        
        const response = await api.post('/billing/trial')
        
        if (response.data.success) {
          successMessage.value = '14-day trial started! You now have access to Pro features.'
          // Redirect to dashboard after brief delay
          setTimeout(() => {
            router.push('/dashboard')
          }, 1500)
          return
        }
      } catch (error) {
        console.error('Error starting trial:', error)

        errorMessage.value = 'Failed to start trial. Please try again.'

        if (error.response?.status === 401) {
          router.push('/login?redirect=' + encodeURIComponent('/pricing'))
          return
        } else if (error.response?.data?.message) {
          errorMessage.value = error.response.data.message
        }

        setTimeout(() => { errorMessage.value = '' }, 8000)
      } finally {
        subscribing.value = false
      }
    }

    const getTrialButtonClass = () => {
      if (hasUsedTrial.value || (trialInfo.value && trialInfo.value.active)) {
        return 'btn btn-disabled bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
      }
      return 'btn btn-primary'
    }

    const getTrialButtonText = () => {
      if (trialInfo.value && trialInfo.value.active) {
        return `Active Trial (${trialInfo.value.days_remaining} days left)`
      }
      if (hasUsedTrial.value) {
        return 'Trial Used'
      }
      return 'Start Free Trial'
    }

    const getSubscribeButtonClass = () => {
      if (currentSubscription.value) {
        return 'btn btn-outline'
      }
      return 'btn btn-primary'
    }

    const getSubscribeButtonText = () => {
      if (currentSubscription.value) {
        return 'Current Plan'
      }
      return 'Subscribe to Pro'
    }

    watch(formattedMonthlyPrice, updateSeoMetadata, { immediate: true })

    onMounted(async () => {
      await loadBillingStatus()
      await loadPricingPlans()
      // Only load subscription data if user is authenticated
      if (authStore.isAuthenticated) {
        await loadCurrentSubscription()
      } else {
        loading.value = false
      }
    })

    return {
      loading,
      subscribing,
      billingStatus,
      pricingPlans,
      selectedMonthlyOffer,
      formattedMonthlyPrice,
      currentSubscription,
      trialInfo,
      hasUsedTrial,
      subscribe,
      startTrial,
      getSubscribeButtonClass,
      getSubscribeButtonText,
      getTrialButtonClass,
      getTrialButtonText,
      errorMessage,
      successMessage,
      billingPeriod,
      pricingVariant,
      selectedMonthlyPlan,
      yearlyPlan,
      monthlyDisplayPrice,
      yearlyDisplayPrice,
      yearlyMonthlyEquivalent,
      yearlySavingsPercent
    }
  }
}
</script>
