<template>
  <span :class="{ 'cusip-resolved': isResolved }" :title="isResolved ? `Originally: ${symbol}` : undefined">
    {{ displaySymbol }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { useCusipMappings } from '@/composables/usePriceAlertNotifications'

const props = defineProps({
  symbol: {
    type: String,
    required: true
  }
})

const { getSymbolForCusip, isResolvedCusip } = useCusipMappings()

const displaySymbol = computed(() => getSymbolForCusip(props.symbol))
const isResolved = computed(() => isResolvedCusip(props.symbol))
</script>

<style scoped>
.cusip-resolved {
  color: #059669; /* Green to indicate resolution */
  font-weight: 600;
  transition: all 0.3s ease;
}

.cusip-resolved:after {
  content: "[SUCCESS]";
  font-size: 0.8em;
  margin-left: 0.25rem;
  opacity: 0.7;
}
</style>