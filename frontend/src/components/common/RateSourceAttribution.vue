<template>
  <a
    v-if="attribution"
    :href="attribution.url"
    target="_blank"
    rel="noopener"
    class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
    :title="`Currency conversions use ${attribution.name} exchange rates${rateDate ? ` (${rateDate})` : ''}`"
  >
    <span class="hidden sm:inline">Exchange rates by {{ attribution.name }}</span>
    <span class="sm:hidden">Rates: {{ attribution.name }}</span>
  </a>
</template>

<script setup>
// Credits the provider behind the displayed currency conversions. Keyless
// AllRatesToday data must carry a visible, followable link (their terms,
// section 3.4), including while a stored fallback map is being reused, so
// this follows the backend's answer rather than any client-side guess.
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const attribution = ref(null)
const rateDate = ref(null)

onMounted(async () => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return
  try {
    const { data } = await api.get('/settings/fx-source')
    attribution.value = data?.attribution || null
    rateDate.value = data?.rateDate || null
  } catch {
    // Attribution is informational; a failed lookup must not break the footer.
  }
})
</script>
