<template>
  <img
    v-if="resolvedLogo"
    :src="resolvedLogo"
    :alt="altText"
    :class="imageClasses"
    @error="imageFailed = true"
  />
  <div
    v-else
    :class="fallbackClasses"
    :aria-label="altText"
  >
    <span :class="fallbackTextClass">
      {{ fallbackText }}
    </span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useSymbolMetadata } from '@/composables/useSymbolMetadata'

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

const imageFailed = ref(false)
const { metadataBySymbol, normalizeSymbol } = useSymbolMetadata(computed(() => props.symbol))

const normalizedSymbol = computed(() => normalizeSymbol(props.symbol))
const metadata = computed(() => metadataBySymbol[normalizedSymbol.value] || null)
const resolvedLogo = computed(() => {
  if (imageFailed.value) {
    return null
  }

  return props.logoUrl || metadata.value?.logo || null
})
const altText = computed(() => props.alt || `${normalizedSymbol.value || 'Stock'} logo`)
const fallbackText = computed(() => (normalizedSymbol.value || '?').slice(0, 2))
const imageClasses = computed(() => `${props.sizeClass} ${props.roundedClass} object-contain bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0`)
const fallbackClasses = computed(() => `${props.sizeClass} ${props.roundedClass} bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 inline-flex items-center justify-center flex-shrink-0`)

watch(
  () => [props.symbol, props.logoUrl],
  () => {
    imageFailed.value = false
  }
)
</script>
