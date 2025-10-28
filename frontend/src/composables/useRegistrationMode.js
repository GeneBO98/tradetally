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
          billingEnabled: registrationConfig.value.billingEnabled,
          allowRegistration: registrationConfig.value.allowRegistration
        })
      } catch (error) {
        console.error('Failed to fetch registration config:', error)
        // Default to open mode on error
        registrationConfig.value = {
          registrationMode: 'open',
          allowRegistration: true,
          billingEnabled: false
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

  const isBillingEnabled = computed(() => {
    const enabled = registrationConfig.value?.billingEnabled === true
    if (registrationConfig.value) {
      console.log('[BILLING] Enabled:', enabled, 'billingEnabled value:', registrationConfig.value.billingEnabled)
    }
    return enabled
  })

  const showSEOPages = computed(() => {
    // Only show SEO pages when billing is enabled (SaaS/public offering)
    // When billing is disabled (default), hide public pages (private instance)
    if (!isBillingEnabled.value) {
      console.log('[SEO PAGES] Hidden - billing disabled (private instance)')
      return false
    }
    // When billing is enabled, show SEO pages (public SaaS offering)
    console.log('[SEO PAGES] Show: true - billing enabled (public instance)')
    return true
  })

  return {
    registrationConfig,
    fetchRegistrationConfig,
    isOpenMode,
    isClosedMode,
    isSemiMode,
    allowRegistration,
    isBillingEnabled,
    showSEOPages
  }
}