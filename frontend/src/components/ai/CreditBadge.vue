<template>
  <div
    v-if="!aiStore.credits.unlimited"
    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
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
    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
    title="Unlimited AI credits (self-hosted)"
  >
    <SparklesIcon class="h-3.5 w-3.5" />
    <span>Unlimited</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAIStore } from '@/stores/ai'
import { SparklesIcon } from '@heroicons/vue/24/solid'

const aiStore = useAIStore()

const badgeClass = computed(() => {
  if (aiStore.credits.unlimited) {
    return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
  }

  const remaining = aiStore.credits.remaining ?? 0
  const allocated = aiStore.credits.allocated ?? 100
  const percentRemaining = allocated > 0 ? (remaining / allocated) * 100 : 0

  if (percentRemaining <= 10) {
    return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
  } else if (percentRemaining <= 30) {
    return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
  } else {
    return 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
  }
})

const tooltipText = computed(() => {
  if (aiStore.credits.unlimited) {
    return 'Unlimited AI credits (self-hosted)'
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
