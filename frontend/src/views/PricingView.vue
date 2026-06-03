<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
    <div class="content-wrapper">
      <!-- Pro tour: step 5 of 5 — Conversion CTA -->
      <ProTourCard
        v-if="authStore.proOnboardingStep === 5"
        :step="5"
        :total-steps="5"
        :next-step="6"
        title="Keep these tools after your trial"
        description="You've seen what Pro catches: revenge trades, premature exits, missed profit, and pre-screened scanner setups. Pick a plan now and your trial keeps running — we won't charge until it ends."
        cta-label="I'll pick a plan"
        icon="rocket"
        :stat-value="proTourTrialDays"
        stat-label="trial days remaining"
        stat-tone="success"
      />

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
                <!-- Spacer to align primary CTAs with the Monthly card's trial slot -->
                <div class="mt-3 min-h-[4.5rem]" aria-hidden="true"></div>
              </div>
            </div>
          </div>

          <!-- Pro Yearly -->
          <div class="card relative border-2 border-green-500 flex flex-col">
            <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <span class="bg-green-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                Best Value
              </span>
            </div>

            <div class="card-body flex flex-col flex-1">
              <div class="text-center">
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">Pro Yearly</h3>
                <div class="mt-4">
                  <span class="text-4xl font-bold text-gray-900 dark:text-white">{{ formattedYearlyPrice }}</span>
                  <span class="text-gray-600 dark:text-gray-400">/year</span>
                </div>
                <p v-if="yearlyDiscountPercent > 0" class="mt-2">
                  <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                    Save {{ yearlyDiscountPercent }}% vs monthly
                  </span>
                </p>
                <p class="mt-4 text-gray-600 dark:text-gray-400">
                  <template v-if="yearlyMonthlyEquivalent">Just {{ yearlyMonthlyEquivalent }}/mo, billed annually</template>
                  <template v-else>Best value for committed traders</template>
                </p>
              </div>

              <ul class="mt-8 space-y-4 flex-1">
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Everything in Pro Monthly</span>
                </li>
                <li v-if="yearlyDiscountPercent > 0" class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">{{ yearlyDiscountPercent }}% cheaper than paying monthly</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Priority support</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Cancel anytime</span>
                </li>
              </ul>

              <div class="mt-8">
                <button
                  v-if="!currentSubscription"
                  @click="subscribe(yearlyOffer)"
                  :disabled="subscribing || !yearlyOffer"
                  class="w-full btn btn-primary"
                >
                  <span v-if="subscribing" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></span>
                  Subscribe Yearly
                </button>
                <button
                  v-else
                  disabled
                  class="w-full btn btn-disabled bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                >
                  Already on Pro
                </button>
                <!-- Spacer to align primary CTAs with the Monthly card's trial slot -->
                <div class="mt-3 min-h-[4.5rem]" aria-hidden="true"></div>
              </div>
            </div>
          </div>

          <!-- Pro Monthly -->
          <div class="card relative border-2 border-primary-500 flex flex-col">
            <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <span class="bg-primary-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </span>
            </div>

            <div class="card-body flex flex-col flex-1">
              <div class="text-center">
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">Pro Monthly</h3>
                <div class="mt-4">
                  <span class="text-4xl font-bold text-gray-900 dark:text-white">{{ formattedMonthlyPrice }}</span>
                  <span class="text-gray-600 dark:text-gray-400">/month</span>
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
                <template v-if="!currentSubscription">
                  <button
                    @click="subscribe(monthlyOffer)"
                    :disabled="subscribing || !monthlyOffer"
                    :class="getSubscribeButtonClass()"
                    class="w-full"
                  >
                    <span v-if="subscribing" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></span>
                    {{ getSubscribeButtonText() }}
                  </button>

                  <!-- Start free trial (slot height matches the spacer on the other cards) -->
                  <div class="mt-3 min-h-[4.5rem] space-y-2">
                    <button
                      @click="startTrial()"
                      :disabled="subscribing || hasUsedTrial || (trialInfo && trialInfo.active)"
                      :class="getTrialButtonClass()"
                      class="w-full"
                    >
                      <span v-if="subscribing" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></span>
                      {{ getTrialButtonText() }}
                    </button>
                    <p
                      v-if="!hasUsedTrial && !(trialInfo && trialInfo.active)"
                      class="text-xs text-center text-gray-500 dark:text-gray-400"
                    >
                      14-day free trial &middot; no card required
                    </p>
                  </div>
                </template>
                <template v-else>
                  <button
                    disabled
                    class="w-full btn btn-disabled bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                  >
                    Current Plan
                  </button>
                  <div class="mt-3 min-h-[4.5rem]" aria-hidden="true"></div>
                </template>
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
import api from '@/services/api'
import ProTourCard from '@/components/onboarding/ProTourCard.vue'

