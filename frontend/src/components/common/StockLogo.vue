<template>
  <img
    v-if="resolvedLogo"
    :src="resolvedLogo"
    :alt="altText"
    :title="companyName || undefined"
    :class="imageClasses"
    @error="handleImageError"
  />
  <div
    v-else
    :class="fallbackClasses"
    :aria-label="altText"
    :title="companyName || undefined"
  >
    <span :class="fallbackTextClass">
      {{ fallbackText }}
    </span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useSymbolMetadata } from '@/composables/useSymbolMetadata'
import { fallbackLogoUrls } from '@/utils/symbolLogo'

const props = defineProps({
  symbol: {
    type: String,
    required: true
  },
  logoUrl: {
    type: String,
    default: null
  },
  sizeClass: {
    type: String,
    default: 'w-8 h-8'
  },
  roundedClass: {
    type: String,
    default: 'rounded-lg'
  },
  fallbackTextClass: {
    type: String,
    default: 'text-xs font-semibold'
  },
  alt: {
    type: String,
    default: ''
  }
})

const failedCandidates = ref(0)
const { metadataBySymbol, normalizeSymbol } = useSymbolMetadata(computed(() => props.symbol))

const normalizedSymbol = computed(() => normalizeSymbol(props.symbol))
const metadata = computed(() => metadataBySymbol[normalizedSymbol.value] || null)

const providedLogo = computed(() => props.logoUrl || metadata.value?.logo || null)

// Provider logo first, then the keyless CDNs; running out lands on the initials.
const logoCandidates = computed(() => {
  const candidates = providedLogo.value ? [providedLogo.value] : []
  return candidates.concat(fallbackLogoUrls(normalizedSymbol.value))
})

const resolvedLogo = computed(() => logoCandidates.value[failedCandidates.value] || null)

function handleImageError() {
  failedCandidates.value += 1
}

const companyName = computed(() => metadata.value?.companyName || metadata.value?.company_name || null)
const altText = computed(() => props.alt || `${normalizedSymbol.value || 'Stock'} logo`)
const fallbackText = computed(() => (normalizedSymbol.value || '?').slice(0, 2))
const imageClasses = computed(() => `${props.sizeClass} ${props.roundedClass} object-contain bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0`)
const fallbackClasses = computed(() => `${props.sizeClass} ${props.roundedClass} bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 inline-flex items-center justify-center flex-shrink-0`)

// providedLogo resolves after mount, so reset or the late logo is indexed past.
watch(
  () => [props.symbol, providedLogo.value],
  () => {
    failedCandidates.value = 0
  }
)
</script>
