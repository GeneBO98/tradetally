<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <div class="flex items-center justify-center mb-6 gap-2 sm:gap-3">
          <img src="/favicon.svg?v=2" alt="TradeTally Logo" class="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
          <span class="text-xl sm:text-2xl md:text-3xl font-bold text-primary-600 dark:text-primary-400 whitespace-nowrap" style="font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 0.05em;">DOMINATE WITH DATA</span>
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Create your account
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Or
          <router-link to="/login" class="font-medium text-primary-600 hover:text-primary-500">
            sign in to existing account
          </router-link>
        </p>
      </div>

      <!-- Registration disabled message -->
      <div v-if="registrationDisabled" class="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-4">
        <div class="text-center">
          <h3 class="text-lg font-medium text-yellow-800 dark:text-yellow-400 mb-2">
            Registration Currently Disabled
          </h3>
          <p class="text-sm text-yellow-700 dark:text-yellow-300">
            User registration is currently disabled by the administrator. Please contact an administrator for assistance.
          </p>
          <div class="mt-4">
            <router-link to="/login" class="btn-primary">
              Sign In Instead
            </router-link>
          </div>
        </div>
      </div>
      
      <form v-if="!registrationDisabled" class="mt-8 space-y-6" @submit.prevent="handleRegister">
        <div class="space-y-4">
          <div>
            <label for="fullName" class="label">Full Name</label>
            <input
              id="fullName"
              v-model="form.fullName"
              name="fullName"
              type="text"
              class="input"
              placeholder="John Doe"
              @keydown.enter="handleRegister"
            />
          </div>
          
          <div>
            <label for="username" class="label">Username</label>
            <input
              id="username"
              v-model="form.username"
              name="username"
              type="text"
              required
              class="input"
              placeholder="johndoe"
              @keydown.enter="handleRegister"
            />
          </div>
          
          <div>
            <label for="email" class="label">Email address</label>
            <input
              id="email"
              v-model="form.email"
              name="email"
              type="email"
              required
              class="input"
              placeholder="john@example.com"
              @keydown.enter="handleRegister"
            />
          </div>
          
          <div>
            <label for="password" class="label">Password</label>
            <input
              id="password"
              v-model="form.password"
              name="password"
              type="password"
              required
              class="input"
              placeholder="Minimum 6 characters"
              @keydown.enter="handleRegister"
            />
          </div>
        </div>

        <!-- Referral Code Banner -->
        <div v-if="referralCreator" class="rounded-md bg-primary-50 dark:bg-primary-900/20 p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-primary-800 dark:text-primary-300">
                Referred by {{ referralCreator }}
              </p>
              <p class="text-xs text-primary-600 dark:text-primary-400 mt-1">
                Use code <span class="font-mono font-bold">{{ form.referral_code }}</span> at checkout for your discount
              </p>
            </div>
          </div>
        </div>

        <div v-if="authStore.error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p class="text-sm text-red-800 dark:text-red-400">{{ authStore.error }}</p>
        </div>

        <div>
          <button
            type="submit"
            :disabled="authStore.loading"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            <span v-if="authStore.loading">Creating account...</span>
            <span v-else>Create account</span>
          </button>
        </div>
        
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'

const authStore = useAuthStore()
const router = useRouter()
const { showError, showSuccess } = useNotification()

const form = ref({
  fullName: '',
  username: '',
  email: '',
  password: '',
  referral_code: ''
})

const referralCreator = ref(null)

const registrationDisabled = ref(false)

onMounted(async () => {
  try {
    const config = await authStore.getRegistrationConfig()
    registrationDisabled.value = !config.allowRegistration

    // If registration is disabled, redirect to login after 3 seconds
    if (registrationDisabled.value) {
      setTimeout(() => {
        router.push('/login')
      }, 5000)
    }

    // Check for referral code in localStorage (set by /r/slug landing page)
    const storedReferralCode = localStorage.getItem('referral_code')
    const storedReferralCreator = localStorage.getItem('referral_creator')
    if (storedReferralCode) {
      form.value.referral_code = storedReferralCode
      referralCreator.value = storedReferralCreator
    }
  } catch (error) {
    console.error('Failed to fetch registration config:', error)
  }
})

async function handleRegister() {
  try {
    const response = await authStore.register(form.value)

    // Clear referral code from localStorage after successful registration
    localStorage.removeItem('referral_code')
    localStorage.removeItem('referral_creator')

    // Show success message
    showSuccess('Registration Successful', response.message)
    
    // Check if email verification or admin approval is required
    if (response.requiresVerification && response.requiresApproval) {
      router.push({ name: 'login', query: { message: 'Please check your email to verify your account and wait for admin approval' } })
    } else if (response.requiresVerification) {
      router.push({ name: 'login', query: { message: 'Please check your email to verify your account' } })
    } else if (response.requiresApproval) {
      router.push({ name: 'login', query: { message: 'Your account is pending admin approval' } })
    } else {
      router.push({ name: 'login', query: { message: 'You can now sign in to your account' } })
    }
  } catch (error) {
    showError('Registration failed', authStore.error)
  }
}
</script>