export default {
  name: 'PricingView',
  components: { ProTourCard },
  setup() {
    const router = useRouter()
    const route = useRoute()
    const authStore = useAuthStore()
    const analytics = useAnalytics()
    const loading = ref(true)
    const subscribing = ref(false)
    const billingStatus = ref({
      billing_enabled: false,
      billing_available: false
    })
    const pricingPlans = ref([])
    const currentSubscription = ref(null)
    const trialInfo = ref(null)
    const hasUsedTrial = ref(false)
    const proTourTrialDays = computed(() => {
      const days = trialInfo.value?.days_remaining
      return Number.isFinite(days) ? days : 14
    })
    const redirectUrl = ref(route.query.redirect || null)
    const errorMessage = ref('')
    const successMessage = ref('')

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

    const monthlyOffer = computed(() => (
      pricingPlans.value.find(plan => plan.interval === 'month') || null
    ))

    const yearlyOffer = computed(() => (
      pricingPlans.value.find(plan => plan.interval === 'year') || null
    ))

    const formattedMonthlyPrice = computed(() => (
      Number.isFinite(monthlyOffer.value?.price) ? formatPrice(monthlyOffer.value.price) : '$0'
    ))

    const formattedYearlyPrice = computed(() => (
      Number.isFinite(yearlyOffer.value?.price) ? formatPrice(yearlyOffer.value.price) : '$0'
    ))

    // Effective monthly cost when billed annually (e.g. "$7/mo billed annually")
    const yearlyMonthlyEquivalent = computed(() => (
      Number.isFinite(yearlyOffer.value?.price) ? formatPrice(yearlyOffer.value.price / 12) : null
    ))

    // Yearly discount vs paying month-to-month for 12 months
    const yearlyDiscountPercent = computed(() => {
      const m = monthlyOffer.value?.price
      const y = yearlyOffer.value?.price
      if (!Number.isFinite(m) || !Number.isFinite(y) || m <= 0 || y >= m * 12) return 0
      return Math.round((1 - (y / (m * 12))) * 100)
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

    const subscribe = async (offer) => {
      // Check if user is authenticated
      if (!authStore.token || !authStore.isAuthenticated) {
        router.push('/login?redirect=' + encodeURIComponent('/pricing'))
        return
      }

      subscribing.value = true
      try {
        const selectedOffer = offer || monthlyOffer.value
        const priceId = selectedOffer?.id

        if (!priceId) {
          throw new Error('Price ID not found. Please contact support.')
        }

        analytics.track('pricing_checkout_started', {
          price_cents: selectedOffer.price,
          currency: selectedOffer.currency || 'USD',
          interval: selectedOffer.interval || 'month'
        })

        const payload = { priceId }
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
      return 'btn border border-primary-500 bg-primary-500/10 text-primary-700 hover:bg-primary-500/20 dark:border-primary-400 dark:bg-primary-500/15 dark:text-primary-300'
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
      authStore,
      loading,
      subscribing,
      billingStatus,
      pricingPlans,
      monthlyOffer,
      yearlyOffer,
      formattedMonthlyPrice,
      formattedYearlyPrice,
      yearlyMonthlyEquivalent,
      yearlyDiscountPercent,
      currentSubscription,
      trialInfo,
      hasUsedTrial,
      proTourTrialDays,
      subscribe,
      startTrial,
      getSubscribeButtonClass,
      getSubscribeButtonText,
      getTrialButtonClass,
      getTrialButtonText,
      errorMessage,
      successMessage
    }
  }
}
</script>
