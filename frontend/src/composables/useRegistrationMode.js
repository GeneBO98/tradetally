import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const registrationConfig = ref(null)

export function useRegistrationMode() {
  const authStore = useAuthStore()
  
  const fetchRegistrationConfig = async () => {
    if (!registrationConfig.value) {
      try {
        registrationConfig.value = await authStore.getRegistrationConfig()
        console.log('[REGISTRATION] Config fetched:', {
          registrationMode: registrationConfig.value.registrationMode,
          billingMode: registrationConfig.value.billingMode,
          allowRegistration: registrationConfig.value.allowRegistration
        })
      } catch (error) {
        console.error('Failed to fetch registration config:', error)
        // Default to open mode on error
        registrationConfig.value = {
          registrationMode: 'open',
          allowRegistration: true,
          billingMode: false
        }
      }
    }
    return registrationConfig.value
  }

  const isOpenMode = computed(() => {
    return registrationConfig.value?.registrationMode === 'open'
  })

  const isClosedMode = computed(() => {
    return registrationConfig.value?.registrationMode === 'disabled'
  })

  const isSemiMode = computed(() => {
    return registrationConfig.value?.registrationMode === 'approval'
  })

  const allowRegistration = computed(() => {
    return registrationConfig.value?.allowRegistration === true
  })

  const isBillingMode = computed(() => {
    const billingEnabled = registrationConfig.value?.billingMode === true
    if (registrationConfig.value) {
      console.log('[BILLING MODE] Enabled:', billingEnabled, 'billingMode value:', registrationConfig.value.billingMode)
    }
    return billingEnabled
  })

  const showSEOPages = computed(() => {
    // Only show SEO pages when billing mode is TRUE (SaaS/public offering)
    // When billing mode is FALSE (default), hide public pages (private instance)
    if (!isBillingMode.value) {
      console.log('[SEO PAGES] Hidden - billing mode is false (private instance)')
      return false
    }
    // When billing mode is true, also check if registration is open
    const show = isOpenMode.value
    console.log('[SEO PAGES] Show:', show, 'Billing mode true, Open mode:', isOpenMode.value)
    return show
  })

  return {
    registrationConfig,
    fetchRegistrationConfig,
    isOpenMode,
    isClosedMode,
    isSemiMode,
    allowRegistration,
    isBillingMode,
    showSEOPages
  }
}