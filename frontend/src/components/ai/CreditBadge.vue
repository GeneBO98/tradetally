<template>
  <div
    v-if="!aiStore.credits.unlimited"
    class="badge gap-1.5"
    :class="badgeClass"
    :title="tooltipText"
  >
    <SparklesIcon class="h-3.5 w-3.5" />
    <span>
      {{ aiStore.credits.remaining ?? 0 }}/{{ aiStore.credits.allocated ?? 100 }}
    </span>
  </div>
  <div
    v-else
    class="badge-primary gap-1.5"
    :title="aiStore.credits.own_provider ? 'Using your own AI provider. No TradeTally credits are used.' : 'Unlimited AI credits (self-hosted)'"
  >
    <SparklesIcon class="h-3.5 w-3.5" />
    <span>{{ aiStore.credits.own_provider ? 'Your AI' : 'Unlimited' }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAIStore } from '@/stores/ai'
import { SparklesIcon } from '@heroicons/vue/24/solid'

const aiStore = useAIStore()

const badgeClass = computed(() => {
  if (aiStore.credits.unlimited) {
    return 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-300'
  }

  const remaining = aiStore.credits.remaining ?? 0
  const allocated = aiStore.credits.allocated ?? 100
  const percentRemaining = allocated > 0 ? (remaining / allocated) * 100 : 0

  // Green/red are reserved for P&L direction; a low balance is a warning.
  if (percentRemaining <= 30) {
    return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300'
  }
  return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
})

const tooltipText = computed(() => {
  if (aiStore.credits.unlimited) {
    return aiStore.credits.own_provider
      ? 'Using your own AI provider. No TradeTally credits are used.'
      : 'Unlimited AI credits (self-hosted)'
  }

  const remaining = aiStore.credits.remaining ?? 0
  const periodEnd = aiStore.credits.period_end

  let text = `${remaining} AI credits remaining`
  if (periodEnd) {
    text += `. Resets on ${new Date(periodEnd).toLocaleDateString()}`
  }
  return text
})
</script>
