<template>
  <span v-if="status === 'pending' || status === 'needs_review'" class="block text-xs font-normal text-primary-700 dark:text-primary-300" :title="status === 'pending' ? 'This trade is included in P&L. Activity reconciliation may update its commissions and totals.' : 'Review the IBKR sync warnings before changing this trade.'">
    {{ status === 'pending' ? 'Awaiting Activity reconciliation' : 'IBKR reconciliation needs review' }}
  </span>
</template>

<script setup>
defineProps({ status: { type: String, default: null } })
</script>
