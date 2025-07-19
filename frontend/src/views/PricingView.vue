<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="text-center">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white">
          Choose Your Plan
        </h1>
        <p class="mt-4 text-xl text-gray-600 dark:text-gray-400">
          Unlock advanced trading analytics and insights
        </p>
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
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p class="mt-4 text-gray-600 dark:text-gray-400">Loading pricing plans...</p>
        </div>
      </div>

      <!-- Pricing Plans -->
      <div v-else class="mt-12">
        <!-- Current Plan Info -->
        <div v-if="currentSubscription" class="mb-8 text-center">
          <div class="inline-flex items-center px-4 py-2 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Currently on {{ currentSubscription.plan_name || 'Pro Plan' }}
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Free Plan -->
          <div class="card relative">
            <div class="card-body">
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

              <ul class="mt-8 space-y-4">
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
                  <span class="text-gray-600 dark:text-gray-400">Trade history</span>
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
                  <span class="text-gray-600 dark:text-gray-400">CSV import/export</span>
                </li>
              </ul>

              <div class="mt-8">
                <button 
                  :disabled="!currentSubscription"
                  class="btn btn-outline w-full"
                  :class="{ 'opacity-50 cursor-not-allowed': !currentSubscription }"
                >
                  {{ currentSubscription ? 'Current Plan' : 'Current Plan' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Pro Plan -->
          <div class="card relative border-2 border-blue-500">
            <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <span class="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </span>
            </div>
            
            <div class="card-body">
              <div class="text-center">
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">Pro</h3>
                <div class="mt-4">
                  <span class="text-4xl font-bold text-gray-900 dark:text-white">$29</span>
                  <span class="text-gray-600 dark:text-gray-400">/month</span>
                </div>
                <p class="mt-4 text-gray-600 dark:text-gray-400">
                  Advanced analytics and behavioral insights for serious traders
                </p>
              </div>

              <ul class="mt-8 space-y-4">
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
                  <span class="text-gray-600 dark:text-gray-400">Real-time alerts</span>
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
                  @click="subscribe('pro')"
                  :disabled="subscribing"
                  :class="getSubscribeButtonClass('pro')"
                  class="w-full"
                >
                  <span v-if="subscribing" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></span>
                  {{ getSubscribeButtonText('pro') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Enterprise Plan -->
          <div class="card relative">
            <div class="card-body">
              <div class="text-center">
                <h3 class="text-2xl font-bold text-gray-900 dark:text-white">Enterprise</h3>
                <div class="mt-4">
                  <span class="text-4xl font-bold text-gray-900 dark:text-white">Custom</span>
                </div>
                <p class="mt-4 text-gray-600 dark:text-gray-400">
                  Custom solutions for trading firms and institutions
                </p>
              </div>

              <ul class="mt-8 space-y-4">
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Everything in Pro</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Multi-user management</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Custom integrations</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">Advanced compliance tools</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">24/7 dedicated support</span>
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span class="text-gray-600 dark:text-gray-400">On-premise deployment</span>
                </li>
              </ul>

              <div class="mt-8">
                <button class="btn btn-outline w-full">
                  Contact Sales
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
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import axios from 'axios'

export default {
  name: 'PricingView',
  setup() {
    const loading = ref(true)
    const subscribing = ref(false)
    const billingStatus = ref({
      billing_enabled: false,
      billing_available: false
    })
    const pricingPlans = ref([])
    const currentSubscription = ref(null)

    const loadBillingStatus = async () => {
      try {
        const response = await axios.get('/api/billing/status')
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
        const response = await axios.get('/api/billing/pricing')
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
        const response = await axios.get('/api/billing/subscription')
        currentSubscription.value = response.data.data.subscription
      } catch (error) {
        console.error('Error loading current subscription:', error)
      } finally {
        loading.value = false
      }
    }

    const subscribe = async (planType) => {
      if (planType !== 'pro') {
        return
      }

      subscribing.value = true
      try {
        // For now, use a hardcoded price ID - in a real app, you'd get this from the pricing plans
        const priceId = 'price_pro_monthly' // This should come from your Stripe dashboard

        const response = await axios.post('/api/billing/checkout', {
          priceId
        })

        // Redirect to Stripe checkout
        window.location.href = response.data.data.checkout_url
      } catch (error) {
        console.error('Error creating checkout session:', error)
        alert('Failed to start checkout process. Please try again.')
      } finally {
        subscribing.value = false
      }
    }

    const getSubscribeButtonClass = (planType) => {
      if (currentSubscription.value && planType === 'pro') {
        return 'btn btn-outline'
      }
      return planType === 'pro' ? 'btn btn-primary' : 'btn btn-outline'
    }

    const getSubscribeButtonText = (planType) => {
      if (currentSubscription.value && planType === 'pro') {
        return 'Current Plan'
      }
      return planType === 'pro' ? 'Start Pro Trial' : 'Get Started'
    }

    onMounted(async () => {
      await loadBillingStatus()
      await loadPricingPlans()
      await loadCurrentSubscription()
    })

    return {
      loading,
      subscribing,
      billingStatus,
      pricingPlans,
      currentSubscription,
      subscribe,
      getSubscribeButtonClass,
      getSubscribeButtonText
    }
  }
}
</script>