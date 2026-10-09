<template>
  <span
    v-if="session"
    :class="badgeClass"
    :title="session.title"
  >
    {{ session.short }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { getTradeSessionBadge } from '@/utils/tradeMarketSession'
import { tradeBadgeClass } from '@/utils/tradeBadges'

const props = defineProps({
  trade: {
    type: Object,
    required: true,
  },
})

const session = computed(() => getTradeSessionBadge(props.trade))

const badgeClass = tradeBadgeClass('session')
</script>
