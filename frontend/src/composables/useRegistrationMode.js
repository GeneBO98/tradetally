import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const registrationConfig = ref(null)

export function useRegistrationMode() {
  const authStore = useAuthStore()
  
  const fetchRegistrationConfig = async () => {
    if (!registrationConfig.value) {
      try {
        registrationConfig.value = await authStore.getRegistrationConfig()
      } catch (error) {
        console.error('Failed to fetch registration config:', error)
        // Default to open mode on error
        registrationConfig.value = {
          registrationMode: 'open',
          allowRegistration: true
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

  const showSEOPages = computed(() => {
    return isOpenMode.value
  })

  return {
    registrationConfig,
    fetchRegistrationConfig,
    isOpenMode,
    isClosedMode,
    isSemiMode,
    allowRegistration,
    showSEOPages
  }
}